import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetlifyDB } from '@netlify/database-dev';
import { readFile,readdir,mkdtemp,rm,symlink,access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Script } from 'node:vm';
import Stripe from 'stripe';
import { validateOrder,CheckoutError } from '../model.mjs';
import { configuration,databaseOptions,verifyDatabase,ACCOUNT_ID,RUNTIME_ID,SESSION_MS,LEASE_MS,CREATE_WINDOW_MS,sandboxProvider } from './config.mjs';
import { createHostedCheckout,token } from './checkout.mjs';
import { createHostedWorker } from './worker.mjs';
import { createHostedServer,ACCESS_COOKIE,SESSION_COOKIE } from './server.mjs';
import { browserAssets } from './assets.mjs';
import { prepare } from './prepare.mjs';
import { controlledPayload,drainControlledEmail } from '../email-worker.mjs';

const env={FIREWOOD_RENDER_QA_ENABLED:'1',FIREWOOD_STRIPE_TEST_ACCOUNT_ID:ACCOUNT_ID,FIREWOOD_STRIPE_TEST_SECRET_KEY:'rk_test_synthetic',
  FIREWOOD_QA_WEB_SERVICE_ID:'srv-syntheticweb01',FIREWOOD_QA_WORKER_SERVICE_ID:'crn-syntheticworker01',RENDER_SERVICE_ID:'srv-syntheticweb01',
  FIREWOOD_QA_ORIGIN:'https://angel-firewood-qa-synthetic.onrender.com',FIREWOOD_QA_ACCESS_TOKEN:'a'.repeat(64),FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET:'whsec_synthetic'};
const config=configuration(env);
const input={quantity:'two',stacking:false,name:'Synthetic Test',email:'qa@example.invalid',phone:'2025550142',address:'123 Example Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic only. No dispatch.'};
const client=new Stripe('rk_test_synthetic');
function payments() {
  const sessions=new Map();let uncertain=false,wait=null;let creates=0;
  return {sessions,get creates(){return creates;},set uncertain(value){uncertain=value;},set wait(value){wait=value;},
    async verifyAccount(){},
    verifyEvent(raw,signature,secret){try{return client.webhooks.constructEvent(raw,signature,secret);}catch{throw new CheckoutError('Invalid test signature.',400);}},
    async create(order,origin,reference,attempt) {
      creates++;
      if(!sessions.has(attempt))sessions.set(attempt,{id:`cs_test_${attempt}`,order:structuredClone(order),origin,reference,attempt,paid:false,expired:false});
      if(wait)await wait;
      if(uncertain){uncertain=false;throw new Error('synthetic_lost_create_response');}
      return {id:sessions.get(attempt).id,url:`https://checkout.stripe.com/c/pay/${sessions.get(attempt).id}`};
    },
    async state(id,total,reference,attempt) {
      const value=sessions.get(attempt);
      if(!value||value.id!==id||value.reference!==reference||value.order.quote.totalCents!==total)throw new Error('synthetic_binding_mismatch');
      return {paid:value.paid,expired:value.expired,closed:value.paid,intentId:`pi_${attempt}`};
    },
    async link(id,total,reference,attempt) {
      await this.state(id,total,reference,attempt);
      return {id,url:`https://checkout.stripe.com/c/pay/${id}`};
    },
    async expire(id){const value=[...sessions.values()].find(v=>v.id===id);if(value.paid)throw new Error('already_paid');value.expired=true;},
    pay(attempt){sessions.get(attempt).paid=true;},
    event(attempt,type='checkout.session.completed',eventId=`evt_${token()}`) {
      const value=sessions.get(attempt);
      return {id:eventId,type,livemode:false,data:{object:{id:value.id,livemode:false,payment_status:value.paid?'paid':'unpaid',client_reference_id:value.reference,metadata:{purpose:'firewood_test_only',attempt}}}};
    },
  };
}
async function fixture(t,{emailEnabled=false}={}) {
  let db,close;
  if(process.env.FIREWOOD_RUNTIME_NATIVE_TEST_URL) {
    const url=new URL(process.env.FIREWOOD_RUNTIME_NATIVE_TEST_URL);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/firewood_render_runtime_test');
    const {Pool}=await import('pg');
    const schema=`runtime_${token()}`;
    const admin=new Pool({connectionString:url.href});await admin.query(`CREATE SCHEMA ${schema}`);
    const pool=new Pool({connectionString:url.href,options:`-c search_path=${schema}`,max:6});
    const {postgresAdapter}=await import('../hosted/runtime.mjs');db=postgresAdapter(pool);
    close=async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();};
  }else{
    db=new NetlifyDB({logger:()=>{}});await db.start();close=()=>db.stop();
  }
  t.after(close);
  for(const folder of [new URL('../migrations/',import.meta.url),new URL('./migrations/',import.meta.url)]) {
    if(db.applyMigrations)await db.applyMigrations(fileURLToPath(folder));
    else for(const name of (await readdir(folder)).sort())if(name.endsWith('.sql'))await db.query(await readFile(new URL(name,folder),'utf8'));
  }
  await db.query('INSERT INTO firewood_render_environment VALUES($1,$2,$3,$4,$5)',[RUNTIME_ID,config.origin,config.webId,config.workerId,ACCOUNT_ID]);
  let time=Date.now();const now=()=>time,provider=payments(),sent=[];
  const mailer={payload:message=>controlledPayload(message,config.mailFrom),async send(payload,id){sent.push({payload,id});return randomUUID();}};
  const settings={...config,emailEnabled};
  function replacement(){const checkout=createHostedCheckout({db,provider,config:settings,now});return {checkout,worker:createHostedWorker({checkout,provider,config:settings,mailer,now})};}
  const app=replacement();
  async function open(){const saved=await app.checkout.session(null,true);return {...saved,input:{...input,csrf:saved.csrf}};}
  async function begin(change={}){const saved=await open();await app.checkout.start(saved.id,{...saved.input,...change});const row=(await db.query('SELECT * FROM firewood_render_sessions WHERE id=$1',[saved.id])).rows[0];return {...saved,attempt:row.attempt};}
  async function ingest(event,worker=app.worker){const raw=JSON.stringify(event);return worker.ingest(Buffer.from(raw),client.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret}));}
  return {db,provider,sent,now,advance(ms){time+=ms;},...app,settings,replacement,open,begin,ingest};
}

test('Render config refuses live/shared credentials, wrong identities, unsafe origins and CRM enablement',()=>{
  for(const [key,value] of [['FIREWOOD_RENDER_QA_ENABLED','0'],['FIREWOOD_STRIPE_TEST_ACCOUNT_ID','acct_other'],['FIREWOOD_STRIPE_TEST_SECRET_KEY','rk_live_synthetic'],['FIREWOOD_STRIPE_TEST_SECRET_KEY','rkcs_test_synthetic'],['FIREWOOD_CRM_TEST_ENABLED','1'],['RENDER_SERVICE_ID','srv_other'],['FIREWOOD_QA_ORIGIN','https://angeltreeservices.org'],['FIREWOOD_QA_ORIGIN',config.origin+'/'],['FIREWOOD_QA_ORIGIN','http://angel-firewood-qa-synthetic.onrender.com'],['FIREWOOD_QA_ACCESS_TOKEN','short']])assert.throws(()=>configuration({...env,[key]:value}));
  assert.equal(configuration({...env,RENDER_SERVICE_ID:env.FIREWOOD_QA_WORKER_SERVICE_ID},'worker').account,ACCOUNT_ID);
  assert.throws(()=>configuration(env,'worker'));assert.throws(()=>configuration({...env,FIREWOOD_STRIPE_TEST_SECRET_KEY:undefined,STRIPE_SECRET_KEY:'rk_test_synthetic'}));
});
test('Render database allows only exact isolated host/database/role with verified TLS',()=>{
  const host='dpg-synthetic01-a.virginia-postgres.render.com',url=`postgresql://firewood_worker:${'b'.repeat(48)}@${host}/firewood_test?sslmode=verify-full`;
  const cfg={FIREWOOD_TEST_DATABASE_HOST:host,FIREWOOD_TEST_DATABASE_URL:url};
  assert.equal(databaseOptions(cfg).ssl.rejectUnauthorized,true);assert.equal(new URL(databaseOptions(cfg).connectionString).search,'');
  for(const bad of [url.replace(host,'db.synthetic.supabase.co'),url.replace('firewood_worker','postgres'),url.replace('/firewood_test','/crm'),url.replace('verify-full','disable'),url+'&sslrootcert=other'])assert.throws(()=>databaseOptions({...cfg,FIREWOOD_TEST_DATABASE_URL:bad}));
});
test('provider checks sandbox identity before creating any Session',async()=>{
  const calls=[];const provider=sandboxProvider(config,async url=>{calls.push(String(url));return Response.json({id:'acct_other'});});
  await assert.rejects(provider.create(validateOrder(input),config.origin,token(),token()),/dedicated_sandbox/u);
  assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/v1/account'));
});
test('provider restores a saved browser link with validated sandbox GET requests only',async()=>{
  const attempt=token(),reference=token(),id=`cs_test_${attempt}`,calls=[];
  const session={id,livemode:false,status:'open',payment_status:'unpaid',amount_total:84000,currency:'usd',client_reference_id:reference,metadata:{purpose:'firewood_test_only',attempt},url:`https://checkout.stripe.com/c/pay/${id}`};
  const provider=sandboxProvider(config,async(url,options)=>{calls.push({url:String(url),method:options.method});return Response.json(String(url).endsWith('/v1/account')?{id:ACCOUNT_ID}:session);});
  assert.deepEqual(await provider.link(id,84000,reference,attempt),{id,url:session.url});
  assert.ok(calls.every(value=>value.method==='GET'));assert.equal(calls.length,3);
  await assert.rejects(provider.link(id,1,reference,attempt));
});
test('runtime verifies the database identity marker',async t=>{
  const f=await fixture(t);await verifyDatabase(f.db,config);
  await assert.rejects(verifyDatabase(f.db,{...config,origin:'https://angel-firewood-qa-other.onrender.com'}));
});
test('owner access expires, is hashed at rest, and has durable rate limiting',async t=>{
  const f=await fixture(t),access=await f.checkout.login(config.accessToken);
  assert.equal(await f.checkout.authorized(access),true);
  assert.notEqual((await f.db.query('SELECT id FROM firewood_render_access')).rows[0].id,access);
  for(let i=0;i<19;i++)await assert.rejects(f.checkout.login('wrong'),e=>e.status===401);
  await assert.rejects(f.checkout.login(config.accessToken),e=>e.status===429);
  f.advance(4*3600000+1);assert.equal(await f.checkout.authorized(access),false);
});
test('six price selections persist approved totals, included delivery and optional stacking',async t=>{
  const f=await fixture(t);
  for(const [quantity,stacking,total] of [['half',false,30000],['half',true,45000],['full',false,45000],['full',true,60000],['two',false,84000],['two',true,99000]]){
    const s=await f.begin({quantity,stacking,totalCents:1});const row=await f.checkout.store.attempt(s.attempt);
    assert.equal(row.quote.totalCents,total);assert.equal(row.quote.deliveryCents,0);assert.equal(row.quote.stackingCents,stacking?15000:0);
  }
  assert.equal(f.provider.sessions.size,6);assert.equal((await f.db.query('SELECT count(*)::int n FROM firewood_test_crm_sync')).rows[0].n,0);
});
test('real customer email, stale veterans fields and invalid CSRF cannot open test payments',async t=>{
  const f=await fixture(t),s=await f.open();
  for(const change of [{email:'real@example.com'},{veteran:true},{csrf:token()}])await assert.rejects(f.checkout.start(s.id,{...s.input,...change}));
  assert.equal(f.provider.sessions.size,0);
});
test('cross-instance double tap makes one payment and preserves entered details',async t=>{
  const f=await fixture(t),s=await f.open(),other=f.replacement();let resume;
  f.provider.wait=new Promise(r=>{resume=r;});
  const first=f.checkout.start(s.id,{...s.input,notes:'Preserved synthetic instructions.'});
  for(let i=0;i<100&&!f.provider.creates;i++)await new Promise(r=>setTimeout(r,5));
  await assert.rejects(other.checkout.start(s.id,s.input),e=>e.status===409);
  resume();await first;f.provider.wait=null;
  assert.equal(f.provider.sessions.size,1);assert.equal((await other.checkout.state(s.id)).order.contact.notes,'Preserved synthetic instructions.');
});
test('lost create response recovers the same attempt in a replacement runtime',async t=>{
  const f=await fixture(t),s=await f.open();f.provider.uncertain=true;
  await assert.rejects(f.checkout.start(s.id,s.input));
  const other=f.replacement();await other.checkout.start(s.id,s.input);
  assert.equal(f.provider.sessions.size,1);assert.equal((await f.db.query('SELECT count(*)::int n FROM firewood_test_attempts')).rows[0].n,1);
});
test('known paid Session without a browser link recovers after the creation retry window',async t=>{
  const f=await fixture(t),s=await f.begin();
  await f.db.query('UPDATE firewood_test_attempts SET payment_url=NULL WHERE id=$1',[s.attempt]);
  f.provider.pay(s.attempt);f.advance(CREATE_WINDOW_MS+1);await f.replacement().worker.work();
  assert.equal((await f.checkout.store.summary()).paid,1);assert.equal(f.provider.creates,1);
});
test('an open known Session restores its missing link by reading, never by creating',async t=>{
  const f=await fixture(t),s=await f.begin();
  await f.db.query('UPDATE firewood_test_attempts SET payment_url=NULL WHERE id=$1',[s.attempt]);
  const result=await f.checkout.start(s.id,s.input);
  assert.equal(result.next,`https://checkout.stripe.com/c/pay/cs_test_${s.attempt}`);assert.equal(f.provider.creates,1);
});
test('an expired known Session without a URL can reach a terminal recovery state',async t=>{
  const f=await fixture(t),s=await f.begin();
  await f.db.query('UPDATE firewood_test_attempts SET payment_url=NULL WHERE id=$1',[s.attempt]);
  f.provider.sessions.get(s.attempt).expired=true;f.advance(CREATE_WINDOW_MS+1);await f.worker.work();
  assert.equal((await f.db.query('SELECT status FROM firewood_render_reconciliation WHERE attempt=$1',[s.attempt])).rows[0].status,'expired');
  assert.equal(f.provider.creates,1);
});
test('changed details expire the old unpaid Session before creating a new quote',async t=>{
  const f=await fixture(t),s=await f.begin();
  await f.checkout.start(s.id,{...s.input,stacking:true,notes:'New synthetic instructions.'});
  assert.equal(f.provider.sessions.get(s.attempt).expired,true);assert.equal(f.provider.sessions.size,2);
  assert.equal((await f.checkout.state(s.id)).order.quote.totalCents,99000);
});
test('payment that wins an expiry race prevents a second charge attempt',async t=>{
  const f=await fixture(t),s=await f.begin();
  f.provider.expire=async()=>{f.provider.pay(s.attempt);throw new Error('completed_during_expire');};
  assert.equal((await f.checkout.start(s.id,{...s.input,stacking:true})).next,'/firewood/checkout/result/');
  assert.equal(f.provider.sessions.size,1);
});
test('SDK-signed fixture is durable before acknowledgement; replacement workers fulfill once',async t=>{
  const f=await fixture(t,{emailEnabled:true}),s=await f.begin();f.provider.pay(s.attempt);
  const event=f.provider.event(s.attempt);await f.ingest(event);
  assert.equal((await f.checkout.store.summary()).paid,0);
  const a=f.replacement(),b=f.replacement();await Promise.all([a.worker.work(),b.worker.work()]);
  await f.ingest(event);await b.worker.work();
  assert.equal((await f.checkout.store.summary()).paid,1);assert.equal(f.sent.length,2);
  assert.ok(f.sent.every(v=>v.payload.to.length===1&&v.payload.to[0]==='info@angeltreeservice.org'));
  assert.equal((await f.checkout.state(s.id)).receipt.totalCents,84000);
});
test('webhook inbox failure cannot acknowledge a lost event',async t=>{
  const f=await fixture(t),s=await f.begin();f.provider.pay(s.attempt);
  const broken={...f.checkout,db:{...f.db,async query(){throw new Error('synthetic_database_down');}}};
  const worker=createHostedWorker({checkout:broken,provider:f.provider,config:f.settings,now:f.now});
  await assert.rejects(f.ingest(f.provider.event(s.attempt),worker));
  assert.equal((await f.db.query('SELECT count(*)::int n FROM firewood_render_events')).rows[0].n,0);
});
test('missing webhook and expired browser still recover through scheduled reconciliation',async t=>{
  const f=await fixture(t),s=await f.begin();f.provider.pay(s.attempt);f.advance(SESSION_MS+1);
  const replacement=f.replacement();await replacement.worker.work();
  assert.equal((await f.checkout.store.summary()).paid,1);assert.equal((await f.db.query('SELECT count(*)::int n FROM firewood_render_sessions')).rows[0].n,0);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM firewood_test_outbox')).rows[0].n,2);
});
test('a crashed session lease recovers after expiry without creating another Session',async t=>{
  const f=await fixture(t),s=await f.begin();
  await f.db.query('UPDATE firewood_render_sessions SET lease_id=$2,lease_until=$3 WHERE id=$1',[s.id,token(),f.now()+LEASE_MS]);
  await assert.rejects(f.replacement().checkout.start(s.id,s.input),e=>e.status===409);
  f.advance(LEASE_MS+1);await f.replacement().checkout.start(s.id,s.input);assert.equal(f.provider.sessions.size,1);
});
test('uncertain create beyond Stripe idempotency window pauses instead of creating again',async t=>{
  const f=await fixture(t),s=await f.open();f.provider.uncertain=true;await assert.rejects(f.checkout.start(s.id,s.input));
  f.advance(CREATE_WINDOW_MS+1);await f.worker.work();
  assert.equal(f.provider.creates,1);assert.equal((await f.db.query('SELECT status FROM firewood_render_reconciliation')).rows[0].status,'review');
});
test('unpaid completion never fulfills; asynchronous success fulfills exactly once',async t=>{
  const f=await fixture(t),s=await f.begin();await f.ingest(f.provider.event(s.attempt));await f.worker.work();assert.equal((await f.checkout.store.summary()).paid,0);
  f.provider.pay(s.attempt);await f.ingest(f.provider.event(s.attempt,'checkout.session.async_payment_succeeded'));await f.worker.work();
  await f.ingest(f.provider.event(s.attempt));await f.worker.work();assert.equal((await f.checkout.store.summary()).paid,1);assert.equal((await f.db.query('SELECT count(*)::int n FROM firewood_test_outbox')).rows[0].n,2);
});
test('bad signatures, live-mode events and conflicting event IDs cannot fulfill',async t=>{
  const f=await fixture(t),s=await f.begin();f.provider.pay(s.attempt);const event=f.provider.event(s.attempt);
  await assert.rejects(f.worker.ingest(Buffer.from(JSON.stringify(event)),'bad'),e=>e.status===400);
  await assert.rejects(f.ingest({...event,livemode:true}),e=>e.status===400);
  await f.ingest(event);await assert.rejects(f.ingest({...event,data:{object:{...event.data.object,id:'cs_test_other'}}}),e=>e.status===400);
  assert.equal((await f.checkout.store.summary()).paid,0);
});
test('matching-app unknown events remain diagnosable instead of disappearing',async t=>{
  const f=await fixture(t),attempt=token(),reference=token();
  await f.provider.create(validateOrder(input),config.origin,reference,attempt);f.provider.pay(attempt);
  await f.ingest(f.provider.event(attempt));await f.worker.work();
  assert.equal((await f.db.query('SELECT status FROM firewood_render_events')).rows[0].status,'pending');assert.equal((await f.checkout.store.summary()).paid,0);
});
test('reconciliation recovers a paid Session whose creation response was lost',async t=>{
  const f=await fixture(t),s=await f.open();f.provider.uncertain=true;
  await assert.rejects(f.checkout.start(s.id,s.input));
  const attempt=(await f.db.query('SELECT attempt FROM firewood_render_sessions WHERE id=$1',[s.id])).rows[0].attempt;
  f.provider.pay(attempt);f.advance(60001);await f.replacement().worker.work();
  assert.equal((await f.checkout.store.summary()).paid,1);assert.equal(f.provider.sessions.size,1);
});
test('an unconfirmed expiry preserves the old attempt and refuses a replacement',async t=>{
  const f=await fixture(t),s=await f.begin();f.provider.expire=async()=>{throw new Error('synthetic_expiry_timeout');};
  await assert.rejects(f.checkout.start(s.id,{...s.input,stacking:true}),e=>e.status===409);
  assert.equal(f.provider.sessions.size,1);assert.equal((await f.checkout.state(s.id)).order.quote.stacking,false);
});
test('reset removes browser authorization without deleting unsettled payment recovery',async t=>{
  const f=await fixture(t),s=await f.begin();await f.checkout.reset(s.id,s.csrf);
  await assert.rejects(f.checkout.state(s.id),e=>e.status===403);
  f.provider.pay(s.attempt);f.advance(60001);await f.worker.work();assert.equal((await f.checkout.store.summary()).paid,1);
});
test('mismatched provider totals never become paid merely because a signed event says paid',async t=>{
  const f=await fixture(t),s=await f.begin();f.provider.pay(s.attempt);
  f.provider.sessions.get(s.attempt).order.quote.totalCents=1;
  await f.ingest(f.provider.event(s.attempt));await f.worker.work();
  assert.equal((await f.checkout.store.summary()).paid,0);assert.equal((await f.db.query('SELECT status FROM firewood_render_events')).rows[0].status,'pending');
});
test('old signatures and connected-account events are refused',async t=>{
  const f=await fixture(t),s=await f.begin(),event=f.provider.event(s.attempt),raw=JSON.stringify(event);
  await assert.rejects(f.worker.ingest(Buffer.from(raw),client.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret,timestamp:Math.floor(Date.now()/1000)-600})),e=>e.status===400);
  await assert.rejects(f.ingest({...event,account:'acct_other'}),e=>e.status===400);
});
test('eight-attempt ceiling is durable across runtimes and includes canceled attempts',async t=>{
  const f=await fixture(t);for(let i=0;i<8;i++)await f.begin();
  const s=await f.open();await assert.rejects(f.replacement().checkout.start(s.id,s.input),e=>e.status===409);assert.equal(f.provider.sessions.size,8);
});
test('email stays off by default; Render batch accepts at most sixteen owner copies',async t=>{
  const f=await fixture(t);for(let i=0;i<8;i++){const s=await f.begin();f.provider.pay(s.attempt);await f.ingest(f.provider.event(s.attempt));}
  await f.worker.work();assert.equal(f.sent.length,0);
  const worker=createHostedWorker({checkout:f.checkout,provider:f.provider,config:{...config,emailEnabled:true},now:f.now,mailer:{payload:m=>controlledPayload(m,config.mailFrom),send:async(p,id)=>{f.sent.push({p,id});return randomUUID();}}});
  for(let i=0;i<9;i++)await worker.work();assert.equal(f.sent.length,16);
  assert.equal((await f.db.query('SELECT used FROM firewood_test_email_budget')).rows[0].used,16);
  await assert.rejects(drainControlledEmail(f.db,null,{budgetLimit:17}));
});
test('heartbeat exposes stale/overdue work for an external monitor without sending alerts',async t=>{
  const f=await fixture(t);assert.equal((await f.worker.status()).stale,true);
  await f.worker.work();assert.equal((await f.worker.status()).healthy,true);f.advance(600001);assert.equal((await f.worker.status()).stale,true);
});
test('worker leaves remaining work durable when its runtime budget is reached',async t=>{
  const f=await fixture(t);
  for(let i=0;i<4;i++){const s=await f.begin();f.provider.pay(s.attempt);await f.ingest(f.provider.event(s.attempt));}
  const state=f.provider.state;f.provider.state=async(...args)=>{f.advance(61000);return state(...args);};
  const result=await f.worker.work();assert.equal(result.events,2);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM firewood_render_events WHERE status='pending'")).rows[0].n,2);
  f.provider.state=state;await f.worker.work();assert.equal((await f.checkout.store.summary()).paid,4);
});
test('hosted browser assets preserve UI and local fonts but remove simulator and remote font requests',async()=>{
  const assets=await browserAssets(),html=assets.get('/firewood/checkout/').body,js=assets.get('/firewood/checkout/checkout.js').body;
  assert.doesNotThrow(()=>new Script(js));assert.ok(!html.includes('simulate-success'));assert.ok(!js.includes("get('simulate-success')"));
  assert.ok(html.includes('https://angeltreeservices.org/firewood/'));assert.ok(!html.includes('css2.css'));assert.ok(assets.get('/firewood/checkout/fonts.css').body.includes('Poppins'));
});

async function http(t,f) {
  const web=await createHostedServer({...f,config:f.settings});const port=await web.listen();t.after(()=>web.close());
  async function call(path,options={}) {
    const data=options.data===undefined?null:typeof options.data==='string'?options.data:JSON.stringify(options.data);
    return new Promise((yes,no)=>{
      const req=request({hostname:'127.0.0.1',port,path,method:options.method??(data?'POST':'GET'),headers:{Host:new URL(config.origin).host,'X-Forwarded-Proto':'https',...(data?{'Content-Type':'application/json',Origin:config.origin,'Content-Length':Buffer.byteLength(data)}:{}),...options.headers}},res=>{const parts=[];res.on('data',v=>parts.push(v));res.on('end',()=>yes({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString()}));});req.on('error',no);req.end(data);
    });
  }
  const login=await call('/firewood/checkout/access',{data:`code=${config.accessToken}`,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  const access=login.headers['set-cookie'][0].split(';')[0];
  const state=await call('/firewood/checkout/api/state',{headers:{Cookie:access}});
  const orderCookie=state.headers['set-cookie'][0].split(';')[0];
  return {call,login,state,auth:{Cookie:`${access}; ${orderCookie}`},csrf:JSON.parse(state.text).csrf};
}
test('HTTP gate, HTTPS cookies, origin checks and hidden routes enforce isolated QA',async t=>{
  const f=await fixture(t),h=await http(t,f);
  assert.equal(h.login.status,303);assert.match(h.login.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Lax/u);
  assert.match(h.state.headers['set-cookie'][0],new RegExp(SESSION_COOKIE));
  assert.equal((await h.call('/firewood/checkout/api/state')).status,401);
  assert.equal((await h.call('/firewood/checkout/',{headers:{Host:'angeltreeservices.org'}})).status,403);
  assert.equal((await h.call('/firewood/checkout/',{headers:{...h.auth,'X-Forwarded-Proto':'http'}})).status,403);
  for(const path of ['/storage','/firewood/checkout/payment/','/firewood/checkout/api/simulate','/.env','/source-manifest.json'])assert.equal((await h.call(path,{headers:h.auth})).status===404||(await h.call(path,{headers:h.auth})).status===405,true);
  assert.equal((await h.call('/firewood/checkout/api/start',{data:{...input,csrf:h.csrf},headers:{...h.auth,Origin:'https://other.invalid'}})).status,403);
  assert.equal((await h.call('/firewood/checkout/api/start',{data:{...input,csrf:token()},headers:h.auth})).status,403);
  const valid=await h.call('/firewood/checkout/api/start',{data:{...input,csrf:h.csrf},headers:h.auth});assert.equal(valid.status,200);
  assert.equal((await h.call('/firewood/checkout/api/start',{data:'x'.repeat(17000),headers:h.auth})).status,413);
});
test('HTTP webhook bypasses UI gate but still rejects signatures and returns 503 on storage outage',async t=>{
  const f=await fixture(t),h=await http(t,f),s=await f.begin();f.provider.pay(s.attempt);const raw=JSON.stringify(f.provider.event(s.attempt));
  assert.equal((await h.call('/firewood/checkout/webhook',{data:raw,headers:{'Stripe-Signature':'bad'}})).status,400);
  const sig=client.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret});
  assert.equal((await h.call('/firewood/checkout/webhook',{data:raw,headers:{'Stripe-Signature':sig,Origin:'https://stripe.example.invalid'}})).status,200);
  const old=f.worker.ingest;f.worker.ingest=async()=>{throw new Error('synthetic_db_down');};
  assert.equal((await h.call('/firewood/checkout/webhook',{data:raw,headers:{'Stripe-Signature':sig}})).status,503);f.worker.ingest=old;
});
test('internal health probe works without forwarded browser headers; checkout still refuses them',async t=>{
  const f=await fixture(t),h=await http(t,f);
  const probe={headers:{Host:'127.0.0.1','X-Forwarded-Proto':'http'}};
  assert.equal((await h.call('/health',probe)).status,200);
  assert.equal((await h.call('/firewood/checkout/api/state',probe)).status,403);
});
test('allowlisted export contains no public build, credentials, simulator server or CRM application',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'firewood-render-export-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const result=await prepare(join(directory,'candidate'));const names=Object.keys(result.manifest);
  assert.ok(names.some(n=>n.endsWith('render/main.mjs')));assert.ok(names.some(n=>n.endsWith('.woff2')));
  assert.ok(!names.some(n=>/(?:^|\/)(?:dist-public|apps|\.env|node_modules|server\.local|private)/u.test(n)));
  assert.ok(!names.includes('netlify.toml'));assert.ok(!names.includes('scripts/firewood-checkout/server.mjs'));
  await assert.rejects(prepare(join(directory,'candidate')));
});
test('export refuses a parent symlink pointing inside the repository',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'firewood-export-link-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const repo=fileURLToPath(new URL('../../../',import.meta.url)),name=`rejected-export-${token()}`;
  await symlink(repo,join(directory,'alias'));
  await assert.rejects(prepare(join(directory,'alias',name)),/outside the repository/u);
  await assert.rejects(access(join(repo,name)));
});
