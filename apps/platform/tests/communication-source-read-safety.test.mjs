import assert from'node:assert/strict';
import test from'node:test';
import{communicationReadFixture}from'./communication-read-fixture.mjs';
const cases=[{table:'customers'},{table:'organizations',organization:true},{table:'quotes',type:'quote_follow_up'},{table:'invoices'},{table:'payments',type:'payment_confirmation'}];
for(const c of cases)test(c.table+': failed source reads stay failed and visible without diagnostics, cancellation, sending or automatic retry',async()=>{
 for(const readFault of [{mode:'error',code:'08006'},{mode:'error',code:'42501'},{mode:'error',code:'57014'},{mode:'error',code:'PGRST116'},{mode:'error',withData:true},{mode:'throw'}]){
  const f=communicationReadFixture({...c,readFault:{table:c.table,...readFault}}),saved=structuredClone(f.tables[c.table]);
  const r=await f.run();assert.equal(r.status,'failed');assert.equal(r.outcome,'not_sent');assert.equal(r.recorded,true);assert.equal(f.row.status,'failed');assert.equal(f.row.cancelled_at,null);assert.equal(f.row.skip_reason,null);assert.match(f.row.last_error,/checks could not be completed safely/);assert.doesNotMatch(JSON.stringify([r,f.row]),/PRIVATE_SYNTHETIC|08006|42501|PGRST116|57014/);assert.equal(f.sent.length,0);assert.deepEqual(f.tables[c.table],saved);
  const readCount=f.reads.filter(t=>t===c.table).length;await f.run();assert.equal(f.reads.filter(t=>t===c.table).length,readCount);assert.equal(f.sent.length,0);assert.equal(f.row.attempt_count,1);
 }
});
test('successful empty source reads retain deliberate missing-record skip/cancel outcomes',async()=>{
 for(const c of cases){const f=communicationReadFixture({...c,readFault:{table:c.table,mode:'missing'}}),r=await f.run();assert.equal(r.status,['customers','organizations'].includes(c.table)?'skipped':'cancelled');assert.equal(f.sent.length,0);assert.equal(f.row.last_error,null);assert.ok(f.row.skip_reason);}
});
test('successful current records retain the same recipient, content, amount, stable key and one send',async()=>{
 for(const c of [{},{organization:true},{type:'quote_follow_up'},{type:'payment_confirmation'}]){const f=communicationReadFixture(c),r=await f.run();assert.equal(r.outcome,'accepted');assert.equal(f.sent.length,1);const sent=f.sent[0];assert.equal(sent.to,'synthetic@example.invalid');assert.equal(sent.idempotencyKey,'customer-communication/'+f.row.id);assert.ok(sent.expectedSourceSnapshot);assert.equal(sent.relatedInvoiceId,f.row.invoice_id);assert.equal(sent.relatedQuoteId,f.row.quote_id);assert.equal(sent.relatedPaymentId,f.row.payment_id);if(c.type==='payment_confirmation'){assert.match(sent.text,/Applied to invoice: \$10.00/);assert.match(sent.text,/Remaining invoice balance: \$90.00/);}await f.run();assert.equal(f.sent.length,1);}
});
test('unacknowledged failed-state writes never invite sending or silently turn the row pending',async()=>{
 const f=communicationReadFixture({readFault:{table:'invoices',mode:'error'},zeroUpdate:true}),r=await f.run();assert.equal(r.outcome,'not_sent');assert.equal(r.recorded,false);assert.equal(f.row.status,'processing');assert.match(r.message,/queue update needs review/);assert.equal(f.sent.length,0);await f.run();assert.equal(f.sent.length,0);
});
test('existing accepted history is never rewritten or resent when a later source read fails',async()=>{
 const f=communicationReadFixture({readFault:{table:'invoices',mode:'error'}}),history={id:'synthetic-history',related_communication_id:f.row.id,status:'sent',sent_at:'2026-10-22T16:30:00Z',provider_message_id:'synthetic-prior'};f.tables.email_events.push(history);const before=structuredClone(f.tables.email_events);await f.run();assert.equal(f.row.status,'failed');assert.equal(f.sent.length,0);assert.deepEqual(f.tables.email_events,before);
});
test('a provider-uncertain result after healthy preparation stays quarantined without a second send',async()=>{
 const f=communicationReadFixture({unknown:true});assert.equal((await f.run()).outcome,'unknown');assert.equal(f.row.status,'failed');await f.run();assert.equal(f.sent.length,1);
});
