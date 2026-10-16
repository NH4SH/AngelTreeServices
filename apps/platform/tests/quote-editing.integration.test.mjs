import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.PR05_DISPOSABLE_STACK === "1" && Boolean(process.env.PR05_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR05 atomic quote editing with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR05_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.equal(process.env.PR05_WEB_URL, "http://127.0.0.1:3102");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR05_DOCKER_BIN;
  assert.ok(docker);
  const base = ["exec", "-i", "supabase_db_ats_pr02_disposable", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  function sql(source) {
    return new Promise((resolve, reject) => {
      const p = spawn(docker, base, { env: process.env }); let out = "", err = "";
      p.stdout.on("data", b => out += b); p.stderr.on("data", b => err += b);
      p.on("error", reject); p.on("exit", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
      p.stdin.end(source);
    });
  }
  async function hold(source) {
    const p=spawn(docker,base,{env:process.env});let err='',pid;
    p.stderr.on('data',b=>err+=b);
    const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(err)));});
    const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR05_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(new Error('Lock exited before ready: '+err)));});
    p.stdin.write(`begin; ${source}; select 'PR05_LOCKED:'||pg_backend_pid();\n`);await ready;
    return Object.assign(async()=>{p.stdin.end('commit;\n');await done;},{pid});
  }
  async function waitBlocked(pid) {
    for(let i=0;i<40;i++) {
      if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))>0)return;
      await new Promise(r=>setTimeout(r,25));
    }
    assert.fail('Independent transaction did not reach the expected parent lock');
  }
  const service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, options);
  const anon = createClient(c.API_URL, c.ANON_KEY, options);
  const marker = randomBytes(5).toString("hex"), results = [], accountIds = [];
  t.after(async()=>{
    if(accountIds.length) {check(await service.from("profiles").update({status:"disabled"}).in("id",accountIds));check(await service.from("employee_records").update({is_active:false,employment_status:"separated"}).in("auth_user_id",accountIds));}
  });
  const check = (r, label = "request") => { assert.ifError(r.error && new Error(`${label}: ${r.error.message} [${r.error.code}]`)); return r.data; };
  const denied = (r, code) => { assert.ok(r.error, "Expected rejection"); if (code) assert.equal(r.error.code, code); };
  const client = jwt => createClient(c.API_URL, c.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  async function account(role, label = role) {
    check(await service.from("roles").upsert({ name: role }, { onConflict: "name" }));
    const password = randomBytes(24).toString("base64url");
    const u = check(await service.auth.admin.createUser({ email: `pr05-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    accountIds.push(u.id);
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR05 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const customer=check(await service.from('customers').insert({display_name:`PR05 disposable ${marker}`,email:`pr05-${marker}@example.invalid`}).select('id').single());
  const location=check(await service.from('service_locations').insert({customer_id:customer.id,label:'PR05 local property',street:'123 Test Street',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
  const run=async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  const lines=(price=1000,extra={})=>[{name:'PR05 local work',description:'Local scope',quantity:1,unit_price_cents:price,total_cents:price,...extra}];
  const header={customer_id:customer.id,organization_id:null,service_location_id:location.id};
  const read=async id=>check(await service.from('quotes').select('*,quote_line_items(*)').eq('id',id).single());
  async function draft(actor=owner,h={},l=lines()){const r=check(await actor.client.rpc('create_quote_draft',{p_header:{...header,...h},p_lines:l}));return read(r.id);}
  const savedLines=q=>q.quote_line_items.sort((a,b)=>a.sort_order-b.sort_order).map(l=>({id:l.id,name:l.name,description:l.description,quantity:Number(l.quantity),unit_price_cents:l.unit_price_cents,total_cents:l.total_cents}));
  const save=(q,l=savedLines(q),h={},actor=owner,extra={})=>actor.client.rpc('save_quote_details',{p_quote_id:q.id,p_expected_revision:q.edit_revision,p_header:h,p_lines:l,...extra});
  const history=async q=>check(await service.from('activity_log').select('*').eq('subject_id',q.id).eq('event_type','quote_updated'));
  async function job(extra={}){return check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'new_lead',service_type:'tree_removal',requested_scope:'PR05 local scope',...extra}).select('*').single());}
  await run('all retained office roles create and save complete drafts through commands',async()=>{
    for(const actor of [owner,admin,estimator,payroll]){const q=await draft(actor);const r=check(await save(q,lines(1200),{customer_message:'Saved together'},actor));const after=await read(q.id);assert.equal(after.total_cents,1200);assert.equal(after.customer_message,'Saved together');assert.ok(r.edit_revision>q.edit_revision);assert.equal(after.quote_line_items.length,1);assert.equal((await history(q)).length,1);}
  });
  await run('authenticated staff cannot bypass financial, identity, revision or line commands',async()=>{
    const q=await draft();for(const actor of [owner,admin,estimator,payroll]){
      for(const patch of [{total_cents:1},{tax_cents:1},{customer_message:'Bypass'},{customer_id:owner.id},{edit_revision:1},{recurring_service_plan_id:owner.id},{service_location_id:owner.id},{pricing_reviewed_at:new Date().toISOString()}]) denied(await actor.client.from('quotes').update(patch).eq('id',q.id),'42501');
      denied(await actor.client.from('quotes').insert({...header,status:'approved'}),'42501');
      denied(await actor.client.from('quote_line_items').insert({quote_id:q.id,...lines()[0]}),'42501');
      denied(await actor.client.from('quote_line_items').update({name:'Bypass'}).eq('quote_id',q.id),'42501');
      denied(await actor.client.from('quote_line_items').delete().eq('quote_id',q.id),'42501');
    }assert.equal((await read(q.id)).total_cents,1000);
  });
  await run('anonymous, field, customer, property-manager and service-only calls cannot create or edit',async()=>{
    const q=await draft();for(const actor of [{client:anon},{client:service},await account('crew'),await account('customer'),await account('property_manager')]){
      denied(await actor.client.rpc('create_quote_draft',{p_header:header,p_lines:lines()}),'42501');denied(await save(q,lines(),{},actor),'42501');
    }
  });
  await run('old issued JWT loses new quote commands immediately after employee deactivation',async()=>{
    const actor=await account('owner','disabled'),q=await draft(actor);check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('id',actor.employeeId));
    denied(await save(q,lines(),{},actor),'42501');denied(await actor.client.rpc('create_quote_draft',{p_header:header,p_lines:lines()}),'42501');
  });
  await run('create ignores forged document state, identity, source line IDs, totals and review stamps',async()=>{
    const q=await draft(owner,{id:owner.id,status:'approved',subtotal_cents:1,total_cents:1,approved_at:new Date().toISOString(),pricing_reviewed_at:new Date().toISOString(),tax_cents:100},lines(1000,{id:owner.id,quote_id:owner.id}));
    assert.notEqual(q.id,owner.id);assert.equal(q.status,'draft');assert.equal(q.total_cents,1100);assert.equal(q.approved_at,null);assert.equal(q.pricing_reviewed_at,null);assert.notEqual(q.quote_line_items[0].id,owner.id);
  });
  await run('a failed later create line rolls back the header, earlier line and creation history',async()=>{
    const before=check(await service.from('quotes').select('id').eq('customer_id',customer.id)).length;
    denied(await owner.client.rpc('create_quote_draft',{p_header:header,p_lines:[...lines(),...lines(500,{service_category_id:owner.id})]}),'23503');
    assert.equal(check(await service.from('quotes').select('id').eq('customer_id',customer.id)).length,before);
  });
  await run('header, retained lines, removals and additions roll back when a later new line fails',async()=>{
    const q=await draft(owner,{},[...lines(),...lines(300)]),before=await read(q.id);
    denied(await save(q,[{...savedLines(q)[0],name:'Changed first'},...lines(500,{material_id:owner.id})],{customer_message:'Must roll back'}),'23503');
    assert.deepEqual(await read(q.id),before);assert.equal((await history(q)).length,0);
  });
  await run('duplicate, foreign and missing persisted IDs are rejected rather than converted to new lines',async()=>{
    const q=await draft(),other=await draft(),l=savedLines(q)[0];
    denied(await save(q,[l,l]),'23514');denied(await save(q,savedLines(other)),'23514');denied(await save(q,[{...l,id:randomUUID()}]),'23514');assert.equal((await read(q.id)).quote_line_items.length,1);
  });
  await run('a successful replacement returns stable new IDs for repeated saves without duplicating lines',async()=>{
    const q=await draft(owner,{},[...lines(),...lines(300)]),l=savedLines(q)[0];
    const r=check(await save(q,[...lines(500),{...l,quantity:2,total_cents:2000}]));assert.equal(r.line_ids.length,2);assert.equal(r.line_ids[1],l.id);
    const after=await read(q.id);assert.equal(after.total_cents,2500);assert.equal(after.quote_line_items.length,2);
    check(await save(after,savedLines(after),{customer_message:'Saved twice'}));assert.equal((await read(q.id)).quote_line_items.length,2);
  });
  await run('same-version simultaneous editors choose one complete result; stale editor receives current metadata without a write',async()=>{
    const q=await draft(),responses=(await Promise.all([save(q,lines(1200),{customer_message:'Editor A'}),save(q,lines(1500),{customer_message:'Editor B'},admin)])).map(r=>check(r));
    assert.equal(responses.filter(r=>r.conflict===true).length,1);assert.equal(responses.filter(r=>!r.conflict).length,1);
    const after=await read(q.id),conflict=responses.find(r=>r.conflict);assert.equal(conflict.current_revision,after.edit_revision);assert.equal(conflict.current_total_cents,after.total_cents);assert.equal((await history(q)).length,1);
    assert.equal(after.customer_message,after.total_cents===1200?'Editor A':'Editor B');assert.equal(after.quote_line_items[0].total_cents,after.total_cents);
    const stale=check(await save(q,lines(900)));assert.equal(stale.conflict,true);assert.deepEqual(await read(q.id),after);
  });
  await run('missing versions fail closed and a failed response retry cannot overwrite a committed save',async()=>{
    const q=await draft();assert.equal(check(await save(q,lines(),{},owner,{p_expected_revision:null})).conflict,true);
    const first=check(await save(q,lines(1300)));assert.ok(first.edit_revision);assert.equal(check(await save(q,lines(1300))).conflict,true);assert.equal((await history(q)).length,1);
  });
  await run('late mandatory audit failure rolls back every field, line, revision and identity',async()=>{
    const q=await draft(),before=await read(q.id),constraint=`pr05_audit_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${q.id}'::uuid or event_type<>'quote_updated') not valid`);
    try{denied(await save(q,lines(1700),{customer_message:'Rollback'}),'23514');assert.deepEqual(await read(q.id),before);assert.equal((await history(q)).length,0);}finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    check(await save(q,lines(1700)));assert.equal((await read(q.id)).total_cents,1700);
  });
  await run('approved, declined, expired and cancelled quotes remain locked and cannot be reopened via staff writes',async()=>{
    for(const status of ['approved','declined','expired','cancelled']){let q=await draft();check(await service.from('quotes').update({status}).eq('id',q.id));q=await read(q.id);denied(await save(q,lines(2000)),'23514');denied(await owner.client.from('quotes').update({status:'draft'}).eq('id',q.id),'23514');assert.equal((await read(q.id)).status,status);}
  });
  await run('invoiced and applied work scope cannot be edited even if a legacy quote status is still open',async()=>{
    const j=await job({status:'accepted'}),q=await draft(owner,{job_id:j.id});check(await service.from('jobs').update({source_quote_id:q.id}).eq('id',j.id));denied(await save(q,lines(2000)),'23514');
    const q2=await draft();check(await service.from('invoices').insert({quote_id:q2.id,customer_id:customer.id,status:'draft',subtotal_cents:1000,total_cents:1000,balance_due_cents:1000}));denied(await save(q2,lines(2000)),'23514');
  });
  await run('telemetry and archive metadata do not invalidate content versions; status and line writers do',async()=>{
    const q=await draft();check(await service.from('quotes').update({view_count:1,last_viewed_at:new Date().toISOString()}).eq('id',q.id));assert.equal((await read(q.id)).edit_revision,q.edit_revision);
    check(await owner.client.from('quotes').update({automatic_follow_ups_enabled:false}).eq('id',q.id));assert.equal((await read(q.id)).edit_revision,q.edit_revision);
    check(await owner.client.from('quotes').update({status:'sent'}).eq('id',q.id));assert.equal(check(await save(q)).conflict,true);
    const after=await read(q.id);check(await service.from('quote_line_items').update({description:'Trusted source edit'}).eq('quote_id',q.id));assert.ok((await read(q.id)).edit_revision>after.edit_revision);
  });
  await run('sent and change-requested saves retain status, delivery and the existing customer token',async()=>{
    for(const status of ['sent','change_requested']){let q=await draft();check(await service.from('quotes').update({status,sent_at:'2026-10-15T12:00:00Z',sent_method:'manual',sent_by_user_id:owner.id}).eq('id',q.id));q=await read(q.id);
      const token=check(await service.from('quote_portal_tokens').insert({quote_id:q.id,customer_id:customer.id,token_hash:randomBytes(32).toString('hex'),created_by_user_id:owner.id}).select('*').single());
      const before=q.sent_at;check(await save(q,savedLines(q),{customer_message:'Keep existing workflow',status:'approved',approved_at:new Date().toISOString(),sent_at:null}));const after=await read(q.id);assert.equal(after.status,status);assert.equal(after.sent_at,before);assert.equal(after.approved_at,null);assert.deepEqual(check(await service.from('quote_portal_tokens').select('*').eq('id',token.id).single()),token);}
  });
  await run('quantities and cents validate precisely, zero-price and empty drafts remain possible',async()=>{
    const q=await draft(owner,{},[]);assert.equal(q.total_cents,0);check(await save(q,lines(1,{quantity:1.5,total_cents:2})));const after=await read(q.id);assert.equal(after.total_cents,2);
    for(const l of [lines(1,{quantity:1.001,total_cents:1}),lines(1,{quantity:0,total_cents:0}),lines(1,{unit_price_cents:1.5,total_cents:2}),lines(1000,{total_cents:1}),lines(2147483647,{quantity:2,total_cents:4294967294})]) denied(await save(after,l));
  });
  await run('organization contacts and locations are authoritative; missing draft contacts remain repairable',async()=>{
    const org=check(await service.from('organizations').insert({name:`PR05 organization ${marker}`}).select('id').single());
    const loc=check(await service.from('service_locations').insert({organization_id:org.id,customer_id:null,label:'PR05 organization property',street:'456 Test Street',city:'Fredericksburg',state:'VA'}).select('id').single());
    const contact=check(await service.from('organization_contacts').insert({organization_id:org.id,full_name:'PR05 approver',is_active:true}).select('id').single());
    const q=await draft(owner,{customer_id:null,organization_id:org.id,service_location_id:loc.id});denied(await save(q),'23514');
    check(await save(q,savedLines(q),{recipient_contact_id:contact.id,approval_contact_id:contact.id}));const after=await read(q.id);assert.equal(after.approval_contact_id,contact.id);
    check(await service.from('organization_contacts').update({is_active:false}).eq('id',contact.id));denied(await save(after),'23514');
    denied(await owner.client.rpc('create_quote_draft',{p_header:{...header,service_location_id:loc.id},p_lines:lines()}),'23514');
  });
  await run('contracting-party transfer requires confirmation and records the old and new party atomically',async()=>{
    const other=check(await service.from('customers').insert({display_name:`PR05 other party ${marker}`}).select('id').single());
    const loc=check(await service.from('service_locations').insert({customer_id:other.id,label:'Other party',street:'789 Test Street',city:'Fredericksburg',state:'VA'}).select('id').single());const q=await draft(),h={customer_id:other.id,organization_id:null,service_location_id:loc.id};
    denied(await save(q,savedLines(q),h),'23514');check(await save(q,savedLines(q),h,owner,{p_confirm_party_change:true}));
    assert.equal((await read(q.id)).customer_id,other.id);const audits=check(await service.from('activity_log').select('metadata_json').eq('subject_id',q.id).eq('event_type','quote_contracting_party_changed'));assert.equal(audits.length,1);assert.equal(audits[0].metadata_json.previous_customer_id,customer.id);
  });
  await run('material and category references survive omitted mobile fields; referenced lines cannot silently detach plans',async()=>{
    const material=check(await service.from('material_catalog').insert({name:`PR05 material ${marker}`,category:'mulch',default_unit:'cubic_yard'}).select('id').single());
    const q=await draft(owner,{},lines(1000,{material_id:material.id})),line=q.quote_line_items[0];
    const plan=check(await service.from('quote_material_requirements').insert({quote_id:q.id,quote_line_item_id:line.id,material_id:material.id,planned_quantity:1,unit:'cubic_yard'}).select('id').single());
    check(await save(q,savedLines(q),{customer_message:'Mobile preserves hidden references'}));const after=await read(q.id);assert.equal(after.quote_line_items[0].material_id,material.id);
    denied(await save(after,[]),'23514');denied(await save(after,[{...savedLines(after)[0],material_id:null}]),'23514');assert.equal(check(await service.from('quote_material_requirements').select('quote_line_item_id').eq('id',plan.id).single()).quote_line_item_id,line.id);
  });
  await run('recurring pricing review and quote contents commit or roll back as one transaction',async()=>{
    const plan=check(await service.from('recurring_service_plans').insert({customer_id:customer.id,plan_name:'PR05 local renewal',service_description:'Local work',recurrence_pattern:'annually',created_by_user_id:owner.id}).select('id').single());
    const pl=check(await service.from('recurring_plan_locations').insert({recurring_plan_id:plan.id,service_location_id:location.id,next_service_due_date:'2027-10-16'}).select('id').single());
    const occurrence=check(await service.from('recurring_service_occurrences').insert({recurring_plan_id:plan.id,recurring_plan_location_id:pl.id,service_location_id:location.id,occurrence_key:`pr05-${marker}`,target_service_date:'2027-10-16',authorization_mode_snapshot:'quote_required'}).select('id').single());
    const q=await draft(owner,{recurring_service_plan_id:plan.id,recurring_occurrence_id:occurrence.id}),before=await read(q.id),constraint=`pr05_review_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${q.id}'::uuid or event_type<>'quote_updated') not valid`);
    try {denied(await save(q,lines(1800),{customer_message:'Rollback pricing review'}),'23514');assert.deepEqual(await read(q.id),before);assert.equal(check(await service.from('recurring_service_occurrences').select('pricing_review_status').eq('id',occurrence.id).single()).pricing_review_status,'required');}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    check(await save(q,lines(1800),{recurring_occurrence_id:owner.id,customer_message:'Reviewed together'}));
    const after=await read(q.id);assert.equal(after.recurring_occurrence_id,occurrence.id);assert.ok(after.pricing_reviewed_at);assert.equal(after.pricing_reviewed_by_user_id,owner.id);assert.equal(after.total_cents,1800);assert.equal(check(await service.from('recurring_service_occurrences').select('pricing_review_status').eq('id',occurrence.id).single()).pricing_review_status,'reviewed');
  });
  await run('a real independent quote lock blocks edits until commit and stale checks run after waiting',async()=>{
    const q=await draft(),release=await hold(`update public.quotes set customer_message='Independent editor' where id='${q.id}'`),pending=save(q,lines(1200)).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}assert.equal(check(await pending).conflict,true);assert.equal((await read(q.id)).customer_message,'Independent editor');
  });
  await run('owner-only draft deletion remains available; deleting a parent cannot bypass closed history',async()=>{
    const q=await draft();const attempt=await estimator.client.from('quotes').delete().eq('id',q.id).select('id');if(attempt.error)assert.equal(attempt.error.code,'42501');else assert.deepEqual(attempt.data,[]);assert.equal((await read(q.id)).id,q.id);check(await owner.client.from('quotes').delete().eq('id',q.id));
    const closed=await draft();check(await service.from('quotes').update({status:'approved'}).eq('id',closed.id));denied(await owner.client.from('quotes').delete().eq('id',closed.id),'23514');assert.equal((await read(closed.id)).status,'approved');
  });
  await run('actual mobile create and duplicate routes use complete atomic drafts',async()=>{
    const root=`${process.env.PR05_WEB_URL}/api/mobile/quotes`,headers={authorization:`Bearer ${owner.jwt}`,'content-type':'application/json'};
    const response=await fetch(root,{method:'POST',headers,body:JSON.stringify({customerId:customer.id,serviceLocationId:location.id,customerMessage:'Mobile atomic create',lines:[{name:'Mobile initial line',quantity:1.5,unitPriceCents:1000}]})});
    const body=await response.json();assert.equal(response.status,201,JSON.stringify(body));const q=await read(body.data.quote.id);assert.equal(q.total_cents,1500);assert.equal(q.quote_line_items.length,1);assert.equal(body.data.quote.editRevision,q.edit_revision);
    const duplicate=await fetch(root+'/'+q.id+'/duplicate',{method:'POST',headers}),copied=await duplicate.json();assert.equal(duplicate.status,201,JSON.stringify(copied));assert.notEqual(copied.data.quote.id,q.id);const copy=await read(copied.data.quote.id);assert.equal(copy.total_cents,1500);assert.equal(copy.quote_line_items.length,1);assert.notEqual(copy.quote_line_items[0].id,q.quote_line_items[0].id);assert.equal(copy.status,'draft');
  });
  await run('actual mobile API rejects unversioned legacy updates and stale edits while accepting the current version',async()=>{
    const q=await draft(),url=`${process.env.PR05_WEB_URL}/api/mobile/quotes/${q.id}`,payload={customerId:customer.id,serviceLocationId:location.id,lines:[{id:q.quote_line_items[0].id,name:'Mobile saved line',quantity:1,unitPriceCents:1400}]};
    const request=async(path,body)=>{const r=await fetch(path,{method:'PATCH',headers:{authorization:`Bearer ${owner.jwt}`,'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
    const detail=await fetch(url,{headers:{authorization:`Bearer ${owner.jwt}`}});assert.equal(detail.status,200);const dto=(await detail.json()).data.quote;assert.equal(dto.editRevision,q.edit_revision);assert.equal(dto.quoteEditVersion,1);
    assert.equal((await request(url,payload)).status,409);
    const updated=await request(url+'/edit',{...payload,expectedRevision:q.edit_revision});assert.equal(updated.status,200,JSON.stringify(updated.body));assert.equal(updated.body.data.quote.totalCents,1400);
    const stale=await request(url+'/edit',{...payload,expectedRevision:q.edit_revision});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'quote_edit_conflict');assert.equal((await read(q.id)).total_cents,1400);
  });
  if(process.env.PR05_RESULTS_FILE) writeFileSync(process.env.PR05_RESULTS_FILE,JSON.stringify({marker,scenarios:results},null,2));
});
