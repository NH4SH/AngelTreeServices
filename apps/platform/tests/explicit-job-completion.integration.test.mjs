import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.PR09_DISPOSABLE_STACK === "1" && Boolean(process.env.PR09_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR09 explicit job completion with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR09_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR09_DOCKER_BIN;
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
    const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR09_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(new Error('Lock exited before ready: '+err)));});
    p.stdin.write(`begin; ${source}; select 'PR09_LOCKED:'||pg_backend_pid();\n`);await ready;
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
    const u = check(await service.auth.admin.createUser({ email: `pr09-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    accountIds.push(u.id);
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR09 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const customer=check(await service.from('customers').insert({display_name:`PR09 disposable ${marker}`,email:`pr09-${marker}@example.invalid`}).select('id').single());
  const location=check(await service.from('service_locations').insert({customer_id:customer.id,label:'PR09 local property',street:'123 Test Street',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
  const run=async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  let seq=0;
  async function job(extra={}) {return check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'scheduled',service_type:'tree_removal',requested_scope:'Synthetic PR09 work only',...extra}).select('*').single());}
  async function quote(j,amount=1000,extra={}) {
    const row=check(await service.from('quotes').insert({job_id:j?.id??null,customer_id:customer.id,service_location_id:location.id,status:'approved',subtotal_cents:amount,tax_cents:100,total_cents:amount+100,...extra}).select('*').single());
    if(amount) check(await service.from('quote_line_items').insert({quote_id:row.id,name:`PR09 source ${++seq}`,quantity:1,unit_price_cents:amount,total_cents:amount}));
    if(j) check(await service.from('jobs').update({source_quote_id:row.id}).eq('id',j.id));
    return row;
  }
  async function addition(j,extra={}) {
    const row=check(await service.from('change_orders').insert({job_id:j.id,customer_id:j.customer_id,organization_id:j.organization_id,service_location_id:j.service_location_id,
      source_quote_id:j.source_quote_id,created_by_user_id:owner.id,title:'PR09 additional work',status:'approved',subtotal_cents:500,tax_cents:50,fee_cents:25,total_cents:575,...extra}).select('*').single());
    check(await service.from('change_order_line_items').insert({change_order_id:row.id,title:'Approved limb removal',quantity:1,unit_price_cents:500,amount_cents:500}));return row;
  }
  async function session(j){return check(await service.from('schedule_events').insert({job_id:j.id,service_location_id:j.service_location_id,title:'PR09 work session',event_type:'job',status:'scheduled',starts_at:'2026-11-01T14:00:00Z',ends_at:'2026-11-01T16:00:00Z',created_by_user_id:owner.id}).select('*').single());}
  const gen=(j,id=randomUUID(),actor=owner,extra={})=>actor.client.rpc('generate_job_invoice',{p_request_id:id,p_job_id:j?.id??null,...extra});
  const read=async id=>check(await service.from('invoices').select('*,invoice_line_items(*)').eq('id',id).single());
  const jobRead=async j=>check(await service.from('jobs').select('*').eq('id',j.id).single());
  const invoices=async j=>check(await service.from('invoices').select('id').eq('job_id',j.id));
  const requests=async j=>JSON.parse(await sql(`select coalesce(json_agg(r),'[]') from app_private.invoice_generation_requests r where job_id='${j.id}'`));
  const crew=await account('crew'),other=await account('customer');
  const context=async(j,actor=owner)=>check(await actor.client.rpc('get_job_completion_context',{p_job_id:j.id}));
  const args=(j,c,extra={})=>({p_request_id:randomUUID(),p_job_id:j.id,p_expected_revision:c.revision,p_expected_snapshot:c.snapshot,p_confirm_future:true,...extra});
  const finish=(p,actor=owner)=>actor.client.rpc('complete_job_work',p);
  const complete=async(j,extra={},actor=owner)=>finish(args(j,await context(j,actor),extra),actor);
  const state=async j=>({job:await jobRead(j),visits:check(await service.from('schedule_events').select('*').eq('job_id',j.id).order('id')),
    closeout:check(await service.from('job_closeouts').select('*').eq('job_id',j.id)),checklist:check(await service.from('job_closeout_checklist_items').select('*').eq('job_id',j.id).order('id')),
    history:check(await service.from('activity_log').select('*').eq('subject_id',j.id).order('id'))});
  await run('invoice preparation preserves work, visits, closeout and completion provenance',async()=>{
    for(const status of ['accepted','scheduled','in_progress','completed_pending_review','ready_to_invoice']) {
      const j=await job({status});await session(j);const before=await state(j),r=check(await gen(j));
      assert.equal(r.job_completed,false);assert.deepEqual(await state(j),{...before,history:(await state(j)).history});
      assert.equal((await state(j)).history.filter(h=>h.event_type==='job_completed_from_invoice').length,0);
    }
  });
  await run('complete work alone closes visits without billing and preserves crew assignments',async()=>{
    const j=await job(),e=await session(j),before=await state(j),r=check(await complete(j));
    assert.equal(r.closed_visit_count,1);assert.equal(r.job_completed,true);assert.equal((await invoices(j)).length,0);
    const after=await state(j);assert.equal(after.job.status,'completed');assert.equal(after.job.completed_by_user_id,owner.id);
    assert.deepEqual(after.closeout,before.closeout);assert.equal(after.visits[0].status,'completed');assert.equal(after.visits[0].id,e.id);
  });
  await run('future work requires explicit confirmation and displayed revision is mandatory',async()=>{
    const j=await job();await session(j);const c=await context(j),before=await state(j);
    denied(await finish(args(j,c,{p_confirm_future:false})),'23514');denied(await finish(args(j,c,{p_expected_revision:null})),'40001');
    denied(await finish(args(j,c,{p_expected_snapshot:{visits:[],closeout:null}})),'40001');assert.deepEqual(await state(j),before);
  });
  await run('combined completion and invoice generation share the reviewed financial transaction',async()=>{
    const j=await job();await quote(j);await session(j);const r=check(await complete(j,{p_mode:'complete_and_invoice'}));
    assert.equal(r.invoice_status,'draft');assert.equal(r.job_completed,true);assert.equal((await read(r.invoice_id)).total_cents,1100);
    assert.equal((await jobRead(j)).status,'completed');assert.equal(r.context.visits.length,0);
  });
  await run('invoice validation failure rolls back completion, visits, audit and request identity',async()=>{
    const j=await job(),q=await quote(j);await session(j);check(await service.from('quote_line_items').update({total_cents:999}).eq('quote_id',q.id));
    const before=await state(j),p=args(j,await context(j),{p_mode:'complete_and_invoice'});denied(await finish(p),'23514');assert.deepEqual(await state(j),before);assert.equal((await invoices(j)).length,0);
    assert.equal(await sql(`select count(*) from app_private.job_completion_requests where request_id='${p.p_request_id}'`),'0');
  });
  await run('mandatory completion audit failure also rolls back a newly prepared combined invoice',async()=>{
    const j=await job();await session(j);const before=await state(j),p=args(j,await context(j),{p_mode:'complete_and_invoice'}),constraint=`pr09_audit_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${j.id}'::uuid or event_type<>'job_work_completed') not valid`);
    try {denied(await finish(p),'23514');assert.deepEqual(await state(j),before);assert.equal((await invoices(j)).length,0);assert.equal((await requests(j)).length,0);}
    finally {await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    check(await finish(p));
  });
  await run('failure saving the final command receipt leaves no completion or invoice',async()=>{
    const j=await job();await session(j);const before=await state(j),p=args(j,await context(j),{p_mode:'complete_and_invoice'}),constraint=`pr09_receipt_${marker}`;
    await sql(`alter table app_private.job_completion_requests add constraint ${constraint} check(request_id<>'${p.p_request_id}'::uuid) not valid`);
    try{denied(await finish(p),'23514');assert.deepEqual(await state(j),before);assert.equal((await invoices(j)).length,0);assert.equal((await requests(j)).length,0);}
    finally{await sql(`alter table app_private.job_completion_requests drop constraint ${constraint}`);}
  });
  await run('exact retries and lost responses return the original result without repeating history',async()=>{
    const j=await job();await session(j);const p=args(j,await context(j)),r=check(await finish(p)),before=await state(j);
    assert.equal(check(await finish(p)).replayed,true);assert.deepEqual(await state(j),before);assert.equal(r.closed_visit_count,1);
    denied(await finish({...p,p_reason:'different'}),'23514');denied(await finish(p,admin),'23514');
  });
  await run('two independent completion requests have one winner and one stale review',async()=>{
    const j=await job();await session(j);const c=await context(j),r=await Promise.all([finish(args(j,c)),finish(args(j,c),admin)]);
    assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='40001').length,1);
    assert.equal((await state(j)).history.filter(h=>h.event_type==='job_work_completed').length,1);
  });
  await run('two identical combined requests create one invoice and one completion',async()=>{
    const j=await job();await session(j);const p=args(j,await context(j),{p_mode:'complete_and_invoice'}),r=(await Promise.all([finish(p),finish(p)])).map(check);
    assert.equal(r[0].invoice_id,r[1].invoice_id);assert.equal((await invoices(j)).length,1);assert.equal(r.filter(x=>x.replayed).length,1);
  });
  await run('concurrent draft preparation and explicit combined completion do not deadlock or duplicate billing',async()=>{
    const j=await job();await session(j);const p=args(j,await context(j),{p_mode:'complete_and_invoice'}),r=await Promise.all([gen(j),finish(p)]);
    r.forEach(check);assert.equal(r[0].data.invoice_id,r[1].data.invoice_id);assert.equal((await invoices(j)).length,1);assert.equal((await jobRead(j)).status,'completed');
  });
  await run('already completed jobs retain their original time, actor and work history',async()=>{
    const j=await job({status:'completed',completed_at:'2026-01-01T12:00:00Z',completed_by_user_id:admin.id}),before=await state(j);
    assert.equal(check(await complete(j)).already_completed,true);assert.deepEqual(await state(j),before);
    check(await complete(j,{p_mode:'complete_and_invoice'}));assert.equal((await jobRead(j)).completed_by_user_id,admin.id);
    assert.equal((await state(j)).history.filter(h=>h.event_type==='job_work_completed').length,0);
  });
  await run('a voided invoice prevents combined completion but work can be finished separately',async()=>{
    const j=await job(),i=check(await gen(j));const lease=check(await owner.client.rpc('begin_invoice_void',{p_invoice_id:i.invoice_id}));check(await owner.client.rpc('finalize_invoice_void',{p_invoice_id:i.invoice_id,p_token:lease.token}));const before=await state(j);
    denied(await complete(j,{p_mode:'complete_and_invoice'}),'23514');assert.deepEqual(await state(j),before);check(await complete(j));assert.equal((await read(i.invoice_id)).status,'void');
  });
  await run('new visits, moved visits, crew replacements and job edits invalidate displayed completion',async()=>{
    for(const mutation of ['add','move','crew','job']) {
      const j=await job(),e=await session(j),c=await context(j);
      if(mutation==='add')await session(j);
      if(mutation==='move')check(await service.from('schedule_events').update({starts_at:'2029-01-01T12:00:00Z',ends_at:null}).eq('id',e.id));
      if(mutation==='crew')check(await service.from('jobs').update({assigned_crew_user_id:crew.id}).eq('id',j.id));
      if(mutation==='job')check(await service.from('jobs').update({requested_scope:'Changed after review'}).eq('id',j.id));
      const before=await state(j);denied(await finish(args(j,c)),'40001');assert.deepEqual(await state(j),before);
    }
  });
  await run('only job work visits close; estimate, follow-up and cancelled history stay intact',async()=>{
    const j=await job(),work=await session(j),estimate=check(await service.from('schedule_events').insert({title:'PR09 estimate',event_type:'estimate',job_id:j.id,status:'scheduled',starts_at:'2029-02-01T13:00:00Z'}).select('id').single());
    assert.equal(check(await complete(j)).closed_visit_count,1);assert.equal(check(await service.from('schedule_events').select('status').eq('id',estimate.id).single()).status,'scheduled');
    assert.equal(check(await service.from('schedule_events').select('status').eq('id',work.id).single()).status,'completed');
  });
  await run('new work cannot silently reopen a completed job through PR08 scheduling',async()=>{
    const j=await job();check(await complete(j));denied(await owner.client.rpc('save_schedule_event',{p_event_id:null,p_expected_revision:null,p_event:{title:'Late visit',event_type:'job',job_id:j.id,status:'scheduled',starts_at:'2029-03-01T13:00:00Z'}}),'23514');
    assert.equal((await jobRead(j)).status,'completed');
  });
  await run('office roles remain authorized; crew, customer, anonymous and service callers cannot complete office work',async()=>{
    for(const actor of [owner,admin,estimator,payroll])check(await complete(await job(),{},actor));
    const j=await job({assigned_crew_user_id:crew.id}),p=args(j,await context(j));
    for(const actor of [crew,other])denied(await finish(p,actor),'42501');
    for(const actor of [anon,service])denied(await actor.rpc('complete_job_work',p),'42501');
    denied(await owner.client.from('jobs').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',j.id),'42501');
    const crewWrite=await crew.client.from('jobs').update({status:'completed'}).eq('id',j.id).select('id');assert.ok(crewWrite.error || crewWrite.data.length===0);assert.equal((await jobRead(j)).completed_at,null);
  });
  await run('crew context exposes no financial information and unrelated jobs are denied',async()=>{
    const j=await job({assigned_crew_user_id:crew.id});check(await gen(j));const c=await context(j,crew);assert.equal(c.has_invoice,null);
    assert.equal(JSON.stringify(c).includes('cents'),false);denied(await crew.client.rpc('get_job_completion_context',{p_job_id:(await job()).id}),'42501');
  });
  await run('issued JWT cannot complete after offboarding during a parent lock wait',async()=>{
    const actor=await account('admin','wait-admin'),j=await job(),p=args(j,await context(j,actor)),release=await hold(`select id from public.jobs where id='${j.id}' for update`),pending=finish(p,actor).then(r=>r);
    try{await waitBlocked(release.pid);check(await service.from('profiles').update({status:'disabled'}).eq('id',actor.id));}finally{await release();}
    denied(await pending,'42501');assert.equal((await jobRead(j)).completed_at,null);
  });
  await run('saved completion replay rechecks live office permission after waiting on its request',async()=>{
    const actor=await account('admin','replay-admin'),j=await job(),p=args(j,await context(j,actor));check(await finish(p,actor));
    const release=await hold(`select pg_advisory_xact_lock(hashtextextended('${p.p_request_id}',43664))`),pending=finish(p,actor).then(r=>r);
    try{await waitBlocked(release.pid);check(await service.from('user_roles').delete().eq('user_id',actor.id));}finally{await release();}
    denied(await pending,'42501');
  });
  await run('closeout review states and evidence stay separate from office work completion',async()=>{
    for(const status of ['submitted','approved','ready_to_invoice']) {
      const j=await job({status:status==='submitted'?'completed_pending_review':'ready_to_invoice'});
      check(await service.from('job_closeouts').update({status,has_incident:true,has_additional_work:true}).eq('job_id',j.id));const before=await state(j);
      check(await complete(j));const after=await state(j);assert.deepEqual(after.closeout,before.closeout);assert.equal(after.job.status,before.job.status);
    }
    const j=await job();check(await service.from('job_closeouts').update({status:'returned'}).eq('job_id',j.id));denied(await complete(j),'23514');
  });
  await run('sent and paid invoices do not hide remaining field work in the operations read model',async()=>{
    for(const invoiceStatus of ['draft','sent','paid']) {
      const j=await job(),i=check(await gen(j));check(await service.from('schedule_events').insert({title:'PR09 future work',event_type:'job',job_id:j.id,status:'scheduled',starts_at:'2029-04-01T13:00:00Z'}));
      check(await service.from('invoices').update({status:invoiceStatus}).eq('id',i.invoice_id));
      const row=check(await owner.client.from('job_operations_index').select('operational_state,invoice_status').eq('id',j.id).single());assert.equal(row.operational_state,'scheduled');assert.equal(row.invoice_status,invoiceStatus);
    }
  });
  const crewPayload=async j=>({
    checklist:check(await service.from('job_closeout_checklist_items').select('id').eq('job_id',j.id)).map(x=>({...x,completion_status:'complete'})),
    scope_items:check(await service.from('job_closeout_scope_items').select('id').eq('job_id',j.id)).map(x=>({...x,completion_state:'completed'})),
    crew_internal_notes:'PR09 retained crew notes',customer_summary:'Work completed locally',incident_occurred:false,additional_work_requested:false,acknowledgment_status:'customer_not_present'
  });
  const crewArgs=(j,c,payload,extra={})=>({p_job_id:j.id,p_request_id:randomUUID(),p_payload:payload,p_expected_revision:c.revision,p_expected_snapshot:c.snapshot,p_confirm_future:true,...extra});
  const crewSubmit=(p,actor=crew)=>actor.client.rpc('submit_job_closeout_atomic',p);
  const photo=async(j,type='completion')=>check(await service.from('job_photos').insert({job_id:j.id,uploaded_by_user_id:crew.id,photo_type:type,storage_path:`pr09-local/${j.id}/${randomUUID()}.jpg`}).select('id').single());
  const crewJob=async()=>{const j=await job({status:'in_progress',assigned_crew_user_id:crew.id});await session(j);await photo(j);return j;};
  await run('crew submission atomically saves evidence, immutable snapshot, review status and visit completion',async()=>{
    const j=await crewJob(),p=crewArgs(j,await context(j,crew),await crewPayload(j));
    const timer=check(await service.from('time_entries').insert({user_id:crew.id,job_id:j.id,entry_type:'job',status:'active',clock_in_at:new Date().toISOString()}).select('*').single());
    const r=check(await crewSubmit(p));assert.equal(r.status,'submitted');assert.equal(r.active_timer_exists,true);assert.equal(r.closed_visit_count,1);assert.equal(r.context.closeout_status,'submitted');
    const after=await state(j);assert.equal(after.job.status,'completed_pending_review');assert.equal(after.visits[0].status,'completed');assert.equal(after.closeout[0].crew_internal_notes,p.p_payload.crew_internal_notes);
    assert.equal(check(await service.from('job_closeout_submissions').select('id').eq('closeout_id',after.closeout[0].id)).length,1);
    assert.deepEqual(check(await service.from('time_entries').select('*').eq('id',timer.id).single()),timer);
    assert.equal(check(await crewSubmit(p)).replayed,true);assert.deepEqual(await state(j),after);
    check(await service.from('time_entries').update({clock_out_at:new Date().toISOString(),status:'completed'}).eq('id',timer.id));
  });
  await run('invalid crew submission saves none of the edited draft, checklist or history',async()=>{
    for(const invalid of ['checklist','scope','incident_answer','incident_note','incident_photo','additional_answer','additional_note','ack','ack_name','photo']) {
      const j=await crewJob(),payload=await crewPayload(j);
      if(invalid==='checklist')payload.checklist[0].completion_status='pending';
      if(invalid==='scope')payload.scope_items[0].completion_state='partially_completed';
      if(invalid==='incident_answer')delete payload.incident_occurred;
      if(invalid==='incident_note')payload.incident_occurred=true;
      if(invalid==='incident_photo'){payload.incident_occurred=true;payload.incident_description='Issue requires photo';}
      if(invalid==='additional_answer')delete payload.additional_work_requested;
      if(invalid==='additional_note')payload.additional_work_requested=true;
      if(invalid==='ack')delete payload.acknowledgment_status;
      if(invalid==='ack_name')payload.acknowledgment_status='acknowledged';
      if(invalid==='photo')check(await service.from('job_photos').delete().eq('job_id',j.id));
      const before=await state(j),p=crewArgs(j,await context(j,crew),payload);denied(await crewSubmit(p));assert.deepEqual(await state(j),before,invalid);
      assert.equal(await sql(`select count(*) from app_private.job_completion_requests where request_id='${p.p_request_id}'`),'0');
    }
  });
  await run('scope exceptions, incident and additional-work flags are retained for office review',async()=>{
    const j=await crewJob(),payload=await crewPayload(j);payload.scope_items[0]={...payload.scope_items[0],completion_state:'partially_completed',exception_note:'Access blocked; office review'};
    payload.incident_occurred=true;payload.incident_description='Local test issue';payload.additional_work_requested=true;payload.additional_work_description='Future estimate only';await photo(j,'issue');
    check(await crewSubmit(crewArgs(j,await context(j,crew),payload)));const closeout=(await state(j)).closeout[0];assert.equal(closeout.has_scope_exception,true);assert.equal(closeout.has_incident,true);assert.equal(closeout.has_additional_work,true);assert.equal((await invoices(j)).length,0);
  });
  await run('draft save returns its own new context without completing work or requiring future acknowledgment',async()=>{
    const j=await crewJob(),c=await context(j,crew),payload=await crewPayload(j);
    const r=check(await crew.client.rpc('save_job_closeout_draft',{p_job_id:j.id,p_payload:payload,p_expected_revision:c.revision,p_expected_snapshot:c.snapshot}));assert.notDeepEqual(r.context.snapshot,c.snapshot);
    assert.equal(r.context.status,'in_progress');assert.equal(r.context.visits.length,1);assert.equal((await jobRead(j)).completed_at,null);
    denied(await crewSubmit(crewArgs(j,c,payload)),'40001');check(await crewSubmit(crewArgs(j,r.context,payload)));
  });
  await run('crew submission also requires future-visit confirmation and rejects reassignment or stale closeout',async()=>{
    const j=await crewJob(),c=await context(j,crew),payload=await crewPayload(j);denied(await crewSubmit(crewArgs(j,c,payload,{p_confirm_future:false})),'23514');
    check(await service.from('job_closeouts').update({crew_internal_notes:'Another editor'}).eq('job_id',j.id));denied(await crewSubmit(crewArgs(j,c,payload)),'40001');
    check(await service.from('jobs').update({assigned_crew_user_id:admin.id,assigned_crew_employee_id:admin.employeeId}).eq('id',j.id));denied(await crewSubmit(crewArgs(j,c,payload)),'42501');
  });
  await run('crew late audit and receipt failures roll back the entire saved submission',async()=>{
    for(const table of ['activity_log','app_private.job_completion_requests']) {
      const j=await crewJob(),p=crewArgs(j,await context(j,crew),await crewPayload(j)),before=await state(j),constraint=`pr09_crew_${marker}`;
      const tab=table==='activity_log'?'public.activity_log':table,guard=table==='activity_log'?`subject_id<>'${j.id}'::uuid or event_type<>'closeout_submitted'`:`request_id<>'${p.p_request_id}'::uuid`;
      await sql(`alter table ${tab} add constraint ${constraint} check(${guard}) not valid`);
      try{denied(await crewSubmit(p),'23514');assert.deepEqual(await state(j),before);assert.equal(check(await service.from('job_closeout_submissions').select('id').eq('closeout_id',before.closeout[0].id)).length,0);}
      finally{await sql(`alter table ${tab} drop constraint ${constraint}`);}
    }
  });
  await run('crew old save/submit commands and private helper access are revoked',async()=>{
    const j=await crewJob();for(const actor of [crew,owner]) {
      denied(await actor.client.rpc('save_assigned_job_closeout',{p_job_id:j.id,p_payload:{}}),'42501');denied(await actor.client.rpc('submit_assigned_job_closeout',{p_job_id:j.id}),'42501');
    }
    for(const role of ['authenticated','anon','service_role'])assert.equal(await sql(`select has_function_privilege('${role}','app_private.finish_job_visits(uuid)','EXECUTE')`),'f');
    assert.equal(await sql("select has_table_privilege('authenticated','app_private.job_completion_requests','SELECT')"),'f');
  });
  await run('work reminders cancel atomically, while processing, sent and billing reminders remain',async()=>{
    const j=await job();await session(j);const messages=[];
    for(const status of ['pending','processing','sent']) messages.push(check(await service.from('customer_communications').insert({job_id:j.id,customer_id:customer.id,communication_type:'work_reminder',reminder_stage:'day_before',recipient_source:'customer',recipient_email:`pr09-${marker}@example.invalid`,scheduled_for:new Date().toISOString(),status,idempotency_key:`pr09-${j.id}-${status}`}).select('*').single()));
    check(await complete(j));for(const m of messages)assert.equal(check(await service.from('customer_communications').select('status').eq('id',m.id).single()).status,m.status==='pending'?'cancelled':m.status);
  });
  await run('legacy unmigrated work appointments are versioned; normalized estimate sources are untouched',async()=>{
    const j=await job();const appt=check(await service.from('appointments').insert({job_id:j.id,service_location_id:location.id,appointment_type:'maintenance',status:'scheduled',starts_at:'2029-05-01T13:00:00Z'}).select('*').single());
    // Migration creates normalized events via triggers; make this fixture explicitly represent a historical unmigrated source.
    await sql(`delete from public.schedule_events where source_appointment_id='${appt.id}'`);
    const c=await context(j);assert.ok(c.visits.some(v=>v.kind==='appointment'&&v.id===appt.id));
    check(await service.from('appointments').update({ends_at:'2029-05-01T15:00:00Z'}).eq('id',appt.id));denied(await finish(args(j,c)),'40001');
    check(await complete(j));assert.equal(check(await service.from('appointments').select('status').eq('id',appt.id).single()).status,'completed');
  });
  await run('mandatory Calendar outbox failure rolls back work, visits, reminders and history',async()=>{
    const connection=check(await service.from('google_calendar_connections').insert({auth_user_id:owner.id,google_account_id:`pr09-${marker}`,google_account_email:`pr09-${marker}@example.invalid`,status:'active',sync_enabled:true,refresh_token_encrypted:'LOCAL-NONCREDENTIAL'}).select('id').single());
    const j=await job(),e=await session(j),before=await state(j),constraint=`pr09_calendar_${marker}`;
    const outbox=check(await service.from('google_calendar_sync_outbox').select('*').eq('schedule_event_id',e.id).single());
    await sql(`alter table public.google_calendar_sync_outbox add constraint ${constraint} check(schedule_event_id<>'${e.id}'::uuid) not valid`);
    try{denied(await complete(j),'23514');assert.deepEqual(await state(j),before);assert.deepEqual(check(await service.from('google_calendar_sync_outbox').select('*').eq('schedule_event_id',e.id).single()),outbox);}
    finally{await sql(`alter table public.google_calendar_sync_outbox drop constraint ${constraint}`);check(await service.from('google_calendar_connections').update({sync_enabled:false,status:'disconnected'}).eq('id',connection.id));}
  });
  await run('changes to checklist or scope after review cannot be overwritten by a crew save',async()=>{
    for(const table of ['job_closeout_checklist_items','job_closeout_scope_items']) {
      const j=await crewJob(),c=await context(j,crew),payload=await crewPayload(j);
      check(await service.from(table).update(table==='job_closeout_checklist_items'?{explanation:'Office changed this'}:{exception_note:'Office changed scope'}).eq('job_id',j.id));
      const before=await state(j);denied(await crewSubmit(crewArgs(j,c,payload)),'40001');assert.deepEqual(await state(j),before);
    }
  });
  await run('concurrent crew submissions create one immutable closeout revision',async()=>{
    const j=await crewJob(),c=await context(j,crew),payload=await crewPayload(j);
    const r=await Promise.all([crewSubmit(crewArgs(j,c,payload)),crewSubmit(crewArgs(j,c,payload))]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='40001').length,1);
    assert.equal(check(await service.from('job_closeout_submissions').select('id').eq('closeout_id',(await state(j)).closeout[0].id)).length,1);
  });
  await run('crew receipt replay rechecks reassignment after its request lock wait',async()=>{
    const j=await crewJob(),p=crewArgs(j,await context(j,crew),await crewPayload(j));check(await crewSubmit(p));
    const release=await hold(`select pg_advisory_xact_lock(hashtextextended('${p.p_request_id}',43664))`),pending=crewSubmit(p).then(r=>r);
    try{await waitBlocked(release.pid);check(await service.from('jobs').update({assigned_crew_user_id:admin.id,assigned_crew_employee_id:admin.employeeId}).eq('id',j.id));}finally{await release();}denied(await pending,'42501');
  });
  await run('review, return, correction and resubmission retain immutable history and first completion provenance',async()=>{
    const j=await crewJob();check(await crewSubmit(crewArgs(j,await context(j,crew),await crewPayload(j))));const first=await jobRead(j);
    denied(await crew.client.rpc('review_job_closeout',{p_job_id:j.id,p_action:'approve'}));
    for(const action of ['approve','ready'])check(await owner.client.rpc('review_job_closeout',{p_job_id:j.id,p_action:action}));
    denied(await owner.client.rpc('review_job_closeout',{p_job_id:j.id,p_action:'reopen'}));
    check(await owner.client.rpc('review_job_closeout',{p_job_id:j.id,p_action:'reopen',p_reason:'Local correction required'}));
    const c=await context(j,crew);assert.equal(c.status,'returned_for_correction');assert.equal(c.closeout_status,'returned');
    check(await crewSubmit(crewArgs(j,c,await crewPayload(j))));const after=await jobRead(j);
    assert.equal(after.completed_at,first.completed_at);assert.equal(after.completed_by_user_id,first.completed_by_user_id);
    assert.equal(check(await service.from('job_closeout_submissions').select('id').eq('closeout_id',(await state(j)).closeout[0].id)).length,2);
  });
  if(process.env.PR09_RESULTS_FILE)writeFileSync(process.env.PR09_RESULTS_FILE,JSON.stringify({marker,checks:results.length,results},null,2));
});
