import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetlifyDB } from '@netlify/database-dev';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createOrderStore } from './store-core.mjs';
import { validateOrder } from './model.mjs';
import { drainControlledEmail, resendTestMailer, controlledPayload, CONTROLLED_RECIPIENT, MailError } from './email-worker.mjs';
import { requireTestRuntime, TEST_SITE_ID, TEST_ACCOUNT_ID, TEST_ORIGIN, postgresAdapter, externalDatabaseOptions } from './hosted/runtime.mjs';
import { storageHandler } from './hosted/service.mjs';
import { remoteOrderStore } from './hosted/remote-store.mjs';
import { testWebhookHandler } from './hosted/webhook.mjs';
import Stripe from 'stripe';
import { stripeAdapter } from './model.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMacbookService, MAC_RUNTIME_ID } from './macbook/service.mjs';
import { request as httpRequest } from 'node:http';

const token = 'a'.repeat(64);
const env = { FIREWOOD_HOSTED_TEST_ENABLED:'1', FIREWOOD_STRIPE_TEST_ACCOUNT_ID:TEST_ACCOUNT_ID, FIREWOOD_STRIPE_TEST_SECRET_KEY:'rk_test_synthetic', FIREWOOD_TEST_STORAGE_TOKEN:token };
const order = validateOrder({ quantity:'two',stacking:true,name:'Synthetic Test',email:'hosted@example.invalid',phone:'2025550142',address:'123 Example Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic only. No delivery.' });
const id = () => randomBytes(24).toString('hex');
const msg = { audience:'customer',to:'unapproved@example.invalid',subject:'[TEST] Firewood',text:'Synthetic confirmation.' };
const from = 'Angel Firewood Test <onboarding@resend.dev>';
test('external database requires a dedicated role, database, exact host and verified TLS',()=>{
  const host='ep-synthetic-pooler.us-east-2.aws.neon.tech';
  const connection=`postgresql://firewood_worker:${'a'.repeat(48)}@${host}/firewood_test?sslmode=require&channel_binding=require`;
  const config={FIREWOOD_TEST_DATABASE_URL:connection,FIREWOOD_TEST_DATABASE_HOST:host};
  const options=externalDatabaseOptions(config);
  assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.enableChannelBinding,true);assert.equal(options.max,2);
  assert.equal(new URL(options.connectionString).search,'');
  for(const value of [connection.replace('firewood_worker','neondb_owner'),connection.replace('/firewood_test','/postgres'),connection.replace('sslmode=require','sslmode=disable'),connection+'&sslrootcert=untrusted',connection.replace(host,'db.ddvlnixdugcbnrewktes.supabase.co')]) assert.throws(()=>externalDatabaseOptions({...config,FIREWOOD_TEST_DATABASE_URL:value}));
  assert.throws(()=>externalDatabaseOptions({...config,FIREWOOD_TEST_DATABASE_HOST:'other.neon.tech'}));
});
async function setup(t) {
  const db = new NetlifyDB({logger:()=>{}}); await db.start();
  await db.applyMigrations(fileURLToPath(new URL('./migrations',import.meta.url)));
  t.after(()=>db.stop());
  const store = createOrderStore(db,{controlledEmail:true});
  async function paid() { const attempt=id(); await store.createAttempt(attempt,id(),order); await store.bindPayment(attempt,{id:`cs_test_${attempt}`,url:null}); await store.confirm(attempt,`cs_test_${attempt}`,'webhook'); return attempt; }
  return { db,store,paid };
}

test('hosted runtime requires the exact site, dedicated sandbox, explicit switch and no CRM',()=>{
  assert.doesNotThrow(()=>requireTestRuntime(env,TEST_SITE_ID));
  for (const [key,value] of [['FIREWOOD_HOSTED_TEST_ENABLED','0'],['FIREWOOD_CRM_TEST_ENABLED','1'],['FIREWOOD_STRIPE_TEST_ACCOUNT_ID','acct_other'],['FIREWOOD_STRIPE_TEST_SECRET_KEY','sk_live_never'],['FIREWOOD_TEST_STORAGE_TOKEN','short']]) assert.throws(()=>requireTestRuntime({...env,[key]:value},TEST_SITE_ID));
  assert.throws(()=>requireTestRuntime(env,'86c48a95-ead4-4b15-8e57-fa827558b2f0'));
});

test('controlled payload routes both audiences only to the owner and excludes customer headers',()=>{
  const payload=controlledPayload(msg,from);
  assert.deepEqual(payload.to,[CONTROLLED_RECIPIENT]); assert.equal(payload.reply_to,CONTROLLED_RECIPIENT); assert.equal(payload.cc,undefined);
  assert.equal(controlledPayload({...msg,reply_to:'unapproved@example.invalid',headers:{'Reply-To':'unapproved@example.invalid'}},from).reply_to,CONTROLLED_RECIPIENT);
  assert.match(payload.subject,/TEST COPY: customer/u); assert.match(payload.text,/do not dispatch/u);
  assert.throws(()=>controlledPayload(msg,'Other <sender@greenprova.com>'));
  assert.throws(()=>controlledPayload({...msg,subject:'Real order'},from));
});

test('dedicated Firewood sender permits only the exact approved subdomain and keeps the owner-only recipient',()=>{
  const sender='Angel Firewood Test <orders@firewood.angeltreeservice.org>';
  const payload=controlledPayload(msg,sender);
  assert.equal(payload.from,sender);assert.deepEqual(payload.to,[CONTROLLED_RECIPIENT]);
  for(const address of ['orders@other.angeltreeservice.org','orders@firewood.angeltreeservice.org.attacker.invalid','orders@firewood.angeltreeservices.org']){
    assert.throws(()=>controlledPayload(msg,`Angel Firewood Test <${address}>`),/sender_unconfirmed/u);
  }
  assert.throws(()=>controlledPayload(msg,'Angel Firewood Test\r\nBcc: other@example.invalid <orders@firewood.angeltreeservice.org>'),/sender_unconfirmed/u);
});

test('Resend adapter has fixed endpoint, recipient and stable idempotency with no redirect',async()=>{
  const calls=[]; const providerId=randomUUID();
  const mailer=resendTestMailer({key:'re_test_only',from,fetcher:async(url,options)=>{calls.push({url,options});return Response.json({id:providerId});}});
  const payload=mailer.payload(msg);
  assert.equal(await mailer.send(payload,'same-message'),providerId); await mailer.send(payload,'same-message');
  assert.equal(calls[0].url,'https://api.resend.com/emails'); assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].options.body).to,[CONTROLLED_RECIPIENT]);
  assert.equal(JSON.parse(calls[0].options.body).reply_to,CONTROLLED_RECIPIENT);
  await assert.rejects(mailer.send({...payload,to:['other@example.com']},'x'),/recipient_blocked/u);
  await assert.rejects(mailer.send({...payload,bcc:['other@example.com']},'x'),/recipient_blocked/u);
  for(const reply_to of ['other@example.invalid',[CONTROLLED_RECIPIENT,'other@example.invalid'],`${CONTROLLED_RECIPIENT}\r\nBcc: other@example.invalid`,undefined]) await assert.rejects(mailer.send({...payload,reply_to},'x'),/recipient_blocked/u);
});

test('legacy frozen payload retries preserve its body and idempotency key after reply routing changes',async()=>{
  const calls=[];const mailer=resendTestMailer({key:'re_test_only',from,fetcher:async(url,options)=>{calls.push(options);return Response.json({id:randomUUID()});}});
  const {reply_to,...legacy}=mailer.payload(msg);assert.equal(reply_to,CONTROLLED_RECIPIENT);
  const frozen=JSON.stringify(legacy);await mailer.send(legacy,'legacy-frozen');await mailer.send(legacy,'legacy-frozen');
  assert.equal(calls[0].body,frozen);assert.equal(calls[1].body,frozen);
  assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
  assert.equal(JSON.parse(calls[0].body).reply_to,undefined);
});

test('provider timeout and 429 retry; rejected credentials and malformed success never count as accepted',async()=>{
  for(const [response,retryable,code] of [[new Response('',{status:429,headers:{'retry-after':'60'}}),true,'email_http_429'],[new Response('',{status:401}),false,'email_http_401'],[Response.json({id:'bad'}),true,'email_response_unconfirmed']]) {
    const mailer=resendTestMailer({key:'re_test_only',from,fetcher:async()=>response});
    await assert.rejects(mailer.send(mailer.payload(msg),'x'),e=>e instanceof MailError && e.retryable===retryable && e.code===code);
  }
});

test('paid record, exactly two messages and email jobs commit together; duplicate webhook is harmless',async t=>{
  const {db,store,paid}=await setup(t); const attempt=await paid();
  await store.confirm(attempt,`cs_test_${attempt}`,'webhook','evt_duplicate');
  assert.equal((await db.query('SELECT * FROM firewood_test_email_delivery')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM firewood_test_outbox')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM firewood_test_confirmations')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM firewood_test_crm_sync')).rows.length,0);
  assert.match((await store.confirmations(attempt))[0].message.text,/controlled test/u);
});

test('independent worker instances claim each message once',async t=>{
  const {db,paid}=await setup(t); await paid(); const sent=[];
  const mailer={payload:m=>controlledPayload(m,from),send:async(p,id)=>{sent.push(id);return randomUUID();}};
  await Promise.all([drainControlledEmail(db,mailer),drainControlledEmail(db,mailer)]);
  assert.equal(sent.length,2); assert.equal(new Set(sent).size,2);
  await drainControlledEmail(db,mailer); assert.equal(sent.length,2);
});

test('lost acknowledgement retries the identical payload/key after a new worker starts',async t=>{
  const {db,paid}=await setup(t); await paid(); let time=1000; const calls=[]; const ids=new Map();
  const mailer={payload:m=>controlledPayload(m,from),async send(payload,key){calls.push({payload,key}); if(!ids.has(key)){ids.set(key,randomUUID());throw new MailError('email_response_unconfirmed',true);}return ids.get(key);}};
  await drainControlledEmail(db,mailer,{now:()=>time});
  assert.equal((await db.query("SELECT * FROM firewood_test_email_delivery WHERE status='accepted'")).rows.length,0);
  time+=30001; await drainControlledEmail(db,{...mailer,payload:()=>{throw new Error('must reuse stored payload');}},{now:()=>time});
  assert.equal((await db.query("SELECT * FROM firewood_test_email_delivery WHERE status='accepted'")).rows.length,2);
  assert.deepEqual(calls[0],calls[2]); assert.deepEqual(calls[1],calls[3]);
});

test('expired lease recovers after worker crash; ambiguous send pauses before 24-hour dedupe expiry',async t=>{
  const {db,paid}=await setup(t); await paid(); const sent=[];
  const mailer={payload:m=>controlledPayload(m,from),send:async(p,id)=>{sent.push(id);return randomUUID();}};
  await db.query("UPDATE firewood_test_email_delivery SET lease_id='dead-worker',lease_until=46000");
  await drainControlledEmail(db,mailer,{now:()=>1000}); assert.equal(sent.length,0);
  await drainControlledEmail(db,mailer,{now:()=>47000}); assert.equal(sent.length,2);
  await paid(); await db.query("UPDATE firewood_test_email_delivery SET first_attempt_at=1000 WHERE status='pending'");
  await drainControlledEmail(db,mailer,{now:()=>1000+23*3600000}); assert.equal(sent.length,2);
  assert.equal((await db.query("SELECT * FROM firewood_test_email_delivery WHERE last_code='deduplication_window_expired'")).rows.length,2);
});

test('terminal rejection pauses, and fixed test budget stops more than ten messages',async t=>{
  const {db,paid}=await setup(t); for(let i=0;i<6;i++)await paid(); let sent=0;
  const mailer={payload:m=>controlledPayload(m,from),send:async()=>{sent++;throw new MailError('email_http_403');}};
  for(let i=0;i<7;i++)await drainControlledEmail(db,mailer);
  assert.equal(sent,10); assert.equal((await db.query('SELECT used FROM firewood_test_email_budget')).rows[0].used,10);
  assert.equal((await db.query("SELECT * FROM firewood_test_email_delivery WHERE status='review'")).rows.length,12);
});

test('email disabled does not claim jobs or send; unpaid attempts do not queue confirmations',async t=>{
  const {db,store,paid}=await setup(t); await store.createAttempt(id(),id(),order);
  assert.equal((await db.query('SELECT * FROM firewood_test_email_delivery')).rows.length,0);
  await paid(); assert.deepEqual(await drainControlledEmail(db,null),{disabled:true,accepted:0,review:0});
  assert.equal((await db.query('SELECT * FROM firewood_test_email_budget')).rows[0].used,0);
});

test('private storage rejects browser, unauthorized, forged prices, real email and simulated payments',async t=>{
  const {db,store}=await setup(t); let accountChecked=false;
  const handler=storageHandler({env,siteId:TEST_SITE_ID,runtime:async()=>({db,store,work:async()=>({})}),provider:{state:async()=>({paid:true})},verifyAccount:async()=>{accountChecked=true;}});
  const request=(method,args=[],headers={})=>handler(new Request('https://test.invalid/',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,...headers},body:JSON.stringify({method,args})}));
  assert.equal((await request('summary',[],{origin:'https://evil.example'})).status,401);
  assert.equal((await request('summary',[],{authorization:'Bearer wrong'})).status,401);
  assert.equal((await request('summary',[],{authorization:'Bearer '+ 'é'.repeat(64)})).status,401);
  assert.equal((await request('createAttempt',[id(),id(),{...order,quote:{...order.quote,totalCents:1}}])).status,422);
  assert.equal((await request('createAttempt',[id(),id(),{...order,contact:{...order.contact,email:'person@example.com'}}])).status,422);
  const attempt=id(); assert.equal((await request('createAttempt',[attempt,id(),order])).status,200);
  assert.equal((await request('confirm',[attempt,'local_simulator','local-simulator'])).status,422);
  assert.equal(accountChecked,false);
  assert.equal((await request('bindPayment',[attempt,{id:'cs_test_bound',url:null}])).status,200);
  assert.equal(accountChecked,true);
  assert.equal((await request('confirm',[attempt,'cs_test_bound','webhook'])).status,200);
});

test('remote store never targets production/CRM or follows redirects',async()=>{
  assert.throws(()=>remoteOrderStore({origin:'https://angeltreeservices.org',token}));
  assert.throws(()=>remoteOrderStore({origin:'https://admin.angeltreeservices.org',token}));
  const calls=[];const store=remoteOrderStore({origin:TEST_ORIGIN,token,fetcher:async(url,options)=>{calls.push({url,options});return Response.json({paid:1});}});
  assert.deepEqual(await store.summary(),{paid:1}); assert.equal(calls[0].options.redirect,'error');
  assert.equal(new Headers(calls[0].options.headers).get('authorization'),`Bearer ${token}`);
  await store.drainCrm(); assert.equal(calls.length,1);
});

test('Postgres transaction adapter pins a connection and rolls back before release',async()=>{
  const events=[];const client={query:async s=>{events.push(s);return {rows:[]};},release:()=>events.push('release')};
  const db=postgresAdapter({connect:async()=>client});
  await assert.rejects(db.transaction(async tx=>{await tx.query('operation');throw new Error('fail');}));
  assert.deepEqual(events,['BEGIN','operation','ROLLBACK','release']);
});

test('paid orders and unsent confirmations survive a stopped database and replacement worker',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ats-firewood-hosted-storage-'));
  let db=new NetlifyDB({directory,logger:()=>{}}); await db.start();
  t.after(async()=>{await db.stop();await rm(directory,{recursive:true,force:true});});
  await db.applyMigrations(fileURLToPath(new URL('./migrations',import.meta.url)));
  let store=createOrderStore(db,{controlledEmail:true});const attempt=id();
  await store.createAttempt(attempt,id(),order);await store.bindPayment(attempt,{id:'cs_test_restart',url:null});
  await store.confirm(attempt,'cs_test_restart','webhook');await db.stop();
  db=new NetlifyDB({directory,logger:()=>{}});await db.start();store=createOrderStore(db,{controlledEmail:true});
  assert.equal((await store.attempt(attempt)).status,'paid');const sends=[];
  await drainControlledEmail(db,{payload:m=>controlledPayload(m,from),send:async(p,key)=>{sends.push(key);return randomUUID();}});
  assert.equal(sends.length,2);assert.equal((await store.confirmations(attempt))[0].status,'accepted');
});

test('hosted signed webhook validates raw bytes, account and paid state; duplicates enqueue once',async t=>{
  const {db,store}=await setup(t); const attempt=id(),reference=id();
  await store.createAttempt(attempt,reference,order);
  const secret='whsec_synthetic';const stripe=new Stripe('rk_test_synthetic');
  const signatureProvider=stripeAdapter('rk_test_synthetic');
  let accountCalls=0;
  const provider={...signatureProvider,state:async()=>({paid:true,intentId:'pi_synthetic'})};
  const handler=testWebhookHandler({env:{...env,FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET:secret},siteId:TEST_SITE_ID,runtime:async()=>({store}),provider,verifyAccount:async()=>{accountCalls++;}});
  const event={id:'evt_hosted',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_hook',livemode:false,payment_status:'paid',client_reference_id:reference,metadata:{purpose:'firewood_test_only',attempt}}}};
  async function send(value,bad=false){const payload=JSON.stringify(value);return handler(new Request('https://test.invalid/',{method:'POST',headers:{'stripe-signature':bad?'bad':stripe.webhooks.generateTestHeaderString({payload,secret})},body:payload}));}
  assert.equal((await send(event,true)).status,400);assert.equal(accountCalls,0);
  assert.equal((await send({...event,livemode:true})).status,400);
  const unpaid=structuredClone(event);unpaid.data.object.payment_status='unpaid';
  assert.equal((await send(unpaid)).status,200);assert.equal((await db.query('SELECT * FROM firewood_test_email_delivery')).rows.length,0);
  assert.equal((await send(event)).status,200);assert.equal((await send(event)).status,200);
  assert.equal((await store.attempt(attempt)).status,'paid');
  assert.equal((await db.query('SELECT * FROM firewood_test_email_delivery')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM firewood_test_payment_events')).rows.length,1);
});

test('webhook processing failure returns retryable status and cannot claim fulfilment',async t=>{
  const {store}=await setup(t);const attempt=id(),reference=id();await store.createAttempt(attempt,reference,order);
  const event={id:'evt_failed',type:'checkout.session.async_payment_succeeded',livemode:false,data:{object:{id:'cs_test_failed',livemode:false,payment_status:'paid',client_reference_id:reference,metadata:{purpose:'firewood_test_only',attempt}}}};
  const handler=testWebhookHandler({env:{...env,FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET:'whsec_synthetic'},siteId:TEST_SITE_ID,runtime:async()=>({store}),provider:{verifyEvent:()=>event,state:async()=>{throw new Error('test outage');}},verifyAccount:async()=>{}});
  const result=await handler(new Request('https://test.invalid/',{method:'POST',body:'signed fixture'}));
  assert.equal(result.status,503);assert.equal((await store.attempt(attempt)).status,'pending');
});

test('private Mac service rejects wrong machine, disabled flags and live keys before opening data',async()=>{
  const macEnv={...env,FIREWOOD_MACBOOK_TEST_ENABLED:'1'};
  await assert.rejects(createMacbookService({env:macEnv,host:'another-machine'}),/approved home MacBook/u);
  await assert.rejects(createMacbookService({env:{...macEnv,FIREWOOD_MACBOOK_TEST_ENABLED:'0'},host:'MacBookPro'}),/disabled/u);
  await assert.rejects(createMacbookService({env:{...macEnv,FIREWOOD_STRIPE_TEST_SECRET_KEY:'sk_live_never'},host:'MacBookPro'}),/dedicated_test/u);
  await assert.rejects(createMacbookService({env:{...macEnv,FIREWOOD_CRM_TEST_ENABLED:'1'},host:'MacBookPro'}),/disabled/u);
});

test('Mac private API verifies its marker, refuses browser/foreign host requests and retains paid jobs after restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ats-firewood-mac-service-'));
  const macEnv={...env,FIREWOOD_MACBOOK_TEST_ENABLED:'1',FIREWOOD_TEST_EMAIL_ENABLED:'0'};
  const options={env:macEnv,directory,host:'MacBookPro',port:0,verifier:{provider:{state:async()=>({paid:true,intentId:'pi_mac_test'})},verifyAccount:async()=>{}}};
  let service=await createMacbookService(options);
  t.after(async()=>{await service.close();await rm(directory,{recursive:true,force:true});});
  assert.equal((await (await fetch(service.origin+'/health')).json()).marker,MAC_RUNTIME_ID);
  const request=async(method,args=[],headers={})=>fetch(service.origin+'/storage',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},body:JSON.stringify({method,args})});
  assert.equal((await request('summary',[],{origin:'https://example.com'})).status,401);
  const forgedStatus = await new Promise((yes,no)=>{
    const req=httpRequest(service.origin+'/health',{headers:{Host:'attacker.example'}},res=>{res.resume();yes(res.statusCode);});req.on('error',no);req.end();
  });
  assert.equal(forgedStatus,403);
  const attempt=id();assert.equal((await request('createAttempt',[attempt,id(),order])).status,200);
  assert.equal((await request('bindPayment',[attempt,{id:'cs_test_mac',url:null}])).status,200);
  assert.equal((await request('confirm',[attempt,'cs_test_mac','webhook'])).status,200);
  await service.close();service=await createMacbookService(options);
  const summary=await (await request('summary')).json();
  assert.deepEqual(summary,{orders:1,paid:1,pending:2,accepted:0,review:0,crm_rows:0});
});

test('Mac remote client accepts only the explicit private forward, never CRM ports',async()=>{
  const {MAC_TEST_ORIGIN}=await import('./hosted/remote-store.mjs');
  assert.throws(()=>remoteOrderStore({origin:'http://127.0.0.1:62321',token}));
  const calls=[];const remote=remoteOrderStore({origin:MAC_TEST_ORIGIN,token,fetcher:async(url,options)=>{calls.push({url,options});return Response.json({orders:0});}});
  assert.equal((await remote.summary()).orders,0);assert.equal(calls[0].url,MAC_TEST_ORIGIN+'/storage');
});
