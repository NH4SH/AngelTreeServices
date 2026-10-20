import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createClient} from '@supabase/supabase-js';
import {load} from './pr10-test-helpers.mjs';import {mapBounded} from '../src/lib/runtime/deadline.ts';
const enabled=process.env.ALERT_RECIPIENTS_DISPOSABLE==='1'&&Boolean(process.env.ALERT_RECIPIENTS_LOCAL_STATUS_FILE);
test('customer activity recipient reads and notification acknowledgement on the real local stack',{skip:!enabled,timeout:120000},async t=>{
 const c=JSON.parse(readFileSync(process.env.ALERT_RECIPIENTS_LOCAL_STATUS_FILE));assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');assert.ok(process.env.ALERT_RECIPIENTS_DOCKER_BIN);
 const requests=[],proof=[],marker='ALERT_READS_LOCAL_'+randomUUID();let actor,injectNoticeReadFailure=false;const sends=[];
 const localFetch=async(input,init)=>{const u=new URL(input instanceof Request?input.url:input);assert.equal(u.origin,c.API_URL,'Nonlocal transport refused');
  if(injectNoticeReadFailure&&u.pathname==='/rest/v1/admin_notifications'&&(init?.method??'GET')==='GET')return new Response(JSON.stringify({message:'SECRET diagnostic',code:'XX000'}),{status:503,headers:{'content-type':'application/json'}});
  const response=await fetch(input,init);let rows;try{const data=await response.clone().json();if(Array.isArray(data))rows=data.length;}catch{}requests.push({table:u.pathname.split('/').at(-1),urlLength:u.href.length,status:response.status,rows});return response;
 };
 const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}};
 const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),auth=createClient(c.API_URL,c.ANON_KEY,opts),anon=createClient(c.API_URL,c.ANON_KEY,opts);
 const ok=r=>{assert.ifError(r.error&&Error(r.error.code+': '+r.error.message));return r.data;};
 const sql=q=>execFileSync(process.env.ALERT_RECIPIENTS_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:q,encoding:'utf8',env:process.env,maxBuffer:2*1024*1024}).trim();
 const reads=load('../src/lib/notifications/recipient-reads.ts',{'server-only':{}});
 const run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,pass:true});});
 let liveCounts;
 t.after(async()=>{injectNoticeReadFailure=false;if(actor){ok(await auth.auth.signOut({scope:'global'}));ok(await db.from('profiles').update({status:'disabled'}).eq('id',actor.id));ok(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',actor.id));}
  if(process.env.ALERT_RECIPIENTS_RESULTS_FILE)writeFileSync(process.env.ALERT_RECIPIENTS_RESULTS_FILE,JSON.stringify({marker,proof,liveCounts,requests,syntheticActorsRetired:actor?1:0,providerCalls:0,simulatedSends:sends.length},null,2)+'\n',{mode:0o600});
 });
 await run('real retained directory returns the complete independent owner/admin set with bounded successful requests',async()=>{
  const expected=JSON.parse(sql("select coalesce(jsonb_agg(p.id order by p.id),'[]') from public.profiles p where p.status='active' and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p.id and r.name in ('owner','admin'))"));
  const rows=await reads.readCustomerActivityRecipients(db);assert.deepEqual(rows.map(r=>r.id).sort(),expected);
  await reads.readCustomerActivityPreferences(db,rows.map(r=>r.id));
  const lookupRequests=requests.filter(r=>['user_roles','profiles','admin_notification_preferences'].includes(r.table));assert.ok(lookupRequests.every(r=>r.status===200&&r.urlLength<5000));
  liveCounts={recipients:rows.length,matchingMemberships:Number(sql("select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id where r.name in ('owner','admin')")),maxLookupUrlLength:Math.max(...lookupRequests.map(r=>r.urlLength)),lookupRequests:lookupRequests.length};
 });
 const password=randomUUID()+randomUUID();actor=ok(await db.auth.admin.createUser({email:marker.toLowerCase()+'@example.invalid',password,email_confirm:true})).user;
 ok(await db.from('profiles').update({status:'active'}).eq('id',actor.id));ok(await db.from('employee_records').insert({auth_user_id:actor.id,legal_name:marker,is_active:true,employment_status:'active'}));
 const role=ok(await db.from('roles').select('id').eq('name','owner').single());ok(await db.from('user_roles').insert({user_id:actor.id,role_id:role.id}));ok(await auth.auth.signInWithPassword({email:actor.email,password}));
 // Scope the real membership query to this synthetic actor so no test notice
 // enters an original user's inbox. Every other read/write is the actual API.
 const scoped={from(table){const q=db.from(table);if(table==='user_roles'){const select=q.select.bind(q);q.select=(...args)=>select(...args).eq('user_id',actor.id);}return q;}};
 async function event(){
  const activityId=randomUUID();ok(await db.from('activity_log').insert({id:activityId,actor_type:'portal',subject_type:'quote',subject_id:randomUUID(),event_type:'local_notification_read_probe',idempotency_key:marker+'-'+activityId,summary:'Synthetic local read verification'}));
  const emitter=load('../src/lib/notifications/customer-activity.ts',{'server-only':{},'@/lib/notifications/recipient-reads':reads,'@/lib/activity-log':{recordActivity:async()=>({created:true,id:activityId})},'@/lib/runtime/deadline':{mapBounded},'@/lib/email/send':{sendTransactionalEmail:async input=>{assert.equal(input.to,actor.email);sends.push(input);return{ok:true,outcome:'accepted',historyRecorded:true};}},'@/lib/security/app-base-url':{buildCanonicalAppUrl:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>scoped},'@/lib/notifications/definitions':{emailPreferenceFields:{quotes:'quote_email_enabled'}}});
  const old=console.error,logs=[];console.error=(...x)=>{if(String(x[0]).startsWith('Customer activity'))logs.push(x);else old(...x);};
  try{await emitter.emitCustomerActivity({category:'quotes',eventType:'local_notification_read_probe',idempotencyKey:marker+'-'+activityId,subjectId:activityId,subjectType:'quote',title:marker,summary:'Synthetic only',destinationPath:'/admin'});}finally{console.error=old;}
  return{activityId,logs};
 }
 await run('actual notification insert, complete readback and status update work for an owned synthetic recipient',async()=>{
  const r=await event();assert.deepEqual(r.logs,[]);assert.equal(sends.length,1);const rows=ok(await db.from('admin_notifications').select('*').eq('activity_id',r.activityId));assert.equal(rows.length,1);assert.equal(rows[0].recipient_user_id,actor.id);assert.equal(rows[0].email_status,'sent');assert.equal(sends[0].idempotencyKey,'admin-activity:'+rows[0].id);
  assert.equal(ok(await auth.from('admin_notifications').select('id').eq('activity_id',r.activityId)).length,1);const denied=await anon.from('admin_notifications').select('id').eq('activity_id',r.activityId);assert.ok(denied.error||!denied.data.length);
 });
 await run('actual email preference opt-out retains in-app notice and skips provider dispatch',async()=>{
  ok(await db.from('admin_notification_preferences').insert({user_id:actor.id,quote_email_enabled:false}));const before=sends.length,r=await event();assert.deepEqual(r.logs,[]);assert.equal(sends.length,before);assert.equal(ok(await db.from('admin_notifications').select('email_status').eq('activity_id',r.activityId).single()).email_status,'skipped');
 });
 await run('lost readback after a real insert retains pending notice without authorizing email or leaking diagnostics',async()=>{
  const before=sends.length;injectNoticeReadFailure=true;let r;try{r=await event();}finally{injectNoticeReadFailure=false;}
  assert.equal(r.logs.length,1);assert.ok(!JSON.stringify(r.logs).includes('SECRET'));assert.equal(sends.length,before);assert.equal(ok(await db.from('admin_notifications').select('email_status').eq('activity_id',r.activityId).single()).email_status,'pending');
 });
});
