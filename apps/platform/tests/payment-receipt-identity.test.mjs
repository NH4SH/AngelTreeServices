import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationReadFixture} from './communication-read-fixture.mjs';

const otherPayment='00000000-0000-4000-8000-000000000999';
function fixture(options={}) {
  const f=communicationReadFixture({type:'payment_confirmation',...options});
  const event=(extra={})=>({id:'synthetic-prior-receipt',email_type:'payment_confirmation',status:'sent',
    related_invoice_id:f.row.invoice_id,related_payment_id:otherPayment,sent_at:new Date().toISOString(),...extra});
  return {...f,event};
}

test('a different recorded payment on the same invoice does not suppress this receipt',async()=>{
  const f=fixture();f.tables.email_events.push(f.event());
  const before=structuredClone([f.tables.payments,f.tables.invoices,f.tables.email_events]);
  const result=await f.run();
  assert.equal(result.outcome,'accepted');assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].relatedPaymentId,f.row.payment_id);
  assert.equal(f.sent[0].idempotencyKey,'customer-communication/'+f.row.id);
  assert.deepEqual([f.tables.payments,f.tables.invoices,f.tables.email_events],before);
  await f.run();assert.equal(f.sent.length,1);
});

test('the same payment still suppresses a duplicate queue receipt',async()=>{
  const f=fixture();f.tables.email_events.push(f.event({related_payment_id:f.row.payment_id}));
  assert.equal((await f.run()).status,'skipped');assert.equal(f.sent.length,0);
});

test('an older invoice receipt without payment identity retains its conservative hold',async()=>{
  for(const related_payment_id of [null,undefined]){
    const f=fixture();f.tables.email_events.push(f.event({related_payment_id}));
    assert.equal((await f.run()).status,'skipped');assert.equal(f.sent.length,0);
  }
});

test('an unidentified receipt for a different invoice does not suppress this receipt',async()=>{
  const f=fixture();f.tables.email_events.push(f.event({related_payment_id:null,related_invoice_id:otherPayment}));
  assert.equal((await f.run()).outcome,'accepted');assert.equal(f.sent.length,1);
});

test('own saved acceptance is reconciled without another send',async()=>{
  const f=fixture();f.tables.email_events.push(f.event({related_communication_id:f.row.id,related_payment_id:f.row.payment_id,provider_message_id:'synthetic-saved'}));
  assert.equal((await f.run()).outcome,'accepted');assert.equal(f.sent.length,0);
  assert.equal(f.row.provider_message_id,'synthetic-saved');
});

test('different payment receipts do not suppress ordinary invoice reminders',async()=>{
  for(const type of ['invoice_payment_reminder','overdue_invoice_reminder']){
    const f=fixture({type});f.tables.email_events.push(f.event());
    assert.equal((await f.run()).outcome,'accepted');assert.equal(f.sent.length,1);
  }
});

test('ordinary invoice documents continue suppressing both reminder stages',async()=>{
  for(const type of ['invoice_payment_reminder','overdue_invoice_reminder']){
    const f=fixture({type});f.tables.email_events.push(f.event({email_type:'invoice',related_payment_id:null}));
    assert.equal((await f.run()).status,'skipped');assert.equal(f.sent.length,0);
  }
});

test('pending and refunded payments cannot acquire a receipt through another payment history',async()=>{
  for(const status of ['pending','refunded','failed']){
    const f=fixture();f.tables.payments[0].status=status;f.tables.email_events.push(f.event());
    assert.equal((await f.run()).status,'cancelled');assert.equal(f.sent.length,0);
  }
});

test('unknown provider outcome remains held and does not start a second receipt attempt',async()=>{
  const f=fixture({unknown:true});f.tables.email_events.push(f.event());
  assert.equal((await f.run()).outcome,'unknown');assert.equal(f.sent.length,1);
  await f.run();assert.equal(f.sent.length,1);
});
