import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.PR04_DISPOSABLE_STACK === "1" && Boolean(process.env.PR04_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR04 atomic invoice generation with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR04_LOCAL_STATUS_FILE, "utf8"));
  const isolated = process.env.PR04_LOCAL_ENV_FILE ? JSON.parse(readFileSync(process.env.PR04_LOCAL_ENV_FILE, "utf8")) : null;
  if (isolated?.projectId.startsWith("ats_coreview_")) { assert.equal(c.API_URL, "http://127.0.0.1:63421"); assert.match(isolated.container, /^supabase_db_ats_coreview_[a-f0-9]+$/); }
  else if (isolated) { assert.equal(c.API_URL, "http://127.0.0.1:62421"); assert.match(isolated.container, /^supabase_db_ats_comanual_[a-f0-9]+$/); }
  else assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR04_DOCKER_BIN;
  assert.ok(docker);
  const base = ["exec", "-i", isolated?.container ?? "supabase_db_ats_pr02_disposable", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
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
    const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR04_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(new Error('Lock exited before ready: '+err)));});
    p.stdin.write(`begin; ${source}; select 'PR04_LOCKED:'||pg_backend_pid();\n`);await ready;
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
    const u = check(await service.auth.admin.createUser({ email: `pr04-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    accountIds.push(u.id);
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR04 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const customer=check(await service.from('customers').insert({display_name:`PR04 disposable ${marker}`,email:`pr04-${marker}@example.invalid`}).select('id').single());
  const location=check(await service.from('service_locations').insert({customer_id:customer.id,label:'PR04 local property',street:'123 Test Street',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
  const run=async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  let seq=0;
  async function job(extra={}) {return check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'scheduled',service_type:'tree_removal',requested_scope:'Synthetic PR04 work only',...extra}).select('*').single());}
  async function quote(j,amount=1000,extra={}) {
    const row=check(await service.from('quotes').insert({job_id:j?.id??null,customer_id:customer.id,service_location_id:location.id,status:'approved',subtotal_cents:amount,tax_cents:100,total_cents:amount+100,...extra}).select('*').single());
    if(amount) check(await service.from('quote_line_items').insert({quote_id:row.id,name:`PR04 source ${++seq}`,quantity:1,unit_price_cents:amount,total_cents:amount}));
    if(j) check(await service.from('jobs').update({source_quote_id:row.id}).eq('id',j.id));
    return row;
  }
  async function addition(j,extra={}) {
    const row=check(await service.from('change_orders').insert({job_id:j.id,customer_id:j.customer_id,organization_id:j.organization_id,service_location_id:j.service_location_id,
      source_quote_id:j.source_quote_id,created_by_user_id:owner.id,title:'PR04 additional work',subtotal_cents:500,tax_cents:50,fee_cents:25,total_cents:575,...extra,status:'draft'}).select('*').single());
    check(await service.from('change_order_line_items').insert({change_order_id:row.id,title:'Approved limb removal',quantity:1,unit_price_cents:500,amount_cents:500}));return check(await service.from('change_orders').update({status:extra.status??'approved'}).eq('id',row.id).select('*').single());
  }
  async function session(j){return check(await service.from('schedule_events').insert({job_id:j.id,service_location_id:j.service_location_id,title:'PR04 work session',event_type:'job',status:'scheduled',starts_at:'2026-11-01T14:00:00Z',ends_at:'2026-11-01T16:00:00Z',created_by_user_id:owner.id}).select('*').single());}
  const gen=(j,id=randomUUID(),actor=owner,extra={})=>actor.client.rpc('generate_job_invoice',{p_request_id:id,p_job_id:j?.id??null,...extra});
  const read=async id=>check(await service.from('invoices').select('*,invoice_line_items(*)').eq('id',id).single());
  const jobRead=async j=>check(await service.from('jobs').select('*').eq('id',j.id).single());
  const invoices=async j=>check(await service.from('invoices').select('id').eq('job_id',j.id));
  const requests=async j=>JSON.parse(await sql(`select coalesce(json_agg(r),'[]') from app_private.invoice_generation_requests r where job_id='${j.id}'`));
  await run('each existing office role retains invoice generation authority',async()=>{
    for(const actor of [owner,admin,estimator,payroll]) {const j=await job();const r=check(await gen(j,randomUUID(),actor));assert.equal((await read(r.invoice_id)).status,'draft');assert.equal((await jobRead(j)).status,'scheduled');}
  });
  await run('anonymous, customer, crew, property manager and service-only sessions cannot generate',async()=>{
    const j=await job();for(const actor of [{client:anon},{client:service},await account('customer'),await account('crew'),await account('property_manager')]) denied(await gen(j,randomUUID(),actor),'42501');
    assert.equal((await invoices(j)).length,0);
  });
  await run('an old owner JWT loses command and replay access after deactivation',async()=>{
    const actor=await account('owner','separated'),j=await job(),id=randomUUID();check(await gen(j,id,actor));
    check(await service.from('employee_records').update({employment_status:'separated',is_active:false}).eq('id',actor.employeeId));
    denied(await gen(j,id,actor),'42501');denied(await gen(await job(),randomUUID(),actor),'42501');
  });
  await run('source prices plus approved additions, tax and fees are copied atomically without completing work',async()=>{
    const j=await job();const q=await quote(j);const linked=await jobRead(j),co=await addition(linked),s=await session(j),id=randomUUID();
    const r=check(await gen(j,id)),inv=await read(r.invoice_id);assert.equal(inv.quote_id,q.id);assert.equal(inv.subtotal_cents,1525);assert.equal(inv.tax_cents,150);assert.equal(inv.total_cents,1675);assert.equal(inv.balance_due_cents,1675);
    assert.equal(inv.invoice_line_items.length,3);assert.equal(inv.invoice_line_items.filter(l=>l.source_change_order_line_item_id).length,1);
    assert.equal(check(await service.from('change_orders').select('invoice_id').eq('id',co.id).single()).invoice_id,inv.id);
    assert.equal(check(await service.from('schedule_events').select('status').eq('id',s.id).single()).status,'scheduled');
    assert.equal((await jobRead(j)).completed_by_user_id,null);assert.equal((await requests(j)).length,1);assert.equal(r.added_change_order_count,1);
    const counts=check(await service.from('activity_log').select('event_type').in('subject_id',[j.id,inv.id]));
    for(const event of ['invoice_created','invoice_draft_created','invoice_draft_created_from_job','approved_change_orders_added']) assert.equal(counts.filter(x=>x.event_type===event).length,1);
  });
  await run('concurrent distinct clicks from multiple office users and both source paths produce one base invoice',async()=>{
    const j=await job(),q=await quote(j);const responses=await Promise.all(Array.from({length:8},(_,i)=>i%2?gen(j,randomUUID(),i%3?owner:admin):gen(null,randomUUID(),owner,{p_quote_id:q.id})));
    const rows=responses.map(r=>check(r));assert.equal(new Set(rows.map(r=>r.invoice_id)).size,1);assert.equal(rows.filter(r=>!r.existing).length,1);assert.equal((await invoices(j)).length,1);
  });
  await run('simultaneous identical request and replay after discarded response return the original invoice without repeating history',async()=>{
    const j=await job(),id=randomUUID(),rows=(await Promise.all([gen(j,id),gen(j,id)])).map(r=>check(r));
    assert.equal(rows[0].invoice_id,rows[1].invoice_id);const before=check(await service.from('activity_log').select('id').in('subject_id',[j.id,rows[0].invoice_id])).length;
    assert.equal(check(await gen(j,id)).invoice_id,rows[0].invoice_id);assert.equal(check(await service.from('activity_log').select('id').in('subject_id',[j.id,rows[0].invoice_id])).length,before);
    denied(await gen(await job(),id),'23514');denied(await gen(j,id,admin),'23514');
  });
  await run('voided existing invoices and replayed voids return explicit status without new charges or completion changes',async()=>{
    const j=await job(),id=randomUUID(),r=check(await gen(j,id));
    const lease=check(await owner.client.rpc('begin_invoice_void',{p_invoice_id:r.invoice_id}));
    check(await owner.client.rpc('finalize_invoice_void',{p_invoice_id:r.invoice_id,p_token:lease.token}));
    assert.equal(check(await gen(j,id)).invoice_status,'void');assert.equal(check(await gen(j)).invoice_status,'void');assert.equal((await invoices(j)).length,1);
  });
  await run('zero-priced scope is an unsent draft rather than a payment',async()=>{
    const j=await job(),r=check(await gen(j)),inv=await read(r.invoice_id);assert.equal(inv.invoice_line_items.length,1);assert.equal(inv.total_cents,0);assert.equal(inv.status,'draft');assert.equal(inv.paid_at,null);assert.equal(inv.sent_at,null);
  });
  await run('invalid source arithmetic, unapproved source, source-job and contracting-party mismatches fail closed',async()=>{
    const j=await job(),q=await quote(j);check(await service.from('quote_line_items').update({total_cents:999}).eq('quote_id',q.id));denied(await gen(j));assert.equal((await invoices(j)).length,0);
    // Construct invalid imported sources before closure; the new PR05 guard
    // correctly prevents reopening/rebinding an already closed quote.
    const unapprovedJob=await job();await quote(unapprovedJob,1000,{status:'draft'});denied(await gen(unapprovedJob),'23514');
    const mismatchedJob=await job(),otherJob=await job();await quote(mismatchedJob,1000,{job_id:otherJob.id});denied(await gen(mismatchedJob),'23514');
    const foreignJob=await job(),otherParty=check(await service.from('customers').insert({display_name:'PR04 other party'}).select('id').single());
    await quote(foreignJob,1000,{customer_id:otherParty.id});denied(await gen(foreignJob),'23514');
  });
  await run('late audit failure rolls back header, every line, addition links, completion, sessions and request; same UUID can retry',async()=>{
    const j=await job();await quote(j);const co=await addition(await jobRead(j)),s=await session(j),id=randomUUID(),constraint=`pr04_audit_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${j.id}'::uuid or event_type<>'invoice_draft_created_from_job') not valid`);
    try {denied(await gen(j,id),'23514');assert.equal((await invoices(j)).length,0);assert.equal((await jobRead(j)).status,'scheduled');assert.equal(check(await service.from('schedule_events').select('status').eq('id',s.id).single()).status,'scheduled');assert.equal(check(await service.from('change_orders').select('invoice_id').eq('id',co.id).single()).invoice_id,null);assert.equal((await requests(j)).length,0);}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    check(await gen(j,id));assert.equal((await invoices(j)).length,1);
  });
  await run('line insertion failure after a valid header leaves no orphan invoice or request',async()=>{
    const j=await job(),q=await quote(j),constraint=`pr04_line_${marker}`;
    await sql(`alter table public.invoice_line_items add constraint ${constraint} check(name not like 'PR04 source %') not valid`);
    try{denied(await gen(j),'23514');assert.equal((await invoices(j)).length,0);assert.equal((await requests(j)).length,0);assert.equal((await jobRead(j)).status,'scheduled');}
    finally{await sql(`alter table public.invoice_line_items drop constraint ${constraint}`);}
    assert.equal(check(await service.from('quotes').select('id').eq('id',q.id).single()).id,q.id);
  });
  await run('inconsistent or foreign approved addition rolls back the entire generated draft',async()=>{
    const j=await job();await quote(j);const co=await addition(await jobRead(j));denied(await service.from('change_order_line_items').update({amount_cents:499}).eq('change_order_id',co.id),'23514');
    // Inject legacy corruption only through the explicitly disposable maintenance connection.
    await sql(`update public.change_order_line_items set amount_cents=499 where change_order_id='${co.id}'`);
    denied(await gen(j),'23514');assert.equal((await invoices(j)).length,0);
    await sql(`update public.change_order_line_items set amount_cents=500 where change_order_id='${co.id}'`);const other=check(await service.from('service_locations').insert({customer_id:customer.id,label:'Other local property',street:'789 Test Street',city:'Fredericksburg',state:'VA'}).select('id').single());denied(await service.from('change_orders').update({service_location_id:other.id}).eq('id',co.id),'23514');await sql(`update public.change_orders set service_location_id='${other.id}'where id='${co.id}'`);
    denied(await gen(j),'23514');assert.equal((await requests(j)).length,0);
  });
  await run('custom work-order invoices preserve entered lines and internal note inside the transaction',async()=>{
    const j=await job(),id=randomUUID(),manual={customer_id:customer.id,organization_id:null,due_at:'2026-11-15T17:00:00Z',notes:'PR04 internal only',lines:[{name:'Custom office charge',quantity:2,unit_price_cents:700,total_cents:1400}]};
    const r=check(await gen(j,id,owner,{p_manual:manual})),inv=await read(r.invoice_id);assert.equal(inv.total_cents,1400);assert.equal(inv.quote_id,null);
    assert.equal(check(await service.from('notes').select('body').eq('job_id',j.id).single()).body,'Invoice note: PR04 internal only');
    denied(await gen(j,id,owner,{p_manual:{...manual,notes:'Changed'}}),'23514');assert.equal(check(await gen(j,id,owner,{p_manual:manual})).invoice_id,inv.id);
  });
  await run('manual party forgery and invalid late note fail without partial invoices',async()=>{
    const j=await job();denied(await gen(j,randomUUID(),owner,{p_manual:{customer_id:owner.id,organization_id:null,lines:[]}}),'23514');
    const constraint=`pr04_note_${marker}`;await sql(`alter table public.notes add constraint ${constraint} check(job_id<>'${j.id}'::uuid) not valid`);
    try{denied(await gen(j,randomUUID(),owner,{p_manual:{customer_id:customer.id,organization_id:null,notes:'Late failure',lines:[{name:'Work',quantity:1,unit_price_cents:100,total_cents:100}]}}),'23514');assert.equal((await invoices(j)).length,0);assert.equal((await jobRead(j)).status,'scheduled');}
    finally{await sql(`alter table public.notes drop constraint ${constraint}`);}
  });
  await run('approved quote without work order creates and links it in the same transaction',async()=>{
    const q=await quote(null),id=randomUUID(),r=check(await gen(null,id,owner,{p_quote_id:q.id})),j=await jobRead({id:r.job_id});assert.equal(j.source_quote_id,q.id);assert.equal(j.status,'accepted');assert.equal(j.completed_at,null);
    assert.equal(check(await service.from('quotes').select('job_id').eq('id',q.id).single()).job_id,j.id);assert.equal(check(await gen(null,id,owner,{p_quote_id:q.id})).invoice_id,r.invoice_id);
  });
  await run('explicit duplicate/supplemental drafts remain possible and historical multiple invoices remain untouched',async()=>{
    const j=await job(),first=check(await gen(j));
    const extra=check(await owner.client.rpc('create_invoice_draft',{p_header:{job_id:j.id,customer_id:customer.id,service_location_id:location.id},p_lines:[{name:'Intentional supplemental work',quantity:1,unit_price_cents:500,total_cents:500}]}));
    assert.notEqual(first.invoice_id,extra.id);assert.equal((await invoices(j)).length,2);assert.equal(check(await gen(j)).invoice_id,first.invoice_id);assert.equal((await invoices(j)).length,2);
  });
  await run('deleting a never-sent draft does not silently regenerate a previously committed request',async()=>{
    const j=await job(),id=randomUUID(),r=check(await gen(j,id));check(await owner.client.from('invoices').delete().eq('id',r.invoice_id));denied(await gen(j,id),'23514');assert.equal((await invoices(j)).length,0);assert.equal((await requests(j)).length,1);
  });
  await run('existing completion provenance is retained and draft preparation leaves remaining visits open',async()=>{
    const when='2026-09-01T12:34:56+00:00',j=await job();const visit=await session(j);check(await service.from('jobs').update({status:'completed',completed_at:when,completed_by_user_id:admin.id}).eq('id',j.id));check(await gen(j));const after=await jobRead(j);assert.equal(new Date(after.completed_at).toISOString(),new Date(when).toISOString());assert.equal(after.completed_by_user_id,admin.id);assert.equal(check(await service.from('schedule_events').select('status').eq('id',visit.id).single()).status,'scheduled');
  });
  await run('private request records are unavailable to authenticated and service API callers',async()=>{
    const r=await owner.client.schema('app_private').from('invoice_generation_requests').select('*');assert.ok(r.error);
    assert.equal(await sql("select has_table_privilege('authenticated','app_private.invoice_generation_requests','SELECT')"),'f');
    assert.equal(await sql("select has_table_privilege('service_role','app_private.invoice_generation_requests','INSERT')"),'f');
  });
  await run('generation waits on the actual job lock and reads a committed source edit after waiting',async()=>{
    const j=await job(),q=await quote(j),release=await hold(`select id from public.jobs where id='${j.id}' for update`);
    const pending=gen(j).then(r=>r);
    try {await waitBlocked(release.pid);
      check(await service.from('quote_line_items').update({unit_price_cents:1200,total_cents:1200}).eq('quote_id',q.id));
      check(await service.from('quotes').update({subtotal_cents:1200,total_cents:1300}).eq('id',q.id));
    } finally{await release();}
    assert.equal((await read(check(await pending).invoice_id)).total_cents,1300);
  });
  await run('existing source line edits wait on the quote parent lock, including deletion',async()=>{
    const j=await job(),q=await quote(j);
    for(const op of ['update','delete']) {
      const release=await hold(`select id from public.quotes where id='${q.id}' for update`);
      const pending=op==='update'?service.from('quote_line_items').update({description:'Committed edit'}).eq('quote_id',q.id).then(r=>r):service.from('quote_line_items').delete().eq('quote_id',q.id).then(r=>r);
      try {await waitBlocked(release.pid);} finally{await release();}
      check(await pending);
    }
  });
  await run('approved addition line edits wait on the parent and remain denied',async()=>{
    const j=await job(),co=await addition(j),release=await hold(`select id from public.change_orders where id='${co.id}' for update`);
    const pending=service.from('change_order_line_items').update({description:'Committed addition edit'}).eq('change_order_id',co.id).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}denied(await pending,'23514');assert.equal(check(await service.from('change_order_line_items').select('description').eq('change_order_id',co.id).single()).description,null);
  });
  await run('organization billing preserves active contacts and party/location authority',async()=>{
    const org=check(await service.from('organizations').insert({name:`PR04 organization ${marker}`}).select('id').single());
    const loc=check(await service.from('service_locations').insert({customer_id:null,organization_id:org.id,label:'PR04 organization property',street:'456 Test Street',city:'Fredericksburg',state:'VA'}).select('id').single());
    const contact=check(await service.from('organization_contacts').insert({organization_id:org.id,full_name:'PR04 accounts payable',email:`pr04-ap-${marker}@example.invalid`,is_active:true}).select('id').single());
    const j=await job({customer_id:null,organization_id:org.id,service_location_id:loc.id,property_manager_contact_id:contact.id});
    const q=await quote(j,1000,{customer_id:null,organization_id:org.id,service_location_id:loc.id,billing_contact_id:contact.id});
    const r=check(await gen(j)),inv=await read(r.invoice_id);assert.equal(inv.customer_id,null);assert.equal(inv.organization_id,org.id);assert.equal(inv.billing_contact_id,contact.id);assert.equal(inv.accounts_payable_contact_id,contact.id);assert.equal(inv.quote_id,q.id);
    const second=await job({customer_id:null,organization_id:org.id,service_location_id:loc.id,property_manager_contact_id:contact.id});
    check(await service.from('organization_contacts').update({is_active:false}).eq('id',contact.id));denied(await gen(second),'23514');assert.equal((await invoices(second)).length,0);
  });
  await run('new quote work order rolls back too when later invoice history fails',async()=>{
    const q=await quote(null),constraint=`pr04_new_job_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(event_type<>'invoice_draft_created' or metadata_json->>'source_quote_id'<>'${q.id}') not valid`);
    const id=randomUUID();try{denied(await gen(null,id,owner,{p_quote_id:q.id}),'23514');assert.equal(check(await service.from('quotes').select('job_id').eq('id',q.id).single()).job_id,null);assert.equal(check(await service.from('jobs').select('id').eq('source_quote_id',q.id)).length,0);}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    check(await gen(null,id,owner,{p_quote_id:q.id}));
  });
  await run('integer overflow after approved additions does not leave header, links or request',async()=>{
    const j=await job();await quote(j,2147483000,{tax_cents:100,total_cents:2147483100});const co=await addition(await jobRead(j),{tax_cents:200,fee_cents:25,total_cents:725});
    denied(await gen(j),'22023');assert.equal((await invoices(j)).length,0);assert.equal(check(await service.from('change_orders').select('invoice_id').eq('id',co.id).single()).invoice_id,null);assert.equal((await requests(j)).length,0);
  });
  await run('approved quote material plans and recurring references survive generation without inventory movements',async()=>{
    const material=check(await service.from('material_catalog').insert({name:`PR04 mulch ${marker}`,category:'mulch',default_unit:'cubic_yard'}).select('id').single());
    const plan=check(await service.from('recurring_service_plans').insert({customer_id:customer.id,plan_name:`PR04 recurring ${marker}`,service_description:'Local recurring service',recurrence_pattern:'annually',created_by_user_id:owner.id}).select('id').single());
    const planLocation=check(await service.from('recurring_plan_locations').insert({recurring_plan_id:plan.id,service_location_id:location.id,next_service_due_date:'2026-11-01'}).select('id').single());
    const visit=check(await service.from('recurring_service_occurrences').insert({recurring_plan_id:plan.id,recurring_plan_location_id:planLocation.id,service_location_id:location.id,occurrence_key:`pr04-${marker}`,target_service_date:'2026-11-01',authorization_mode_snapshot:'quote_required'}).select('id').single());
    const q=await quote(null,1000,{recurring_service_plan_id:plan.id,recurring_occurrence_id:visit.id,debris_handling:'haul_all'});
    check(await service.from('quote_line_items').update({material_id:material.id}).eq('quote_id',q.id));
    const r=check(await gen(null,randomUUID(),owner,{p_quote_id:q.id})),inv=await read(r.invoice_id),j=await jobRead({id:r.job_id});
    assert.equal(inv.recurring_service_plan_id,plan.id);assert.equal(inv.recurring_occurrence_id,visit.id);assert.equal(j.debris_handling,'haul_all');
    const requirements=check(await service.from('job_material_requirements').select('material_id,planned_quantity,source_quote_requirement_id').eq('job_id',j.id));assert.equal(requirements.length,1);assert.equal(requirements[0].material_id,material.id);assert.ok(requirements[0].source_quote_requirement_id);
    assert.equal(check(await service.from('inventory_transactions').select('id').eq('job_id',j.id)).length,0);
    assert.equal(check(await service.from('recurring_service_occurrences').select('work_order_id').eq('id',visit.id).single()).work_order_id,j.id);
    const other=check(await service.from('customers').insert({display_name:'PR04 unrelated recurring party'}).select('id').single());
    const wrong=await job({customer_id:other.id,recurring_service_plan_id:plan.id});denied(await gen(wrong),'23514');assert.equal((await invoices(wrong)).length,0);
  });
  await run('manually archived linked leads require explicit restoration before quote invoicing',async()=>{
    const j=await job({status:'quoted'}),q=await quote(j);
    // A manually archived lead remains protected. The separate approval workflow
    // owns website submission records; do not fabricate or remove their guards.
    check(await service.from('jobs').update({archived_at:new Date().toISOString(),lead_disposition:'archived'}).eq('id',j.id));
    denied(await gen(null,randomUUID(),owner,{p_quote_id:q.id}),'23514');assert.equal((await invoices(j)).length,0);
  });
  await run('change-order approval locks the job before the addition and can safely precede simultaneous generation',async()=>{
    const j=await job(),co=await addition(j,{status:'sent'}),release=await hold(`select id from public.jobs where id='${j.id}' for update`);
    const approve=owner.client.rpc('record_change_order_manual_approval',{p_request_id:randomUUID(),p_change_order_id:co.id,p_expected_revision:co.edit_revision,p_approval:{name:'PR04 local approver',method:'phone',notes:'Synthetic customer authorization for reviewed scope.'}}).then(r=>r);
    let pending;
    try {await waitBlocked(release.pid);
      // NOWAIT proves approval has not taken the child lock while waiting on job.
      await sql(`begin;select id from public.change_orders where id='${co.id}' for update nowait;rollback;`);
      pending=gen(j).then(r=>r);
      for(let i=0;i<40;i++) {if(Number(await sql(`select count(*) from pg_stat_activity where ${release.pid}=any(pg_blocking_pids(pid))`))>=2)break;await new Promise(r=>setTimeout(r,25));}
    } finally{await release();}
    check(await approve);const inv=await read(check(await pending).invoice_id);assert.equal(inv.total_cents,575);assert.equal(check(await service.from('job_change_order_scope_items').select('id').eq('change_order_id',co.id)).length,1);
  });
  await run('failure to persist the durable generation result rolls back all prior work and permits the same request retry',async()=>{
    const j=await job(),id=randomUUID(),constraint=`pr04_request_${marker}`;
    await sql(`alter table app_private.invoice_generation_requests add constraint ${constraint} check(job_id<>'${j.id}'::uuid) not valid`);
    try{denied(await gen(j,id),'23514');assert.equal((await invoices(j)).length,0);assert.equal((await jobRead(j)).status,'scheduled');assert.equal((await requests(j)).length,0);}
    finally{await sql(`alter table app_private.invoice_generation_requests drop constraint ${constraint}`);}
    const r=check(await gen(j,id));assert.equal(check(await gen(j,id)).invoice_id,r.invoice_id);assert.equal((await invoices(j)).length,1);
  });
  await run('portal approval retains service authority, mandatory history and idempotent scope without reopening direct audit writes',async()=>{
    const j=await job(),co=await addition(j,{status:'sent'});
    const args={p_change_order_id:co.id,p_approved_by_name:'PR04 portal approver',p_approval_method:'portal',p_recorded_by_user_id:null};
    const approved=check(await service.rpc('approve_change_order',args));assert.equal(approved[0].newly_approved,true);
    const history=check(await service.from('activity_log').select('actor_type,actor_user_id').eq('subject_id',co.id).eq('event_type','change_order_approved'));
    assert.equal(history.length,1);assert.equal(history[0].actor_type,'portal');assert.equal(history[0].actor_user_id,null);
    denied(await owner.client.rpc('approve_change_order',args),'42501');
    assert.equal(check(await service.rpc('approve_change_order',args))[0].newly_approved,false);
    assert.equal(check(await service.from('job_change_order_scope_items').select('id').eq('change_order_id',co.id)).length,1);
    assert.equal(check(await service.from('activity_log').select('id').eq('subject_id',co.id).eq('event_type','change_order_approved')).length,1);
    denied(await owner.client.from('activity_log').insert({subject_type:'change_order',subject_id:co.id,event_type:'forged_history'}),'42501');
    denied(await (await account('crew','approval-denied')).client.rpc('approve_change_order',args));
    denied(await anon.rpc('approve_change_order',args),'42501');
  });
  if(process.env.PR04_RESULTS_FILE) writeFileSync(process.env.PR04_RESULTS_FILE,JSON.stringify({scenarios:results},null,2));
});
