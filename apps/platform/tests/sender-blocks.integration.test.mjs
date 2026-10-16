import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {load} from './pr10-test-helpers.mjs';

const enabled=process.env.SPAM_DISPOSABLE_STACK==='1'&&Boolean(process.env.SPAM_LOCAL_STATUS_FILE);
test('Reversible sender blocking with real disposable Auth, PostgreSQL and intake',{skip:!enabled,timeout:240000},async t=>{
 const c=JSON.parse(readFileSync(process.env.SPAM_LOCAL_STATUS_FILE,'utf8'));
 assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.ok(process.env.SPAM_DOCKER_BIN);assert.match(process.env.DOCKER_HOST??'',/^unix:\/\//);
 const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),anon=createClient(c.API_URL,c.ANON_KEY,opts);
 const marker='BLOCK_LOCAL_'+crypto.randomUUID().slice(0,8),actors=[],results=[];let reviewJobId;
 const check=r=>{assert.ifError(r.error&&Error(r.error.message+' ['+r.error.code+']'));return r.data;};
 const denied=(r,code)=>{assert.ok(r.error,'Expected rejection');if(code)assert.equal(r.error.code,code);};
 const sql=source=>new Promise((resolve,reject)=>{
  const p=spawn(process.env.SPAM_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let out='',err='';
  p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);
 });
 const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
 async function actor(role){const password=crypto.randomUUID()+crypto.randomUUID();const u=check(await db.auth.admin.createUser({email:`${marker.toLowerCase()}-${role}@example.invalid`,password,email_confirm:true})).user;actors.push(u.id);check(await db.from('profiles').update({status:'active'}).eq('id',u.id));
  check(await db.from('employee_records').insert({auth_user_id:u.id,legal_name:`${marker} ${role}`,is_active:true,employment_status:'active'}));
  const rr=check(await db.from('roles').select('id').eq('name',role).single());check(await db.from('user_roles').insert({user_id:u.id,role_id:rr.id}));
  const client=createClient(c.API_URL,c.ANON_KEY,opts);check(await client.auth.signInWithPassword({email:u.email,password}));return{id:u.id,client};}
 const owner=await actor('owner'),admin=await actor('admin'),estimator=await actor('estimator'),crew=await actor('crew'),customer=await actor('customer');
 let seq=0;
 function submission(extra={}){const id=marker+'_'+(++seq);return{submissionId:id,firstName:'Synthetic',lastName:marker,name:'Synthetic '+marker,phone:'+1540'+String(5000000+seq).padStart(7,'0'),email:`${id.toLowerCase()}@example.invalid`,serviceLabel:'Tree Care',serviceType:'other',customerTypeLabel:'Homeowner',customerType:'residential',commercialName:null,propertyScope:'1 property',address:'123 Local Fixture Street, Fredericksburg, VA 22401',addressParts:{street:'123 Local Fixture Street',city:'Fredericksburg',state:'VA',postalCode:'22401',needsConfirmation:false},projectDetails:'Disposable sender-blocking fixture '+marker,hazardPresent:false,updatesOptIn:false,preferredContactMethod:'email',preferredAppointmentTiming:null,pageUrl:'https://angeltreeservices.org',referrer:null,utmSource:'local-test',utmMedium:'test',utmCampaign:marker,utmTerm:null,utmContent:null,requestFingerprint:crypto.createHash('sha256').update(id).digest('hex'),submittedAt:new Date().toISOString(),...extra};}
 const submit=s=>db.rpc('submit_website_lead',{p_submission:s});
 async function lead(extra={},spam=true){const s=submission(extra),r=check(await submit(s));if(spam)check(await owner.client.from('jobs').update({lead_disposition:'spam'}).eq('id',r.job_id));return{s,id:r.job_id};}
 const controls=async(id,client=owner.client)=>check(await client.rpc('get_website_sender_controls',{p_jobs:[id]}))[0];
 async function block(l,{email=true,phone=false,client=owner.client,request=crypto.randomUUID(),contacts,reason='Repeated spam submissions in local verification'}={}){
  return client.rpc('block_website_sender',{p_job:l.id,p_contacts:contacts??(await controls(l.id)).contacts,p_email:email,p_phone:phone,p_reason:reason,p_request:request});
 }
 const unblock=(id,client=owner.client,request=crypto.randomUUID())=>client.rpc('unblock_website_sender',{p_block:id,p_reason:'Disposable verification unblock',p_request:request});
 const register=async(client=owner.client,page=1)=>check(await client.rpc('list_website_sender_blocks',{p_page:page}));
 const counts=()=>sql("select jsonb_object_agg(n,c) from (select 'customers' n,count(*) c from public.customers union all select 'organizations',count(*) from public.organizations union all select 'organization_contacts',count(*) from public.organization_contacts union all select 'service_locations',count(*) from public.service_locations union all select 'jobs',count(*) from public.jobs union all select 'notes',count(*) from public.notes union all select 'activity_log',count(*) from public.activity_log union all select 'outbox',count(*) from app_private.outbound_deliveries union all select 'snapshots',count(*) from app_private.website_lead_submissions) x");
 t.after(async()=>{
  // Only this run's synthetic identities, never broad cleanup or the review owner.
  await sql(`update app_private.website_sender_blocks set unblocked_at=coalesce(unblocked_at,clock_timestamp()),unblock_reason=coalesce(unblock_reason,'Local suite finished') where source_job_id in(select id from public.jobs where utm_campaign='${marker}');`);
  check(await db.from('profiles').update({status:'disabled'}).in('id',actors));check(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors));
  // Archive this run's accepted test leads; retain all facts and the one UI fixture.
  await sql(`update public.jobs set archived_at=coalesce(archived_at,clock_timestamp()),lead_disposition='archived' where utm_campaign='${marker}' and id is distinct from ${reviewJobId?`'${reviewJobId}'::uuid`:'null::uuid'};`);
  if(process.env.SPAM_RESULTS_FILE)writeFileSync(process.env.SPAM_RESULTS_FILE,JSON.stringify({marker,reviewJobId,results,passed:results.length},null,2));
 });
 await run('only live owner/admin may read or change blocks; tables and server intake stay private',async()=>{
  const l=await lead();
  for(const client of [anon,db,estimator.client,crew.client,customer.client]){
   denied(await client.rpc('get_website_sender_controls',{p_jobs:[l.id]}),'42501');denied(await client.rpc('list_website_sender_blocks',{}),'42501');
   denied(await block(l,{client}),'42501');denied(await unblock(crypto.randomUUID(),client),'42501');
  }
  check(await admin.client.rpc('get_website_sender_controls',{p_jobs:[l.id]}));
  for(const role of ['anon','authenticated','service_role'])for(const table of ['website_sender_blocks','blocked_website_submissions'])
   for(const permission of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(await sql(`select has_table_privilege('${role}','app_private.${table}','${permission}')`),'f');
  denied(await owner.client.rpc('submit_website_lead',{p_submission:submission()}),'42501');
 });
 await run('block requires spam classification, exact reviewed contacts, a reason and a selection',async()=>{
  const l=await lead({},false);denied(await block(l),'23514');check(await owner.client.from('jobs').update({lead_disposition:'spam'}).eq('id',l.id));
  denied(await block(l,{contacts:{email:'other@example.invalid',phone:l.s.phone}}),'40001');denied(await block(l,{email:false}),'22023');denied(await block(l,{reason:'no'}),'22023');
  const missing=await lead({email:null});denied(await block(missing),'22023');
 });
 await run('email case variants are blocked before any party/work/audit/notice creation',async()=>{
  const l=await lead();const r=check(await block(l)),before=await counts();assert.equal(r.blockIds.length,1);
  const s=submission({email:l.s.email.toUpperCase(),phone:'+15405559876'}),blocked=check(await submit(s));assert.equal(blocked.blocked,true);assert.equal(blocked.job_id,null);assert.equal(blocked.created,false);assert.equal(await counts(),before);
  const receipt=JSON.parse(await sql(`select to_jsonb(r) from app_private.blocked_website_submissions r where submission_id='${s.submissionId}'`));assert.equal(receipt.block_ids[0],r.blockIds[0]);assert.deepEqual(Object.keys(receipt).sort(),['block_ids','created_at','payload_hash','submission_id']);
 });
 await run('email selection does not block unrelated emails, domains, addresses, names or shared phones',async()=>{
  const l=await lead();check(await block(l));const r=check(await submit(submission({phone:l.s.phone})));assert.equal(r.created,true);
  assert.equal(check(await submit(submission({email:'different-'+l.s.email}))).created,true);
 });
 await run('North American phone variants normalize to the exact selected phone',async()=>{
  const l=await lead();check(await block(l,{email:false,phone:true}));
  assert.equal(await sql(`select app_private.normalize_website_sender('phone','(${l.s.phone.slice(2,5)}) ${l.s.phone.slice(5,8)}-${l.s.phone.slice(8)}')`),l.s.phone);
  assert.equal(check(await submit(submission({phone:l.s.phone,email:'new-'+l.s.email}))).blocked,true);
  assert.equal(check(await submit(submission({email:l.s.email}))).created,true);
 });
 await run('commercial and no-email phone-only submissions use the same decision boundary',async()=>{
  const l=await lead({customerType:'commercial',customerTypeLabel:'Commercial / Property Management',commercialName:'Synthetic Company '+marker,email:null});
  check(await block(l,{email:false,phone:true,client:admin.client}));const before=await counts();assert.equal(check(await submit(submission({phone:l.s.phone,email:null,customerType:'commercial',customerTypeLabel:'Commercial / Property Management',commercialName:'Another Synthetic Company'}))).blocked,true);assert.equal(await counts(),before);
 });
 await run('concurrent duplicate submissions store one blocked receipt and no records',async()=>{
  const l=await lead();check(await block(l));const s=submission({email:l.s.email}),before=await counts();
  const all=(await Promise.all(Array.from({length:8},()=>submit(s)))).map(check);assert.ok(all.every(x=>x.blocked));assert.equal(await counts(),before);
  assert.equal(await sql(`select count(*) from app_private.blocked_website_submissions where submission_id='${s.submissionId}'`),'1');
  denied(await submit({...s,projectDetails:'Changed same-key payload'}),'23505');
 });
 await run('concurrent block confirmations converge; response-loss replay cannot reblock after unblock',async()=>{
  const l=await lead(),request=crypto.randomUUID(),contacts=(await controls(l.id)).contacts;
  const all=(await Promise.all(Array.from({length:6},()=>block(l,{request,contacts})))).map(check);assert.equal(new Set(all.map(x=>x.blockIds[0])).size,1);
  const id=all[0].blockIds[0];check(await unblock(id));assert.equal(check(await block(l,{request,contacts})).blockIds[0],id);assert.equal((await controls(l.id)).blockedKinds.length,0);
  denied(await block(l,{request,contacts,phone:true}),'23505');
 });
 await run('unblocking one identity leaves the other effective; old blocked receipts never replay after both unblock',async()=>{
  const l=await lead(),r=check(await block(l,{phone:true}));assert.equal(r.blockIds.length,2);
  const s=submission({email:l.s.email,phone:l.s.phone});assert.equal(check(await submit(s)).blocked,true);
  check(await unblock(r.blockIds[0]));assert.equal(check(await submit(submission({email:l.s.email,phone:l.s.phone}))).blocked,true);
  check(await unblock(r.blockIds[1]));assert.equal(check(await submit(s)).blocked,true);assert.equal(check(await submit(submission({email:l.s.email,phone:l.s.phone}))).created,true);
 });
 await run('restoring the old lead does not unblock or resend it; a historic replay never recreates context',async()=>{
  const l=await lead();check(await block(l));check(await owner.client.from('jobs').update({lead_disposition:'active'}).eq('id',l.id));
  const before=await counts();assert.equal(check(await submit(l.s)).duplicate_mode,'replayed');assert.equal(await counts(),before);assert.equal(check(await submit(submission({email:l.s.email}))).blocked,true);
 });
 await run('failed audit rolls back block and unblock together with their history',async()=>{
  const l=await lead(),name='block_fault_'+crypto.randomUUID().replaceAll('-','');
  async function fault(event,fn){await sql(`alter table public.activity_log add constraint ${name} check(subject_id<>'${l.id}' or event_type<>'${event}') not valid;`);try{await fn();}finally{await sql(`alter table public.activity_log drop constraint ${name}`);}}
  await fault('website_sender_blocked',async()=>{denied(await block(l));assert.equal((await controls(l.id)).blockedKinds.length,0);});
  const b=check(await block(l));await fault('website_sender_unblocked',async()=>{denied(await unblock(b.blockIds[0]));assert.deepEqual((await controls(l.id)).blockedKinds,['email']);});
 });
 await run('legacy leads without saved PR14 payload can block only exact current contact details',async()=>{
  const l=await lead();await sql(`delete from app_private.website_lead_submissions where job_id='${l.id}'`);
  assert.equal((await controls(l.id)).contacts.email,l.s.email);check(await block(l));assert.equal(check(await submit(submission({email:l.s.email}))).blocked,true);
 });
 await run('immutable original intake contact wins over later customer edits',async()=>{
  const l=await lead();const j=check(await db.from('jobs').select('customer_id').eq('id',l.id).single());check(await db.from('customers').update({email:'changed-'+l.s.email}).eq('id',j.customer_id));
  assert.equal((await controls(l.id)).contacts.email,l.s.email);check(await block(l));assert.equal(check(await submit(submission({email:l.s.email}))).blocked,true);assert.equal(check(await submit(submission({email:'changed-'+l.s.email}))).created,true);
 });
 await run('offboarded or disabled actors with issued tokens cannot list, block or unblock',async()=>{
  const l=await lead(),b=check(await block(l));check(await db.from('profiles').update({status:'disabled'}).eq('id',admin.id));denied(await registerError(admin.client),'42501');denied(await unblock(b.blockIds[0],admin.client),'42501');denied(await block(l,{client:admin.client}),'42501');check(await db.from('profiles').update({status:'active'}).eq('id',admin.id));
  check(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',admin.id));denied(await registerError(admin.client),'42501');denied(await block(l,{client:admin.client}),'42501');check(await db.from('employee_records').update({is_active:true,employment_status:'active'}).eq('auth_user_id',admin.id));
 });
 function registerError(client){return client.rpc('list_website_sender_blocks',{});}
 await run('a held block transaction serializes a new submission until the committed decision is visible',async()=>{
  const l=await lead(),contacts=(await controls(l.id)).contacts,request=crypto.randomUUID();
  const p=spawn(process.env.SPAM_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let err='',pid;
  p.stderr.on('data',b=>err+=b);const done=new Promise(resolve=>p.on('exit',resolve));
  const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/BLOCK_READY:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('exit',()=>reject(Error(err)));});
  p.stdin.write(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${owner.id}',true);select public.block_website_sender('${l.id}','${JSON.stringify(contacts)}',true,false,'Held block concurrency test','${request}');select 'BLOCK_READY:'||pg_backend_pid();\n`);await ready;
  const s=submission({email:l.s.email}),pending=submit(s).then(r=>r);let waiting=false;
  try{for(let i=0;i<50;i++){if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}assert.ok(waiting);}
  finally{p.stdin.end('commit;\n');await done;}
  assert.equal(check(await pending).blocked,true);
 });
 await run('a rolled-back block admits a new request and retains no partial decision',async()=>{
  const l=await lead(),contacts=(await controls(l.id)).contacts;
  await sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${owner.id}',true);select public.block_website_sender('${l.id}','${JSON.stringify(contacts)}',true,false,'Rollback block concurrency test','${crypto.randomUUID()}');rollback;`);
  assert.equal((await controls(l.id)).blockedKinds.length,0);assert.equal(check(await submit(submission({email:l.s.email}))).created,true);
 });
 await run('role-management serialization rechecks a queued administrator after access is revoked',async()=>{
  const l=await lead(),contacts=(await controls(l.id)).contacts;
  const p=spawn(process.env.SPAM_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let err='',pid;
  p.stderr.on('data',b=>err+=b);const done=new Promise(resolve=>p.on('exit',resolve));
  const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/REVOKE_READY:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('exit',()=>reject(Error(err)));});
  p.stdin.write(`begin;select pg_advisory_xact_lock(hashtext('platform-role-management'));update public.profiles set status='disabled' where id='${admin.id}';select 'REVOKE_READY:'||pg_backend_pid();\n`);await ready;
  const pending=block(l,{client:admin.client,contacts}).then(r=>r);let waiting=false;
  try{for(let i=0;i<50;i++){if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}assert.ok(waiting);}
  finally{p.stdin.end('commit;\n');await done;}
  denied(await pending,'42501');assert.equal((await controls(l.id)).blockedKinds.length,0);check(await db.from('profiles').update({status:'active'}).eq('id',admin.id));
 });
 await run('block register pages include exact active count and retain reason/history',async()=>{
  for(let i=0;i<20;i++){const l=await lead();check(await block(l));}
  const a=await register(),b=await register(owner.client,2);assert.ok(a.count>25);assert.equal(a.rows.length,25);assert.ok(b.rows.length);assert.equal(a.count,b.count);assert.equal(new Set([...a.rows,...b.rows].map(x=>x.id)).size,a.rows.length+b.rows.length);
  assert.equal(a.activeCount,Number(await sql('select count(*) from app_private.website_sender_blocks where unblocked_at is null')));
  assert.ok(a.rows.every(x=>x.reason&&Number.isSafeInteger(x.blocked_requests)));
 });
 await run('PR14 office notice preparation, claim and supervised repair cannot bypass an active sender block',async()=>{
  const l=await lead({},false),attempt=check(await db.rpc('claim_website_lead_notification',{p_job_id:l.id}));
  const payload={from:'office@example.invalid',reply_to:'office@example.invalid',to:['office@example.invalid'],cc:[],subject:'Synthetic office notice',text:'No real provider.'};
  const batch=check(await db.rpc('prepare_website_notice_batch',{p_job_id:l.id,p_attempt_id:attempt,p_messages:[payload]}));
  const other=await lead({email:l.s.email});check(await block(other));
  assert.equal(check(await db.rpc('claim_outbound_delivery',{p_delivery_id:batch[0]})),null);
  denied(await owner.client.rpc('review_outbound_delivery',{p_delivery_id:batch[0],p_action:'retry',p_reason:'Try blocked repair locally',p_request_id:crypto.randomUUID()}),'40001');
  const d=check(await db.rpc('get_outbound_delivery',{p_delivery_id:batch[0]}));assert.equal(d.attempt_count,0);assert.equal(d.state,'cancelled');
  denied(await db.rpc('prepare_outbound_delivery',{p_request_key:crypto.randomUUID(),p_payload:payload,p_context:{kind:'office',email_type:'lead_internal_notice',job_id:l.id}}),'23514');
 });
 await run('contact blocking does not affect existing quote/invoice email eligibility',async()=>{
  const l=await lead(),j=check(await db.from('jobs').select('customer_id,service_location_id').eq('id',l.id).single());check(await block(l));
  const q=check(await owner.client.rpc('create_quote_draft',{p_header:{customer_id:j.customer_id,service_location_id:j.service_location_id},p_lines:[{name:'Preserved service',quantity:1,unit_price_cents:10000,total_cents:10000}]}));
  const p={from:'office@example.invalid',reply_to:'office@example.invalid',to:[l.s.email],cc:[],subject:'Preserve real quote behavior',text:'Local stub only'};
  const r=check(await db.rpc('prepare_outbound_delivery',{p_request_key:crypto.randomUUID(),p_payload:p,p_context:{kind:'quote',email_type:'quote',actor_id:owner.id,quote_ids:[q.id],customer_id:j.customer_id,portal_tokens:[],expected_versions:{['quote:'+q.id]:q.edit_revision}}}));
  const a=check(await db.rpc('claim_outbound_delivery',{p_delivery_id:r.id}));assert.ok(a);check(await db.rpc('finish_outbound_delivery',{p_delivery_id:r.id,p_attempt_id:a.attempt_id,p_outcome:'not_attempted'}));
 });
 await run('actual public route returns the same new-request response and never invokes notification transport',async()=>{
  const l=await lead();check(await block(l));let notices=0;
  const intake=load('../src/lib/leads/intake.ts',{'server-only':{},'node:crypto':crypto,'@/lib/supabase/admin':{getServiceRoleClient:()=>db}});
  const route=load('../src/app/api/leads/route.ts',{'next/server':{NextResponse:class extends Response{static json(b,i){return Response.json(b,i);}}},'@/lib/leads/config':{PUBLIC_LEAD_SUCCESS_MESSAGE:'Request received.',getAllowedLeadIntakeOrigins:()=>['http://127.0.0.1:8000']},'@/lib/leads/intake':intake,'@/lib/leads/notifications':{attemptWebsiteLeadNotification:async()=>{notices++;}},'@/lib/security/monitoring-secret':{bearerToken:()=>null,isAuthenticatedMonitoringCanary:()=>false},'@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>({allowed:true,available:true}),hashRateLimitKey:()=> 'local',trustedClientIp:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>db}});
  const request=email=>new Request('http://127.0.0.1:3102/api/leads',{method:'POST',headers:{origin:'http://127.0.0.1:8000'},body:new URLSearchParams({name:'Synthetic request',phone:l.s.phone,email,address:l.s.address,message:l.s.projectDetails,service:'Tree Care',submission_id:crypto.randomUUID()})});
  const blocked=await route.POST(request(l.s.email.toUpperCase()));assert.equal(blocked.status,201);assert.equal(notices,0);
  const accepted=await route.POST(request('new-'+l.s.email));assert.equal(accepted.status,201);assert.deepEqual(await blocked.json(),await accepted.json());assert.equal(notices,1);
 });
 await run('running local HTTP endpoint suppresses normalized blocked contacts with its real route and rate limiter',async()=>{
  assert.equal(process.env.SPAM_WEB_URL,'http://127.0.0.1:3102');
  const l=await lead();check(await block(l));const before=await counts();
  const response=await fetch(process.env.SPAM_WEB_URL+'/api/leads',{method:'POST',headers:{origin:'http://127.0.0.1:8000'},signal:AbortSignal.timeout(30000),body:new URLSearchParams({name:'Synthetic local HTTP',phone:l.s.phone.slice(2),email:l.s.email.toUpperCase(),address:l.s.address,message:l.s.projectDetails,service:'Tree Care',submission_id:marker+'_http'})});
  assert.equal(response.status,201);const body=await response.json();assert.equal(body.ok,true);assert.deepEqual(Object.keys(body).sort(),['message','ok']);assert.doesNotMatch(JSON.stringify(body),/blocked|block_ids|spam|example.invalid/i);assert.equal(await counts(),before);
 });
 await run('local review fixture is retained without any active block or provider call',async()=>{
  const l=await lead({name:'Synthetic spam review',email:'spam-review-'+marker.toLowerCase()+'@example.invalid',projectDetails:'Synthetic local-only example. Use Block sender, select exact contacts, then unblock in Blocked senders. No real customer or provider is involved.'});reviewJobId=l.id;
  assert.equal((await controls(l.id)).blockedKinds.length,0);
 });
});
