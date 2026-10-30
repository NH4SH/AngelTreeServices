import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,X509Certificate} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {request} from 'node:https';
import Stripe from 'stripe';
import {configuration,databaseOptions,SANDBOX_ACCOUNT,verifyDatabase} from './config.mjs';
import {policyHash,orderInput,refundEligibility,CheckoutError} from './policy.mjs';
import {createCheckout,token,digest,CREATE_MS} from './checkout.mjs';
import {createWorker} from './worker.mjs';
import {migrate} from './migrate.mjs';
import {stripeProvider,purpose} from './provider.mjs';
import {backendServer,relayServer,BASE,orderCookie} from './server.mjs';
import {powerStatus} from './power.mjs';
import {seal,unseal} from './seal.mjs';
import {customerMailer} from './mailer.mjs';
import {assets} from './assets.mjs';

const env={FIREWOOD_CANDIDATE_MODE:'sandbox',FIREWOOD_CANDIDATE_ACCOUNT:SANDBOX_ACCOUNT,FIREWOOD_CANDIDATE_STRIPE_KEY:'rk_test_synthetic',
  FIREWOOD_CANDIDATE_ORIGIN:'https://firewood-candidate.invalid',FIREWOOD_CANDIDATE_WEBHOOK_SECRET:'whsec_synthetic',
  FIREWOOD_CANDIDATE_CRM_ENABLED:'0',FIREWOOD_CANDIDATE_EMAIL_ENABLED:'0',FIREWOOD_CANDIDATE_ACCESS_TOKEN:'a'.repeat(64)};
const config=configuration(env),client=new Stripe('rk_test_synthetic');
const input={quantity:'two',stacking:false,name:'Synthetic Customer',email:'test@example.invalid',phone:'2025550142',address:'123 Example Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic only; no dispatch.',termsAccepted:true,householdUseConfirmed:true};
function payments(){const items=new Map(),refunds=new Map();let lost=false,wait=null,refundLost=false,failState=false,calls=0;
 return {items,refunds,get creates(){return calls;},set lost(v){lost=v;},set wait(v){wait=v;},set refundLost(v){refundLost=v;},set failState(v){failState=v;},async verifyAccount(){},
  verifyEvent(raw,sig){try{return client.webhooks.constructEvent(raw,sig,config.webhookSecret);}catch{throw new CheckoutError('Invalid signature.',400);}},
  async create(row){calls++;if(!items.has(row.id))items.set(row.id,{row:structuredClone(row),id:'cs_test_'+row.id.replaceAll('-',''),paid:false,expired:false,processing:false,disputed:false,refundCents:0});if(wait)await wait;if(lost){lost=false;throw Error('lost_create');}const p=items.get(row.id);return {id:p.id,url:'https://checkout.stripe.com/c/pay/'+p.id};},
  async state(row){if(failState)throw Error('synthetic_provider_outage');const p=items.get(row.id);if(!p||p.id!==row.payment_id||p.row.quote.totalCents!==row.quote.totalCents)throw Error('synthetic_binding');return {paid:p.paid,expired:p.expired,processing:p.processing,intent:'pi_'+row.id.replaceAll('-','')};},
  async link(row){await this.state(row);return {id:row.payment_id,url:'https://checkout.stripe.com/c/pay/'+row.payment_id};},
  async expire(row){const p=items.get(row.id);if(p.paid||p.processing)throw Error('not_open');p.expired=true;},
  async refund(row,job){if(!refunds.has(job.id))refunds.set(job.id,{id:'re_'+job.id.replaceAll('-',''),amount:job.amount});if(refundLost){refundLost=false;throw Error('lost_refund_response');}items.get(row.id).refundCents=job.amount;return {...refunds.get(job.id),status:'succeeded'};},
  async lifecycleOrder(e){const p=[...items.values()].find(p=>'pi_'+p.row.id.replaceAll('-','')===e.data.object.payment_intent);return p?{id:p.row.id,intent:e.data.object.payment_intent}:null;},
  async lifecycle(e,row){const p=items.get(row.id);return e.type==='charge.refunded'?{refundCents:p.refundCents}:{disputed:p.disputed,disputeId:e.data.object.id};},
  event(id,type='checkout.session.completed',eventId='evt_'+token()){const p=items.get(id);return {id:eventId,livemode:false,type,data:{object:{id:type.startsWith('charge.dispute')?'dp_'+token():type==='charge.refunded'?'ch_'+token():p.id,livemode:false,client_reference_id:id,payment_intent:'pi_'+id.replaceAll('-',''),metadata:{purpose,order:id,policy_hash:policyHash,environment:'sandbox'}}}};}
 };
}
async function fixture(t){let db,close;
 if(process.env.FIREWOOD_CANDIDATE_NATIVE_TEST_URL){const u=new URL(process.env.FIREWOOD_CANDIDATE_NATIVE_TEST_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'56388');assert.equal(u.pathname,'/firewood_candidate_test');
   const {Pool}=await import('pg'),{postgresAdapter}=await import('../../hosted/runtime.mjs');const admin=new Pool({connectionString:u.href}),schema='candidate_'+token();await admin.query('CREATE SCHEMA '+schema);const pool=new Pool({connectionString:u.href,options:'-c search_path='+schema,max:6});db=postgresAdapter(pool);close=async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();};
 }else{const {NetlifyDB}=await import('@netlify/database-dev');db=new NetlifyDB({logger:()=>{}});await db.start();close=()=>db.stop();}t.after(close);await migrate(db,config);
 let time=Date.now();const now=()=>time,provider=payments();function replacement(mailer=null){const checkout=createCheckout({db,config,provider,now});return {checkout,worker:createWorker(checkout,{mailer,now})};}
 const app=replacement();await app.checkout.owner('pause',{paused:false});
 async function open(){return app.checkout.session(null,true);}
 async function begin(change={}){const s=await open();await app.checkout.start(s,{...input,...change,csrf:s.csrf});return {s,row:await app.checkout.order((await app.checkout.session(s.cookie)).order_id)};}
 async function ingest(e,worker=app.worker){const raw=JSON.stringify(e);return worker.ingest(Buffer.from(raw),client.webhooks.generateTestHeaderString({payload:raw,secret:config.webhookSecret}));}
 async function paid(change={}){const v=await begin(change);provider.items.get(v.row.id).paid=true;await ingest(provider.event(v.row.id));await app.worker.work();return {...v,row:await app.checkout.order(v.row.id)};}
 return {db,provider,now,advance(ms){time+=ms;},...app,replacement,open,begin,ingest,paid};
}
test('candidate configuration rejects live keys and unapproved activation before provider use',()=>{assert.equal(config.sandbox,true);
 for(const [k,v] of [['FIREWOOD_CANDIDATE_MODE','live'],['FIREWOOD_CANDIDATE_ACCOUNT','acct_other'],['FIREWOOD_CANDIDATE_STRIPE_KEY','rk_live_synthetic'],['FIREWOOD_CANDIDATE_STRIPE_KEY','sk_test_synthetic'],['FIREWOOD_CANDIDATE_ORIGIN','https://angeltreeservices.org'],['FIREWOOD_CANDIDATE_ORIGIN',config.origin+'/'],['FIREWOOD_CANDIDATE_EMAIL_ENABLED','1'],['FIREWOOD_CANDIDATE_CRM_ENABLED','1']])assert.throws(()=>configuration({...env,[k]:v}));
 assert.throws(()=>configuration({...env,FIREWOOD_CANDIDATE_MODE:'live'},{}),/live_activation/);
});
test('candidate DB settings refuse QA/CRM databases, ports, roles and nonloopback hosts',()=>{const url='postgresql://firewood_candidate_worker:'+('b'.repeat(64))+'@127.0.0.1:56388/firewood_candidate_sandbox';assert.equal(databaseOptions({FIREWOOD_CANDIDATE_DATABASE_URL:url},config).max,4);
 for(const value of [url.replace('56388','56382'),url.replace('firewood_candidate_sandbox','crm'),url.replace('127.0.0.1','192.168.1.1'),url.replace('firewood_candidate_worker','postgres'),url+'?sslmode=disable'])assert.throws(()=>databaseOptions({FIREWOOD_CANDIDATE_DATABASE_URL:value},config));});
test('power policy accepts owner-approved battery >10%, refuses 10%, below and unknown',()=>{for(const n of [11,50,100])assert.equal(powerStatus(`Now drawing from 'Battery Power'\n${n}%; discharging`).allowed,true);for(const n of [0,9,10])assert.equal(powerStatus(`${n}%; discharging`).allowed,false);assert.equal(powerStatus('unknown').allowed,false);assert.equal(powerStatus("Now drawing from 'AC Power'").allowed,true);});
test('authenticated backups restore exactly and reject wrong keys and modified archives',()=>{const key=Buffer.alloc(32,7),data=Buffer.from('synthetic order backup'),encrypted=seal(data,key);assert.deepEqual(unseal(encrypted,key),data);assert.throws(()=>unseal(encrypted,Buffer.alloc(32,8)));encrypted[encrypted.length-1]^=1;assert.throws(()=>unseal(encrypted,key));});
test('customer email adapter is unavailable in sandbox, freezes sender and preserves message identity on retry',async()=>{assert.throws(()=>customerMailer(config,'re_synthetic'));const calls=[];
 const mailer=customerMailer({...config,sandbox:false,emailEnabled:true},'re_synthetic',async(url,options)=>{calls.push({url,options});return Response.json({id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'});});const id='fw-confirmation-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',message={to:'synthetic@example.invalid',replyTo:'info@angeltreeservice.org',subject:'Synthetic test',text:'No real sending.'};await mailer.send(message,id);await mailer.send(message,id);assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);assert.equal(JSON.parse(calls[0].options.body).from,'Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>');assert.ok(calls.every(c=>c.url==='https://api.resend.com/emails'));});
test('migration repeats safely, pins account/origin/policy and rejects existing foreign tables',async t=>{const f=await fixture(t);await migrate(f.db,config);await verifyDatabase(f.db,config);await assert.rejects(verifyDatabase(f.db,{...config,account:'acct_other'}));await f.db.query('CREATE TABLE foreign_data(id int)');await assert.rejects(migrate(f.db,config),/fresh_separate/);});
test('all six approved totals are persisted with free delivery, immutable terms and no eight-attempt limit',async t=>{const f=await fixture(t);for(const [quantity,stacking,total] of [['half',false,30000],['half',true,45000],['full',false,45000],['full',true,60000],['two',false,84000],['two',true,99000],['two',false,84000],['two',true,99000],['full',false,45000]]){const {row}=await f.begin({quantity,stacking,totalCents:1});assert.equal(row.quote.totalCents,total);assert.equal(row.quote.deliveryCents,0);assert.equal(row.terms.hash,policyHash);await assert.rejects(f.db.query('UPDATE fw_orders SET quote=$2 WHERE id=$1',[row.id,JSON.stringify({...row.quote,totalCents:1})]));}assert.equal(f.provider.items.size,9);});
test('acknowledgement, CSRF, malformed input and sandbox-only email restrictions are enforced',async t=>{const f=await fixture(t),s=await f.open();for(const change of [{termsAccepted:false},{csrf:token()},{email:'person@example.com'},{veteran:true},{quantity:'three'},{phone:'bad'}])await assert.rejects(f.checkout.start(s,{...input,csrf:s.csrf,...change}));assert.equal(f.provider.creates,0);assert.equal(orderInput({...input,email:'customer@example.com'},{sandbox:false}).contact.email,'customer@example.com');});
test('household use is an explicit boolean before any order, office quote or payment can open',async t=>{
 const f=await fixture(t),s=await f.open();
 for(const value of [undefined,null,false,'true','on',1,{}]){
  await assert.rejects(f.checkout.start(s,{...input,csrf:s.csrf,householdUseConfirmed:value}),e=>e.field==='termsAccepted'&&/business purchases/.test(e.message));
  await assert.rejects(f.checkout.owner('quote',{...input,residential:true,singleDiscountConfirmed:true,woodCents:79800,stackingCents:0,householdUseConfirmed:value}));
 }
 assert.equal(f.provider.creates,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM fw_orders')).rows[0].n,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM fw_quotes')).rows[0].n,0);
 await f.checkout.start(s,{...input,csrf:s.csrf});const row=await f.checkout.order((await f.checkout.session(s.cookie)).order_id);
 assert.equal(row.terms.householdUseConfirmed,true);assert.equal(row.terms.purchaseUse,'personal-household-only');assert.equal(row.terms.version,'firewood-20261028-household-v2');assert.equal(row.terms.hash,policyHash);
 await assert.rejects(f.db.query('UPDATE fw_orders SET terms=$2 WHERE id=$1',[row.id,JSON.stringify({...row.terms,householdUseConfirmed:false})]));
});
test('household confirmation and entered details survive return and replacement without another payment',async t=>{
 const f=await fixture(t),v=await f.begin();const state=await f.replacement().checkout.state(v.s);
 assert.equal(state.order.householdUseConfirmed,true);assert.equal(state.order.termsAccepted,true);assert.deepEqual(state.order.contact,v.row.contact);
 await f.replacement().checkout.start(v.s,{...input,csrf:v.s.csrf});assert.equal(f.provider.creates,1);
 await assert.rejects(f.checkout.start(v.s,{...input,csrf:v.s.csrf,householdUseConfirmed:false}));assert.equal(f.provider.creates,1);
 f.provider.items.get(v.row.id).paid=true;await f.ingest(f.provider.event(v.row.id));await f.worker.work();
 const messages=(await f.db.query('SELECT message FROM fw_outbox')).rows;assert.equal(messages.length,2);assert.ok(messages.every(x=>x.message.text.includes('Use confirmed: personal household use at the delivery address.')));
});
test('sandbox and future live templates disclose household-only ordering with one explicit acknowledgement',async()=>{
 for(const sandbox of [true,false]){const html=(await assets({...config,sandbox})).get('/firewood/checkout/').body;
  assert.match(html,/<p class="field-help" id="household-note">Online orders are for personal household use\./);
  assert.match(html,/<a href="tel:\+15403888715">Call \(540\) 388-8715 for business purchases\.<\/a>/);
  assert.match(html,/I confirm personal household use at the delivery address and have read the delivery and cancellation terms\./);
  assert.equal((html.match(/name="termsAccepted"/g)||[]).length,1);assert.match(html,/No tax is added to qualifying household orders\./);
  assert.match(html,/48 hours before the start/);assert.match(html,/inform Angel before purchase/);assert.match(html,/https:\/\/angeltreeservices\.org\/privacy\//);
 }
});
test('customer cookie hashes and cross-session isolation persist across replacement instances',async t=>{const f=await fixture(t),v=await f.begin(),b=await f.open();assert.equal(v.s.id,digest(v.s.cookie));assert.notEqual(v.s.id,v.s.cookie);assert.equal((await f.checkout.state(b)).order,null);await assert.rejects(f.checkout.confirmation(b));assert.equal((await f.replacement().checkout.state(v.s)).order.contact.notes,input.notes);f.advance(86400001);await assert.rejects(f.checkout.session(v.s.cookie));});
test('double tap and lost create response retain one frozen provider operation',async t=>{const f=await fixture(t),s=await f.open();let release;f.provider.wait=new Promise(r=>release=r);const first=f.checkout.start(s,{...input,csrf:s.csrf});for(let n=0;n<100&&!f.provider.creates;n++)await new Promise(r=>setTimeout(r,2));await assert.rejects(f.replacement().checkout.start(s,{...input,csrf:s.csrf}),e=>e.status===409);release();await first;f.provider.wait=null;
 const b=await f.open();f.provider.lost=true;await assert.rejects(f.checkout.start(b,{...input,csrf:b.csrf}));await f.replacement().checkout.start(b,{...input,csrf:b.csrf});assert.equal(f.provider.items.size,2);assert.equal((await f.checkout.state(b)).order.contact.notes,input.notes);});
test('uncertain creates are not retried outside the provider idempotency window',async t=>{const f=await fixture(t),s=await f.open();f.provider.lost=true;await assert.rejects(f.checkout.start(s,{...input,csrf:s.csrf}));f.advance(CREATE_MS+1);await assert.rejects(f.checkout.start({...s,expires:f.now()+86400000},{...input,csrf:s.csrf}));assert.equal(f.provider.items.size,1);});
test('changing an unpaid order expires the old session; a paid or processing session cannot be replaced',async t=>{const f=await fixture(t),v=await f.begin();await f.checkout.start(v.s,{...input,quantity:'half',csrf:v.s.csrf});assert.equal(f.provider.items.get(v.row.id).expired,true);const id=(await f.checkout.session(v.s.cookie)).order_id;f.provider.items.get(id).processing=true;assert.equal((await f.checkout.start(v.s,{...input,csrf:v.s.csrf})).next,'/firewood/checkout/result/');assert.equal(f.provider.items.size,2);});
test('return-page state never fulfills a paid session; durable worker confirmation works without a browser',async t=>{const f=await fixture(t),v=await f.begin();f.provider.items.get(v.row.id).paid=true;assert.equal((await f.checkout.state(v.s)).status,'pending');assert.equal((await f.db.query('SELECT * FROM fw_outbox')).rows.length,0);await f.worker.work();assert.equal((await f.checkout.state(v.s)).status,'paid');assert.equal((await f.db.query('SELECT * FROM fw_outbox')).rows.length,2);});
test('signed inbox is durable through provider outage, duplicates, worker replacement and delayed success',async t=>{const f=await fixture(t),v=await f.begin(),e=f.provider.event(v.row.id);await f.ingest(e);await f.ingest(e);assert.equal((await f.db.query('SELECT * FROM fw_events')).rows.length,1);f.provider.failState=true;assert.ok((await f.worker.work()).retry>0);f.provider.failState=false;f.advance(120000);await f.replacement().worker.work();assert.equal((await f.checkout.order(v.row.id)).payment_status,'pending');f.provider.items.get(v.row.id).paid=true;await f.ingest(f.provider.event(v.row.id,'checkout.session.async_payment_succeeded'));await f.replacement().worker.work();await f.ingest(e);await f.worker.work();assert.equal((await f.db.query('SELECT * FROM fw_outbox')).rows.length,2);});
test('bad signatures, live events, wrong policy and conflicting event identities cannot confirm orders',async t=>{const f=await fixture(t),v=await f.begin(),e=f.provider.event(v.row.id);await assert.rejects(f.worker.ingest(Buffer.from('{}'),'bad'));await assert.rejects(f.ingest({...e,livemode:true}));await f.ingest(e);await assert.rejects(f.ingest({...e,data:{object:{...e.data.object,id:'cs_test_other'}}}));f.provider.items.get(v.row.id).paid=true;await f.ingest({...e,id:'evt_'+token(),data:{object:{...e.data.object,metadata:{...e.data.object.metadata,policy_hash:'bad'}}}});await f.worker.work();assert.equal((await f.db.query("SELECT count(*)::int n FROM fw_outbox")).rows[0].n,2);assert.ok((await f.db.query("SELECT count(*)::int n FROM fw_events WHERE status='review'")).rows[0].n>0);});
test('owner pause stops new payments, while confirmed orders remain durable and recoverable',async t=>{const f=await fixture(t),v=await f.begin();await f.checkout.owner('pause',{paused:true});await assert.rejects(f.begin(),/paused/);f.provider.items.get(v.row.id).paid=true;await f.ingest(f.provider.event(v.row.id));await f.worker.work();assert.equal((await f.checkout.order(v.row.id)).payment_status,'paid');});
test('delivery scheduling uses future absolute windows, version checks and customer agreement for changes',async t=>{const f=await fixture(t),v=await f.paid();await f.checkout.owner('schedule',{id:v.row.id,version:v.row.version,start:f.now()+72*3600000,end:f.now()+74*3600000});await assert.rejects(f.checkout.owner('schedule',{id:v.row.id,version:v.row.version,start:f.now()+80*3600000,end:f.now()+82*3600000}),e=>e.status===409);const row=await f.checkout.order(v.row.id);await assert.rejects(f.checkout.owner('schedule',{id:row.id,version:row.version,start:f.now()+80*3600000,end:f.now()+82*3600000}));});
test('approved full-refund cases and exact 48-hour boundary remain independent from late cancellation',async t=>{const f=await fixture(t);for(const reason of ['customer-cancels','angel-cancels','cannot-fulfill','declined-angel-reschedule']){const v=await f.paid();assert.equal((await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason})).refundPending,true);}const row={payment_status:'paid',fulfillment:'scheduled',delivery_start:f.now()+48*3600000};assert.equal(refundEligibility(row,'customer-cancels',f.now()).eligible,true);assert.equal(refundEligibility(row,'customer-cancels',f.now()+1).eligible,false);assert.equal(refundEligibility(row,'angel-cancels',f.now()+1).eligible,true);});
test('late customer cancellation is non-refundable; no delivery or duplicate refund occurs',async t=>{const f=await fixture(t),v=await f.paid();await f.checkout.owner('schedule',{id:v.row.id,version:v.row.version,start:f.now()+3600000,end:f.now()+7200000});let row=await f.checkout.order(v.row.id);assert.equal((await f.checkout.owner('cancel',{id:row.id,version:row.version,reason:'customer-cancels'})).refundPending,false);row=await f.checkout.order(row.id);await assert.rejects(f.checkout.owner('delivered',{id:row.id,version:row.version}));await f.worker.work();assert.equal(f.provider.refunds.size,0);});
test('refund response loss recovers one immutable refund without issuing another payment',async t=>{const f=await fixture(t),v=await f.paid();await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});f.provider.refundLost=true;assert.ok((await f.worker.work()).retry>0);f.advance(120000);await f.replacement().worker.work();assert.equal(f.provider.refunds.size,1);assert.equal((await f.checkout.order(v.row.id)).payment_status,'refunded');assert.equal((await f.checkout.state(v.s)).status,'refunded');});
test('old uncertain refunds require review instead of replay after idempotency retention',async t=>{const f=await fixture(t),v=await f.paid();await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});f.provider.refundLost=true;await f.worker.work();f.advance(CREATE_MS+1);await f.worker.work();assert.equal((await f.db.query('SELECT status FROM fw_refunds')).rows[0].status,'review');assert.equal(f.provider.refunds.size,1);});
test('email acceptance uncertainty uses one durable message identity and no duplicate confirmations',async t=>{const f=await fixture(t),v=await f.begin(),accepted=new Map();let fail=true;const mailer={async send(message,id){if(!accepted.has(id))accepted.set(id,message);if(fail){fail=false;throw Error('lost_acceptance');}return 'synthetic-message-'+id;}};const app=f.replacement(mailer);f.provider.items.get(v.row.id).paid=true;await f.ingest(f.provider.event(v.row.id),app.worker);await app.worker.work();f.advance(120000);await f.replacement(mailer).worker.work();await f.ingest(f.provider.event(v.row.id));await f.replacement(mailer).worker.work();assert.equal(accepted.size,2);assert.equal((await f.db.query("SELECT count(*)::int n FROM fw_outbox WHERE status='accepted'")).rows[0].n,2);});
test('older uncertain email is quarantined rather than resent outside deduplication retention',async t=>{const f=await fixture(t),v=await f.begin(),mailer={async send(){throw Error('uncertain_send');}};f.provider.items.get(v.row.id).paid=true;await f.ingest(f.provider.event(v.row.id));await f.replacement(mailer).worker.work();f.advance(CREATE_MS+1);await f.replacement(mailer).worker.work();assert.equal((await f.db.query("SELECT count(*)::int n FROM fw_outbox WHERE status='review'")).rows[0].n,2);});
test('refund and dispute events reconcile current provider state even when delivered out of order',async t=>{const f=await fixture(t),v=await f.begin(),p=f.provider.items.get(v.row.id);p.paid=true;p.refundCents=v.row.quote.totalCents;const refund=f.provider.event(v.row.id,'charge.refunded');await f.ingest(refund);await f.worker.work();f.advance(120000);await f.worker.work();assert.equal((await f.checkout.order(v.row.id)).payment_status,'refunded');const b=await f.paid();f.provider.items.get(b.row.id).disputed=true;await f.ingest(f.provider.event(b.row.id,'charge.dispute.created'));await f.worker.work();assert.equal((await f.checkout.order(b.row.id)).disputed,true);f.provider.items.get(b.row.id).disputed=false;await f.ingest(f.provider.event(b.row.id,'charge.dispute.closed'));await f.worker.work();assert.equal((await f.checkout.order(b.row.id)).disputed,false);});
test('office-approved price is bound before payment to email, size, stacking and single use',async t=>{const f=await fixture(t);const q=await f.checkout.owner('quote',{...input,quantity:'half',residential:true,singleDiscountConfirmed:true,woodCents:28500,stackingCents:0});const s=await f.open();await f.checkout.start(s,{...input,quantity:'half',assistedQuote:q.quoteToken,csrf:s.csrf});await f.checkout.start(s,{...input,quantity:'half',assistedQuote:q.quoteToken,csrf:s.csrf});const row=await f.checkout.order((await f.checkout.session(s.cookie)).order_id);assert.equal(row.quote.totalCents,28500);assert.equal(f.provider.items.size,1);const b=await f.open();await assert.rejects(f.checkout.start(b,{...input,quantity:'half',assistedQuote:q.quoteToken,csrf:b.csrf}));});
test('cancel navigation retains the office quote even without a quote token in the return URL',async t=>{const f=await fixture(t);const q=await f.checkout.owner('quote',{...input,quantity:'half',residential:true,singleDiscountConfirmed:true,woodCents:28500,stackingCents:0});const s=await f.open();await f.checkout.start(s,{...input,quantity:'half',assistedQuote:q.quoteToken,csrf:s.csrf});assert.equal((await f.checkout.state(s)).assistedQuote.totalCents,28500);await f.checkout.start(s,{...input,quantity:'half',csrf:s.csrf});assert.equal(f.provider.items.size,1);});
test('provider validates dedicated account before create; no API accepts caller price overrides',async()=>{const calls=[],p=stripeProvider(config,async(url,options)=>{calls.push({url:String(url),method:options.method});return Response.json({id:'acct_other'});});await assert.rejects(p.create({id:randomUUID(),quote:{totalCents:84000},terms:{hash:policyHash}}),/account_mismatch/);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');});
test('Stripe request freezes six prices, purpose, terms, free delivery and canonical returns without a payment-method allowlist',async()=>{
 for(const [quantity,stacking,total] of [['half',false,30000],['half',true,45000],['full',false,45000],['full',true,60000],['two',false,84000],['two',true,99000]]){
  const row={id:randomUUID(),...orderInput({...input,quantity,stacking},config)},calls=[];
  const provider=stripeProvider(config,async(url,options)=>{if(String(url).endsWith('/v1/account'))return Response.json({id:SANDBOX_ACCOUNT});const body=new URLSearchParams(options.body);calls.push(body);return Response.json({id:'cs_test_synthetic',livemode:false,amount_total:total,currency:'usd',client_reference_id:row.id,metadata:{purpose,order:row.id,policy_hash:policyHash,environment:'sandbox'},url:'https://checkout.stripe.com/c/pay/cs_test_synthetic'});});
  await provider.create(row);const p=calls[0];assert.equal(Number(p.get('line_items[0][price_data][unit_amount]'))+(stacking?Number(p.get('line_items[1][price_data][unit_amount]')):0),total);assert.equal(p.get('success_url'),config.origin+'/firewood/checkout/result/');assert.equal(p.get('automatic_tax[enabled]'),'false');assert.equal(p.get('allow_promotion_codes'),'false');assert.ok(![...p.keys()].some(k=>k.startsWith('payment_method_types')));assert.match(p.get('integration_identifier'),/^firewood-candidate-[a-z]{8}$/u);
 }
});
test('claimed sandbox refund harness requires the restricted identity key and cannot operate in live mode',async()=>{assert.throws(()=>stripeProvider({...config,key:'rkcs_test_synthetic'}));assert.throws(()=>stripeProvider({...config,sandbox:false,key:'rkcs_test_synthetic'},fetch,{sandboxIdentityKey:'rk_test_synthetic'}));
 const p=stripeProvider({...config,key:'rkcs_test_synthetic'},async()=>Response.json({id:SANDBOX_ACCOUNT}),{sandboxIdentityKey:'rk_test_synthetic'});await p.verifyAccount();});

test('reset cannot detach the customer cookie while a payment start holds its lease',async t=>{
 const f=await fixture(t),s=await f.open();let release;f.provider.wait=new Promise(r=>release=r);
 const opening=f.checkout.start(s,{...input,csrf:s.csrf});
 try{for(let i=0;i<100&&!f.provider.creates;i++)await new Promise(r=>setTimeout(r,2));
   await assert.rejects(f.checkout.reset(s,s.csrf),e=>e.status===409);
 }finally{release();await opening;f.provider.wait=null;}
 assert.ok((await f.checkout.session(s.cookie)).order_id);assert.equal(f.provider.items.size,1);
});
test('reset rechecks the current order instead of trusting a stale empty session snapshot',async t=>{
 const f=await fixture(t),s=await f.open();await f.checkout.start(s,{...input,csrf:s.csrf});
 await assert.rejects(f.checkout.reset(s,s.csrf),e=>e.status===409);assert.ok((await f.checkout.session(s.cookie)).order_id);
});
test('a known pending refund is polled after restart and after the creation retry window without another refund request',async t=>{
 const f=await fixture(t),v=await f.paid();let creates=0,reads=0,status='pending';
 f.provider.refund=async(row,job)=>{creates++;return {id:'re_pendingrefund',status};};
 f.provider.refundState=async()=>{reads++;return {id:'re_pendingrefund',status};};
 await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});await f.worker.work();
 let job=(await f.db.query('SELECT * FROM fw_refunds')).rows[0];assert.equal(job.status,'pending');assert.equal(job.provider_id,'re_pendingrefund');
 f.advance(CREATE_MS+1);status='succeeded';await f.replacement().worker.work();job=(await f.db.query('SELECT * FROM fw_refunds')).rows[0];
 assert.equal(job.status,'done');assert.equal(creates,1);assert.equal(reads,1);assert.equal((await f.checkout.order(v.row.id)).payment_status,'refunded');
});
test('explicitly held live email remains pending and prevents new checkout creation',async t=>{
 const f=await fixture(t),v=await f.begin(),settings={...config,sandbox:false,emailEnabled:false};
 const checkout=createCheckout({db:f.db,config:settings,provider:f.provider,now:f.now}),worker=createWorker(checkout);
 await worker.confirm(v.row,{paid:true,intent:'pi_syntheticheldmail'});await worker.work();
 assert.equal((await f.db.query("SELECT count(*)::int n FROM fw_outbox WHERE status='pending'")).rows[0].n,2);
 assert.ok((await worker.status()).alerts.includes('email:disabled'));
 const s=await checkout.session(null,true);await assert.rejects(checkout.start(s,{...input,csrf:s.csrf}),e=>e.status===503);
});
test('a worker with a fresh active heartbeat is healthy until its progress becomes stale',async t=>{
 const f=await fixture(t),v=await f.begin();let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r),read=f.provider.state.bind(f.provider);
 f.provider.state=async row=>{entered();await gate;return read(row);};await f.checkout.state(v.s);const running=f.worker.work();
 try{await ready;assert.ok(!(await f.worker.status()).alerts.includes('worker:stale'));}finally{release();await running;}
 f.advance(120001);assert.ok((await f.worker.status()).alerts.includes('worker:stale'));
});
test('concurrent dispute events cannot overwrite a later provider state with an older snapshot',async t=>{
 const f=await fixture(t),v=await f.paid();f.provider.items.get(v.row.id).disputed=true;
 await f.ingest(f.provider.event(v.row.id,'charge.dispute.created','evt_disputeaaa'));
 await f.ingest(f.provider.event(v.row.id,'charge.dispute.closed','evt_disputebbb'));
 let entered,release,first=true;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r),read=f.provider.lifecycle.bind(f.provider);
 f.provider.lifecycle=async(e,row)=>{const proof=await read(e,row);if(first){first=false;entered();await gate;}return proof;};
 const a=f.worker.work({limit:1});await ready;f.provider.items.get(v.row.id).disputed=false;const b=f.replacement().worker.work({limit:1});
 await Promise.race([b,new Promise(r=>setTimeout(r,250))]);release();await Promise.all([a,b]);
 assert.equal((await f.checkout.order(v.row.id)).disputed,false);
});

test('failed, canceled and action-required refunds stay visible for review without another refund request',async t=>{
 for(const status of ['failed','canceled','requires_action']){const f=await fixture(t),v=await f.paid();let creates=0;
   f.provider.refund=async()=>{creates++;return {id:'re_terminal',status};};
   await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});await f.worker.work();
   assert.equal((await f.checkout.state(v.s)).receipt.refundStatus,'review');
   assert.equal((await f.checkout.order(v.row.id)).payment_status,'paid');
   f.advance(120000);await f.replacement().worker.work();assert.equal(creates,1);
 }
});
test('refund events without object livemode detect later failure and accept duplicate delivery after reconciliation',async t=>{
 const f=await fixture(t),v=await f.paid();let status='succeeded',creates=0;
 f.provider.refund=async(row,job)=>{creates++;return {id:'re_laterfailure',status,operation:job.id};};
 f.provider.refundState=async()=>({id:'re_laterfailure',status,charge:'ch_bound'});
 await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});await f.worker.work();
 assert.equal((await f.checkout.order(v.row.id)).payment_status,'refunded');status='failed';
 const event={id:'evt_laterfailure',type:'refund.failed',livemode:false,data:{object:{id:'re_laterfailure',payment_intent:v.row.payment_intent}}};
 await f.ingest(event);await f.replacement().worker.work();await f.ingest(event);
 assert.equal((await f.checkout.state(v.s)).receipt.refundStatus,'review');
 assert.equal((await f.checkout.order(v.row.id)).refund_cents,v.row.quote.totalCents);
 assert.equal((await f.worker.status()).alerts.includes('fw_refunds:owner-review'),true);assert.equal(creates,1);
});
test('external pending and failed refunds are linked to the receipt and duplicate lifecycle delivery remains harmless',async t=>{
 const f=await fixture(t),v=await f.paid();let status='pending';
 f.provider.refundState=async()=>({id:'re_external',status,charge:'ch_external'});
 const event={id:'evt_external',type:'refund.created',livemode:false,data:{object:{id:'re_external',payment_intent:v.row.payment_intent}}};
 await f.ingest(event);await f.worker.work();await f.ingest(event);assert.equal((await f.checkout.state(v.s)).receipt.refundStatus,'pending');
 status='failed';f.advance(120000);await f.replacement().worker.work();assert.equal((await f.checkout.state(v.s)).receipt.refundStatus,'review');
 assert.equal(f.provider.refunds.size,0);
});
test('a newer refund webhook fences an older worker completion from clearing owner review',async t=>{
 const f=await fixture(t),v=await f.paid();let status='succeeded';
 f.provider.refund=async()=>({id:'re_fenced',status});f.provider.refundState=async()=>({id:'re_fenced',status,charge:'ch_fenced'});
 await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});
 let entered,release,first=true;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r),query=f.db.query.bind(f.db);
 f.db.query=async(sql,args)=>{if(first&&sql.startsWith('UPDATE fw_refunds SET status=$3')){first=false;entered();await gate;}return query(sql,args);};
 const running=f.worker.work();await ready;
 try{status='failed';await f.ingest({id:'evt_fenced',type:'refund.failed',livemode:false,data:{object:{id:'re_fenced',payment_intent:v.row.payment_intent}}});await f.replacement().worker.work();}
 finally{release();await running;}
 assert.equal((await f.checkout.state(v.s)).receipt.refundStatus,'review');
});
test('known refund status reads can retry a temporary outage after the creation window',async t=>{
 const f=await fixture(t),v=await f.paid();let reads=0,creates=0;
 f.provider.refund=async()=>{creates++;return {id:'re_readretry',status:'pending'};};
 f.provider.refundState=async()=>{reads++;if(reads===1)throw Error('temporary_outage');return {id:'re_readretry',status:'succeeded'};};
 await f.checkout.owner('cancel',{id:v.row.id,version:v.row.version,reason:'angel-cancels'});await f.worker.work();
 f.advance(CREATE_MS+1);await f.worker.work();assert.equal((await f.db.query('SELECT status FROM fw_refunds')).rows[0].status,'pending');
 f.advance(120000);await f.replacement().worker.work();assert.equal((await f.db.query('SELECT status FROM fw_refunds')).rows[0].status,'done');assert.equal(creates,1);
});
test('provider refund reads bind identity, amount and metadata; charge totals count only succeeded refunds',async()=>{
 const row={id:randomUUID(),payment_intent:'pi_bound',quote:{totalCents:84000},terms:{hash:policyHash}};
 const job={id:randomUUID(),provider_id:'re_bound',amount:84000};
 const meta={purpose,order:row.id,policy_hash:policyHash,environment:'sandbox',operation:job.id};
 let refund={id:'re_bound',amount:84000,currency:'usd',payment_intent:'pi_bound',charge:'ch_bound',status:'pending',metadata:meta};
 let list=[];const calls=[];
 const provider=stripeProvider(config,async url=>{const u=new URL(url);calls.push(u.pathname);
   if(u.pathname==='/v1/account')return Response.json({id:SANDBOX_ACCOUNT});
   if(u.pathname==='/v1/refunds/re_bound')return Response.json(refund);
   if(u.pathname==='/v1/charges/ch_bound')return Response.json({id:'ch_bound',livemode:false,payment_intent:'pi_bound',currency:'usd',amount:84000,amount_refunded:84000});
   if(u.pathname==='/v1/refunds')return Response.json({object:'list',data:list,has_more:false,url:'/v1/refunds'});
   throw Error('unexpected_provider_request');
 });
 assert.equal((await provider.refundState(row,job)).status,'pending');
 const good=structuredClone(refund);for(const bad of [{payment_intent:'pi_wrong'},{amount:1},{currency:'eur'},{id:'re_wrong'},{metadata:{...meta,order:randomUUID()}},{status:'unknown'}]){refund={...good,...bad};await assert.rejects(provider.refundState(row,job),/binding_mismatch/);}refund=good;
 const event={type:'charge.refunded',data:{object:{id:'ch_bound'}}};list=[refund];let proof=await provider.lifecycle(event,row);assert.equal(proof.refundCents,0);assert.equal(proof.refundPending,true);
 list=[{...refund,status:'failed'}];proof=await provider.lifecycle(event,row);assert.equal(proof.refundCents,0);assert.equal(proof.refundNeedsReview,true);
 list=[{...refund,status:'succeeded'}];proof=await provider.lifecycle(event,row);assert.equal(proof.refundCents,84000);assert.ok(calls.every(path=>path.startsWith('/v1/')));
});

async function certificates(t){const dir=await mkdtemp(join(tmpdir(),'fw-candidate-tls-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const run=args=>execFileSync('/usr/bin/openssl',args,{cwd:dir,stdio:'ignore'});run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=Firewood candidate test CA']);
 const result={ca:await readFile(join(dir,'ca.pem'))};
 for(const name of ['backend','relay','owner','edge']){run(['req','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name]);
   const {writeFile}=await import('node:fs/promises');await writeFile(join(dir,'ext'),name==='backend'?'subjectAltName=DNS:firewood-candidate-backend.invalid\nextendedKeyUsage=serverAuth':name==='edge'?'subjectAltName=DNS:firewood-candidate.invalid\nextendedKeyUsage=serverAuth':'extendedKeyUsage=clientAuth');
   run(['x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','2','-extfile','ext']);result[name]={key:await readFile(join(dir,name+'.key')),cert:await readFile(join(dir,name+'.pem'))};result[name].fingerprint=new X509Certificate(result[name].cert).fingerprint256;}
 return result;
}
function httpsCall(port,{path=BASE,method='GET',data,host='firewood-candidate.invalid',origin,ca,key,cert,servername='firewood-candidate.invalid',cookie,extra={}}={}){return new Promise((yes,no)=>{const payload=data===undefined?null:typeof data==='string'?data:JSON.stringify(data);const r=request({hostname:'127.0.0.1',port,path,method,ca,key,cert,servername,rejectUnauthorized:true,headers:{Host:host,...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(payload?{'Content-Type':typeof data==='string'?'application/x-www-form-urlencoded':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),...extra}},response=>{const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>yes({status:response.statusCode,headers:response.headers,text:Buffer.concat(chunks).toString()}));});r.on('error',no);r.end(payload);});}
test('mTLS hop rejects missing/wrong peers; relay hides owner routes, preserves secure cookies and validates origin',async t=>{const f=await fixture(t),c=await certificates(t),backend=await backendServer({...f,config},{key:c.backend.key,cert:c.backend.cert,ca:c.ca,relayFingerprint:c.relay.fingerprint,ownerFingerprint:c.owner.fingerprint});const bp=await backend.listen();t.after(()=>backend.close());const relay=relayServer(config,{key:c.edge.key,cert:c.edge.cert,ca:c.ca,clientKey:c.relay.key,clientCert:c.relay.cert,backendFingerprint:c.backend.fingerprint},{backendPort:bp});const rp=await relay.listen();t.after(()=>relay.close());
 await assert.rejects(httpsCall(bp,{ca:c.ca,servername:'firewood-candidate-backend.invalid'}));
 const login=await httpsCall(rp,{ca:c.ca,path:BASE+'access',method:'POST',data:'code='+config.accessToken,origin:config.origin});assert.equal(login.status,303);const cookie=login.headers['set-cookie'][0].split(';')[0];assert.match(login.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Lax/);assert.doesNotMatch(login.headers['set-cookie'][0],/Domain=/);
 const state=await httpsCall(rp,{ca:c.ca,path:BASE+'api/state',cookie});assert.equal(state.status,200);assert.match(state.headers['set-cookie'][0],new RegExp(orderCookie));assert.equal(JSON.parse(state.text).order,null);
 for(let i=0;i<5;i++)assert.equal((await httpsCall(rp,{ca:c.ca,path:'/health'})).status,200);
 assert.equal((await httpsCall(rp,{ca:c.ca,path:'/owner/status',method:'POST',data:{}})).status,403);
 assert.equal((await httpsCall(bp,{ca:c.ca,key:c.relay.key,cert:c.relay.cert,servername:'firewood-candidate-backend.invalid',path:'/owner/status',method:'POST',data:{}})).status,404);
 assert.equal((await httpsCall(bp,{ca:c.ca,key:c.owner.key,cert:c.owner.cert,servername:'firewood-candidate-backend.invalid',path:'/owner/status',method:'POST',data:{}})).status,200);
 assert.equal((await httpsCall(rp,{ca:c.ca,path:BASE+'api/start',cookie,method:'POST',data:{},origin:'https://evil.invalid'})).status,403);
 assert.equal((await httpsCall(rp,{ca:c.ca,host:'evil.invalid'})).status,403);
 const html=await httpsCall(rp,{ca:c.ca,cookie});assert.equal(html.status,200);assert.match(html.text,/48 hours before the start/);assert.match(html.text,/termsAccepted/);assert.doesNotMatch(html.text,/name="veteran"/);assert.match(html.headers['x-robots-tag'],/noindex/);
});
