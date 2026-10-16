import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.PR08_DISPOSABLE_STACK === "1" && Boolean(process.env.PR08_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("Atomic scheduling with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR08_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.equal(process.env.PR08_WEB_URL, "http://127.0.0.1:3102");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR08_DOCKER_BIN;
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
    const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR08_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(new Error('Lock exited before ready: '+err)));});
    p.stdin.write(`begin; ${source}; select 'PR08_LOCKED:'||pg_backend_pid();\n`);await ready;
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
    check(await service.from("employee_records").update({is_active:false,employment_status:"separated"}).like("legal_name",`PR08 % ${marker}`));
    if(accountIds.length) {check(await service.from("profiles").update({status:"disabled"}).in("id",accountIds));check(await service.from("employee_records").update({is_active:false,employment_status:"separated"}).in("auth_user_id",accountIds));}
  });
  const check = (r, label = "request") => { assert.ifError(r.error && new Error(`${label}: ${r.error.message} [${r.error.code}]`)); return r.data; };
  const denied = (r, code) => { assert.ok(r.error, "Expected rejection"); if (code) assert.equal(r.error.code, code); };
  const client = jwt => createClient(c.API_URL, c.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  async function account(role, label = role) {
    check(await service.from("roles").upsert({ name: role }, { onConflict: "name" }));
    const password = randomBytes(24).toString("base64url");
    const u = check(await service.auth.admin.createUser({ email: `pr08-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    accountIds.push(u.id);
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR08 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const crew = await account("crew"), other = await account("customer");
  const customer=check(await service.from('customers').insert({display_name:`PR08 local ${marker}`,email:`pr08-${marker}@example.invalid`}).select('id').single());
  const location=check(await service.from('service_locations').insert({customer_id:customer.id,label:'PR08 local property',street:'123 Local Test St',city:'Fredericksburg',state:'VA'}).select('id').single());
  const run=async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  const read=async id=>check(await service.from('schedule_events').select('*,schedule_event_assignments(*)').eq('id',id).single());
  const job=async(extra={})=>check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'accepted',service_type:'tree_removal',requested_scope:'PR08 local scope',...extra}).select('*').single());
  let day = 1;
  const header=(extra={})=>({title:`PR08 local visit ${marker}`,event_type:'job',status:'scheduled',starts_at:new Date(Date.parse('2028-01-01T13:00:00Z')+day++*86400000).toISOString(),ends_at:null,job_id:null,all_day:false,calendar_notes:'Keep these notes',...extra});
  const create=(h,ids=[],actor=owner,extra={})=>actor.client.rpc('save_schedule_event',{p_event_id:null,p_expected_revision:null,p_event:h,p_employee_ids:ids,...extra});
  const save=(e,h={},ids=e.schedule_event_assignments.map(a=>a.employee_id),actor=owner,extra={})=>actor.client.rpc('save_schedule_event',{p_event_id:e.id,p_expected_revision:e.edit_revision,p_event:{...e,...h},p_employee_ids:ids,...extra});
  const move=(e,start,actor=owner,extra={})=>actor.client.rpc('save_schedule_event',{p_event_id:e.id,p_expected_revision:e.edit_revision,p_event:{starts_at:start,ends_at:new Date(Date.parse(start)+3600000).toISOString()},p_mode:'time',...extra});
  const status=(e,next,actor=owner,extra={})=>actor.client.rpc('save_schedule_event',{p_event_id:e.id,p_expected_revision:e.edit_revision,p_event:{status:next},p_mode:'status',...extra});
  async function snapshot(j){return check(await service.from('schedule_events').select('id,edit_revision').eq('job_id',j.id).eq('event_type','job').in('status',['scheduled','confirmed','in_progress'])).sort((a,b)=>a.id.localeCompare(b.id));}
  const work=(j,s,expected,actor=owner,extra={})=>actor.client.rpc('save_job_employee_work_sessions',{p_job_id:j.id,p_sessions:s,p_mode:'replace',p_expected_snapshot:expected,...extra});
  const session=(date,ids=[],extra={})=>({date,start_time:'08:00',end_time:'16:00',assigned_user_ids:ids,notes:'PR08 work notes',status:'scheduled',...extra});
  async function event(h={},ids=[]){return read(check(await create(header(h),ids)).id);}
  const activities=async id=>check(await service.from('activity_log').select('*').eq('subject_id',id));
  await run('office permissions and durable employees without CRM login are preserved',async()=>{
    const noLogin=check(await service.from('employee_records').insert({legal_name:`PR08 offline ${marker}`,employment_status:'active',is_active:true}).select('id').single());
    const e=await event({},[noLogin.id]);assert.equal(e.schedule_event_assignments[0].user_id,null);assert.equal(e.schedule_event_assignments[0].employee_id,noLogin.id);
    check(await create(header({event_type:'estimate'}),[],estimator));denied(await create(header(),[],estimator),'42501');
    for(const actor of [owner,admin,payroll])check(await create(header(),[],actor));
    for(const actor of [crew,other])denied(await create(header(),[],actor),'42501');
    denied(await anon.rpc('save_schedule_event',{p_event_id:null,p_expected_revision:null,p_event:header()}),'42501');
    denied(await service.rpc('save_schedule_event',{p_event_id:null,p_expected_revision:null,p_event:header()}),'42501');
  });
  await run('employee ID and linked user ID normalize to one durable assignment',async()=>{
    const e=await event({},[crew.id,crew.employeeId,crew.employeeId]);assert.equal(e.schedule_event_assignments.length,1);assert.equal(e.schedule_event_assignments[0].employee_id,crew.employeeId);assert.equal(e.schedule_event_assignments[0].user_id,crew.id);
    const assignment=e.schedule_event_assignments[0];assert.ok(assignment.id);
    check(await move(e,'2027-02-01T13:00:00Z'));const after=await read(e.id);assert.deepEqual(after.schedule_event_assignments,e.schedule_event_assignments);assert.equal(after.calendar_notes,e.calendar_notes);
  });
  await run('invalid or inactive employees cannot leave a moved visit or empty crew',async()=>{
    const inactive=check(await service.from('employee_records').insert({legal_name:`PR08 separated ${marker}`,employment_status:'separated',is_active:false}).select('id').single());
    const e=await event({},[crew.employeeId]);denied(await save(e,{title:'Invalid replacement'},[randomUUID()]),'23503');assert.deepEqual(await read(e.id),e);
    denied(await save(e,{starts_at:'2027-03-03T13:00:00Z'},[inactive.id],owner,{p_override_reason:'Cannot override offboarding',p_allow_conflicts:true}),'23514');assert.deepEqual(await read(e.id),e);
  });
  await run('two editors cannot overwrite the same event or silently refresh its revision',async()=>{
    const e=await event();const r=await Promise.all([save(e,{title:'PR08 winner A'}),save(e,{title:'PR08 winner B'},[],admin)]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='40001').length,1);
    const after=await read(e.id);denied(await move(e,'2027-03-05T13:00:00Z'),'40001');assert.deepEqual(await read(e.id),after);
    denied(await owner.client.rpc('save_schedule_event',{p_event_id:e.id,p_expected_revision:null,p_event:{status:'cancelled'},p_mode:'status'}),'40001');
  });
  await run('direct authenticated writes and old unchecked work-session RPCs cannot bypass the command',async()=>{
    const e=await event({},[crew.employeeId]),j=await job();
    denied(await owner.client.from('schedule_events').update({title:'Forged',edit_revision:999}).eq('id',e.id),'42501');
    denied(await owner.client.from('schedule_events').insert(header()),'42501');
    denied(await owner.client.from('schedule_event_assignments').delete().eq('event_id',e.id),'42501');
    denied(await owner.client.from('schedule_event_assignments').insert({event_id:e.id,employee_id:owner.employeeId}),'42501');
    denied(await owner.client.rpc('save_job_employee_work_sessions',{p_job_id:j.id,p_sessions:[],p_mode:'replace'}),'42501');
    denied(await owner.client.rpc('save_job_work_sessions',{p_job_id:j.id,p_sessions:[],p_mode:'replace'}),'42501');assert.deepEqual(await read(e.id),e);
  });
  await run('late assignment failure rolls back event, previous crew, job summary and history',async()=>{
    const j=await job(),e=await event({job_id:j.id},[crew.employeeId]);const beforeJob=check(await service.from('jobs').select('*').eq('id',j.id).single()),beforeHistory=await activities(e.id),constraint=`pr08_assign_${marker}`;
    await sql(`alter table public.schedule_event_assignments add constraint ${constraint} check(event_id<>'${e.id}'::uuid or employee_id<>'${admin.employeeId}'::uuid) not valid`);
    try{denied(await save(e,{title:'Must roll back',starts_at:'2027-04-02T13:00:00Z'},[admin.employeeId]),'23514');assert.deepEqual(await read(e.id),e);assert.deepEqual(await activities(e.id),beforeHistory);assert.deepEqual(check(await service.from('jobs').select('*').eq('id',j.id).single()),beforeJob);}
    finally{await sql(`alter table public.schedule_event_assignments drop constraint ${constraint}`);}
  });
  await run('mandatory audit failure rolls back a create without a compensating delete',async()=>{
    const h=header({title:`PR08 failed create ${marker}`}),constraint=`pr08_audit_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(event_type<>'schedule_event_created' or actor_user_id<>'${owner.id}'::uuid) not valid`);
    try{denied(await create(h,[crew.employeeId]),'23514');assert.equal(check(await service.from('schedule_events').select('id').eq('title',h.title)).length,0);}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
  });
  await run('shared crew booking is serialized across different jobs',async()=>{
    const j1=await job(),j2=await job(),h=header({starts_at:'2027-05-01T12:00:00Z',ends_at:'2027-05-01T20:00:00Z'});
    const r=await Promise.all([create({...h,job_id:j1.id},[crew.employeeId]),create({...h,job_id:j2.id},[crew.employeeId],admin)]);
    assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='23P01').length,1);
  });
  await run('overlap confirmation requires both an owner/admin and a recorded reason',async()=>{
    const e=await event({starts_at:'2027-05-02T12:00:00Z',ends_at:'2027-05-02T20:00:00Z'},[crew.employeeId]);const h=header({starts_at:e.starts_at,ends_at:e.ends_at,event_type:'estimate'});
    denied(await create(h,[crew.employeeId],owner,{p_allow_conflicts:true}),'23P01');
    denied(await create(h,[crew.employeeId],estimator,{p_allow_conflicts:true,p_override_reason:'Estimator attempt'}),'23P01');
    denied(await create(h,[crew.employeeId],payroll,{p_allow_conflicts:true,p_override_reason:'Payroll attempt'}),'23P01');
    const r=check(await create(h,[crew.employeeId],admin,{p_allow_conflicts:true,p_override_reason:'Supervised split crew confirmed'}));assert.ok((await activities(r.id)).some(x=>x.metadata_json.override_reason==='Supervised split crew confirmed'));
  });
  await run('qualifications are checked in SQL, including archived or expired credentials',async()=>{
    const ct=check(await service.from('credential_types').insert({type_key:`pr08_${marker}`,label:'PR08 verified qualification'}).select('id').single());
    const req=check(await service.from('qualification_requirements').insert({requirement_scope:'job_assignment_role',scope_value:'internal',credential_type_id:ct.id,warning_only:false,is_active:true}).select('id').single());
    try{
      const h=header({event_type:'internal'});denied(await create(h,[crew.employeeId]),'23514');
      const c=check(await service.from('employee_credentials').insert({employee_id:crew.employeeId,credential_type_id:ct.id,status:'active',expiration_date:'2020-01-01'}).select('id').single());denied(await create(h,[crew.employeeId]),'23514');
      check(await service.from('employee_credentials').update({expiration_date:'2030-01-01',archived_at:new Date().toISOString()}).eq('id',c.id));denied(await create(h,[crew.employeeId]),'23514');
      check(await service.from('employee_credentials').update({archived_at:null}).eq('id',c.id));check(await create(h,[crew.employeeId]));
      check(await create(header({event_type:'internal'}),[admin.employeeId],owner,{p_override_reason:'Supervised qualification review'}));
    } finally{check(await service.from('qualification_requirements').update({is_active:false}).eq('id',req.id));}
  });
  await run('employee offboarding committed during a wait prevents the new assignment',async()=>{
    const candidate=await account('crew','wait-crew'),h=header({starts_at:'2027-06-01T12:00:00Z'});
    const release=await hold(`update public.employee_records set is_active=false,employment_status='separated' where id='${candidate.employeeId}'`),pending=create(h,[candidate.employeeId]).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}denied(await pending,'23514');assert.equal(check(await service.from('schedule_events').select('id').eq('starts_at',h.starts_at).eq('title',h.title)).length,0);
  });
  await run('revoked actor access during the event lock wait is rejected with its issued JWT',async()=>{
    const actor=await account('admin','wait-admin'),e=await event();const release=await hold(`update public.schedule_events set title='PR08 locked edit' where id='${e.id}'`),pending=save(e,{title:'Revoked attempt'},[],actor).then(r=>r);
    try{await waitBlocked(release.pid);check(await service.from('profiles').update({status:'disabled'}).eq('id',actor.id));}finally{await release();}
    const r=await pending;assert.ok(r.error);assert.ok(['40001','42501'].includes(r.error.code));assert.equal((await read(e.id)).title,'PR08 locked edit');
  });
  await run('multi-day saves retain event and assignment identities for time-only edits and keep other days intact',async()=>{
    const j=await job();const r=check(await work(j,[session('2027-07-01',[crew.employeeId]),session('2027-07-02',[crew.employeeId])],[]));assert.equal(r.session_count,2);assert.equal(r.sessions.length,2);assert.ok(r.sessions.every(s=>s.id));
    const e=await read(r.sessions[0].id),otherDay=await read(r.sessions[1].id);check(await move(e,'2027-07-01T14:00:00Z'));assert.deepEqual(await read(otherDay.id),otherDay);assert.deepEqual((await read(e.id)).schedule_event_assignments,e.schedule_event_assignments);
    const j2=check(await service.from('jobs').select('*').eq('id',j.id).single());assert.equal(j2.status,'scheduled');assert.equal(j2.assigned_crew_employee_id,crew.employeeId);assert.equal(j2.assigned_crew_user_id,crew.id);
  });
  await run('whole-schedule snapshots detect added days, changes and cancellation',async()=>{
    const j=await job(),r=check(await work(j,[session('2027-07-03')],[])),stale=r.snapshot;
    check(await create(header({job_id:j.id,starts_at:'2027-07-04T12:00:00Z'})));
    denied(await work(j,r.sessions,stale),'40001');
    const before=await snapshot(j);check(await status(await read(r.sessions[0].id),'cancelled'));denied(await work(j,r.sessions,before),'40001');
    const current=await snapshot(j);denied(await work(j,r.sessions,current),'40001');assert.equal((await read(r.sessions[0].id)).status,'cancelled');
  });
  await run('two whole-schedule editors have one winner, and late second-day failures roll back every day',async()=>{
    const j=await job(),s=[session('2027-07-05')],r=await Promise.all([work(j,s,[]),work(j,[session('2027-07-06')],[],admin)]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='40001').length,1);
    const current=await snapshot(j),before=await read(current[0].id),beforeJob=check(await service.from('jobs').select('*').eq('id',j.id).single()),cname=`pr08_second_${marker}`;
    await sql(`alter table public.schedule_events add constraint ${cname} check(job_id<>'${j.id}'::uuid or starts_at<>'2027-07-08T12:00:00Z'::timestamptz) not valid`);
    try{denied(await work(j,[session('2027-07-07',[],{id:before.id}),session('2027-07-08')],current),'23514');assert.deepEqual(await snapshot(j),current);assert.deepEqual(await read(before.id),before);assert.deepEqual(check(await service.from('jobs').select('*').eq('id',j.id).single()),beforeJob);}
    finally{await sql(`alter table public.schedule_events drop constraint ${cname}`);}
  });
  await run('clearing a schedule cancels active visits, retains history and does not regress later job status',async()=>{
    const j=await job(),r=check(await work(j,[session('2027-07-09',[crew.employeeId])],[]));check(await service.from('jobs').update({status:'in_progress'}).eq('id',j.id));
    check(await work(j,[],r.snapshot));const e=await read(r.sessions[0].id),after=check(await service.from('jobs').select('*').eq('id',j.id).single());assert.equal(e.status,'cancelled');assert.equal(e.schedule_event_assignments.length,1);assert.equal(after.status,'in_progress');assert.equal(after.scheduled_start_at,null);assert.equal(after.assigned_crew_employee_id,null);assert.equal(after.assigned_crew_user_id,null);
  });
  await run('date validation, daylight saving and explicit all-day ranges use the business timezone',async()=>{
    const j=await job();denied(await work(j,[session('2027-03-14',[],{start_time:'02:30',end_time:'04:00'})],[]),'22007');
    const r=check(await work(j,[session('2027-03-13'),session('2027-03-14')],[]));const a=await read(r.sessions[0].id),b=await read(r.sessions[1].id);assert.match(a.starts_at,/T13:00:00/);assert.match(b.starts_at,/T12:00:00/);
    const f=check(await work(j,[session('2027-11-06'),session('2027-11-07')],r.snapshot));assert.match((await read(f.sessions[0].id)).starts_at,/T12:00:00/);assert.match((await read(f.sessions[1].id)).starts_at,/T13:00:00/);
    const all=await event({event_type:'pto',all_day:true,starts_at:'2027-03-14T05:00:00Z',ends_at:'2027-03-15T03:59:00Z'});assert.equal(all.all_day,true);assert.equal(Date.parse(all.ends_at)-Date.parse(all.starts_at),23*3600000-60000);
    denied(await work(j,[session('2027-07-10'),session('2027-07-10')],f.snapshot),'22023');
  });
  await run('estimate visits do not schedule accepted work and mismatched job properties are rejected',async()=>{
    const j=await job();check(await create(header({event_type:'estimate',job_id:j.id})));assert.equal(check(await service.from('jobs').select('status').eq('id',j.id).single()).status,'accepted');
    const otherCustomer=check(await service.from('customers').insert({display_name:`PR08 other ${marker}`}).select('id').single()),bad=await job({customer_id:otherCustomer.id});denied(await create(header({job_id:bad.id})),'23514');
    const e=await event({event_type:'estimate'});denied(await save(e,{event_type:'job'},[],estimator),'42501');
  });
  await run('pending reminders are cancelled atomically on a move; processing and sent messages are retained',async()=>{
    const e=await event({event_type:'estimate'});const messages=[];
    for(const state of ['pending','processing','sent'])messages.push(check(await service.from('customer_communications').insert({customer_id:customer.id,schedule_event_id:e.id,communication_type:'estimate_reminder',reminder_stage:'day_before',recipient_source:'customer',recipient_email:`pr08-${marker}@example.invalid`,scheduled_for:new Date().toISOString(),status:state,idempotency_key:`pr08-${e.id}-${state}`}).select('*').single()));
    check(await move(e,'2027-08-01T12:00:00Z'));assert.deepEqual(check(await service.from('customer_communications').select('id,status').in('id',messages.map(m=>m.id))).sort((a,b)=>a.id.localeCompare(b.id)),messages.map(m=>({id:m.id,status:m.status==='pending'?'cancelled':m.status})).sort((a,b)=>a.id.localeCompare(b.id)));
  });
  await run('Calendar claimed work cannot acknowledge or fail a newer schedule revision',async()=>{
    const connection=check(await service.from('google_calendar_connections').insert({auth_user_id:owner.id,google_account_id:`pr08-${marker}`,google_account_email:`pr08-${marker}@example.invalid`,status:'active',sync_enabled:true,refresh_token_encrypted:'LOCAL-NONCREDENTIAL'}).select('id').single());
    try{
      const e=await event({event_type:'estimate'}),task=check(await service.from('google_calendar_sync_outbox').select('*').eq('schedule_event_id',e.id).single());
      check(await service.from('google_calendar_sync_outbox').update({available_at:'2000-01-01T00:00:00Z'}).eq('dedupe_key',task.dedupe_key));
      const claimed=check(await service.rpc('claim_google_calendar_sync_tasks',{p_limit:1}));assert.equal(claimed.length,1);assert.equal(claimed[0].dedupe_key,task.dedupe_key);assert.equal(claimed[0].revision,task.revision);assert.equal(claimed[0].status,'processing');
      check(await move(e,'2027-09-01T12:00:00Z'));
      const current=check(await service.from('google_calendar_sync_outbox').select('*').eq('schedule_event_id',e.id).single());assert.ok(current.revision>task.revision);assert.equal(current.status,'pending');
      check(await service.from('google_calendar_sync_outbox').delete().eq('dedupe_key',task.dedupe_key).eq('revision',task.revision));
      check(await service.from('google_calendar_sync_outbox').update({status:'exhausted'}).eq('dedupe_key',task.dedupe_key).eq('revision',task.revision));
      assert.deepEqual(check(await service.from('google_calendar_sync_outbox').select('*').eq('dedupe_key',current.dedupe_key).single()),current);
    }finally{check(await service.from('google_calendar_connections').update({sync_enabled:false,status:'disconnected'}).eq('id',connection.id));}
  });
  const sourceArgs=(employee=crew.employeeId)=>({p_contact_name:'PR08 Local Contact',p_phone:'5550100000',p_email:`pr08-${marker}@example.invalid`,p_street:'123 Local Test St',p_city:'Fredericksburg',p_state:'VA',p_postal_code:'22401',p_access_notes:null,p_service_notes:null,p_service_type:'tree_removal',p_requested_scope:'PR08 local estimate scope',p_event_title:`PR08 source estimate ${marker}`,p_calendar_notes:'Keep these source notes',p_starts_at:'2027-10-01T12:00:00Z',p_ends_at:null,p_assigned_user_id:employee,p_override_reason:null,p_expected_revision:null});
  await run('website-lead scheduling saves a no-login estimator atomically and stale source edits are rejected',async()=>{
    const employee=check(await service.from('employee_records').insert({legal_name:`PR08 source no login ${marker}`,is_active:true,employment_status:'active'}).select('id').single());
    const j=await job({status:'new_lead',website_submission_id:`pr08-${marker}`});const args={...sourceArgs(employee.id),p_lead_job_id:j.id,p_organization_name:null,p_internal_notes:null,p_preferred_contact_method:null,p_preferred_appointment_timing:null};
    const r=check(await owner.client.rpc('schedule_lead_estimate',args))[0],e=await read(r.event_id);assert.equal(e.schedule_event_assignments[0].employee_id,employee.id);assert.equal(e.schedule_event_assignments[0].user_id,null);assert.equal(e.lead_intake_job_id,j.id);
    denied(await owner.client.rpc('schedule_lead_estimate',{...args,p_starts_at:'2027-10-02T12:00:00Z'}),'40001');assert.deepEqual(await read(e.id),e);
    check(await owner.client.rpc('schedule_lead_estimate',{...args,p_expected_revision:e.edit_revision,p_starts_at:'2027-10-02T12:00:00Z'}));assert.match((await read(e.id)).starts_at,/2027-10-02/);
    denied(await estimator.client.rpc('schedule_lead_estimate',{...args,p_override_reason:'Not authorized'}),'42501');
  });
  await run('customer estimate creation keeps durable crew and repeated request keys cannot overwrite a saved visit',async()=>{
    const args={...sourceArgs(),p_source_request_key:randomUUID(),p_customer_id:customer.id,p_organization_id:null,p_contact_id:null,p_service_location_id:location.id,p_starts_at:'2027-10-03T12:00:00Z'};
    const r=check(await owner.client.rpc('schedule_party_estimate',args))[0],e=await read(r.event_id);assert.equal(e.source_customer_id,customer.id);assert.equal(e.job_id,null);assert.equal(e.schedule_event_assignments[0].employee_id,crew.employeeId);
    denied(await owner.client.rpc('schedule_party_estimate',{...args,p_starts_at:'2027-10-04T12:00:00Z'}),'40001');assert.deepEqual(await read(e.id),e);
    const bad=await job(),beforeCustomer=check(await service.from('customers').select('*').eq('id',customer.id).single());
    denied(await owner.client.rpc('schedule_party_estimate',{...args,p_source_request_key:randomUUID(),p_assigned_user_id:randomUUID(),p_contact_name:'Must roll back contact',p_starts_at:'2027-10-05T12:00:00Z'}),'23503');assert.deepEqual(check(await service.from('customers').select('*').eq('id',customer.id).single()),beforeCustomer);
  });
  await run('assignment-only changes invalidate an editor and crew RLS still follows durable assignments',async()=>{
    const e=await event({},[crew.employeeId]);assert.equal(check(await crew.client.from('schedule_events').select('id').eq('id',e.id)).length,1);
    const a=e.schedule_event_assignments[0];check(await service.from('schedule_event_assignments').update({assignment_role:'crew_leader'}).eq('id',a.id));
    denied(await save(e,{title:'Stale crew edit'}),'40001');const current=await read(e.id);assert.ok(current.edit_revision>e.edit_revision);assert.equal(current.schedule_event_assignments[0].assignment_role,'crew_leader');
    assert.equal(check(await other.client.from('schedule_events').select('id').eq('id',e.id)).length,0);
  });
  await run('an authorization change while waiting for an employee lock is rechecked after that wait',async()=>{
    const actor=await account('admin','crew-wait-admin'),candidate=await account('crew','crew-wait-target'),h=header();
    const release=await hold(`select id from public.employee_records where id='${candidate.employeeId}' for update`),pending=create(h,[candidate.employeeId],actor).then(r=>r);
    try{await waitBlocked(release.pid);check(await service.from('profiles').update({status:'disabled'}).eq('id',actor.id));}finally{await release();}
    denied(await pending,'42501');assert.equal(check(await service.from('schedule_events').select('id').eq('title',h.title).eq('starts_at',h.starts_at)).length,0);
  });
  await run('failure to durably queue Calendar work rolls back the visit rather than lose the update',async()=>{
    const connection=check(await service.from('google_calendar_connections').insert({auth_user_id:admin.id,google_account_id:`pr08-queue-${marker}`,google_account_email:`pr08-queue-${marker}@example.invalid`,status:'active',sync_enabled:true,refresh_token_encrypted:'LOCAL-NONCREDENTIAL'}).select('id').single());
    const e=await event({event_type:'estimate'}),before=check(await service.from('google_calendar_sync_outbox').select('*').eq('schedule_event_id',e.id).single()),constraint=`pr08_queue_${marker}`;
    await sql(`alter table public.google_calendar_sync_outbox add constraint ${constraint} check(schedule_event_id<>'${e.id}'::uuid) not valid`);
    try{denied(await move(e,'2027-12-01T13:00:00Z'),'23514');assert.deepEqual(await read(e.id),e);assert.deepEqual(check(await service.from('google_calendar_sync_outbox').select('*').eq('dedupe_key',before.dedupe_key).single()),before);}
    finally{await sql(`alter table public.google_calendar_sync_outbox drop constraint ${constraint}`);check(await service.from('google_calendar_connections').update({sync_enabled:false,status:'disconnected'}).eq('id',connection.id));}
  });
  await run('malformed snapshots, duplicate days and excessive schedules fail before making changes',async()=>{
    const j=await job();denied(await work(j,[],null),'22023');denied(await work(j,[session('2027-12-02'),session('2027-12-02')],[]),'22023');
    denied(await work(j,Array.from({length:61},()=>session('2027-12-03')),[]),'22023');assert.deepEqual(await snapshot(j),[]);
  });
  await run('a repeated browser creation identity acknowledges one visit without duplicating crew or history',async()=>{
    const h=header({request_id:randomUUID()}),r=await Promise.all([create(h,[crew.employeeId]),create(h,[crew.employeeId])]);r.forEach(x=>check(x));assert.equal(r[0].data.id,r[1].data.id);assert.equal(r.filter(x=>x.data.replayed).length,1);
    const e=await read(h.request_id),a=await activities(e.id);check(await create(h,[crew.employeeId]));assert.deepEqual(await read(e.id),e);assert.deepEqual(await activities(e.id),a);assert.equal(e.schedule_event_assignments.length,1);
    denied(await create(h,[],admin),'42501');
  });
  await run('existing office completion still finishes linked visits and cannot complete an unfinished work order',async()=>{
    const j=await job(),e=await event({job_id:j.id},[crew.employeeId]);
    denied(await owner.client.rpc('complete_completed_job_schedule',{p_job_id:j.id}),'23514');
    check(await service.from('jobs').update({status:'completed'}).eq('id',j.id));const before=check(await service.from('jobs').select('*').eq('id',j.id).single());
    denied(await crew.client.rpc('complete_completed_job_schedule',{p_job_id:j.id}),'42501');
    assert.equal(check(await owner.client.rpc('complete_completed_job_schedule',{p_job_id:j.id})),1);assert.equal((await read(e.id)).status,'completed');assert.deepEqual((await read(e.id)).schedule_event_assignments,e.schedule_event_assignments);assert.deepEqual(check(await service.from('jobs').select('*').eq('id',j.id).single()),before);
    assert.equal(check(await owner.client.rpc('complete_completed_job_schedule',{p_job_id:j.id})),0);
  });
  await run('completed history can be retained while newly forged inactive assignments are rejected',async()=>{
    const employee=check(await service.from('employee_records').insert({legal_name:`PR08 historic ${marker}`,employment_status:'active',is_active:true}).select('id').single()),e=await event({},[employee.id]);check(await status(e,'completed'));
    check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('id',employee.id));const current=await read(e.id);
    check(await save(current,{calendar_notes:'Historic note retained'}));denied(await create(header({status:'completed'}),[employee.id]),'23514');
  });
  if(process.env.PR08_RESULTS_FILE)writeFileSync(process.env.PR08_RESULTS_FILE,JSON.stringify({tests:results},null,2));
});
