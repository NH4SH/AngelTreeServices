import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {makePrepareFixture,canonicalHandoff,handoffDigest,signHandoff,PREPARE_PATH,RENEW_PATH,HANDOFF_SOURCE,SANDBOX_ACCOUNT} from './contract.mjs';
import {handoffClient,handoffTestScope,prepareOrderBinding} from './client.mjs';
import {installHandoffStore,handoffStore} from './store.mjs';
import {handoffAssets} from './assets.mjs';
import {validateSettlement} from './settlement.mjs';
import {installOrderStore,handoffOrders} from './orders.mjs';
import {testOrderServer} from './server.mjs';
import {nativeTestConfiguration} from './native.mjs';
const scope={testOnly:true,origin:'http://127.0.0.1:3228',portalOrigin:'http://127.0.0.1:3228',account:SANDBOX_ACCOUNT,source:HANDOFF_SOURCE,keyId:'synthetic-v2',secret:'a'.repeat(64)};
function receipt(request,extra={}){return {...Object.fromEntries(Object.entries(request).filter(([k])=>k!=='order')),invoice_id:randomUUID(),invoice_number:'TEST-FW2-'+request.order_id,
  principal_cents:request.order.principal_cents,preparation_status:'prepared',replayed:false,capability_version:1,receipt_authority:'crm',order_confirmation_authority:'website',
  payment_retry_required:false,delivery_completed:false,payment_execution_ready:false,execution_blockers:['shared_collector_review_pending'],
  portal_url:scope.portalOrigin+'/portal/invoice/'+'b'.repeat(48),expires_at:new Date(Date.now()+900000).toISOString(),...extra};}
async function fixture(t){const{NetlifyDB}=await import('@netlify/database-dev');const db=new NetlifyDB({logger:()=>{}});await db.start();t.after(()=>db.stop());await installHandoffStore(db,scope);return db;}

test('sandbox scope rejects live, generic, hosted and credential-bearing destinations',()=>{
  for(const change of [{testOnly:false},{account:'acct_live_wrong'},{source:'old_source'},{origin:'https://admin.angeltreeservices.org'},{portalOrigin:'http://localhost:3228'},{origin:'http://user:password@127.0.0.1:3228'},{secret:'short'}])assert.throws(()=>handoffTestScope({...scope,...change}));
});
test('native launch wrapper refuses live mode, sending, alternate ports and unrelated database identities',()=>{
  const value={sandbox:true,live:false,emailSending:false,listenPort:3227,browserOrigin:'http://127.0.0.1:55849',handoff:scope,
    database:{sandbox:true,production:false,database:'fw_invoice_v2_qa_20261029',role:'fw_invoice_v2_web_20261029',schema:'fw_website_v2',databaseUrl:'postgresql://fw_invoice_v2_web_20261029:'+('c'.repeat(64))+'@127.0.0.1:56388/fw_invoice_v2_qa_20261029'}};
  assert.equal(nativeTestConfiguration(value).live,false);
  for(const change of[{live:true},{emailSending:true},{listenPort:3000},{browserOrigin:'https://checkout.angeltreeservices.org'},{database:{...value.database,schema:'public'}},{database:{...value.database,databaseUrl:value.database.databaseUrl.replace('56388','56396')}}])assert.throws(()=>nativeTestConfiguration({...value,...change}));
});
test('normalizes a stored Website order into the canonical v2 invoice request without a payment attempt',()=>{
  const f=makePrepareFixture(),o=f.order,q={quantity:o.quantity,stacking:o.stacking,woodCents:o.wood_cents,deliveryCents:0,stackingCents:o.stacking_cents,totalCents:o.principal_cents,currency:'usd'};
  const request=prepareOrderBinding({id:f.order_id,number:f.reference,quote:q,contact:o.contact,terms:o.terms,created_at:o.accepted_at_ms});
  assert.equal(canonicalHandoff(request),canonicalHandoff(f));assert.equal('attempt_id' in request,false);assert.equal('session_id' in request,false);
  assert.throws(()=>prepareOrderBinding({id:f.order_id,number:f.reference,quote:q,contact:{...o.contact,email:'real@example.com'},terms:o.terms,created_at:o.accepted_at_ms}));
});
test('signs bounded exact-path requests and rejects malformed, redirected or foreign-invoice preparation',async()=>{
  const f=makePrepareFixture(),expected=receipt(f);let seen;
  const client=handoffClient(scope,{fetcher:async(url,init)=>{seen={url,init};return Response.json(expected);},now:()=>1793289600000});
  assert.deepEqual(await client.prepare(f),expected);assert.equal(seen.url,scope.origin+PREPARE_PATH);assert.equal(seen.init.redirect,'error');assert.equal(seen.init.headers['X-ATS-Signature'],signHandoff(seen.init.body,seen.init.headers['X-ATS-Timestamp'],scope.secret,PREPARE_PATH));
  for(const value of [{...expected,principal_cents:1},{...expected,account_id:'acct_wrong'},{...expected,portal_url:'https://foreign.invalid/portal/invoice/'+'x'.repeat(48)}])await assert.rejects(handoffClient(scope,{fetcher:async()=>Response.json(value)}).prepare(f));
  await assert.rejects(handoffClient(scope,{fetcher:async()=>new Response('x'.repeat(65537))}).prepare(f));
});
test('renewal cannot move an invoice or reduce its capability version',async()=>{
  const f=makePrepareFixture(),old=receipt(f,{capability_version:2});let path;
  const client=handoffClient(scope,{fetcher:async(url)=>{path=url;return Response.json({...old,capability_version:3});}});
  assert.equal((await client.renew(f,old)).invoice_id,old.invoice_id);assert.equal(path,scope.origin+RENEW_PATH);
  for(const change of [{invoice_id:randomUUID()},{capability_version:1}])await assert.rejects(handoffClient(scope,{fetcher:async()=>Response.json({...old,...change})}).renew(f,old));
  await assert.rejects(client.status(f,old),/settlement_unconfirmed/);
});
test('durable prepare survives a lost reply and a worker restart without minting another invoice',async t=>{
  const db=await fixture(t),f=makePrepareFixture();let at=Date.now(),calls=0,lost=true,mapping;
  const fetcher=async()=>{calls++;mapping??=receipt(f);if(lost){lost=false;throw Error('lost_after_commit');}return Response.json({...mapping,replayed:calls>1});};
  let store=handoffStore({db,client:handoffClient(scope,{fetcher}),now:()=>at});await store.enqueue(f);
  assert.deepEqual(await store.work(),{prepared:0,pending:1,review:0});assert.equal((await store.saved(f.order_id)).invoice_id,null);
  at+=6000;store=handoffStore({db,client:handoffClient(scope,{fetcher}),now:()=>at});assert.deepEqual(await store.work(),{prepared:1,pending:0,review:0});
  const saved=await store.saved(f.order_id);assert.equal(saved.invoice_id,mapping.invoice_id);assert.equal(saved.receipt.replayed,true);assert.equal(calls,2);await assert.rejects(store.paymentLink(f.order_id),/payment_execution_not_ready/);
  await store.work();assert.equal(calls,2);
});
test('concurrent identical preparations stay singular; changed snapshots and SQL rewrites are refused',async t=>{
  const db=await fixture(t),f=makePrepareFixture(),client=handoffClient(scope,{fetcher:async()=>Response.json(receipt(f))}),store=handoffStore({db,client});
  await Promise.all([store.enqueue(f),store.enqueue(f)]);assert.equal((await db.query('SELECT count(*)::int n FROM fwv2_prepare')).rows[0].n,1);
  const changed=structuredClone(f);changed.order.contact.notes='Different immutable details';changed.snapshot_hash=handoffDigest(changed.order);await assert.rejects(store.enqueue(changed),/immutable_handoff_preparation/);
  await assert.rejects(db.query('UPDATE fwv2_prepare SET request=$2 WHERE order_id=$1',[f.order_id,JSON.stringify(changed)]),/immutable_handoff_preparation/);
  await store.work();await assert.rejects(db.query('UPDATE fwv2_prepare SET invoice_id=$2 WHERE order_id=$1',[f.order_id,randomUUID()]),/immutable_handoff_preparation/);
});
test('authorization failure holds for review; unconfirmed success stays retryable and cannot mark paid',async t=>{
  const db=await fixture(t),f=makePrepareFixture();let store=handoffStore({db,client:handoffClient(scope,{fetcher:async()=>new Response('{}',{status:403})})});await store.enqueue(f);assert.deepEqual(await store.work(),{prepared:0,pending:0,review:1});
  const other=makePrepareFixture({orderId:randomUUID()});store=handoffStore({db,client:handoffClient(scope,{fetcher:async()=>Response.json({ok:true,paid:true})})});await store.enqueue(other);assert.deepEqual(await store.work(),{prepared:0,pending:1,review:0});assert.equal((await store.saved(other.order_id)).invoice_id,null);
});
test('v1 namespaces cannot be retrofitted and endpoint identity cannot change on reinstall',async t=>{
  const db=await fixture(t);await assert.rejects(installHandoffStore(db,{...scope,keyId:'other-key'}),/handoff_identity_conflict/);
  await db.query('CREATE TABLE fw_orders(id uuid)');await assert.rejects(installHandoffStore(db,scope),/fresh_handoff_namespace_required/);
});
test('v2 preview exposes choices and separate fee review while refusing production rendering',async()=>{
  const files=await handoffAssets({sandbox:true}),html=files.get('/firewood/checkout/').body;
  assert.ok(html.includes('Payment options')&&html.includes('Order subtotal')&&html.includes('3% merchant surcharge'));
  assert.ok(html.includes('name="termsAccepted"')&&html.includes('name="email"')&&html.includes('Delivery and cancellations'));
  assert.ok(files.get('/firewood/checkout/checkout.js').body.includes('Continue to payment options'));await assert.rejects(handoffAssets({sandbox:false}),/handoff_preview_only/);
});

function originalProof(principal,fee=0){return {paid:true,observed_at:new Date().toISOString(),principal_cents:principal,surcharge_collected_cents:fee,gross_collected_cents:principal+fee,payment_ids:[randomUUID()]};}
function settlement(f,prepared,extra={}){
  return {...Object.fromEntries(Object.entries(f).filter(([k])=>k!=='order')),invoice_id:prepared.invoice_id,observation_revision:1,
    payment_state:'unpaid',totals:{invoice_principal_cents:f.order.principal_cents,paid_principal_cents:0,surcharge_collected_cents:0,gross_collected_cents:0,
      refunded_principal_cents:0,refunded_surcharge_cents:0,gross_refunded_cents:0,balance_due_cents:f.order.principal_cents},
    payment_preference:null,payment_pending:false,review_required:false,original_paid_evidence:null,payment_retry_required:false,
    receipt_authority:'crm',order_confirmation_authority:'website',delivery_completed:false,fulfillment_ready:false,verification_source:'crm_ledger',...extra};
}
test('bank processing and offline preferences cannot authorize fulfillment; malformed totals fail closed',()=>{
  const f=makePrepareFixture(),p=receipt(f),unpaid=settlement(f,p);
  assert.equal(validateSettlement(unpaid,f,p).fulfillment_ready,false);
  for(const change of [{payment_state:'processing',payment_pending:true,payment_preference:'ach'},{payment_state:'offline_pending',payment_preference:'check_mail'}])assert.equal(validateSettlement({...unpaid,...change},f,p).fulfillment_ready,false);
  for(const change of [{fulfillment_ready:true},{payment_state:'paid'},{totals:{...unpaid.totals,balance_due_cents:0}},{totals:{...unpaid.totals,gross_collected_cents:-1}},{verification_source:'unverified'}])assert.throws(()=>validateSettlement({...unpaid,...change},f,p));
});
test('paid credit fee and refunds preserve separate principal/gross and immutable original evidence',()=>{
  const f=makePrepareFixture(),p=receipt(f),v=settlement(f,p),principal=f.order.principal_cents,fee=Math.round(principal*.03);
  const paid={...v,payment_state:'paid',payment_preference:'card',fulfillment_ready:true,original_paid_evidence:originalProof(principal,fee),
    totals:{...v.totals,paid_principal_cents:principal,balance_due_cents:0,surcharge_collected_cents:fee,gross_collected_cents:principal+fee}};
  assert.equal(validateSettlement(paid,f,p).totals.gross_collected_cents,principal+fee);
  for(const change of [{paid:false},{payment_ids:[]},{gross_collected_cents:principal+fee+1},{observed_at:'invalid'}])assert.throws(()=>validateSettlement({...paid,original_paid_evidence:{...paid.original_paid_evidence,...change}},f,p));
  const refunded={...paid,observation_revision:2,payment_state:'refunded',fulfillment_ready:false,review_required:true,
    totals:{...paid.totals,paid_principal_cents:0,balance_due_cents:principal,refunded_principal_cents:principal,refunded_surcharge_cents:fee,gross_refunded_cents:principal+fee}};
  assert.equal(validateSettlement(refunded,f,p,paid).totals.gross_refunded_cents,principal+fee);
  assert.throws(()=>validateSettlement({...refunded,original_paid_evidence:null},f,p,paid));assert.throws(()=>validateSettlement({...refunded,observation_revision:1},f,p,paid));
});
test('out-of-order observations and SQL mutations cannot replace paid evidence or append-only history',async t=>{
  const db=await fixture(t),f=makePrepareFixture(),prepared=receipt(f);let version=1;
  const unpaid=settlement(f,prepared),principal=f.order.principal_cents;
  const paid={...unpaid,observation_revision:2,payment_state:'paid',payment_preference:'ach',fulfillment_ready:true,original_paid_evidence:originalProof(principal),totals:{...unpaid.totals,paid_principal_cents:principal,balance_due_cents:0,gross_collected_cents:principal}};
  const client=handoffClient(scope,{fetcher:async url=>Response.json(url.endsWith(PREPARE_PATH)?prepared:version===1?unpaid:paid)}),store=handoffStore({db,client});
  await store.enqueue(f);await store.work();assert.equal((await store.observe(f.order_id)).payment_state,'unpaid');version=2;assert.equal((await store.observe(f.order_id)).fulfillment_ready,true);
  version=1;await assert.rejects(store.observe(f.order_id),/settlement_version_conflict/);assert.equal((await store.observation(f.order_id)).payment_state,'paid');
  await assert.rejects(db.query('UPDATE fwv2_observation SET revision=1,receipt=$2 WHERE order_id=$1',[f.order_id,JSON.stringify(unpaid)]),/immutable_handoff_observation/);
  await assert.rejects(db.query('DELETE FROM fwv2_observation_history WHERE order_id=$1',[f.order_id]),/append_only_handoff_history/);
});

async function ordersFixture(t,{executionReady=true}={}){
  const db=await fixture(t);await installOrderStore(db,scope);await db.query('UPDATE fwv2_control SET paused=false WHERE id=true');
  const mappings=new Map();let failStatus=false,at=Date.now();
  const client=handoffClient(scope,{fetcher:async(url,init)=>{
    const input=JSON.parse(init.body);
    if(url.endsWith(PREPARE_PATH)){
      if(!mappings.has(input.order_id)){const p=receipt(input,{payment_execution_ready:executionReady,execution_blockers:executionReady?[]:['collector_runtime_not_enabled']});mappings.set(input.order_id,{request:input,prepared:p,status:settlement(input,p)});}
      return Response.json(mappings.get(input.order_id).prepared);
    }
    const m=mappings.get(input.order_id);if(url.endsWith(RENEW_PATH)){m.prepared={...m.prepared,capability_version:m.prepared.capability_version+1,portal_url:scope.portalOrigin+'/portal/invoice/'+'c'.repeat(48),expires_at:new Date(at+900000).toISOString()};return Response.json(m.prepared);}
    return failStatus?new Response('{}',{status:503}):Response.json(m.status);
  }});
  const orders=handoffOrders({db,client,now:()=>at}),s=await orders.session(null,true),f=makePrepareFixture();
  const input={...f.order.contact,quantity:'full',stacking:true,termsAccepted:true,householdUseConfirmed:true,csrf:s.csrf};
  return{db,orders,s,input,mappings,setTime:v=>{at=v;},setStatusFailure:v=>{failStatus=v;}};
}
test('accepted order and preparation queue commit atomically; duplicate starts keep one immutable invoice',async t=>{
  const {db,orders,s,input,mappings}=await ordersFixture(t);
  await Promise.all([orders.start(s,input),orders.start(s,input)]);
  assert.equal((await db.query('SELECT count(*)::int n FROM fwv2_orders')).rows[0].n,1);assert.equal(mappings.size,1);
  const state=await orders.state(s);assert.equal(state.order.frozen,true);assert.equal(state.order.quote.totalCents,60000);assert.equal(state.payment.payment_state,'unpaid');
  assert.equal(state.order.contact.notes,input.notes);await assert.rejects(orders.start(s,{...input,notes:'Changed accepted details'}),/accepted order is saved/);
  await assert.rejects(db.query("UPDATE fwv2_orders SET quote='{}'"),/immutable_accepted_order/);
  assert.equal((await db.query('SELECT count(*)::int n FROM fwv2_prepare')).rows[0].n,1);
});
test('terms, household use, session, office proof and synthetic-email checks happen before saving',async t=>{
  const {db,orders,s,input}=await ordersFixture(t);
  for(const change of [{csrf:'wrong'},{termsAccepted:false},{householdUseConfirmed:false},{email:'real@example.com'},{state:'NY'},{state:'MD'},{assistedQuote:'customer-supplied'}])await assert.rejects(orders.start(s,{...input,...change}));
  assert.equal((await db.query('SELECT count(*)::int n FROM fwv2_orders')).rows[0].n,0);
  await db.query('UPDATE fwv2_control SET paused=true');await assert.rejects(orders.start(s,input),/paused/);
});
test('expired payment link renews the same invoice; unknown, processing and reviewed payments cannot resume',async t=>{
  const f=await ordersFixture(t);await f.orders.start(f.s,f.input);const m=[...f.mappings.values()][0];
  const id=m.prepared.invoice_id;f.setTime(Date.parse(m.prepared.expires_at)+1000);
  const link=await f.orders.resume(f.s,{csrf:f.s.csrf});assert.equal(link.next,scope.portalOrigin+'/portal/invoice/'+'c'.repeat(48));
  assert.equal((await f.orders.handoff.saved(m.request.order_id)).invoice_id,id);assert.equal(f.mappings.size,1);
  m.status={...m.status,observation_revision:2,payment_state:'processing',payment_preference:'ach',payment_pending:true};
  assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');
  f.setStatusFailure(true);await assert.rejects(f.orders.resume(f.s,{csrf:f.s.csrf}),/status is being checked/);assert.equal((await f.orders.state(f.s)).verificationPending,true);
});
test('an unpaid order prepared while collection was paused can check the same invoice after reopening',async t=>{
  const f=await ordersFixture(t,{executionReady:false});await f.orders.start(f.s,f.input);const m=[...f.mappings.values()][0],invoice=m.prepared.invoice_id;
  const before=await f.orders.state(f.s);assert.equal(before.paymentExecutionReady,false);assert.equal(before.preparation,'prepared');
  m.prepared={...m.prepared,payment_execution_ready:true,execution_blockers:[]};
  const next=await f.orders.resume(f.s,{csrf:f.s.csrf});assert.equal(next.next,scope.portalOrigin+'/portal/invoice/'+'c'.repeat(48));
  assert.equal((await f.orders.state(f.s)).paymentExecutionReady,true);assert.equal((await f.orders.handoff.saved(m.request.order_id)).invoice_id,invoice);
  assert.equal(f.mappings.size,1);assert.equal((await f.db.query('SELECT count(*)::int n FROM fwv2_orders')).rows[0].n,1);
  assert.equal((await f.orders.state(f.s)).order.contact.notes,f.input.notes);assert.equal((await f.orders.confirmation(f.s)).status,'pending');
});
test('checking a still-held collector preserves the order and never renews processing or reviewed payments',async t=>{
  const f=await ordersFixture(t,{executionReady:false});await f.orders.start(f.s,f.input);const m=[...f.mappings.values()][0],invoice=m.prepared.invoice_id;
  await assert.rejects(f.orders.resume(f.s,{csrf:f.s.csrf}),/Payment options are not available yet/);assert.equal((await f.orders.handoff.saved(m.request.order_id)).invoice_id,invoice);
  const version=m.prepared.capability_version;
  m.status={...m.status,observation_revision:2,payment_state:'processing',payment_preference:'ach',payment_pending:true};
  assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');assert.equal(m.prepared.capability_version,version);
  m.status={...m.status,observation_revision:3,payment_state:'unpaid',payment_pending:false,review_required:true};
  assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');assert.equal(m.prepared.capability_version,version);
  assert.equal(f.mappings.size,1);assert.equal((await f.orders.confirmation(f.s)).status,'pending');
});
test('paid confirmation is captured once across restarts; refunds preserve it and cannot authorize new payment',async t=>{
  const f=await ordersFixture(t);await f.orders.start(f.s,f.input);const m=[...f.mappings.values()][0],principal=m.request.order.principal_cents,fee=1800;
  m.status={...m.status,observation_revision:2,payment_state:'paid',payment_preference:'card',fulfillment_ready:true,original_paid_evidence:originalProof(principal,fee),
    totals:{...m.status.totals,paid_principal_cents:principal,balance_due_cents:0,surcharge_collected_cents:fee,gross_collected_cents:principal+fee}};
  await f.orders.work();await f.orders.work();assert.equal((await f.db.query('SELECT count(*)::int n FROM fwv2_confirmations')).rows[0].n,1);
  const confirmation=await f.orders.confirmation(f.s);assert.equal(confirmation.status,'captured');assert.match(confirmation.confirmation.text,/subtotal: \$600.00/);assert.match(confirmation.confirmation.text,/surcharge collected: \$18.00/);assert.match(confirmation.confirmation.text,/payment collected: \$618.00/);
  m.status={...m.status,observation_revision:3,payment_state:'refunded',fulfillment_ready:false,review_required:true,totals:{...m.status.totals,paid_principal_cents:0,balance_due_cents:principal,refunded_principal_cents:principal,refunded_surcharge_cents:fee,gross_refunded_cents:principal+fee}};
  await f.orders.work();assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');assert.deepEqual(await f.orders.confirmation(f.s),confirmation);
  await assert.rejects(f.db.query('DELETE FROM fwv2_confirmations'),/immutable_accepted_order/);
});
test('a pending bank refund holds fulfillment and repayment without inventing refunded money or replacing confirmation',async t=>{
  const f=await ordersFixture(t);await f.orders.start(f.s,f.input);const m=[...f.mappings.values()][0],principal=m.request.order.principal_cents;
  m.status={...m.status,observation_revision:2,payment_state:'paid',payment_preference:'ach',fulfillment_ready:true,original_paid_evidence:originalProof(principal),
    totals:{...m.status.totals,paid_principal_cents:principal,balance_due_cents:0,gross_collected_cents:principal}};
  await f.orders.work();const original=await f.orders.confirmation(f.s),paidProof=structuredClone(m.status.original_paid_evidence);
  m.status={...m.status,observation_revision:3,payment_state:'processing',payment_pending:true,review_required:true,fulfillment_ready:false};
  await f.orders.work();await f.orders.work();const pending=await f.orders.state(f.s);
  assert.equal(pending.verificationPending,false);assert.equal(pending.payment.review_required,true);assert.equal(pending.payment.payment_pending,true);assert.equal(pending.payment.fulfillment_ready,false);
  assert.equal(pending.payment.totals.gross_collected_cents,principal);assert.equal(pending.payment.totals.gross_refunded_cents,0);
  assert.deepEqual(pending.payment.original_paid_evidence,paidProof);assert.deepEqual(await f.orders.confirmation(f.s),original);
  assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fwv2_confirmations')).rows[0].n,1);
  m.status={...m.status,fulfillment_ready:true};await assert.rejects(f.orders.handoff.observe(m.request.order_id),/settlement_unconfirmed/);
  // A verified failed/canceled refund has no completed refunded principal.
  // Returning financial certainty cannot create another order confirmation.
  m.status={...m.status,observation_revision:4,payment_state:'paid',payment_pending:false,review_required:false,fulfillment_ready:true};
  await f.orders.work();const unsuccessful=await f.orders.state(f.s);
  assert.equal(unsuccessful.payment.payment_state,'paid');assert.equal(unsuccessful.payment.totals.gross_refunded_cents,0);
  assert.deepEqual(unsuccessful.payment.original_paid_evidence,paidProof);assert.deepEqual(await f.orders.confirmation(f.s),original);
  assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fwv2_confirmations')).rows[0].n,1);
  m.status={...m.status,observation_revision:5,payment_state:'processing',payment_pending:true,review_required:true,fulfillment_ready:false};
  await f.orders.work();
  m.status={...m.status,observation_revision:6,payment_state:'refunded',payment_pending:false,fulfillment_ready:false,
    totals:{...m.status.totals,paid_principal_cents:0,balance_due_cents:principal,refunded_principal_cents:principal,gross_refunded_cents:principal}};
  await f.orders.work();const refunded=await f.orders.state(f.s);
  assert.equal(refunded.payment.payment_state,'refunded');assert.equal(refunded.payment.fulfillment_ready,false);assert.equal(refunded.payment.totals.gross_refunded_cents,principal);
  assert.deepEqual(refunded.payment.original_paid_evidence,paidProof);assert.deepEqual(await f.orders.confirmation(f.s),original);
  assert.equal((await f.orders.resume(f.s,{csrf:f.s.csrf})).next,'/firewood/checkout/result/');
});
test('session isolation and local HTTP guards reject cross-origin writes, cookie guessing and malformed bodies',async t=>{
  const f=await ordersFixture(t),http=await testOrderServer({orders:f.orders,origin:'http://127.0.0.1:55849',testOnly:true});const port=await http.listen();t.after(()=>http.close());
  const base='http://127.0.0.1:'+port,headers={host:'127.0.0.1:55849'};
  // Browser fetch cannot override Host. This transport intentionally tests the
  // receiving side of a fixed-target local relay with its canonical Host.
  const fetch=(url,init={})=>new Promise((yes,no)=>{const req=httpRequest(url,init,res=>{const parts=[];res.on('data',p=>parts.push(p));res.on('end',()=>{const h=new Headers();for(const[k,v]of Object.entries(res.headers))if(v!==undefined)h.set(k,Array.isArray(v)?v.join(', '):v);yes(new Response(Buffer.concat(parts),{status:res.statusCode,headers:h}));});});req.on('error',no);req.end(init.body);});
  assert.equal((await fetch(base+'/firewood/checkout/api/start',{method:'POST',headers:{...headers,origin:'https://foreign.invalid','content-type':'application/json'},body:'{}'})).status,403);
  const r=await fetch(base+'/firewood/checkout/api/state',{headers});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('x-robots-tag'),/noindex/);
  const cookie=r.headers.get('set-cookie').split(';')[0],state=await r.json();assert.equal(state.order,null);
  const invalid=await fetch(base+'/firewood/checkout/api/start',{method:'POST',headers:{...headers,origin:'http://127.0.0.1:55849',cookie,'content-type':'application/json'},body:'['});assert.equal(invalid.status,400);
  const huge=await fetch(base+'/firewood/checkout/api/start',{method:'POST',headers:{...headers,origin:'http://127.0.0.1:55849',cookie,'content-type':'application/json'},body:'x'.repeat(16400)});assert.equal(huge.status,413);
  await f.orders.start(f.s,f.input);const other=await f.orders.session(null,true);assert.equal((await f.orders.state(other)).order,null);assert.equal((await f.orders.state(f.s)).order.contact.email,f.input.email);
  assert.equal((await fetch(base+'/health',{headers:{...headers,'x-forwarded-host':'foreign.invalid'}})).status,403);
  await assert.rejects(testOrderServer({orders:f.orders,origin:'https://checkout.angeltreeservices.org',testOnly:true}),/loopback_test_origin_required/);
});
