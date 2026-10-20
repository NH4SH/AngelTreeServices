import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {writeFileSync} from 'node:fs';
import {load} from './pr10-test-helpers.mjs';import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';import * as crypto from 'node:crypto';
const enabled=process.env.ATOMIC_ACTIVITY_DISPOSABLE==='1',exec=promisify(execFile),proof=[];
test('atomic activity preparation and PR14 recovery on a fresh local PostgreSQL replay',{skip:!enabled,timeout:180000},async t=>{
 const database=process.env.ATOMIC_ACTIVITY_DATABASE;assert.match(database??'',/^ats_activity_fresh_[a-f0-9]{32}$/);assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');const docker=process.env.ATOMIC_ACTIVITY_DOCKER_BIN;assert.ok(docker);
 const lit=v=>v===null||v===undefined?'null':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
 async function sql(query){try{const r=await exec(docker,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:8*1024*1024,timeout:60000});return r.stdout.trim();}catch(e){throw Error(String(e.stderr??e.message));}}
 const json=async query=>JSON.parse((await sql(query))||'null');
 const rpc=async(name,args={},role='service_role',uid=null)=>{
  assert.match(name,/^[a-z_]+$/);const named=Object.entries(args).map(([k,v])=>{assert.match(k,/^p_[a-z_]+$/);return k+'=>'+lit(v);}).join(',');
  try{return{data:await json(`set role ${role};set request.jwt.claims=${lit({role,sub:uid})};select public.${name}(${named})`),error:null};}catch(e){return{data:null,error:{message:e.message}};}
 };
 const ok=r=>{assert.ifError(r.error&&Error(r.error.message));return r.data;},deny=r=>assert.ok(r.error,'Command must refuse this operation');
 const envelope={from:'Office <office@example.invalid>',reply_to:'office@example.invalid'};
 function event(overrides={}){return{category:'quotes',changes:{},metadata:{},destination_path:'/admin',event_type:'atomic_local_notice',idempotency_key:'atomic-local/'+randomUUID(),organization_id:null,record_label:'Synthetic <record>',summary:'Synthetic & local only',body:'Synthetic notice',title:'Synthetic local activity',subject_id:randomUUID(),subject_type:'quote',customer_id:null,invoice_id:null,change_order_id:null,payment_id:null,quote_id:null,...overrides};}
 const prepare=(e,extra={})=>rpc('prepare_customer_activity',{p_event:e,p_envelope:envelope,p_destination:'http://127.0.0.1:3102/admin',...extra});
 const get=id=>rpc('get_outbound_delivery',{p_delivery_id:id}).then(ok);
 const claim=id=>rpc('claim_outbound_delivery',{p_delivery_id:id}).then(ok);
 const finish=(id,attempt,outcome='accepted')=>rpc('finish_outbound_delivery',{p_delivery_id:id,p_attempt_id:attempt,p_outcome:outcome,p_provider_message_id:outcome==='accepted'?'local-'+id:null}).then(ok);
 const run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,pass:true});});
 async function seed(n=2){const tag='atomic-local-'+randomUUID();await sql(`update public.profiles set status='disabled' where id in (select id from auth.users where email like 'atomic-local-%@example.invalid');insert into public.roles(name) values('owner'),('admin'),('crew') on conflict(name) do nothing;insert into auth.users(id,email,raw_user_meta_data) select md5(${lit(tag)}||i)::uuid,${lit(tag)}||'-'||i||'@example.invalid','{}'::jsonb from generate_series(1,${n}) i;update public.profiles set status='active',full_name='Synthetic <office>' where email like ${lit(tag+'-%@example.invalid')};insert into public.user_roles(user_id,role_id) select p.id,r.id from public.profiles p cross join public.roles r where p.email like ${lit(tag+'-%@example.invalid')} and r.name in ('owner','admin');`);return json(`select jsonb_agg(jsonb_build_object('id',id,'email',email) order by email) from public.profiles where email like ${lit(tag+'-%@example.invalid')}`);}
 t.after(async()=>{await sql("update public.profiles set status='disabled' where id in (select id from auth.users where email like 'atomic-local-%@example.invalid')");});
 const notices=aid=>json(`select jsonb_agg(to_jsonb(n) order by recipient_user_id) from public.admin_notifications n where activity_id=${lit(aid)}`);
 await run('all activity, notice and saved-email writes roll back on a late preparation failure',async()=>{
  const users=await seed(),e=event();await sql(`create function app_private.atomic_local_failure() returns trigger language plpgsql as $$begin if new.context->>'email_type'='admin_customer_activity' and new.payload#>>'{to,0}'=${lit(users[1].email)} then raise exception 'Injected last recipient failure';end if;return new;end$$;create trigger atomic_local_failure before insert on app_private.outbound_deliveries for each row execute function app_private.atomic_local_failure();`);
  try{deny(await prepare(e));assert.equal(await sql(`select count(*) from activity_log where idempotency_key=${lit(e.idempotency_key)}`),'0');assert.equal(await sql(`select count(*) from app_private.customer_activity_preparations where request_key=${lit(e.idempotency_key)}`),'0');}finally{await sql('drop trigger atomic_local_failure on app_private.outbound_deliveries;drop function app_private.atomic_local_failure()');}
 });
 await run('concurrent same-event calls create one complete frozen audience and reject payload collisions',async()=>{
  await seed();const e=event(),[a,b]=await Promise.all([prepare(e),prepare(e)]),x=ok(a),y=ok(b);assert.equal(x.activity_id,y.activity_id);assert.notEqual(x.created,y.created);assert.equal(x.notification_count,2);assert.deepEqual([...x.delivery_ids].sort(),[...y.delivery_ids].sort());assert.equal((await notices(x.activity_id)).length,2);
  deny(await prepare({...e,summary:'Changed request'}));const first=await get(x.delivery_ids[0]);const replay=ok(await prepare(e,{p_envelope:{from:'changed@example.invalid',reply_to:'changed@example.invalid'},p_destination:'https://changed.example.invalid/admin'}));assert.deepEqual(replay.delivery_ids.slice().sort(),x.delivery_ids.slice().sort());assert.deepEqual((await get(x.delivery_ids[0])).payload,first.payload);assert.match(first.payload.html,/&lt;office&gt;/);assert.match(first.payload.html,/Synthetic &amp; local/);assert.equal(first.provider_key,'admin-activity:'+first.context.notification_id);
 });
 await run('preparation waits on the same request lock and commits no partial event during contention',async()=>{
  await seed(1);const e=event();let locked=false;
  const held=sql(`begin;select pg_advisory_xact_lock(145,hashtext(${lit(e.idempotency_key)}));select pg_sleep(1.5);commit;`);
  for(let i=0;i<20;i++){locked=Number(await sql(`select count(*) from pg_locks where locktype='advisory' and classid=145 and granted`))>0;if(locked)break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(locked);const pending=prepare(e);let waiting=false;
  for(let i=0;i<20;i++){waiting=Number(await sql(`select count(*) from pg_stat_activity where wait_event_type='Lock' and query like ${lit('%'+e.idempotency_key+'%')}`))>0;if(waiting)break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(waiting,'Actual PostgreSQL request lock wait observed');assert.equal(await sql(`select count(*) from activity_log where idempotency_key=${lit(e.idempotency_key)}`),'0');await held;assert.equal(ok(await pending).notification_count,1);
 });
 await run('complete audience exceeds the API cap and skips disabled, separated, crew and opted-out email correctly',async()=>{
  const users=await seed(1020);await sql(`update public.profiles set status='disabled' where id=${lit(users[0].id)};insert into employee_records(auth_user_id,is_active,employment_status) values(${lit(users[1].id)},true,'active');update employee_records set is_active=false,employment_status='separated' where auth_user_id=${lit(users[1].id)};delete from user_roles where user_id=${lit(users[2].id)};insert into user_roles(user_id,role_id) select ${lit(users[2].id)},id from roles where name='crew';insert into admin_notification_preferences(user_id,quote_email_enabled) values(${lit(users[1019].id)},false);`);
  const r=ok(await prepare(event()));assert.equal(r.notification_count,1017);assert.equal(r.delivery_ids.length,1016);const ns=await notices(r.activity_id);assert.equal(ns.filter(n=>n.email_status==='skipped').length,1);assert.ok(ns.some(n=>n.recipient_user_id===users[1019].id));assert.equal(new Set(ns.map(n=>n.recipient_user_id)).size,1017);
 });
 await run('no eligible audience and other-category notifications commit without email requests',async()=>{
  await seed(1);const r=ok(await prepare(event({category:'other'})));assert.equal(r.notification_count,1);assert.deepEqual(r.delivery_ids,[]);assert.equal((await notices(r.activity_id))[0].email_status,'skipped');await sql("update profiles set status='disabled' where id in (select id from auth.users where email like 'atomic-local-%@example.invalid')");const none=ok(await prepare(event()));assert.equal(none.notification_count,0);assert.deepEqual(none.delivery_ids,[]);
 });
 await run('lost preparation acknowledgement is safely recoverable and dispatch claims serialize all replayed sends',async()=>{
  await seed(1);const e=event();await prepare(e); // discard the first acknowledgement
  const r=ok(await prepare(e)),id=r.delivery_ids[0],sends=[];
  const db={rpc:(name,args)=>rpc(name,args)};
  const delivery=load('../src/lib/email/delivery.ts',{'server-only':{},'node:crypto':crypto,'@/lib/email/delivery-commands':{callDeliveryCommand},'@/lib/email/delivery-context':{emailDeliveryContext}});
  const transport=async input=>{sends.push(input);assert.match(input.to,/@example.invalid$/);return{ok:true,outcome:'accepted',configured:true,historyRecorded:false,providerMessageId:'local-'+id,retryable:false,message:'Simulated acceptance'};};
  await Promise.all([delivery.dispatchSavedEmail(id,db,transport),delivery.dispatchSavedEmail(id,db,transport)]);await delivery.dispatchSavedEmail(id,db,transport);assert.equal(sends.length,1);assert.equal((await get(id)).history_recorded,true);assert.equal((await notices(r.activity_id))[0].email_status,'sent');
 });
 await run('current offboarding, opt-out, email changes and suppression stop a prepared send without changing the frozen recipient',async()=>{
  for(const mode of ['disabled','separated','role_removed','optout','email_changed','suppressed']){
   const [user]=await seed(1),r=ok(await prepare(event())),id=r.delivery_ids[0];
   const changes={disabled:`update profiles set status='disabled' where id=${lit(user.id)}`,separated:`insert into employee_records(auth_user_id,is_active,employment_status) values(${lit(user.id)},true,'active');update employee_records set is_active=false,employment_status='separated' where auth_user_id=${lit(user.id)}`,role_removed:`delete from user_roles where user_id=${lit(user.id)}`,optout:`insert into admin_notification_preferences(user_id,quote_email_enabled) values(${lit(user.id)},false)`,email_changed:`update profiles set email='changed@example.invalid' where id=${lit(user.id)}`,suppressed:`insert into app_private.email_suppressions(recipient,reason,provider_message_id) values(${lit(user.email)},'bounced','local-synthetic')`};
   await sql(changes[mode]);assert.equal(await claim(id),null,mode);assert.equal((await get(id)).state,'cancelled');assert.equal((await get(id)).payload.to[0],user.email);assert.equal((await notices(r.activity_id))[0].email_status,'skipped');
  }
 });
 await run('provider uncertainty never auto-retries; supervised retry reuses the exact request and key',async()=>{
  const [owner]=await seed(1),e=event(),r=ok(await prepare(e)),id=r.delivery_ids[0],a=await claim(id);await finish(id,a.attempt_id,'unknown');assert.equal((await notices(r.activity_id))[0].email_status,'failed');assert.equal(await claim(id),null);ok(await prepare(e));assert.equal(await claim(id),null);
  const reviewed=ok(await rpc('review_outbound_delivery',{p_delivery_id:id,p_action:'retry',p_reason:'Synthetic local review only',p_request_id:randomUUID()},'authenticated',owner.id));assert.equal(reviewed.id,id);const b=await claim(id);assert.equal(b.idempotency_key,a.idempotency_key);assert.deepEqual(b.payload,a.payload);await finish(id,b.attempt_id);assert.equal((await notices(r.activity_id))[0].email_status,'sent');assert.equal((await get(id)).attempt_count,2);
 });
 await run('a provider webhook recovers an interrupted finish and never dispatches a second message',async()=>{
  await seed(1);const r=ok(await prepare(event())),id=r.delivery_ids[0];await claim(id);const d=await get(id);
  const args={p_event_id:'msg_local_'+randomUUID(),p_hash:'a'.repeat(64),p_message_id:'local-'+id,p_type:'email.delivered',p_occurred_at:new Date().toISOString(),p_delivery_id:id,p_recipients:d.payload.to};
  ok(await rpc('record_outbound_provider_event',args));ok(await rpc('record_outbound_provider_event',args));assert.equal((await notices(r.activity_id))[0].email_status,'sent');const saved=await get(id);assert.equal(saved.state,'accepted');assert.equal(saved.delivery_status,'delivered');assert.equal(saved.history_recorded,true);assert.equal(await claim(id),null);
 });
 await run('accepted receipt survives a failed history write and supervised repair sends nothing',async()=>{
  const [owner]=await seed(1),r=ok(await prepare(event())),id=r.delivery_ids[0],a=await claim(id);
  await sql(`alter table public.email_events add constraint atomic_local_history_failure check(outbound_delivery_id is distinct from ${lit(id)}::uuid) not valid`);
  try{await finish(id,a.attempt_id);assert.equal((await get(id)).state,'accepted');assert.equal((await get(id)).repair_state,'needs_review');assert.equal((await notices(r.activity_id))[0].email_status,'sent');}finally{await sql('alter table public.email_events drop constraint atomic_local_history_failure');}
  const review=ok(await rpc('review_outbound_delivery',{p_delivery_id:id,p_action:'reconcile',p_reason:'Synthetic history repair only',p_request_id:randomUUID()},'authenticated',owner.id));assert.equal(review.repaired,true);assert.equal((await get(id)).history_recorded,true);assert.equal((await get(id)).attempt_count,1);assert.equal(await claim(id),null);
 });
 await run('later opt-in and directory additions cannot expand an already prepared audience',async()=>{
  const [owner]=await seed(1);await sql(`insert into admin_notification_preferences(user_id,quote_email_enabled) values(${lit(owner.id)},false)`);const e=event(),r=ok(await prepare(e));assert.equal(r.notification_count,1);assert.equal(r.delivery_ids.length,0);
  await sql(`update admin_notification_preferences set quote_email_enabled=true where user_id=${lit(owner.id)}`);await seed(2);const replay=ok(await prepare(e));assert.equal(replay.activity_id,r.activity_id);assert.equal(replay.notification_count,1);assert.deepEqual(replay.delivery_ids,[]);
 });
 await run('expired uncertainty cannot authorize a new key or a late same-key retry',async()=>{
  const [owner]=await seed(1),r=ok(await prepare(event())),id=r.delivery_ids[0],a=await claim(id);await finish(id,a.attempt_id,'unknown');await sql(`update app_private.outbound_deliveries set first_dispatched_at=clock_timestamp()-interval '24 hours' where id=${lit(id)}`);
  for(const action of ['retry','new_copy'])deny(await rpc('review_outbound_delivery',{p_delivery_id:id,p_action:action,p_reason:'Synthetic expired window review',p_request_id:randomUUID()},'authenticated',owner.id));assert.equal(await claim(id),null);assert.equal((await get(id)).attempt_count,1);
 });
 await run('malformed paths, identities and body shapes reject without writing a preparation',async()=>{
  await seed(1);for(const change of [{destination_path:null},{destination_path:'/portal'},{subject_id:null},{subject_id:'invalid'},{changes:[]},{metadata:null}])deny(await prepare(event(change)));
 });
 await run('legacy activity holds without a new audience, intent, or automatic backfill',async()=>{
  await seed(1);const e=event();await sql(`insert into activity_log(subject_id,subject_type,event_type,idempotency_key) values(${lit(e.subject_id)},'quote',${lit(e.event_type)},${lit(e.idempotency_key)})`);const r=ok(await prepare(e));assert.equal(r.legacy_hold,true);assert.deepEqual(r.delivery_ids,[]);assert.equal(await sql(`select count(*) from admin_notifications where activity_id=${lit(r.activity_id)}`),'0');
 });
 await run('new private tables and service preparation are inaccessible to anonymous, staff, and service table reads',async()=>{
  const [owner]=await seed(1),e=event();deny(await rpc('prepare_customer_activity',{p_event:e,p_envelope:envelope},'anon'));deny(await rpc('prepare_customer_activity',{p_event:e,p_envelope:envelope},'authenticated',owner.id));deny(await rpc('prepare_customer_activity',{p_event:e,p_envelope:envelope},'service_role',owner.id));
  for(const role of ['anon','authenticated','service_role'])for(const table of ['customer_activity_preparations','customer_activity_deliveries'])await assert.rejects(sql(`set role ${role};select * from app_private.${table}`));
  const r=ok(await prepare(e)),ns=await notices(r.activity_id);const view=await json(`set role authenticated;set request.jwt.claims=${lit({role:'authenticated',sub:owner.id})};select jsonb_agg(id) from admin_notifications where activity_id=${lit(r.activity_id)}`);assert.deepEqual(view,[ns[0].id]);
  const review=ok(await rpc('list_outbound_deliveries',{p_id:r.delivery_ids[0]},'authenticated',owner.id));assert.equal(review.deliveries[0].kind,'admin_activity');assert.equal('payload' in review.deliveries[0],false);
 });
 if(process.env.ATOMIC_ACTIVITY_RESULTS_FILE)writeFileSync(process.env.ATOMIC_ACTIVITY_RESULTS_FILE,JSON.stringify({database,proof,providerCalls:0,hostedWrites:0,sourceRowsCopied:false},null,2)+'\n',{mode:0o600});
});
