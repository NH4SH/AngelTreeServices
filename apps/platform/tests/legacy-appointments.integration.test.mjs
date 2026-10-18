import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const enabled=process.env.LEGACY_APPOINTMENTS_DISPOSABLE==='1'&&Boolean(process.env.LEGACY_APPOINTMENTS_LOCAL_STATUS_FILE);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
test('legacy appointments: actual atomic saves, history, reminders, permissions and concurrency',{skip:!enabled,timeout:180000},async t=>{
 const c=JSON.parse(readFileSync(process.env.LEGACY_APPOINTMENTS_LOCAL_STATUS_FILE,'utf8'));assert.equal(c.API_URL,'http://127.0.0.1:54321');
 assert.match(process.env.DOCKER_HOST??'',/^unix:.*pr02-disposable\/sock\/docker.sock$/);const docker=process.env.LEGACY_APPOINTMENTS_DOCKER_BIN;assert.ok(docker);
 const service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,options),anon=createClient(c.API_URL,c.ANON_KEY,options);
 const marker=randomBytes(6).toString('hex'),actors=[],results=[];let reviewAppointmentId=null;
 const check=(r,label='local request')=>{assert.equal(r.error?.code??null,null,label);return r.data;};
 const denied=(r,code)=>{assert.ok(r.error);if(code)assert.equal(r.error.code,code);};
 const base=['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
 function sql(source){return new Promise((resolve,reject)=>{const p=spawn(docker,base,{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code===0?resolve(out.trim()):reject(Error('Local fixture SQL failed: '+err)));p.stdin.end(source);});}
 async function hold(jobId){const p=spawn(docker,base,{env:process.env});let text='';const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Owned lock session failed')));});
  const ready=new Promise(resolve=>p.stdout.on('data',b=>{text+=b;if(text.includes('LOCK_READY:'))resolve(Number(/LOCK_READY:(\d+)/.exec(text)?.[1]));}));
  p.stdin.write(`begin;select id from public.jobs where id='${jobId}' for update;select 'LOCK_READY:'||pg_backend_pid();\n`);return{pid:await ready,release:async()=>{p.stdin.end('commit;\n');await done;}};}
 async function blocked(pid){for(let i=0;i<100;i++){if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))>0)return;await new Promise(r=>setTimeout(r,30));}throw Error('Expected a local parent-lock wait.');}
 t.after(async()=>{if(actors.length){check(await service.from('profiles').update({status:'disabled'}).in('id',actors));check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors));}
  if(process.env.LEGACY_APPOINTMENTS_RESULTS_FILE)writeFileSync(process.env.LEGACY_APPOINTMENTS_RESULTS_FILE,JSON.stringify({results,reviewAppointmentId,productionChanged:false,providerRequests:0},null,2));});
 async function account(role){const password=randomBytes(24).toString('base64url');const u=check(await service.auth.admin.createUser({email:`legacy-${role}-${marker}@example.invalid`,password,email_confirm:true})).user;actors.push(u.id);
  check(await service.from('profiles').update({status:'active'}).eq('id',u.id));const employee=check(await service.from('employee_records').insert({auth_user_id:u.id,legal_name:`Local legacy ${role} ${marker}`,employment_status:'active',is_active:true}).select('id').single());
  const r=check(await service.from('roles').select('id').eq('name',role).single());check(await service.from('user_roles').insert({user_id:u.id,role_id:r.id}));
  const client=createClient(c.API_URL,c.ANON_KEY,options);check(await client.auth.signInWithPassword({email:u.email,password}));return{...u,client,employeeId:employee.id};}
 const owner=await account('owner'),admin=await account('admin'),estimator=await account('estimator'),payroll=await account('payroll_admin'),crew=await account('crew'),customerActor=await account('customer');
 const customer=check(await service.from('customers').insert({display_name:`Legacy local ${marker}`,email:`legacy-customer-${marker}@example.invalid`}).select('id').single());
 const location=check(await service.from('service_locations').insert({customer_id:customer.id,street:'123 Local Test St',city:'Fredericksburg',state:'VA'}).select('id').single());
 async function job(status='accepted'){const j=check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status,service_type:'tree_removal',requested_scope:`Local legacy fixture ${marker}`}).select('*').single());
  const q=check(await service.from('quotes').insert({customer_id:customer.id,job_id:j.id,service_location_id:location.id,status:'approved',subtotal_cents:0,tax_cents:0,total_cents:0,approved_at:new Date().toISOString()}).select('id').single());
  check(await service.from('jobs').update({source_quote_id:q.id}).eq('id',j.id));return j;}
 const read=async id=>check(await service.from('appointments').select('*').eq('id',id).single());
 const handoff=async j=>check(await service.from('follow_up_tasks').select('*').eq('dedupe_key','approved-work-schedule:'+j.id).single());
 const history=async id=>check(await service.from('activity_log').select('*').eq('subject_id',id).order('id'));
 const values=(extra={})=>({appointment_type:'job',starts_at:'2035-03-01T13:00:00Z',ends_at:'2035-03-01T14:00:00Z',calendar_notes:'Retain this note',assigned_id:null,...extra});
 const create=(j,v=values(),actor=owner,id=randomUUID(),extra={})=>actor.client.rpc('save_legacy_appointment',{p_appointment_id:id,p_job_id:j.id,p_expected_revision:null,p_values:v,p_mode:'create',...extra});
 const edit=(a,v,actor=owner,extra={})=>actor.client.rpc('save_legacy_appointment',{p_appointment_id:a.id,p_job_id:a.job_id,p_expected_revision:a.edit_revision,p_values:v,p_mode:'details',...extra});
 const status=(a,state,actor=owner,extra={})=>actor.client.rpc('save_legacy_appointment',{p_appointment_id:a.id,p_job_id:a.job_id,p_expected_revision:a.edit_revision,p_values:{status:state},p_mode:'status',...extra});
 const details=(a,extra={})=>({starts_at:a.starts_at,ends_at:a.ends_at,calendar_notes:a.calendar_notes,assigned_id:a.assigned_employee_id,...extra});
 const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
 await run('existing office roles retain legacy type permissions while other audiences and service bypasses are denied',async()=>{
  for(const actor of [owner,admin,estimator,payroll]){const j=await job();check(await create(j,values(),actor));}
  const j=await job();for(const actor of [crew,customerActor,{client:anon},{client:service}])denied(await create(j,values(),actor),'42501');
  const a=await read(check(await create(j)).id);
  denied(await owner.client.from('appointments').update({status:'cancelled'}).eq('id',a.id),'42501');
  denied(await owner.client.from('appointments').delete().eq('id',a.id),'42501');
  denied(await owner.client.from('appointments').insert({job_id:j.id,service_location_id:location.id,starts_at:a.starts_at}),'42501');
  assert.equal((await read(a.id)).status,'scheduled');
 });
 await run('booking and final cancellation close and reopen one scheduling handoff atomically',async()=>{
  const j=await job(),before=await handoff(j);assert.equal(before.status,'open');
  const a=await read(check(await create(j)).id);assert.equal((await handoff(j)).status,'completed');assert.equal((await handoff(j)).id,before.id);
  check(await status(a,'cancelled'));assert.equal((await handoff(j)).status,'open');assert.equal((await handoff(j)).id,before.id);
  assert.equal(check(await service.from('jobs').select('status').eq('id',j.id).single()).status,'scheduled');
 });
 await run('lost create acknowledgement reuses one appointment and never repeats history or accepts a changed payload/actor',async()=>{
  const j=await job(),id=randomUUID(),v=values();const first=check(await create(j,v,owner,id));const before=await history(id);
  const again=check(await create(j,v,owner,id));assert.equal(again.replayed,true);assert.equal(again.id,first.id);assert.deepEqual(await history(id),before);
  denied(await create(j,{...v,calendar_notes:'Changed request'},owner,id),'40001');denied(await create(j,v,admin,id),'40001');
 });
 await run('simultaneous create retries acknowledge one record and one creation audit',async()=>{
  const j=await job(),id=randomUUID(),v=values();const responses=await Promise.all([create(j,v,owner,id),create(j,v,owner,id)]);
  const saved=responses.map(r=>check(r));assert.ok(saved.every(r=>r.id===id));assert.equal(saved.filter(r=>r.replayed).length,1);
  assert.equal((await history(id)).filter(r=>r.event_type==='legacy_appointment_create').length,1);
 });
 await run('a competing booking and final cancellation retain the booked handoff with no repair gap',async()=>{
  const j=await job(),a=await read(check(await create(j)).id);
  const responses=await Promise.all([status(a,'cancelled'),create(j,values({starts_at:'2035-04-01T13:00:00Z',ends_at:'2035-04-01T14:00:00Z'}))]);responses.forEach(r=>check(r));
  assert.equal((await handoff(j)).status,'completed');assert.equal(check(await owner.client.from('approved_work_handoff_gaps').select('id').eq('id',j.id)).length,0);
 });
 await run('concurrent editors produce one winner, and stale or mismatched parent requests preserve the saved record',async()=>{
  const j=await job(),a=await read(check(await create(j)).id);const r=await Promise.all([edit(a,details(a,{calendar_notes:'Editor A'})),edit(a,details(a,{calendar_notes:'Editor B'}),admin)]);
  assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='40001').length,1);const after=await read(a.id);
  denied(await status(a,'cancelled'),'40001');denied(await status(after,'cancelled',owner,{p_job_id:(await job()).id}),'40001');assert.deepEqual(await read(a.id),after);
 });
 await run('a handoff audit failure rolls back booking, job transition and all appointment history',async()=>{
  const j=await job(),task=await handoff(j),id=randomUUID(),constraint='legacy_handoff_'+marker;
  await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${task.id}'::uuid or event_type<>'scheduling_handoff_resolved') not valid`);
  try{denied(await create(j,values(),owner,id),'23514');assert.equal(check(await service.from('appointments').select('id').eq('id',id)).length,0);assert.deepEqual(await handoff(j),task);assert.equal(check(await service.from('jobs').select('status').eq('id',j.id).single()).status,'accepted');assert.equal((await history(id)).length,0);}
  finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
 });
 await run('moving a visit cancels only pending old reminders and a late audit failure restores the prior state',async()=>{
  const j=await job(),a=await read(check(await create(j,values({appointment_type:'estimate'}))).id),messages=[];
  for(const state of ['pending','processing','sent'])messages.push(check(await service.from('customer_communications').insert({customer_id:customer.id,job_id:j.id,appointment_id:a.id,communication_type:'estimate_reminder',reminder_stage:'day_before',recipient_source:'customer',recipient_email:`legacy-${marker}@example.invalid`,scheduled_for:new Date().toISOString(),status:state,idempotency_key:`legacy-${a.id}-${state}`}).select('*').single()));
  const constraint='legacy_audit_'+marker;
  await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${a.id}'::uuid or event_type<>'legacy_appointment_details') not valid`);
  try{denied(await edit(a,details(a,{starts_at:'2035-03-02T13:00:00Z',ends_at:'2035-03-02T14:00:00Z'})),'23514');assert.deepEqual(await read(a.id),a);for(const m of messages)assert.deepEqual(check(await service.from('customer_communications').select('*').eq('id',m.id).single()),m);}
  finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
  check(await edit(a,details(a,{starts_at:'2035-03-02T13:00:00Z',ends_at:'2035-03-02T14:00:00Z'})));
  for(const m of messages)assert.equal(check(await service.from('customer_communications').select('status').eq('id',m.id).single()).status,m.status==='pending'?'cancelled':m.status);
 });
 await run('employees without logins remain assignable; separated staff cannot be newly assigned or override offboarding',async()=>{
  const employee=check(await service.from('employee_records').insert({legal_name:`Legacy no-login ${marker}`,employment_status:'active',is_active:true}).select('id').single());
  const j=await job(),a=await read(check(await create(j,values({assigned_id:employee.id}))).id);assert.equal(a.assigned_employee_id,employee.id);assert.equal(a.assigned_user_id,null);
  check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('id',employee.id));
  denied(await edit(a,details(a)), '23514');check(await status(a,'completed'));const closed=await read(a.id);
  check(await edit(closed,details(closed,{calendar_notes:'Historical correction'})));denied(await status(await read(a.id),'scheduled',owner,{p_override_reason:'Cannot override separation'}),'23514');
 });
 await run('new active work on a completed job is refused while a customer follow-up remains available',async()=>{
  const j=await job('completed');denied(await create(j),'23514');check(await create(j,values({appointment_type:'follow_up'})));
 });
 await run('live SQL qualifications reject forged/expired/archived evidence and restrict overrides to owner/admin',async()=>{
  const ct=check(await service.from('credential_types').insert({type_key:`legacy_${marker}`,label:'Legacy synthetic qualification'}).select('id').single());
  const req=check(await service.from('qualification_requirements').insert({requirement_scope:'job_assignment_role',scope_value:'follow_up',credential_type_id:ct.id,warning_only:false,is_active:true}).select('id').single());
  try {
   const j=await job(),v=values({appointment_type:'follow_up',assigned_id:crew.employeeId});
   denied(await create(j,v,estimator),'23514');denied(await create(j,v,payroll,randomUUID(),{p_override_reason:'Not authorized to override'}),'23514');
   const override=check(await create(j,v,owner,randomUUID(),{p_override_reason:'Supervised local qualification review'}));assert.ok(override.warning_count>0);
   const credential=check(await service.from('employee_credentials').insert({employee_id:crew.employeeId,credential_type_id:ct.id,status:'active',expiration_date:'2020-01-01'}).select('id').single());denied(await create(j,v,estimator),'23514');
   check(await service.from('employee_credentials').update({expiration_date:'2036-01-01',archived_at:new Date().toISOString()}).eq('id',credential.id));denied(await create(j,v,estimator),'23514');
   check(await service.from('employee_credentials').update({archived_at:null}).eq('id',credential.id));check(await create(j,v,estimator));
  }finally{check(await service.from('qualification_requirements').update({is_active:false}).eq('id',req.id));}
 });
 await run('deactivation during a parent-lock wait rejects the issued token before any write',async()=>{
  const j=await job(),id=randomUUID(),lock=await hold(j.id);const pending=create(j,values(),estimator,id).then(r=>r);
  try{await blocked(lock.pid);check(await service.from('profiles').update({status:'disabled'}).eq('id',estimator.id));}finally{await lock.release();}
  denied(await pending,'42501');assert.equal(check(await service.from('appointments').select('id').eq('id',id)).length,0);
 });
 const review=await job();reviewAppointmentId=check(await create(review,values({appointment_type:'follow_up'}))).id;
});
