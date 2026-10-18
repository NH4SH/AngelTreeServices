import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID,randomBytes,randomInt} from 'node:crypto';import{readFileSync,writeFileSync}from'node:fs';import{spawn}from'node:child_process';import{createClient}from'@supabase/supabase-js';import{createServerClient}from'@supabase/ssr';
import{load}from'./pr10-test-helpers.mjs';import * as recordCode from '../src/lib/record-search.ts';import * as businessTime from '../src/lib/business-time.ts';import * as filterCode from '../src/lib/handoff-views.ts';import{withDeadline}from'../src/lib/runtime/deadline.ts';import{checkLegacySchedulingHandoff}from'../src/lib/schedule/legacy-handoff.ts';
const enabled=process.env.PR15_DISPOSABLE_STACK==='1'&&Boolean(process.env.PR15_LOCAL_STATUS_FILE);
test('PR15 real authorized search and owned scheduling handoffs',{skip:!enabled,timeout:240000},async t=>{
 const c=JSON.parse(readFileSync(process.env.PR15_LOCAL_STATUS_FILE,'utf8'));assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.equal(process.env.PR15_WEB_URL,'http://127.0.0.1:3102');assert.match(process.env.DOCKER_HOST??'',/^unix:/);
 const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),anon=createClient(c.API_URL,c.ANON_KEY,opts);
 const check=r=>{assert.ifError(r.error&&Error(r.error.message+' ['+r.error.code+']'));return r.data;},denied=(r,code)=>{assert.ok(r.error);if(code)assert.equal(r.error.code,code);};
 const marker=randomUUID().slice(0,8),actors=[],results=[],metrics=[];let reviewJobId=null;
 const sql=source=>new Promise((resolve,reject)=>{const p=spawn(process.env.PR15_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);});
 async function hold(source){const p=spawn(process.env.PR15_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let pid,err='';p.stderr.on('data',b=>err+=b);const done=new Promise((res,rej)=>{p.on('exit',code=>code?rej(Error(err)):res());});await new Promise((res,rej)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR15_LOCK:(\d+)/);if(m){pid=Number(m[1]);res();}});p.on('error',rej);p.stdin.write(`begin;${source};select 'PR15_LOCK:'||pg_backend_pid();\n`);});return{pid,release:async()=>{p.stdin.end('commit;\n');await done;}};}
 async function blocked(pid){for(let n=0;n<50;n++){if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`)))return;await new Promise(r=>setTimeout(r,20));}assert.fail('No independent lock wait');}
 t.after(async()=>{if(actors.length){check(await service.from('profiles').update({status:'disabled'}).in('id',actors));check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors));}if(process.env.PR15_RESULTS_FILE)writeFileSync(process.env.PR15_RESULTS_FILE,JSON.stringify({marker,reviewJobId,results,metrics},null,2));});
 async function actor(role){const password=randomBytes(24).toString('base64url'),u=check(await service.auth.admin.createUser({email:`pr15-${role}-${marker}@example.invalid`,password,email_confirm:true})).user;actors.push(u.id);check(await service.from('profiles').update({status:'active',full_name:`PR15 ${role} ${marker}`}).eq('id',u.id));check(await service.from('employee_records').insert({auth_user_id:u.id,legal_name:`PR15 ${role} ${marker}`,is_active:true,employment_status:'active'}));const r=check(await service.from('roles').select('id').eq('name',role).single());check(await service.from('user_roles').insert({user_id:u.id,role_id:r.id}));const jar=new Map(),client=createServerClient(c.API_URL,c.ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(v=>jar.set(v.name,v.value))}});check(await client.auth.signInWithPassword({email:u.email,password}));return{id:u.id,client,cookie:()=>[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};}
 const owner=await actor('owner'),admin=await actor('admin'),estimator=await actor('estimator'),payroll=await actor('payroll_admin'),crew=await actor('crew'),customerActor=await actor('customer');
 const phone='540'+randomInt(1000000,9999999),name='PR15 Willow '+marker;
 const customer=check(await service.from('customers').insert({display_name:name,phone,email:`pr15-${marker}@example.invalid`}).select('id').single());
 const household=check(await service.from('customers').insert({display_name:'PR15 Second household '+marker,phone}).select('id').single());
 const archived=check(await service.from('customers').insert({display_name:'PR15 Archived '+marker,phone,archived_at:new Date().toISOString()}).select('id').single());
 const loc=check(await service.from('service_locations').insert({customer_id:customer.id,street:'123 Willow Lane',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
 const searchCode=load('../src/lib/data/command-search.ts',{'server-only':{},'@/lib/record-search':recordCode,'@/lib/runtime/deadline':{withDeadline}});
 const run=(label,fn)=>t.test(label,async()=>{await fn();results.push({name:label,pass:true});});
 const rolesFor=client=>load('../src/lib/auth/roles.ts',{'@/lib/supabase/server':{createClient:async()=>client}});
 const actionsFor=client=>load('../src/app/admin/follow-ups/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/auth/roles':rolesFor(client),'@/lib/business-time':businessTime,'@/lib/runtime/deadline':{withDeadline}});
 async function quote(est=estimator.id){const q=check(await owner.client.rpc('create_quote_draft',{p_header:{customer_id:customer.id,service_location_id:loc.id},p_lines:[{name:'PR15 scope',description:'Disposable only',quantity:1,unit_price_cents:12345,total_cents:12345}]}));const employee=est?check(await service.from('employee_records').select('id').eq('auth_user_id',est).single()):null;check(await service.from('quotes').update({estimator_user_id:est,estimator_employee_id:employee?.id??null}).eq('id',q.id));return check(await service.from('quotes').select('*').eq('id',q.id).single());}
 const approve=q=>owner.client.rpc('approve_quote',{p_quote_id:q.id,p_expected_revision:q.edit_revision});
 const task=async job=>check(await service.from('follow_up_tasks').select('*').eq('dedupe_key','approved-work-schedule:'+job).single());
 const update=(actor,row,assignee=owner.id,snooze=null,version=row.updated_at)=>actor.client.rpc('update_office_handoff',{p_task_id:row.id,p_expected_updated_at:version,p_assignee_id:assignee,p_snoozed_until:snooze});
 let primary,jobId;
 await run('search returns separate households sharing a phone, excludes archived rows and preserves mixed addresses',async()=>{
  const found=await searchCode.searchCommandRecords(owner.client,phone);const ids=found.filter(r=>r.recordType==='customer').map(r=>r.id);assert.ok(ids.includes(customer.id)&&ids.includes(household.id));assert.equal(ids.includes(archived.id),false);
  assert.ok((await searchCode.searchCommandRecords(owner.client,'123 Willow 22401')).some(r=>r.id===customer.id));
  for(const row of found)assert.deepEqual(Object.keys(row).sort(),['detail','href','id','recordType','title']);
 });
 await run('concurrent approval and repeated ensure calls create one scheduling handoff owned by the active estimator',async()=>{
  const q=await quote(),all=(await Promise.all(Array.from({length:3},()=>approve(q)))).map(check);assert.equal(new Set(all.map(r=>r.job_id)).size,1);jobId=all[0].job_id;primary=await task(jobId);assert.equal(primary.assigned_to_user_id,estimator.id);assert.equal(primary.status,'open');
  const ids=(await Promise.all(Array.from({length:4},()=>owner.client.rpc('ensure_scheduling_handoff',{p_job_id:jobId})))).map(check);assert.deepEqual(new Set(ids),new Set([primary.id]));assert.equal(check(await service.from('follow_up_tasks').select('id').eq('job_id',jobId).eq('task_type','schedule_approved_work')).length,1);assert.equal(check(await service.from('activity_log').select('id').eq('subject_id',primary.id).eq('event_type','scheduling_handoff_opened')).length,1);
 });
 await run('quote numbers and record results work for every office role without monetary search snippets',async()=>{
  const invoice=check(await owner.client.rpc('create_invoice_draft',{p_header:{customer_id:customer.id,service_location_id:loc.id},p_lines:[{name:'Local invoice',quantity:1,unit_price_cents:12345,total_cents:12345}]}));
  for(const user of [owner,admin,estimator,payroll]){const r=await searchCode.searchCommandRecords(user.client,marker);assert.ok(r.some(x=>x.recordType==='customer'));assert.ok(r.some(x=>x.recordType==='quote'));assert.ok(r.some(x=>x.recordType==='invoice'));assert.ok(r.some(x=>x.recordType==='job'&&x.title==='Work order'&&x.detail.includes('123 Willow Lane')));assert.equal(r.some(row=>row.title.includes('$')||row.detail.includes('$')||row.detail.includes('123.45')),false);}
  const q=check(await service.from('quotes').select('quote_number').eq('job_id',jobId).single());assert.ok((await searchCode.searchCommandRecords(owner.client,q.quote_number)).some(r=>r.recordType==='quote'));
 });
 await run('real HTTP search denies anonymous and field/customer accounts, is private, and exposes no credentials',async()=>{
  const base=process.env.PR15_WEB_URL+'/api/admin/record-search?q='+encodeURIComponent(marker);
  assert.equal((await fetch(base)).status,401);
  for(const user of [crew,customerActor]){const response=await fetch(base,{headers:{cookie:user.cookie()}});assert.equal(response.status,403);assert.deepEqual((await response.json()).results,[]);}
  const r=await fetch(base,{headers:{cookie:owner.cookie()}});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.match(r.headers.get('vary'),/Cookie/);const body=await r.text();assert.equal(body.includes(c.SERVICE_ROLE_KEY),false);assert.equal(body.includes('total_cents'),false);assert.ok(JSON.parse(body).results.length);
  for(let i=0;i<3;i++){const start=performance.now();const sample=await fetch(base,{headers:{cookie:owner.cookie()}});assert.equal(sample.status,200);await sample.json();metrics.push({kind:'authorized-http-search',durationMs:Math.round(performance.now()-start)});}
 });
 await run('new invoker views and recovery commands preserve public and role boundaries',async()=>{
  for(const table of ['office_follow_up_queue','approved_work_handoff_gaps','office_handoff_staff']){denied(await anon.from(table).select('*'),'42501');assert.equal(check(await crew.client.from(table).select('*')).length,0);}
  for(const actor of [crew,customerActor]){denied(await actor.client.rpc('ensure_scheduling_handoff',{p_job_id:jobId}),'42501');denied(await update(actor,primary),'42501');}
  denied(await service.rpc('ensure_scheduling_handoff',{p_job_id:jobId}),'42501');
  assert.equal(await sql("select bool_and('security_invoker=true'=any(reloptions) and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE') and not has_table_privilege('service_role',oid,'INSERT,UPDATE,DELETE')) from pg_class where oid in ('public.office_follow_up_queue'::regclass,'public.approved_work_handoff_gaps'::regclass,'public.office_handoff_staff'::regclass)"),'t');
  denied(await owner.client.from('office_handoff_staff').update({full_name:'Must not be writable through a read view'}).eq('id',owner.id),'42501');
 });
 await run('owner changes use current versions, reject inactive/field owners, and retain a mandatory audit',async()=>{
  for(const who of [owner,admin,estimator,payroll]){primary=await task(jobId);check(await update(who,primary,who.id));}
  primary=await task(jobId);denied(await update(owner,primary,crew.id),'23514');check(await service.from('profiles').update({status:'disabled'}).eq('id',admin.id));denied(await update(owner,primary,admin.id),'23514');check(await service.from('profiles').update({status:'active'}).eq('id',admin.id));
  const old=primary;check(await update(owner,primary,estimator.id));denied(await update(owner,old,owner.id),'40001');primary=await task(jobId);assert.equal(primary.assigned_to_user_id,estimator.id);
  assert.ok(check(await service.from('activity_log').select('id').eq('subject_id',primary.id).eq('event_type','office_handoff_changed')).length>=5);
 });
 await run('snoozing changes actual return order and stale updates cannot erase it',async()=>{
  const future=new Date(Date.now()+86400000).toISOString();primary=await task(jobId);check(await update(owner,primary,owner.id,future));const row=await task(jobId);assert.equal(Date.parse(row.next_action_at),Date.parse(future));assert.equal(row.status,'waiting');
  const code=load('../src/lib/data/next-actions.ts',{'server-only':{},react:{cache:fn=>fn},'@/lib/supabase/server':{createClient:async()=>owner.client},'@/lib/auth/roles':rolesFor(owner.client),'@/lib/runtime/deadline':{withDeadline}});
  const due=await code.getOfficeHandoffPage(filterCode.handoffFilters({assigned:'me',due:'due'}),owner.id);assert.ifError(due.error);assert.equal(due.data.some(r=>r.id===row.id),false);
  const snoozed=await code.getOfficeHandoffPage(filterCode.handoffFilters({assigned:'me',due:'snoozed'}),owner.id);assert.ifError(snoozed.error);assert.ok(snoozed.data.some(r=>r.id===row.id));
  check(await update(owner,row,estimator.id,null));primary=await task(jobId);
 });
 await run('bulk preview invokes the real server action without mutating or sending',async()=>{
  const before=await task(jobId),form=new FormData();form.append('task_id',before.id);form.set('assigned_to_user_id',owner.id);form.set('snoozed_until','2030-03-01T09:00');
  const result=await actionsFor(owner.client).previewHandoffChanges({status:'idle',message:''},form);assert.equal(result.status,'success');assert.match(result.message,/No tasks were changed/);assert.equal(result.preview.length,1);assert.deepEqual(await task(jobId),before);
  form.set('assigned_to_user_id',owner.id);const owned=await actionsFor(owner.client).previewHandoffChanges({status:'idle',message:''},form);assert.equal(owned.status,'success');assert.match(owned.preview[0].change,new RegExp(marker));assert.deepEqual(await task(jobId),before);
  const bad=new FormData();for(let i=0;i<26;i++)bad.append('task_id',randomUUID());assert.equal((await actionsFor(owner.client).previewHandoffChanges({status:'idle',message:''},bad)).status,'error');
 });
 await run('a mandatory handoff audit failure rolls back the entire approval',async()=>{
  const q=await quote(),constraint='pr15_audit_'+marker.replaceAll('-','');await sql(`alter table public.activity_log add constraint ${constraint} check(event_type<>'scheduling_handoff_opened' or actor_user_id<>'${owner.id}'::uuid) not valid`);
  try{denied(await approve(q),'23514');const after=check(await service.from('quotes').select('status,job_id').eq('id',q.id).single());assert.deepEqual(after,{status:'draft',job_id:null});assert.equal(check(await service.from('jobs').select('id').eq('source_quote_id',q.id)).length,0);}finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
 });
 let event1,event2;
 async function book(day){return check(await owner.client.rpc('save_schedule_event',{p_event_id:null,p_expected_revision:null,p_event:{title:'PR15 local booking '+marker,event_type:'job',status:'scheduled',job_id:jobId,service_location_id:loc.id,starts_at:`2030-02-${day}T13:00:00Z`,ends_at:`2030-02-${day}T14:00:00Z`},p_employee_ids:[]}));}
 async function cancel(id){const e=check(await service.from('schedule_events').select('edit_revision').eq('id',id).single());return owner.client.rpc('save_schedule_event',{p_event_id:id,p_expected_revision:e.edit_revision,p_event:{status:'cancelled'},p_mode:'status',p_employee_ids:[]});}
 await run('booking resolves a handoff once; a second booking and a partial cancellation cannot reopen it',async()=>{
  event1=await book('01');assert.equal((await task(jobId)).status,'completed');event2=await book('02');check(await cancel(event1.id));assert.equal((await task(jobId)).status,'completed');assert.equal(check(await service.from('activity_log').select('id').eq('subject_id',primary.id).eq('event_type','scheduling_handoff_resolved')).length,1);
 });
 await run('cancelling the final booking reopens the original handoff, retaining owner and history',async()=>{
  check(await cancel(event2.id));const reopened=await task(jobId);assert.equal(reopened.id,primary.id);assert.equal(reopened.status,'open');assert.equal(reopened.assigned_to_user_id,estimator.id);assert.equal(reopened.completed_at,null);assert.equal(check(await service.from('follow_up_tasks').select('id').eq('dedupe_key',reopened.dedupe_key)).length,1);primary=reopened;
 });
 await run('direct callers cannot forge, delete or manually close automatic scheduling history',async()=>{
  denied(await owner.client.from('follow_up_tasks').insert({customer_id:customer.id,job_id:jobId,title:'Forged',due_at:new Date().toISOString(),dedupe_key:'approved-work-schedule:'+randomUUID()}),'42501');
  for(const values of [{status:'completed'},{job_id:randomUUID()},{dedupe_key:'changed'}])denied(await owner.client.from('follow_up_tasks').update(values).eq('id',primary.id),'42501');denied(await owner.client.from('follow_up_tasks').delete().eq('id',primary.id),'42501');assert.equal((await task(jobId)).status,'open');
 });
 await run('archiving and restoring work cancel and reopen one task without removing historical records',async()=>{
  check(await service.from('jobs').update({archived_at:new Date().toISOString()}).eq('id',jobId));assert.equal((await task(jobId)).status,'cancelled');check(await service.from('jobs').update({archived_at:null}).eq('id',jobId));assert.equal((await task(jobId)).status,'open');
 });
 await run('older approved work gaps are read-only until an explicit idempotent repair',async()=>{
  check(await service.from('follow_up_tasks').update({status:'completed'}).eq('id',primary.id));
  const gap=check(await owner.client.from('approved_work_handoff_gaps').select('id').eq('id',jobId).single());assert.equal(gap.id,jobId);
  assert.equal((await task(jobId)).status,'completed');
  const f=new FormData();f.set('job_id',jobId);assert.equal((await actionsFor(owner.client).trackSchedulingHandoff({status:'idle',message:''},f)).status,'success');
  assert.equal((await task(jobId)).id,primary.id);assert.equal((await task(jobId)).status,'open');assert.equal(check(await owner.client.from('approved_work_handoff_gaps').select('id').eq('id',jobId)).length,0);
 });
 await run('legacy maintenance repair remains available and normal appointment edits reconcile in their transaction',async()=>{
  const a=check(await service.from('appointments').insert({job_id:jobId,service_location_id:loc.id,appointment_type:'job',status:'scheduled',starts_at:'2030-04-01T13:00:00Z',ends_at:'2030-04-01T14:00:00Z'}).select('id').single());
  assert.equal(await checkLegacySchedulingHandoff(owner.client,jobId),true);assert.equal((await task(jobId)).status,'completed');
  let current=check(await service.from('appointments').select('*').eq('id',a.id).single());
  check(await owner.client.rpc('save_legacy_appointment',{p_appointment_id:a.id,p_job_id:jobId,p_expected_revision:current.edit_revision,p_values:{starts_at:'2030-04-02T13:00:00Z',ends_at:'2030-04-02T14:00:00Z',assigned_id:null,calendar_notes:current.calendar_notes},p_mode:'details'}));assert.equal((await task(jobId)).status,'completed');
  current=check(await service.from('appointments').select('*').eq('id',a.id).single());
  check(await owner.client.rpc('save_legacy_appointment',{p_appointment_id:a.id,p_job_id:jobId,p_expected_revision:current.edit_revision,p_values:{status:'cancelled'},p_mode:'status'}));assert.equal(check(await owner.client.from('approved_work_handoff_gaps').select('id').eq('id',jobId)).length,0);
  assert.equal(await checkLegacySchedulingHandoff(crew.client,jobId),false);assert.equal(await checkLegacySchedulingHandoff(owner.client,jobId),true);assert.equal((await task(jobId)).id,primary.id);assert.equal((await task(jobId)).status,'open');
 });
 await run('removing an owner makes the task visible in Needs an owner without granting another role access',async()=>{
  check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',estimator.id));assert.equal(check(await owner.client.from('office_follow_up_queue').select('needs_owner').eq('id',primary.id).single()).needs_owner,true);assert.equal(check(await owner.client.from('office_handoff_staff').select('id').eq('id',estimator.id)).length,0);
  const preview=new FormData();preview.append('task_id',primary.id);preview.set('assigned_to_user_id',estimator.id);
  assert.equal((await actionsFor(owner.client).previewHandoffChanges({status:'idle',message:''},preview)).status,'error');
  check(await service.from('employee_records').update({is_active:true,employment_status:'active'}).eq('auth_user_id',estimator.id));
  check(await service.from('profiles').update({status:'disabled'}).eq('id',estimator.id));const visible=check(await owner.client.from('office_follow_up_queue').select('id,needs_owner').eq('needs_owner',true).eq('id',primary.id).single());assert.equal(visible.needs_owner,true);denied(await update(estimator,await task(jobId),owner.id),'42501');
  const r=await fetch(process.env.PR15_WEB_URL+'/api/admin/record-search?q='+marker,{headers:{cookie:estimator.cookie()}});assert.equal(r.status,403);check(await service.from('profiles').update({status:'active'}).eq('id',estimator.id));
 });
 await run('offboarding during a job lock wait revokes an issued token before ownership changes',async()=>{
  const current=await task(jobId),held=await hold(`select id from public.jobs where id='${jobId}' for update`);const pending=update(estimator,current,owner.id).then(r=>r);
  try{await blocked(held.pid);check(await service.from('profiles').update({status:'disabled'}).eq('id',estimator.id));}finally{await held.release();}
  denied(await pending,'42501');assert.equal((await task(jobId)).assigned_to_user_id,current.assigned_to_user_id);check(await service.from('profiles').update({status:'active'}).eq('id',estimator.id));
 });
 await run('manual next-action capabilities remain and queue paging uses effective return times',async()=>{
  const rows=Array.from({length:28},(_,i)=>({customer_id:customer.id,title:`PR15 manual ${i} ${marker}`,task_type:'customer_callback',assigned_to_user_id:owner.id,due_at:new Date(Date.now()+i*1000).toISOString()}));check(await owner.client.from('follow_up_tasks').insert(rows));
  const code=load('../src/lib/data/next-actions.ts',{'server-only':{},react:{cache:fn=>fn},'@/lib/supabase/server':{createClient:async()=>owner.client},'@/lib/auth/roles':rolesFor(owner.client),'@/lib/runtime/deadline':{withDeadline}});
  const one=await code.getOfficeHandoffPage(filterCode.handoffFilters({assigned:'me'}),owner.id),two=await code.getOfficeHandoffPage(filterCode.handoffFilters({assigned:'me',page:2}),owner.id);assert.ifError(one.error);assert.ifError(two.error);assert.equal(one.count,28);assert.equal(one.data.length,25);assert.equal(two.data.length,3);assert.equal(new Set([...one.data,...two.data].map(r=>r.id)).size,28);
  const row=one.data[0];check(await owner.client.from('follow_up_tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',row.id));
 });
 await run('final review work retains a current active owner and no duplicate task',async()=>{
  primary=await task(jobId);check(await update(owner,primary,'55b614b2-efce-4b3a-85e5-697f4fb6b81f'));reviewJobId=jobId;assert.equal(check(await service.from('follow_up_tasks').select('id').eq('job_id',jobId).eq('task_type','schedule_approved_work')).length,1);
 });
});
