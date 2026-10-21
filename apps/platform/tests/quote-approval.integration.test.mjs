import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.QUOTE_APPROVAL_DISPOSABLE_STACK === "1" && Boolean(process.env.QUOTE_APPROVAL_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("Atomic quote approval with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.QUOTE_APPROVAL_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.equal(process.env.QUOTE_APPROVAL_WEB_URL, "http://127.0.0.1:3102");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.QUOTE_APPROVAL_DOCKER_BIN;
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
    const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/QUOTE_APPROVAL_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(new Error('Lock exited before ready: '+err)));});
    p.stdin.write(`begin; ${source}; select 'QUOTE_APPROVAL_LOCKED:'||pg_backend_pid();\n`);await ready;
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
    const u = check(await service.auth.admin.createUser({ email: `qa-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    accountIds.push(u.id);
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `QUOTE_APPROVAL ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const customer=check(await service.from('customers').insert({display_name:`QUOTE_APPROVAL disposable ${marker}`,email:`qa-${marker}@example.invalid`}).select('id').single());
  const location=check(await service.from('service_locations').insert({customer_id:customer.id,label:'QUOTE_APPROVAL local property',street:'123 Test Street',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
  const run=async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  const lines=(price=1000,extra={})=>[{name:'QUOTE_APPROVAL local work',description:'Local scope',quantity:1,unit_price_cents:price,total_cents:price,...extra}];
  const header={customer_id:customer.id,organization_id:null,service_location_id:location.id};
  const read=async id=>check(await service.from('quotes').select('*,quote_line_items(*)').eq('id',id).single());
  async function draft(actor=owner,h={},l=lines()){const r=check(await actor.client.rpc('create_quote_draft',{p_header:{...header,...h},p_lines:l}));return read(r.id);}
  const savedLines=q=>q.quote_line_items.sort((a,b)=>a.sort_order-b.sort_order).map(l=>({id:l.id,name:l.name,description:l.description,quantity:Number(l.quantity),unit_price_cents:l.unit_price_cents,total_cents:l.total_cents}));
  const save=(q,l=savedLines(q),h={},actor=owner,extra={})=>actor.client.rpc('save_quote_details',{p_quote_id:q.id,p_expected_revision:q.edit_revision,p_header:h,p_lines:l,...extra});
  const history=async q=>check(await service.from('activity_log').select('*').eq('subject_id',q.id).eq('event_type','quote_updated'));
  async function job(extra={}){return check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'new_lead',service_type:'tree_removal',requested_scope:'QUOTE_APPROVAL local scope',...extra}).select('*').single());}
  const approve=(q,actor=owner,version=q.edit_revision)=>actor.client.rpc('approve_quote',{p_quote_id:q.id,p_expected_revision:version});
  const jobsFor=async q=>check(await service.from('jobs').select('*').eq('source_quote_id',q.id));
  const events=async(q,type='quote_approved')=>check(await service.from('activity_log').select('*').eq('subject_id',q.id).eq('event_type',type));
  async function token(q,extra={}) {return check(await service.from('quote_portal_tokens').insert({quote_id:q.id,customer_id:customer.id,token_hash:randomBytes(32).toString('hex'),...extra}).select('*').single());}
  const portal=(q,t,version=q.edit_revision)=>service.rpc('approve_quote_by_portal',{p_token_hash:t.token_hash,p_expected_revision:version});
  const fresh=async q=>read(q.id);
  await run('all office roles atomically approve the displayed revision and create exactly one accepted work order',async()=>{
    for(const actor of [owner,admin,estimator,payroll]) {
      const q=await draft(actor,{customer_message:'Approved local note'},lines(1200,{description:'Approved scope'})),r=check(await approve(q,actor)),after=await fresh(q),jobs=await jobsFor(q);
      assert.equal(after.status,'approved');assert.equal(after.approved_from_revision,q.edit_revision);assert.equal(after.job_id,r.job_id);assert.equal(jobs.length,1);assert.equal(jobs[0].status,'accepted');assert.equal(jobs[0].requested_scope,'Approved local note\n\nApproved scope');assert.equal(r.created_job,true);
      assert.equal((await events(q)).length,1);assert.equal((await events(q))[0].actor_user_id,actor.id);assert.equal(check(await service.from('invoices').select('id').eq('quote_id',q.id)).length,0);
      const scope=check(await service.from('job_closeout_scope_items').select('quote_line_item_id,title,description').eq('job_id',r.job_id));assert.ok(scope.some(s=>s.quote_line_item_id===q.quote_line_items[0].id&&s.description==='Approved scope'));
    }
  });
  await run('simultaneous approvals and response-loss retries reuse the committed work order and timestamps',async()=>{
    const q=await draft(),responses=(await Promise.all([approve(q),approve(q,admin)])).map(r=>check(r));assert.equal(new Set(responses.map(r=>r.job_id)).size,1);assert.equal(responses.filter(r=>r.replayed).length,1);
    const before=await fresh(q),retry=check(await approve(q));assert.equal(retry.replayed,true);assert.deepEqual(await fresh(q),before);assert.equal((await jobsFor(q)).length,1);assert.equal((await events(q)).length,1);
  });
  await run('a stale or absent page version never creates work or approves a newer proposal',async()=>{
    const q=await draft();check(await save(q,lines(1800),{customer_message:'Newly edited scope'}));
    denied(await approve(q),'PT409');denied(await approve(q,owner,null),'PT409');assert.equal((await jobsFor(q)).length,0);assert.equal((await fresh(q)).status,'draft');
    const current=await fresh(q),r=check(await approve(current));assert.match((await jobsFor(q))[0].requested_scope,/Newly edited scope/);assert.equal(r.replayed,false);
  });
  await run('editing and approving concurrently choose one consistent version without orphaned work',async()=>{
    for(let i=0;i<4;i++) {
      const q=await draft(),[a,s]=await Promise.all([approve(q),save(q,lines(1900),{customer_message:'Concurrent new scope'},admin)]),after=await fresh(q);
      if(a.error){assert.equal(a.error.code,'PT409');assert.equal(check(s).conflict,undefined);assert.equal(after.status,'draft');assert.equal(after.total_cents,1900);assert.equal((await jobsFor(q)).length,0);}
      else{check(a);if(s.error)assert.equal(s.error.code,'PT409');else assert.equal(check(s).conflict,true);assert.equal(after.status,'approved');assert.equal(after.total_cents,1000);assert.equal((await jobsFor(q)).length,1);}
    }
  });
  await run('a real editor lock waits before the version check and leaves no partially accepted job',async()=>{
    const q=await draft(),release=await hold(`update public.quotes set customer_message='Locked editor changed scope' where id='${q.id}'`),pending=approve(q).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}denied(await pending,'PT409');assert.equal((await jobsFor(q)).length,0);assert.equal((await events(q)).length,0);
  });
  await run('an uncommitted approval blocks a real save; after commit the unsaved editor gets a conflict',async()=>{
    const q=await draft(),release=await hold(`set local role authenticated; select set_config('request.jwt.claim.sub','${owner.id}',true);select set_config('request.jwt.claims','{"sub":"${owner.id}","role":"authenticated"}',true);select public.approve_quote('${q.id}',${q.edit_revision})`),pending=save(q,lines(2200)).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}const response=await pending;if(response.error)assert.equal(response.error.code,'PT409');else assert.equal(check(response).conflict,true);assert.equal((await fresh(q)).status,'approved');assert.equal((await fresh(q)).total_cents,1000);assert.equal((await jobsFor(q)).length,1);
  });
  await run('two quotes cannot both claim the same linked lead and later work statuses never regress',async()=>{
    const j=await job(),q1=await draft(owner,{job_id:j.id}),q2=await draft(owner,{job_id:j.id}),r=await Promise.all([approve(q1),approve(q2,admin)]);
    assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='23514').length,1);const winner=r[0].error?q2:q1,loser=r[0].error?q1:q2;
    assert.equal((await fresh(loser)).status,'draft');assert.equal((await jobsFor(winner)).length,1);assert.equal((await jobsFor(loser)).length,0);
    check(await service.from('jobs').update({status:'in_progress'}).eq('id',j.id));const before=check(await service.from('jobs').select('*').eq('id',j.id).single());check(await approve(winner));assert.deepEqual(check(await service.from('jobs').select('*').eq('id',j.id).single()),before);
  });
  await run('late mandatory history failure rolls back quote, new job, closeout, material plans and pending reminders',async()=>{
    const material=check(await service.from('material_catalog').insert({name:`Approval local material ${marker}`,category:'mulch',default_unit:'cubic_yard'}).select('id').single());
    const q=await draft(owner,{},lines(1000,{material_id:material.id})),before=await fresh(q),constraint=`qa_audit_${marker}`;
    const reminder=check(await service.from('customer_communications').insert({customer_id:customer.id,quote_id:q.id,communication_type:'quote_follow_up',reminder_stage:'first',recipient_source:'customer',recipient_email:`qa-${marker}@example.invalid`,scheduled_for:new Date().toISOString(),status:'pending',idempotency_key:`qa-${marker}`}).select('*').single());
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${q.id}'::uuid or event_type<>'quote_approved') not valid`);
    try{denied(await approve(q),'23514');assert.deepEqual(await fresh(q),before);assert.equal((await jobsFor(q)).length,0);assert.equal(check(await service.from('quote_material_requirements').select('id').eq('quote_id',q.id)).length,0);assert.deepEqual(check(await service.from('customer_communications').select('*').eq('id',reminder.id).single()),reminder);}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    const r=check(await approve(q));assert.equal(check(await service.from('job_material_requirements').select('id').eq('job_id',r.job_id)).length,1);assert.equal(check(await service.from('customer_communications').select('status').eq('id',reminder.id).single()).status,'cancelled');
  });
  await run('existing material plan identities survive and approval replay never reserves or replays planning changes',async()=>{
    const material=check(await service.from('material_catalog').insert({name:`Approval retained material ${marker}`,category:'mulch',default_unit:'cubic_yard'}).select('id').single()),q=await draft(owner,{},lines(1000,{material_id:material.id}));
    const plan=check(await service.from('quote_material_requirements').insert({quote_id:q.id,quote_line_item_id:q.quote_line_items[0].id,material_id:material.id,planned_quantity:7,unit:'cubic_yard'}).select('*').single());
    const r=check(await approve(q)),jobPlan=check(await service.from('job_material_requirements').select('*').eq('job_id',r.job_id).single());assert.equal(jobPlan.source_quote_requirement_id,plan.id);assert.equal(Number(jobPlan.planned_quantity),1);assert.deepEqual(check(await service.from('quote_material_requirements').select('*').eq('id',plan.id).single()),plan);
    check(await service.from('job_material_requirements').update({planned_quantity:9}).eq('id',jobPlan.id));check(await approve(q));assert.equal(Number(check(await service.from('job_material_requirements').select('planned_quantity').eq('id',jobPlan.id).single()).planned_quantity),9);
  });
  await run('closed quotes, cancelled work and foreign work order properties fail without state changes',async()=>{
    for(const status of ['declined','expired','cancelled']){let q=await draft();check(await service.from('quotes').update({status}).eq('id',q.id));q=await fresh(q);denied(await approve(q),'23514');assert.equal((await jobsFor(q)).length,0);}
    const j=await job({status:'cancelled'}),q=await draft(owner,{job_id:j.id});denied(await approve(q),'23514');assert.equal((await fresh(q)).status,'draft');
    const otherLocation=check(await service.from('service_locations').insert({customer_id:customer.id,label:'Other local property',street:'456 Test Street',city:'Fredericksburg',state:'VA'}).select('id').single());
    const j2=await job(),q2=await draft(owner,{job_id:j2.id});check(await service.from('jobs').update({service_location_id:otherLocation.id}).eq('id',j2.id));denied(await approve(q2),'23514');assert.equal((await fresh(q2)).status,'draft');
  });
  await run('anonymous, field and external roles cannot approve and service-only calls cannot use the staff command',async()=>{
    const q=await draft();for(const actor of [{client:anon},{client:service},await account('crew'),await account('customer'),await account('property_manager')])denied(await approve(q,actor),'42501');assert.equal((await jobsFor(q)).length,0);
  });
  await run('old issued staff JWT cannot approve or replay approval after live deactivation',async()=>{
    const actor=await account('owner','deactivated'),q=await draft(actor);check(await approve(q,actor));check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('id',actor.employeeId));denied(await approve(q,actor),'42501');
  });
  await run('staff deactivation while approval waits is checked again after the quote lock',async()=>{
    const actor=await account('owner','waiting-deactivation'),q=await draft(actor),release=await hold(`select id from public.quotes where id='${q.id}' for update`),pending=approve(q,actor).then(r=>r);
    try{await waitBlocked(release.pid);check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('id',actor.employeeId));}finally{await release();}
    denied(await pending,'42501');assert.equal((await jobsFor(q)).length,0);assert.equal((await fresh(q)).status,'draft');
  });
  await run('automatically archived website leads restore atomically but manually archived work stays protected',async()=>{
    const j=await job({website_submission_id:randomUUID(),archived_at:new Date().toISOString(),archived_by_user_id:owner.id,lead_disposition:'archived'}),q=await draft(owner,{job_id:j.id}),result=check(await approve(q));assert.equal(result.job_id,j.id);
    const after=check(await service.from('jobs').select('*').eq('id',j.id).single());assert.equal(after.archived_at,null);assert.equal(after.archived_by_user_id,null);assert.equal(after.lead_disposition,'active');assert.equal(after.status,'accepted');
    const manual=await job({archived_at:new Date().toISOString()}),q2=await draft(owner,{job_id:manual.id});denied(await approve(q2),'23514');assert.equal((await fresh(q2)).status,'draft');
  });
  await run('recurring approval status and work-order links roll back with late history failure',async()=>{
    const plan=check(await service.from('recurring_service_plans').insert({customer_id:customer.id,plan_name:'Approval local renewal',service_description:'Local work',recurrence_pattern:'annually',created_by_user_id:owner.id}).select('id').single());
    const pl=check(await service.from('recurring_plan_locations').insert({recurring_plan_id:plan.id,service_location_id:location.id,next_service_due_date:'2027-10-16'}).select('id').single());
    const occurrence=check(await service.from('recurring_service_occurrences').insert({recurring_plan_id:plan.id,recurring_plan_location_id:pl.id,service_location_id:location.id,occurrence_key:`qa-${marker}`,target_service_date:'2027-10-16',authorization_mode_snapshot:'quote_required'}).select('*').single());
    const q=await draft(owner,{recurring_service_plan_id:plan.id,recurring_occurrence_id:occurrence.id}),constraint=`qa_recurring_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${q.id}'::uuid or event_type<>'quote_approved') not valid`);
    try{denied(await approve(q),'23514');assert.deepEqual(check(await service.from('recurring_service_occurrences').select('*').eq('id',occurrence.id).single()),occurrence);assert.equal((await jobsFor(q)).length,0);}finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    const r=check(await approve(q)),after=check(await service.from('recurring_service_occurrences').select('*').eq('id',occurrence.id).single());assert.equal(after.status,'approved');assert.equal(after.work_order_id,r.job_id);assert.equal(after.renewal_quote_id,q.id);
  });
  await run('direct authenticated acceptance, timestamps and work-order source bindings cannot bypass the command',async()=>{
    const q=await draft(),j=await job();denied(await owner.client.from('quotes').update({status:'approved'}).eq('id',q.id),'42501');denied(await owner.client.from('quotes').update({approved_at:new Date().toISOString()}).eq('id',q.id),'42501');
    denied(await owner.client.from('jobs').update({source_quote_id:q.id}).eq('id',j.id),'42501');denied(await owner.client.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'accepted',service_type:'other',requested_scope:'Bypass',source_quote_id:q.id}),'42501');
    const r=check(await approve(q));denied(await owner.client.from('quotes').update({job_id:null}).eq('id',q.id),'42501');denied(await owner.client.from('jobs').update({source_quote_id:null}).eq('id',r.job_id),'42501');
    check(await owner.client.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'accepted',service_type:'other',requested_scope:'Ordinary manual work remains available'}));
  });
  await run('valid customer-token approval uses a server-only command and atomically records token use',async()=>{
    const q=await draft(),t=await token(q),r=check(await portal(q,t)),after=await fresh(q),used=check(await service.from('quote_portal_tokens').select('*').eq('id',t.id).single());assert.equal(after.status,'approved');assert.equal(used.used_at,after.approved_at);assert.equal((await events(q))[0].actor_type,'portal');assert.equal((await events(q))[0].actor_user_id,null);
    denied(await owner.client.rpc('approve_quote_by_portal',{p_token_hash:t.token_hash,p_expected_revision:q.edit_revision}),'42501');denied(await anon.rpc('approve_quote_by_portal',{p_token_hash:t.token_hash,p_expected_revision:q.edit_revision}),'42501');assert.equal(check(await portal(q,t)).job_id,r.job_id);assert.equal((await events(q)).length,1);
  });
  await run('expired, revoked, missing, malformed and stale customer tokens cannot create work',async()=>{
    for(const patch of [{revoked_at:new Date().toISOString()},{expires_at:'2020-01-01T00:00:00Z'}]){const q=await draft(),t=await token(q,patch);denied(await portal(q,t),'42501');assert.equal((await jobsFor(q)).length,0);}
    const q=await draft(),t=await token(q);check(await save(q,lines(2100)));denied(await portal(q,t),'PT409');assert.equal((await jobsFor(q)).length,0);denied(await portal(q,{token_hash:'bad'}),'42501');denied(await portal(q,{token_hash:randomBytes(32).toString('hex')}),'42501');
  });
  await run('token revocation committed while approval waits is rechecked under lock',async()=>{
    const q=await draft(),t=await token(q),release=await hold(`update public.quote_portal_tokens set revoked_at=clock_timestamp() where id='${t.id}'`),pending=portal(q,t).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}denied(await pending,'42501');assert.equal((await fresh(q)).status,'draft');assert.equal((await jobsFor(q)).length,0);
  });
  await run('late portal approval failure rolls back token use and all work; retry can then finish',async()=>{
    const q=await draft(),t=await token(q),constraint=`qa_portal_${marker}`;await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${q.id}'::uuid or event_type<>'quote_approved') not valid`);
    try{denied(await portal(q,t),'23514');assert.equal((await jobsFor(q)).length,0);assert.equal(check(await service.from('quote_portal_tokens').select('used_at').eq('id',t.id).single()).used_at,null);assert.equal((await fresh(q)).status,'draft');}finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}check(await portal(q,t));
  });
  await run('legacy approved quote repair preserves original acceptance time and replays without duplicate history',async()=>{
    let q=await draft();check(await service.from('quotes').update({status:'approved',approved_at:'2026-10-15T12:00:00Z'}).eq('id',q.id));q=await fresh(q);const t=await token(q);denied(await portal(q,t),'23514');assert.equal((await jobsFor(q)).length,0);
    const r=check(await approve(q));assert.equal((await fresh(q)).approved_at,'2026-10-15T12:00:00+00:00');assert.equal((await events(q,'quote_approval_repaired')).length,1);assert.equal((await events(q)).length,0);assert.equal(check(await approve(q)).job_id,r.job_id);
  });
  await run('approval and PR04 generation share parent order and never create separate work orders',async()=>{
    const q=await draft(),[a,g]=await Promise.all([approve(q),owner.client.rpc('generate_job_invoice',{p_request_id:randomUUID(),p_quote_id:q.id})]);check(a);if(g.error)assert.ok(['23514','PT409'].includes(g.error.code),g.error.message);else check(g);
    const jobs=await jobsFor(q);assert.equal(jobs.length,1);const after=await fresh(q);assert.equal(after.job_id,jobs[0].id);assert.equal(after.status,'approved');
  });
  if(process.env.QUOTE_APPROVAL_RESULTS_FILE) writeFileSync(process.env.QUOTE_APPROVAL_RESULTS_FILE,JSON.stringify({marker,scenarios:results},null,2));
});
