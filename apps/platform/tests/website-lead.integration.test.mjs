import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';

const enabled=process.env.PR13_DISPOSABLE_STACK==='1'&&Boolean(process.env.PR13_LOCAL_STATUS_FILE);
test('PR13 transactional website intake against disposable Auth, RLS and PostgreSQL',{skip:!enabled,timeout:180000},async t=>{
 const c=JSON.parse(readFileSync(process.env.PR13_LOCAL_STATUS_FILE,'utf8'));
 assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.ok(process.env.PR13_DOCKER_BIN);assert.match(process.env.DOCKER_HOST??'',/^unix:\/\//);
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,options),anon=createClient(c.API_URL,c.ANON_KEY,options);
 const marker='PR13_LOCAL_'+randomUUID().slice(0,8),results=[],actors=[];let reviewJobId=null;
 const check=r=>{assert.ifError(r.error&&new Error(r.error.message+' ['+r.error.code+']'));return r.data;};
 const denied=(r,code)=>{assert.ok(r.error,'Expected rejection');if(code)assert.equal(r.error.code,code);};
 const sql=source=>new Promise((resolve,reject)=>{
  const p=spawn(process.env.PR13_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);
 });
 const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
 let seq=0;
 function submission(extra={}){const id=marker+'_'+(++seq);return{submissionId:id,firstName:'Local',lastName:marker,name:'Local '+marker,phone:'+15405550123',email:'shared-household@example.invalid',serviceLabel:'Tree Care',serviceType:'other',customerTypeLabel:'Homeowner',customerType:'residential',commercialName:null,propertyScope:'1 property',address:'123 '+marker+' Street, Fredericksburg, VA 22401',addressParts:{street:'123 '+marker+' Street',city:'Fredericksburg',state:'VA',postalCode:'22401',needsConfirmation:false},projectDetails:'Local test project '+marker,hazardPresent:false,updatesOptIn:true,preferredContactMethod:'text',preferredAppointmentTiming:'Weekday afternoon',pageUrl:'https://angeltreeservices.com/contact',referrer:null,utmSource:'local-test',utmMedium:'test',utmCampaign:'PR13',utmTerm:null,utmContent:null,requestFingerprint:createHash('sha256').update(id).digest('hex'),submittedAt:new Date().toISOString(),...extra};}
 const submit=s=>service.rpc('submit_website_lead',{p_submission:s});
 const job=async id=>check(await service.from('jobs').select('*').eq('id',id).single());
 const claim=id=>service.rpc('claim_website_lead_notification',{p_job_id:id});
 const finish=(id,attempt,outcome)=>service.rpc('finish_website_lead_notification',{p_job_id:id,p_attempt_id:attempt,p_outcome:outcome});
 const counts=()=>sql("select jsonb_object_agg(n,c) from (select 'customers' n,count(*) c from public.customers union all select 'organizations',count(*) from public.organizations union all select 'organization_contacts',count(*) from public.organization_contacts union all select 'service_locations',count(*) from public.service_locations union all select 'jobs',count(*) from public.jobs union all select 'notes',count(*) from public.notes union all select 'activity_log',count(*) from public.activity_log) s");
 t.after(async()=>{if(actors.length){check(await service.from('profiles').update({status:'disabled'}).in('id',actors));check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors));}if(process.env.PR13_RESULTS_FILE)writeFileSync(process.env.PR13_RESULTS_FILE,JSON.stringify({results,marker,reviewJobId,passed:results.length},null,2));});
 await run('public and authenticated callers cannot execute any privileged intake/notice command',async()=>{
  const u=check(await service.auth.admin.createUser({email:marker.toLowerCase()+'@example.invalid',password:randomUUID()+randomUUID(),email_confirm:true})).user;actors.push(u.id);
  // Signed token uses the actual local Auth key; no production or forged metadata authority.
  const token=(role,sub)=>{const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const text=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,sub,iss:'supabase',aud:'authenticated',exp:Math.floor(Date.now()/1000)+600});return text+'.'+createHmac('sha256',c.JWT_SECRET).update(text).digest('base64url');};
  for(const client of [anon,createClient(c.API_URL,c.ANON_KEY,{...options,global:{headers:{Authorization:'Bearer '+token('authenticated',u.id)}}}),createClient(c.API_URL,c.SERVICE_ROLE_KEY,{...options,global:{headers:{Authorization:'Bearer '+token('service_role',u.id)}}})]) {
   denied(await client.rpc('submit_website_lead',{p_submission:submission()}),'42501');denied(await client.rpc('claim_website_lead_notification',{p_job_id:randomUUID()}),'42501');denied(await client.rpc('finish_website_lead_notification',{p_job_id:randomUUID(),p_attempt_id:randomUUID(),p_outcome:'accepted'}),'42501');
  }
 });
 await run('residential request commits the party, location, lead, note, audit and durable notice intent together',async()=>{
  const s=submission({hazardPresent:true}),r=check(await submit(s)),j=await job(r.job_id);assert.equal(r.created,true);assert.equal(r.duplicate_mode,null);assert.equal(j.priority,'urgent');assert.equal(j.notification_outcome,'pending');assert.equal(j.notification_attempt_id,null);assert.match(j.website_submission_payload_hash,/^[a-f0-9]{64}$/);assert.equal(j.organization_id,null);
  const customer=check(await service.from('customers').select('*').eq('id',j.customer_id).single());assert.equal(customer.email,s.email);assert.equal(customer.primary_contact_name,s.name);
  const location=check(await service.from('service_locations').select('*').eq('id',j.service_location_id).single());assert.equal(location.customer_id,j.customer_id);assert.equal(location.street,s.addressParts.street);
  const notes=check(await service.from('notes').select('*').eq('job_id',j.id));assert.equal(notes.length,1);assert.match(notes[0].body,/Project details:/);assert.equal(notes[0].visibility,'internal');
  const events=check(await service.from('activity_log').select('*').eq('subject_id',j.id).eq('event_type','website_lead_received'));assert.equal(events.length,1);assert.equal(events[0].metadata_json.updates_opt_in,true);assert.equal(events[0].metadata_json.submission_id,s.submissionId);
 });
 await run('commercial request keeps organization, contact roles and onsite/property links coherent',async()=>{
  const s=submission({customerType:'commercial',customerTypeLabel:'Commercial / Property Management',commercialName:'Company '+marker}),r=check(await submit(s)),j=await job(r.job_id);assert.equal(j.customer_id,null);assert.ok(j.organization_id);assert.equal(j.property_manager_contact_id,j.onsite_contact_id);
  const contact=check(await service.from('organization_contacts').select('*').eq('id',j.onsite_contact_id).single());assert.equal(contact.organization_id,j.organization_id);assert.equal(contact.preferred_contact_method,'text');assert.deepEqual(contact.contact_roles,['website_lead']);assert.equal(contact.receives_invoices,false);assert.equal(contact.receives_job_updates,true);
  const loc=check(await service.from('service_locations').select('*').eq('id',j.service_location_id).single());assert.equal(loc.organization_id,j.organization_id);assert.equal(loc.customer_id,null);
 });
 await run('commercial request without a company preserves the existing individual-customer path and unconfirmed address',async()=>{
  const s=submission({customerType:'commercial',customerTypeLabel:'Commercial / Property Management',addressParts:{street:marker,city:'Needs confirmation',state:'VA',postalCode:null,needsConfirmation:true}}),r=check(await submit(s)),j=await job(r.job_id);assert.ok(j.customer_id);assert.equal(j.organization_id,null);const loc=check(await service.from('service_locations').select('*').eq('id',j.service_location_id).single());assert.match(loc.service_notes,/Confirm/);assert.match(j.internal_notes,/Address needs office confirmation/);
 });
 await run('concurrent exact retries create one context and a lost response can be replayed without changing history',async()=>{
  const s=submission(),before=JSON.parse(await counts()),all=(await Promise.all(Array.from({length:6},()=>submit(s)))).map(check);assert.equal(all.filter(r=>r.created).length,1);assert.equal(new Set(all.map(r=>r.job_id)).size,1);const j=await job(all[0].job_id),after=JSON.parse(await counts());for(const table of ['customers','service_locations','jobs','notes'])assert.equal(after[table]-before[table],1);
  const replay=check(await submit({...s,submittedAt:new Date(Date.now()+1000).toISOString()}));assert.equal(replay.duplicate_mode,'replayed');assert.deepEqual(await job(j.id),j);assert.deepEqual(JSON.parse(await counts()),after);
  denied(await submit({...s,projectDetails:'Different scope '+marker}),'23505');assert.deepEqual(await job(j.id),j);
 });
 await run('distinct simultaneous matching requests are flagged without merging shared household email or losing a request',async()=>{
  const a=submission(),b=submission({requestFingerprint:a.requestFingerprint}),r=(await Promise.all([submit(a),submit(b)])).map(check);assert.equal(r.filter(x=>x.duplicate_mode==='likely_duplicate').length,1);const jobs=await Promise.all(r.map(x=>job(x.job_id)));assert.notEqual(jobs[0].customer_id,jobs[1].customer_id);const duplicate=jobs.find(j=>j.duplicate_of_job_id),original=jobs.find(j=>!j.duplicate_of_job_id);assert.equal(duplicate.duplicate_of_job_id,original.id);assert.match(duplicate.internal_notes,/Likely duplicate/);
 });
 await run('legacy and archived linked-lead replays never recreate context, reactivate leads or change work',async()=>{
  const s=submission(),r=check(await submit(s));check(await service.from('jobs').update({website_submission_payload_hash:null,lead_disposition:'archived'}).eq('id',r.job_id));const before=await job(r.job_id);assert.equal(check(await submit({...s,projectDetails:'Legacy original body is unavailable'})).created,false);assert.deepEqual(await job(r.job_id),before);assert.equal(check(await claim(r.job_id)),null);
 });
 await run('invalid payloads fail before any party/location is persisted',async()=>{
  const before=await counts();for(const bad of [null,{},submission({phone:'bad'}),submission({submissionId:''}),submission({requestFingerprint:'bad'}),submission({hazardPresent:'true'}),submission({addressParts:{street:'',city:'',state:'VA',needsConfirmation:false}})])denied(await submit(bad),'22023');assert.equal(await counts(),before);
 });
 for(const table of ['customers','organizations','organization_contacts','service_locations','jobs','notes','activity_log']) await run(`failure at ${table} rolls back every preceding creation boundary`,async()=>{
  const suffix=randomUUID().replaceAll('-',''),fn='qa_pr13_'+suffix,tr='qa_pr13_'+suffix,s=submission({commercialName:table==='customers'?null:marker+' failure '+suffix,customerType:table==='customers'?'residential':'commercial',customerTypeLabel:table==='customers'?'Homeowner':'Commercial / Property Management'}),before=await counts();
  // Scoped to this suite's marker, removed in finally. No production DB access.
  await sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if to_jsonb(new)::text like '%${marker}%' then raise exception 'PR13 injected local failure'; end if; return new; end $$; create trigger ${tr} before insert on public.${table} for each row execute function public.${fn}();`);
  try{denied(await submit(s));assert.equal(await counts(),before);}finally{await sql(`drop trigger ${tr} on public.${table};drop function public.${fn}();`);}
  assert.equal(check(await submit(s)).created,true);
 });
 await run('a rolled-back transaction leaves no partial context and the submission remains retryable',async()=>{
  const s=submission(),before=await counts(),escaped=JSON.stringify(s).replaceAll("'","''");await sql(`begin;set local role service_role;select public.submit_website_lead('${escaped}'::jsonb);rollback;`);assert.equal(await counts(),before);assert.equal(check(await submit(s)).created,true);
 });
 await run('a real connection crash releases the submission lock and a waiting retry commits exactly once',async()=>{
  const s=submission(),before=JSON.parse(await counts()),escaped=JSON.stringify(s).replaceAll("'","''");
  const p=spawn(process.env.PR13_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let stderr='',pid;
  p.stderr.on('data',b=>stderr+=b);const done=new Promise(resolve=>p.on('exit',code=>resolve(code)));
  const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR13_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(Error('Crash fixture exited before lock: '+stderr)));});
  p.stdin.write(`begin;set local role service_role;select public.submit_website_lead('${escaped}'::jsonb);select 'PR13_LOCKED:'||pg_backend_pid();\n`);await ready;
  const pending=submit(s).then(r=>r);let blocked=false;
  try {for(let i=0;i<40;i++){if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))){blocked=true;break;}await new Promise(r=>setTimeout(r,25));}assert.equal(blocked,true);}
  finally{await sql(`select pg_terminate_backend(${pid})`);p.stdin.end();await done;}
  const r=check(await pending);assert.equal(r.created,true);const after=JSON.parse(await counts());for(const table of ['customers','service_locations','jobs','notes'])assert.equal(after[table]-before[table],1);assert.equal(check(await submit(s)).created,false);
 });
 await run('ordinary authenticated writes cannot forge the new server-managed intake or notice state',async()=>{
  const r=check(await submit(submission()));
  await sql(`begin;set local role authenticated;update public.jobs set notification_outcome='accepted',notification_attempt_id=gen_random_uuid(),notification_started_at=now() where id='${r.job_id}';rollback;`);assert.equal((await job(r.job_id)).notification_outcome,'pending');
  // Check the trigger directly with a real authenticated uid under a privileged
  // SQL session as well; row-level filtering alone cannot be the only guard.
  await assert.rejects(sql(`begin;select set_config('request.jwt.claim.sub','${actors[0]}',true);update public.jobs set website_submission_payload_hash=repeat('a',64) where id='${r.job_id}';rollback;`),/server-managed/);
 });
 await run('notice intent has exactly one concurrent claim and no implicit reclaim/replay send',async()=>{
  const s=submission(),r=check(await submit(s)),claims=(await Promise.all(Array.from({length:5},()=>claim(r.job_id)))).map(check),a=claims.find(Boolean);assert.equal(claims.filter(Boolean).length,1);assert.equal((await job(r.job_id)).notification_outcome,'sending');assert.equal(check(await claim(r.job_id)),null);check(await submit(s));assert.equal(check(await claim(r.job_id)),null);assert.equal(check(await finish(r.job_id,randomUUID(),'accepted')),false);assert.equal(check(await finish(r.job_id,a,'unknown')),true);assert.equal(check(await finish(r.job_id,a,'unknown')),true);assert.equal(check(await finish(r.job_id,a,'accepted')),false);assert.equal((await job(r.job_id)).notification_status,'failed');
 });
 await run('accepted/rejected/unattempted outcomes preserve existing statuses and cannot be sent again',async()=>{
  for(const [outcome,status] of [['accepted','sent'],['rejected','failed'],['not_attempted','skipped']]){const r=check(await submit(submission())),a=check(await claim(r.job_id));assert.equal(check(await finish(r.job_id,a,outcome)),true);const j=await job(r.job_id);assert.equal(j.notification_outcome,outcome);assert.equal(j.notification_status,status);assert.equal(check(await claim(r.job_id)),null);assert.equal(check(await finish(r.job_id,a,outcome)),true);}
 });
 await run('claim and completion history failures roll back their state changes, preserving safe review after lost acknowledgement',async()=>{
  const r=check(await submit(submission())),suffix=randomUUID().replaceAll('-',''),fn='qa_pr13_'+suffix;
  async function fault(event,action){await sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.subject_id='${r.job_id}' and new.event_type='${event}' then raise exception 'PR13 notice history failure';end if;return new;end $$;create trigger ${fn} before insert on public.activity_log for each row execute function public.${fn}();`);try{await action();}finally{await sql(`drop trigger ${fn} on public.activity_log;drop function public.${fn}();`);}}
  await fault('website_lead_notification_started',async()=>{denied(await claim(r.job_id));assert.equal((await job(r.job_id)).notification_outcome,'pending');assert.equal((await job(r.job_id)).notification_attempt_id,null);});
  const a=check(await claim(r.job_id));await fault('website_lead_notification_sent',async()=>{denied(await finish(r.job_id,a,'accepted'));assert.equal((await job(r.job_id)).notification_outcome,'sending');assert.equal(check(await claim(r.job_id)),null);});assert.equal(check(await finish(r.job_id,a,'accepted')),true);
 });
 await run('actual route, intake and notice adapters commit once with a stubbed provider and retain uncertain delivery for office review',async()=>{
  const intake=load('../src/lib/leads/intake.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'node:crypto':crypto,'@/lib/supabase/admin':{getServiceRoleClient:()=>service}});let sends=0;
  const notices=load('../src/lib/leads/notifications.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'@/lib/email/delivery':load('../src/lib/email/delivery.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'node:crypto':crypto,'@/lib/email/delivery-context':{emailDeliveryContext}}),'@/lib/email/config':{getInternalLeadNotificationEmails:()=>['office@example.invalid'],getEmailSetupState:()=>({configured:true,from:'office@example.invalid',replyTo:'office@example.invalid'})},'@/lib/email/send':{sendEmailTransport:async args=>{assert.match(args.to,/@example\.invalid$/);sends++;return{outcome:'unknown',ok:false,historyRecorded:true,providerMessageId:null,retryable:false};}},'@/lib/email/templates':{leadInternalNoticeTemplate:()=>({subject:'Local safety review',text:'Disposable local fixture',html:'Disposable local fixture'})},'@/lib/leads/intake':intake,'@/lib/supabase/admin':{getServiceRoleClient:()=>service}});
  const route=load('../src/app/api/leads/route.ts',{'next/server':{NextResponse:class extends Response{static json(body,init){return Response.json(body,init);}}},'@/lib/leads/config':{PUBLIC_LEAD_SUCCESS_MESSAGE:'Thank you — your request was received. We’ll contact you shortly.',getAllowedLeadIntakeOrigins:()=>['http://127.0.0.1:8000']},'@/lib/leads/intake':intake,'@/lib/leads/notifications':notices,'@/lib/security/monitoring-secret':{bearerToken:()=>null,isAuthenticatedMonitoringCanary:()=>false},'@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>({available:true,allowed:true}),hashRateLimitKey:()=> 'local-test',trustedClientIp:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>service}});
  const id=marker+'_route',form=new URLSearchParams({name:'Local safety review',phone:'5405550123',email:'review@example.invalid',address:'123 Local Review Street, Fredericksburg, VA 22401',message:'Disposable website request for local review. No real customer was contacted.',service:'Tree Care',submission_id:id});
  const request=()=>new Request('http://127.0.0.1:3102/api/leads',{method:'POST',headers:{origin:'http://127.0.0.1:8000'},body:form});
  const created=await route.POST(request());assert.equal(created.status,201);assert.deepEqual(Object.keys(await created.json()).sort(),['message','ok']);const replay=await route.POST(request());assert.equal(replay.status,200);assert.equal(sends,1);
  const j=check(await service.from('jobs').select('*').eq('website_submission_id',id).single());assert.equal(j.notification_outcome,'unknown');assert.equal(j.notification_status,'failed');reviewJobId=j.id;
 });

});
