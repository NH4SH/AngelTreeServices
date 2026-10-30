import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeStripeWebhook,processStripeWebhook} from '../src/lib/payments/webhook-recovery.ts';
import {createCheckoutBudget} from '../src/lib/payments/checkout-budget.ts';

const invoice='11111111-1111-4111-8111-111111111111',reservation='22222222-2222-4222-8222-222222222222';
function bankFixture(change=()=>{}) {
 const checkout={id:reservation,invoice_id:invoice,stripe_payment_intent_id:'pi_bank_fixture',total_charge_cents:45000,currency:'usd',payment_channel:'ach'};
 const intent={id:'pi_bank_fixture',livemode:false,status:'requires_payment_method',amount:45000,amount_received:0,currency:'usd',metadata:{invoice_id:invoice,checkout_reservation_id:reservation},payment_method_types:['us_bank_account']};
 const session={id:'cs_bank_fixture',livemode:false,status:'complete',payment_status:'unpaid',client_reference_id:invoice,amount_total:45000,currency:'usd',metadata:{invoice_id:invoice,checkout_reservation_id:reservation},payment_intent:intent};
 change({checkout,intent,session});
 return {livemode:false,stripe:{checkout:{sessions:{retrieve:async()=>structuredClone(session)}}},supabase:{from(){return{select(){return this;},eq(){return this;},abortSignal(){return this;},maybeSingle:async()=>({data:structuredClone(checkout),error:null})};}}};
}
function event(type,id){return{id:'evt_bank_risk_fixture',type,created:1,livemode:false,data:{object:{id}}};}
test('failed asynchronous bank debit re-fetches current unpaid provider state and returns no capture evidence',async()=>{
 const r=await normalizeStripeWebhook(event('checkout.session.async_payment_failed','cs_bank_fixture'),bankFixture(),createCheckoutBudget());
 assert.equal(r.operation,'failed');assert.equal(r.intent_id,'pi_bank_fixture');assert.equal(r.reservation_id,reservation);assert.equal(r.charge_id,undefined);assert.equal(r.refunds,undefined);
});
test('delayed bank failure envelope cannot downgrade a currently processing debit',async()=>{
 const r=await normalizeStripeWebhook(event('checkout.session.async_payment_failed','cs_bank_fixture'),bankFixture(({intent})=>intent.status='processing'),createCheckoutBudget());assert.equal(r.operation,'pending');
});
test('contradictory paid Checkout and failed intent stay unresolved, never fabricate a returned or successful payment',async()=>{
 await assert.rejects(()=>normalizeStripeWebhook(event('checkout.session.async_payment_failed','cs_bank_fixture'),bankFixture(({session})=>session.payment_status='paid'),createCheckoutBudget()),e=>e.applicationErrorCode==='checkout_payment_not_ready');
});
for(const type of ['charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'])test('late bank return '+type+' uses authoritative terminal dispute without recreating or refunding payment',async()=>{
 let calls=0;
 const deps={livemode:false,supabase:{},stripe:{disputes:{retrieve:async id=>{calls++;return{id,livemode:false,charge:'ch_bank_fixture',status:'lost',amount:45000,currency:'usd'};}}}};
 const e=event(type,'dp_bank_return_fixture');e.data.object.status='needs_response';
 const r=await normalizeStripeWebhook(e,deps,createCheckoutBudget());assert.equal(calls,1);assert.deepEqual(r,{operation:'dispute',dispute_id:'dp_bank_return_fixture',charge_id:'ch_bank_fixture',dispute_status:'lost',dispute_amount_cents:45000,currency:'usd'});
});
for(const change of [d=>d.livemode=true,d=>d.id='dp_foreign'])test('late return rejects provider mode/identity mismatch '+change.toString(),async()=>{
 const deps={livemode:false,supabase:{},stripe:{disputes:{retrieve:async id=>{const d={id,livemode:false,charge:'ch_bank_fixture',status:'lost',amount:45000,currency:'usd'};change(d);return d;}}}};
 await assert.rejects(()=>normalizeStripeWebhook(event('charge.dispute.closed','dp_bank_return_fixture'),deps,createCheckoutBudget()));
});

function earlyRefundFixture(change=()=>{}) {
 const checkout={id:reservation,invoice_id:invoice,stripe_payment_intent_id:'pi_bank_fixture',stripe_checkout_session_id:'cs_bank_fixture',stripe_confirmation_token_id:null,total_charge_cents:45000,currency:'usd',payment_channel:'ach'};
 const intent={id:'pi_bank_fixture',livemode:false,status:'processing',amount:45000,amount_received:0,currency:'usd',latest_charge:'ch_bank_fixture',metadata:{invoice_id:invoice,checkout_reservation_id:reservation},payment_method_types:['us_bank_account']};
 const session={id:'cs_bank_fixture',livemode:false,status:'complete',payment_status:'unpaid',client_reference_id:invoice,amount_total:45000,currency:'usd',metadata:{invoice_id:invoice,checkout_reservation_id:reservation},payment_intent:intent.id};
 const charge={id:'ch_bank_fixture',livemode:false,status:'pending',paid:false,amount:45000,amount_refunded:0,currency:'usd',payment_intent:intent.id,payment_method_details:{type:'us_bank_account'}};
 const refund={id:'re_bank_fixture',charge:charge.id,payment_intent:intent.id,amount:45000,currency:'usd',status:'pending',created:1};
 const data={checkout,intent,session,charge,refund,invoice:{id:invoice,status:'sent'}};
 change(data);const reads=[];
 const deps={livemode:false,stripe:{refunds:{retrieve:async()=>structuredClone(refund),list:async()=>({data:[structuredClone(refund)],has_more:false})},charges:{retrieve:async()=>structuredClone(charge)},paymentIntents:{retrieve:async()=>structuredClone(intent)},checkout:{sessions:{retrieve:async()=>structuredClone(session)}}},supabase:{from(table){reads.push(table);return{select(){return this;},eq(){return this;},abortSignal(){return this;},maybeSingle:async()=>({data:structuredClone(table==='invoices'?data.invoice:checkout),error:null})};}}};
 return{deps,data,reads};
}
for(const status of ['pending','requires_action'])test('bound '+status+' ACH refund before debit success remains retryable without financial evidence',async()=>{
 const {deps,reads}=earlyRefundFixture(({refund})=>refund.status=status);
 await assert.rejects(()=>normalizeStripeWebhook(event('refund.created','re_bank_fixture'),deps,createCheckoutBudget()),e=>e.applicationErrorCode==='refund_payment_not_ready'&&e.retryable===true);
 assert.deepEqual(reads,['invoice_checkout_sessions','invoices']);
});
test('early ACH refund receipt releases its lease for recovery without applying money or planning/sending email',async()=>{
 const {deps}=earlyRefundFixture(),calls=[];
 deps.supabase.rpc=(name)=>({abortSignal:async()=>{calls.push(name);return{data:name==='claim_stripe_webhook'?{status:'claimed',token:reservation,phase:'pending',invoice_id:null,communications_synced:false}:true,error:null};}});
 await assert.rejects(()=>processStripeWebhook(event('refund.created','re_bank_fixture'),{...deps,sendEmail:async()=>{assert.fail('No email before financial evidence');},syncCommunications:async()=>{assert.fail('No planning before financial evidence');}}),e=>e.applicationErrorCode==='refund_payment_not_ready'&&e.retryable===true);
 assert.deepEqual(calls,['claim_stripe_webhook','fail_stripe_webhook']);
});
test('same ACH refund can be normalized after authoritative debit success without recreating payment',async()=>{
 const {deps,data}=earlyRefundFixture();
 await assert.rejects(()=>normalizeStripeWebhook(event('refund.created','re_bank_fixture'),deps,createCheckoutBudget()),e=>e.retryable===true);
 data.charge.paid=true;data.charge.status='succeeded';data.intent.status='succeeded';data.intent.amount_received=45000;data.session.payment_status='paid';
 const result=await normalizeStripeWebhook(event('refund.created','re_bank_fixture'),deps,createCheckoutBudget());
 assert.equal(result.operation,'refund');assert.equal(result.charge_id,'ch_bank_fixture');assert.equal(result.intent_id,'pi_bank_fixture');assert.equal(result.refunds[0].status,'pending');assert.equal(result.refund_gross_cents,undefined);
});
const invalidEarlyRefunds={
 'foreign charge':({charge})=>charge.id='ch_other',
 'live charge':({charge})=>charge.livemode=true,
 'card charge':({charge})=>charge.payment_method_details.type='card',
 'failed charge':({charge})=>charge.status='failed',
 'premature refunded amount':({charge})=>charge.amount_refunded=1,
 'terminal refund':({refund})=>refund.status='succeeded',
 'wrong refund intent':({refund})=>refund.payment_intent='pi_other',
 'wrong refund currency':({refund})=>refund.currency='eur',
 'zero refund':({refund})=>refund.amount=0,
 'foreign intent':({intent})=>intent.id='pi_other',
 'live intent':({intent})=>intent.livemode=true,
 'failed intent':({intent})=>intent.status='requires_payment_method',
 'premature received amount':({intent})=>intent.amount_received=1,
 'wrong latest charge':({intent})=>intent.latest_charge='ch_other',
 'card intent':({intent})=>intent.payment_method_types=['card'],
 'missing invoice metadata':({intent})=>delete intent.metadata.invoice_id,
 'wrong local invoice':({checkout})=>checkout.invoice_id=reservation,
 'wrong local intent':({checkout})=>checkout.stripe_payment_intent_id='pi_other',
 'card reservation':({checkout})=>checkout.payment_channel='card',
 'wrong local amount':({checkout})=>checkout.total_charge_cents=1,
 'foreign session':({session})=>session.id='cs_other',
 'live session':({session})=>session.livemode=true,
 'wrong session intent':({session})=>session.payment_intent='pi_other',
 'wrong session invoice':({session})=>session.client_reference_id=reservation,
 'paid session with unpaid charge':({session})=>session.payment_status='paid',
 'void invoice':({invoice})=>invoice.status='void',
 'missing invoice':data=>data.invoice=null,
};
for(const [label,change]of Object.entries(invalidEarlyRefunds))test('early refund does not relax '+label+' validation',async()=>{
 const {deps}=earlyRefundFixture(change);
 await assert.rejects(()=>normalizeStripeWebhook(event('refund.created','re_bank_fixture'),deps,createCheckoutBudget()),e=>e.retryable===false&&e.applicationErrorCode!=='refund_payment_not_ready');
});
test('unpaid aggregate charge.refunded never becomes paid or pending refund evidence',async()=>{
 const {deps}=earlyRefundFixture();await assert.rejects(()=>normalizeStripeWebhook(event('charge.refunded','ch_bank_fixture'),deps,createCheckoutBudget()),e=>e.applicationErrorCode==='refund_amount_invalid'&&e.retryable===false);
});
for(const type of ['refund.created','refund.updated','refund.failed','charge.refund.updated','charge.refunded'])for(const paid of [false,true])test(type+' rejects a live referenced charge in '+(paid?'paid':'early ACH')+' branch',async()=>{
 const {deps}=earlyRefundFixture(({charge})=>{charge.livemode=true;charge.paid=paid;});
 await assert.rejects(()=>normalizeStripeWebhook(event(type,type==='charge.refunded'?'ch_bank_fixture':'re_bank_fixture'),deps,createCheckoutBudget()),e=>e.applicationErrorCode==='provider_mode_invalid'&&e.retryable===false);
});
