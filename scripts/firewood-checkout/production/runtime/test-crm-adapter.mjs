import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configuration,SANDBOX_ACCOUNT} from './config.mjs';
import {policyHash} from './policy.mjs';
import {migrate} from './migrate.mjs';
import {createCheckout,token} from './checkout.mjs';
import {createWorker} from './worker.mjs';
import {stripeProvider} from './provider.mjs';
import {createCandidateCrmAdapter} from './crm-adapter.mjs';

const config=configuration({FIREWOOD_CANDIDATE_MODE:'sandbox',FIREWOOD_CANDIDATE_ACCOUNT:SANDBOX_ACCOUNT,
  FIREWOOD_CANDIDATE_STRIPE_KEY:'rk_test_synthetic',FIREWOOD_CANDIDATE_ORIGIN:'https://firewood-candidate.invalid',
  FIREWOOD_CANDIDATE_WEBHOOK_SECRET:'whsec_synthetic',FIREWOOD_CANDIDATE_ACCESS_TOKEN:'a'.repeat(64),
  FIREWOOD_CANDIDATE_CRM_ENABLED:'0',FIREWOOD_CANDIDATE_EMAIL_ENABLED:'0'});
const scope={origin:'http://127.0.0.1:48987',sourceId:'website_firewood_candidate_v1',keyId:'synthetic_candidate',
  signingSecret:'s'.repeat(64),mode:'sandbox',accountId:SANDBOX_ACCOUNT};
const input={quantity:'two',stacking:true,name:'Synthetic Candidate',email:'candidate@example.invalid',phone:'+1 (202) 555-0142',
  address:'123 Synthetic Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic test only; no dispatch.',termsAccepted:true,householdUseConfirmed:true};

async function fixture(t,{connected=true}={}){
  let db,close;
  if(process.env.FIREWOOD_CANDIDATE_NATIVE_TEST_URL){
    const u=new URL(process.env.FIREWOOD_CANDIDATE_NATIVE_TEST_URL);
    assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'56388');assert.equal(u.pathname,'/firewood_candidate_test');
    const {Pool}=await import('pg'),{postgresAdapter}=await import('../../hosted/runtime.mjs');
    const admin=new Pool({connectionString:u.href,max:1});
    const context=(await admin.query('SELECT current_database() AS db,inet_server_port() AS port,host(inet_server_addr()) AS host')).rows[0];
    assert.deepEqual(context,{db:'firewood_candidate_test',port:56388,host:'127.0.0.1'});
    const schema='crm_adapter_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
    const pool=new Pool({connectionString:u.href,options:'-c search_path='+schema,max:6});db=postgresAdapter(pool);
    close=async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();};
  }else{const {NetlifyDB}=await import('@netlify/database-dev');db=new NetlifyDB({logger:()=>{}});await db.start();close=()=>db.stop();}
  t.after(close);await migrate(db,config);
  let time=Date.now(),outage=false,lost=false,createLost=false,requests=0;
  const now=()=>time,records=new Map(),payments=new Map(),financial=new Map();
  const fetcher=async(url,options)=>{
    requests++;assert.equal(url,scope.origin+'/api/integrations/firewood/candidate-import');
    if(outage)return new Response('{}',{status:503});
    const req=JSON.parse(options.body);let receipt=records.get(req.order_id),replayed=!!receipt;
    if(!receipt){receipt={...Object.fromEntries(Object.entries(req).filter(([k])=>k!=='order')),import_status:'recorded',
      payment_intent_id:'pi_'+req.order_id.replaceAll('-',''),invoice_id:randomUUID(),invoice_number:'TEST-FW-'+req.order_id,payment_id:randomUUID(),
      total_cents:req.order.total_cents,currency:'usd',invoice_status:'paid',balance_due_cents:0,replayed:false,
      original_receipt:{paid:true,balance_due_cents:0},notification_authority:'website',crm_customer_email_sent:false,
      delivery_completed:false,payment_retry_required:false,refund_cents:0,refund_pending:false,refund_review_required:false,
      dispute_status:null,review_required:false,refresh_required:false};records.set(req.order_id,receipt);}
    if(lost){lost=false;throw Error('synthetic_response_loss_after_mapping');}
    return Response.json({...receipt,...financial.get(req.order_id),replayed},{status:replayed?200:201});
  };
  let creates=0;
  function replacement(useCrm=connected){
    const crm=useCrm?createCandidateCrmAdapter({db,scope,fetcher,now}):null;
    const provider={crm,async verifyAccount(){},verifyEvent(raw){return JSON.parse(raw.toString());},
      async create(row){creates++;if(crm){crm.metadata(row);const stored=(await db.query('SELECT crm_binding FROM fw_orders WHERE id=$1',[row.id])).rows[0];assert.deepEqual(stored.crm_binding,row.crm_binding);}
        if(!payments.has(row.id))payments.set(row.id,{id:'cs_test_'+row.id.replaceAll('-',''),paid:false,expired:false,row:structuredClone(row)});
        if(createLost){createLost=false;throw Error('synthetic_provider_response_loss');}return {id:payments.get(row.id).id,url:'https://checkout.stripe.com/c/pay/'+payments.get(row.id).id};},
      async state(row){const p=payments.get(row.id);return {paid:p.paid,expired:p.expired,processing:false,intent:'pi_'+row.id.replaceAll('-','')};},
      async link(row){return {id:row.payment_id,url:'https://checkout.stripe.com/c/pay/'+row.payment_id};},
      async expire(row){payments.get(row.id).expired=true;},
      async lifecycleOrder(e){const row=[...payments.values()].find(p=>'pi_'+p.row.id.replaceAll('-','')===e.data.object.payment_intent)?.row;return row?{id:row.id,intent:e.data.object.payment_intent}:null;},
      async lifecycle(e,row){const f=financial.get(row.id)??{};return e.type==='charge.refunded'?{refundCents:f.refund_cents??0,refundPending:f.refund_pending??false,refundNeedsReview:f.refund_review_required??false}:{disputed:!!f.dispute_status,disputeId:e.data.object.id};}
    };
    const checkout=createCheckout({db,config,provider,crm,now});return {crm,provider,checkout,worker:createWorker(checkout,{now})};
  }
  const app=replacement();if(app.crm)await app.crm.install(config);await app.checkout.owner('pause',{paused:false});
  async function begin(change={},target=app){const s=await target.checkout.session(null,true);await target.checkout.start(s,{...input,...change,csrf:s.csrf});return {s,row:await target.checkout.order((await target.checkout.session(s.cookie)).order_id)};}
  async function pay(v,target=app){payments.get(v.row.id).paid=true;await target.checkout.state(v.s);await target.worker.work();return target.checkout.order(v.row.id);}
  async function state(id){return (await db.query('SELECT * FROM fw_crm_sync WHERE order_id=$1',[id])).rows[0];}
  async function lifecycle(row,type='charge.refunded'){
    await app.worker.ingest(Buffer.from(JSON.stringify({id:'evt_'+token(),type,livemode:false,data:{object:{id:type==='charge.refunded'?'ch_synthetic':'dp_synthetic',livemode:false,payment_intent:'pi_'+row.id.replaceAll('-','')}}})), 'synthetic');
    await app.worker.work();
  }
  return {db,...app,now,replacement,begin,pay,state,lifecycle,records,payments,financial,get requests(){return requests;},get creates(){return creates;},advance(ms){time+=ms;},outage(v){outage=v;},loseResponse(){lost=true;},loseCreate(){createLost=true;}};
}

test('connected adapter rejects live/sending scopes and cannot retrofit retained orders',async t=>{
  const f=await fixture(t,{connected:false});await f.begin();
  const crm=createCandidateCrmAdapter({db:f.db,scope});
  await assert.rejects(crm.install({...config,sandbox:false,mode:'live'}),/sandbox_crm_candidate_only/);
  await assert.rejects(crm.install({...config,emailEnabled:true}),/sandbox_crm_candidate_only/);
  await assert.rejects(crm.install(config),/fresh_crm_candidate_required/);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='fw_orders' AND column_name='crm_binding'")).rows[0].n,0);
  assert.throws(()=>createCandidateCrmAdapter({db:f.db,scope:{...scope,mode:'live'}}));
  assert.throws(()=>createCandidateCrmAdapter({db:f.db,scope:{...scope,origin:'https://admin.angeltreeservices.org'}}));
});
test('binding is committed before payment creation and six approved prices retain customer display details',async t=>{
  const f=await fixture(t);for(const [quantity,stacking,total] of [['half',false,30000],['half',true,45000],['full',false,45000],['full',true,60000],['two',false,84000],['two',true,99000]]){
    const {row}=await f.begin({quantity,stacking,email:'CANDIDATE@EXAMPLE.INVALID'});
    assert.equal(row.quote.totalCents,total);assert.equal(row.crm_binding.order.total_cents,total);assert.equal(row.crm_binding.order.delivery_cents,0);
    assert.equal(row.crm_binding.order.contact.email,input.email);assert.equal(row.contact.email,'CANDIDATE@EXAMPLE.INVALID');assert.equal(row.contact.phone,input.phone);
    assert.equal(row.crm_binding.order_id,row.id);assert.equal(row.crm_binding.attempt_id,row.id);assert.equal(row.crm_binding.order.terms.hash,policyHash);
    await assert.rejects(f.db.query('UPDATE fw_orders SET crm_binding=$2 WHERE id=$1',[row.id,JSON.stringify({...row.crm_binding,snapshot_hash:'0'.repeat(64)})]),/immutable_crm_binding/);
  }assert.equal(f.requests,0);assert.equal(f.payments.size,6);
});
test('candidate source identity stays pinned and all construction uses the same adapter',async t=>{
  const f=await fixture(t);await f.crm.install(config);
  const other=createCandidateCrmAdapter({db:f.db,scope:{...scope,sourceId:'another_candidate'}});
  await assert.rejects(other.install(config),/crm_candidate_identity_conflict/);
  assert.throws(()=>createCheckout({db:f.db,config,provider:f.provider,crm:other}),/same_candidate_crm_adapter_required/);
});
test('new office quote freezes explicit approval evidence before payment and the approved amount survives replacement',async t=>{
  const f=await fixture(t),q=await f.checkout.owner('quote',{...input,quantity:'full',residential:true,singleDiscountConfirmed:true,woodCents:42750,stackingCents:14250});
  const {row,s}=await f.begin({quantity:'full',assistedQuote:q.quoteToken});
  assert.equal(row.quote.totalCents,57000);assert.equal(row.crm_binding.order.total_cents,57000);
  assert.equal(row.crm_binding.order.office_approval.approval_id,q.quote.officeApproval.approval_id);
  assert.ok(row.crm_binding.order.office_approval.approved_at_ms<=Number(row.created_at));
  const next=f.replacement();await next.checkout.start(s,{...input,quantity:'full',csrf:s.csrf});assert.equal(f.creates,1);
});
test('lost payment response reuses the same stored binding and provider identity',async t=>{
  const f=await fixture(t),s=await f.checkout.session(null,true);f.loseCreate();
  await assert.rejects(f.checkout.start(s,{...input,csrf:s.csrf}));
  const row=await f.checkout.order((await f.checkout.session(s.cookie)).order_id),hash=row.crm_binding.snapshot_hash;
  await f.replacement().checkout.start(s,{...input,csrf:s.csrf});
  assert.equal((await f.checkout.order(row.id)).crm_binding.snapshot_hash,hash);assert.equal(f.payments.size,1);
});
test('unpaid and return-page observations cannot queue invoices; paid recording atomically queues one mapping and two captured audiences',async t=>{
  const f=await fixture(t),v=await f.begin();await f.worker.work();assert.equal(f.requests,0);assert.equal(await f.state(v.row.id),undefined);
  f.payments.get(v.row.id).paid=true;assert.equal((await f.checkout.state(v.s)).status,'pending');assert.equal(f.requests,0);
  await f.worker.work();let r=await f.state(v.row.id);assert.equal(r.status,'synced');assert.equal(f.records.size,1);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM fw_outbox WHERE status='captured'")).rows[0].n,2);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fw_outbox WHERE provider_id IS NOT NULL')).rows[0].n,0);
  await f.worker.confirm(await f.checkout.order(v.row.id),{paid:true,intent:'pi_'+v.row.id.replaceAll('-','')});await f.replacement().worker.work();
  assert.equal(f.records.size,1);assert.equal((await f.state(v.row.id)).receipt.invoice_id,r.receipt.invoice_id);
});
test('failed enqueue rolls back paid state and confirmations together until replacement recovers',async t=>{
  const f=await fixture(t),v=await f.begin(),enqueue=f.crm.enqueue;f.crm.enqueue=async()=>{throw Error('synthetic_database_failure');};
  await f.pay(v);assert.equal((await f.checkout.order(v.row.id)).payment_status,'pending');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fw_outbox')).rows[0].n,0);assert.equal(await f.state(v.row.id),undefined);
  f.crm.enqueue=enqueue;f.advance(120000);await f.replacement().worker.work();assert.equal((await f.state(v.row.id)).status,'synced');assert.equal(f.records.size,1);
});
test('CRM outages and lost responses leave confirmations independent and recover the same invoice after restart',async t=>{
  const f=await fixture(t),v=await f.begin();f.outage(true);await f.pay(v);
  assert.equal((await f.checkout.order(v.row.id)).payment_status,'paid');assert.equal((await f.state(v.row.id)).status,'pending');assert.equal(f.records.size,0);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM fw_outbox WHERE status='captured'")).rows[0].n,2);
  f.outage(false);f.loseResponse();f.advance(60000);await f.replacement().worker.work();assert.equal(f.records.size,1);assert.equal((await f.state(v.row.id)).status,'pending');
  const id=f.records.get(v.row.id).invoice_id;f.advance(120000);await f.replacement().worker.work();assert.equal((await f.state(v.row.id)).receipt.invoice_id,id);assert.equal(f.records.size,1);
});
test('verified financial events refresh one mapping while later failed refunds preserve original paid evidence',async t=>{
  const f=await fixture(t),v=await f.begin();await f.pay(v);const initial=(await f.state(v.row.id)).receipt;
  f.financial.set(v.row.id,{refund_cents:99000,review_required:true});await f.lifecycle(v.row);assert.equal((await f.state(v.row.id)).receipt.refund_cents,99000);
  f.financial.set(v.row.id,{refund_cents:0,refund_review_required:true,review_required:true});await f.lifecycle(v.row);
  const row=await f.state(v.row.id);assert.equal(row.status,'review');assert.equal(row.receipt.refund_cents,0);assert.equal(row.receipt.original_receipt.paid,true);
  assert.equal(row.receipt.invoice_id,initial.invoice_id);assert.equal(row.receipt.payment_id,initial.payment_id);assert.equal(f.records.size,1);
});
test('Stripe candidate sends and checks full binding on Session and Intent before accepting a payment link',async t=>{
  const f=await fixture(t),{row}=await f.begin(),meta=f.crm.metadata(row),calls=[];
  const p=stripeProvider(config,async(url,options)=>{
    if(String(url).endsWith('/v1/account'))return Response.json({id:SANDBOX_ACCOUNT});
    const body=new URLSearchParams(options.body);calls.push(body);
    return Response.json({id:'cs_test_synthetic_candidate_session',url:'https://checkout.stripe.com/c/pay/cs_test_synthetic_candidate_session',livemode:false,amount_total:row.quote.totalCents,currency:'usd',client_reference_id:row.id,metadata:meta});
  },{crm:f.crm});
  await p.create(row);assert.equal(calls.length,1);
  for(const [k,v] of Object.entries(meta)){assert.equal(calls[0].get('metadata['+k+']'),v);assert.equal(calls[0].get('payment_intent_data[metadata]['+k+']'),v);}
  assert.equal(calls[0].get('client_reference_id'),row.id);assert.equal(calls[0].has('payment_method_types[0]'),false);
  await assert.rejects(p.create({...row,crm_binding:null}),/frozen_crm_binding_required/);
});
