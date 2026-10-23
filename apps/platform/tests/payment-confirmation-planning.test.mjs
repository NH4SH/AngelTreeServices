import assert from 'node:assert/strict';
import test from 'node:test';
import {appointmentQueueFixture} from './appointment-queue-fixture.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const timestamp='2026-10-23T12:00:00.000Z';
export const payment=n=>({id:id(n),invoice_id:id(999999),status:'succeeded',created_at:timestamp,updated_at:timestamp,
  customers:{id:id(999998),email:'synthetic@example.invalid',status:'active'},organizations:null});
export const paymentPlanner=(count=401,options={})=>appointmentQueueFixture({
  settings:{payment_confirmation_enabled:true},paymentRowCap:1000,
  tables:{schedule_events:[],payments:Array.from({length:count},(_,n)=>payment(n+1)),customer_communications:[]},...options,
});
const receiptRows=f=>f.tables.customer_communications.filter(x=>x.communication_type==='payment_confirmation');

test('payment preparation includes all 1001 sources beyond the API representation cap',async()=>{
  const f=paymentPlanner(1001);const before=structuredClone(f.tables.payments);
  assert.equal((await f.run()).error,null);assert.equal(receiptRows(f).length,1001);
  assert.deepEqual(f.tables.payments,before);
  const reads=f.calls.filter(c=>c.table==='payments');assert.equal(reads.length,7);
  for(const call of reads){assert.deepEqual(call.sort,{key:'id',ascending:true});assert.equal(call.cap,200);}
  assert.ok(f.upserts.every(r=>r.idempotency_key===`auto:payment:${r.payment_id}:confirmation`));
  const first=structuredClone(receiptRows(f));await f.run();assert.deepEqual(receiptRows(f),first);
});

test('short capped pages are not mistaken for completion and writes stay bounded',async()=>{
  const f=paymentPlanner(401,{paymentRowCap:7});assert.equal((await f.run()).error,null);
  assert.equal(receiptRows(f).length,401);assert.equal(f.calls.filter(c=>c.table==='payments').length,59);
  assert.equal(f.calls.filter(c=>c.operation==='upsert').length,3);
});

test('later read errors, thrown responses and unusable data withhold every payment write',async()=>{
  for(const mode of ['error','throw','null']){
    const f=paymentPlanner(401,{paymentReadFault:{at:2,mode}});const r=await f.run();
    assert.ok(r.error);assert.equal(r.created,0);assert.equal(f.upserts.length,0);
    assert.doesNotMatch(r.error,/PRIVATE_SYNTHETIC/);
  }
});

test('nonadvancing, unordered and malformed cursors fail safely without partial preparation',async()=>{
  for(const mode of ['repeat','reverse','invalid']){
    const f=paymentPlanner(401,{paymentReadFault:{at:2,mode}});assert.ok((await f.run()).error);
    assert.equal(f.upserts.length,0);
  }
});

test('failed source pages stop the actual worker before claiming any deliveries',async()=>{
  const f=paymentPlanner(401,{paymentReadFault:{at:2,mode:'error'}});const r=await f.worker();
  assert.equal(r.claimed,0);assert.ok(r.error);
  assert.equal(f.calls.some(c=>c.rpc==='claim_due_customer_communications'),false);
});

test('accepted-email follow-up remains pending after an incomplete source scan and recovers without a resend',async()=>{
  const f=paymentPlanner(401,{paymentReadFault:{at:2,mode:'error'}});const saved=structuredClone(f.delivery);
  assert.equal((await f.followups()).sourceReconciled,false);assert.equal(f.acks,0);assert.deepEqual(f.delivery,saved);
  f.clearPaymentFaults();assert.equal((await f.followups()).sourceReconciled,true);assert.equal(f.acks,1);
  assert.equal(receiptRows(f).length,401);await f.followups();assert.equal(f.acks,1);
});

test('partial and lost batch acknowledgements retain prior state and resume under the same keys',async()=>{
  for(const mode of ['error','throw','lost']){
    const f=paymentPlanner(401,{paymentUpsertFault:{at:2,mode}});const r=await f.run();
    assert.ok(r.error);assert.equal(r.created,200);assert.equal(receiptRows(f).length,mode==='lost'?400:200);
    const before=structuredClone(receiptRows(f));f.clearPaymentFaults();assert.equal((await f.run()).error,null);
    assert.equal(receiptRows(f).length,401);for(const row of before)assert.deepEqual(receiptRows(f).find(r=>r.id===row.id),row);
  }
});

test('an unsuccessful batch write prevents claiming and recovery acknowledgement',async()=>{
  const worker=paymentPlanner(401,{paymentUpsertFault:{at:2,mode:'lost'}});
  assert.equal((await worker.worker()).claimed,0);assert.equal(worker.calls.some(c=>c.rpc==='claim_due_customer_communications'),false);
  const recovery=paymentPlanner(401,{paymentUpsertFault:{at:2,mode:'error'}});
  assert.equal((await recovery.followups()).sourceReconciled,false);assert.equal(recovery.acks,0);
});

test('invoice-scoped recovery never prepares a different invoice or runs an unrelated source',async()=>{
  const f=paymentPlanner(401);f.tables.payments.push({...payment(500),invoice_id:id(888888)});
  assert.equal((await f.invoice(id(999999))).error,null);assert.equal(receiptRows(f).length,401);
  assert.equal(f.calls.some(c=>['quotes','appointments','schedule_events'].includes(c.table)),false);
  for(const call of f.calls.filter(c=>c.table==='payments'))assert.ok(call.filters.some(([k,v])=>k==='invoice_id'&&v===id(999999)));
});

test('earlier source deletion between pages cannot shift later payments out of the scan',async()=>{
  const f=paymentPlanner(401,{onPaymentRead({tables,read}){if(read===1)tables.payments=tables.payments.filter(r=>r.id!==id(1));}});
  assert.equal((await f.run()).error,null);assert.equal(receiptRows(f).length,401);
  assert.ok(receiptRows(f).some(r=>r.payment_id===id(401)));
});

test('existing succeeded/since/contact eligibility remains unchanged',async()=>{
  const f=paymentPlanner(0);f.tables.payments.push(payment(1),{...payment(2),status:'pending'},
    {...payment(3),created_at:'1900-01-01T00:00:00Z'},{...payment(4),customers:{...payment(4).customers,status:'archived'}},
    {...payment(5),customers:null,organizations:{id:id(999997),billing_email:'billing@example.invalid',status:'active'},invoices:{accounts_payable_contact:{email:'ap@example.invalid',is_active:true}}});
  assert.equal((await f.run()).error,null);assert.deepEqual(receiptRows(f).map(r=>r.payment_id),[id(1),id(5)]);
  assert.equal(receiptRows(f)[1].recipient_email,'ap@example.invalid');
});

test('automatic sending and payment-confirmation OFF switches avoid source reads and writes',async()=>{
  for(const settings of [{automated_sending_enabled:false,payment_confirmation_enabled:true},{automated_sending_enabled:true,payment_confirmation_enabled:false}]){
    const f=paymentPlanner(401,{settings});assert.equal((await f.run()).error,null);
    assert.equal(f.calls.some(c=>c.table==='payments'),false);assert.equal(f.upserts.length,0);
  }
});

test('a bounded source deadline cannot acknowledge an incomplete pass',async()=>{
  const now=Date.now;let elapsed=0;Date.now=()=>now()+elapsed;
  try{
    const f=paymentPlanner(401,{onPaymentRead({read}){if(read===1)elapsed=6000;}});
    assert.ok((await f.run()).error);assert.equal(f.upserts.length,0);
  }finally{Date.now=now;}
});

test('concurrent complete preparations preserve one queue row per stable payment key',async()=>{
  const f=paymentPlanner(401);const results=await Promise.all([f.run(),f.run()]);
  results.forEach(r=>assert.equal(r.error,null));assert.equal(receiptRows(f).length,401);
  assert.equal(new Set(receiptRows(f).map(r=>r.idempotency_key)).size,401);
});
