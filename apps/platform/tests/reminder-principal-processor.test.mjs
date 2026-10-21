import assert from 'node:assert/strict';
import test from 'node:test';
import {invoiceId,customerId} from './portal-payment-context-fixture.mjs';
import {reminderFixture} from './reminder-principal-fixture.mjs';

test('ordinary and overdue reminders use the complete acknowledged principal despite row caps',async()=>{
 for(const overdue of [false,true]){const f=reminderFixture({overdue});assert.equal((await f.run()).outcome,'accepted');assert.deepEqual(f.balances,[995]);assert.equal(f.reads.length,1);assert.equal(f.sends.length,1);await f.run();assert.equal(f.sends.length,1);}
});
test('fully settled and overpaid snapshots cancel a reminder without creating a payment prompt',async()=>{
 for(const total of [1005,1000]){const f=reminderFixture({total});assert.equal((await f.run()).status,'cancelled');assert.equal(f.sends.length,0);assert.equal(f.balances.length,0);}
});
test('payment receipts share the complete remaining-balance read without changing the payment amount',async()=>{
 const f=reminderFixture({confirmation:true});assert.equal((await f.run()).outcome,'accepted');assert.deepEqual(f.balances,[995]);assert.equal(f.reads.length,1);
});
for(const [name,options]of Object.entries({
 missingFunction:{receipt:{data:null,error:{code:'42883',message:'Private schema diagnostic'}}},
 denied:{receipt:{data:null,error:{code:'42501',message:'Private permission diagnostic'}}},missing:{receipt:{data:null,error:null}},
 incomplete:{receipt:{data:{invoice_id:invoiceId},error:null}},wrongInvoice:{receipt:{data:{invoice_id:customerId,successful_payment_count:1,paid_principal_cents:1},error:null}},
 fractional:{receipt:{data:{invoice_id:invoiceId,successful_payment_count:1,paid_principal_cents:0.5},error:null}},transport:{throws:true},timeout:{hangs:true},
}))test(`${name} snapshot stops delivery without a guessed-zero balance or automatic retry`,async()=>{
 const f=reminderFixture(options),r=await f.run();assert.equal(r.outcome,'not_sent');assert.equal(f.row.status,'failed');assert.equal(f.sends.length,0);assert.equal(f.balances.length,0);assert.doesNotMatch(r.message,/Private/);await f.run();assert.equal(f.reads.filter(r=>r.name).length,1);
 if(options.hangs)assert.ok(f.reads.some(r=>r.aborted));
});
test('invalid invoice totals stop before reading payments or rendering a reminder',async()=>{
 for(const total of [NaN,Infinity,-1,0.5,2147483648]){const f=reminderFixture({total});assert.equal((await f.run()).outcome,'not_sent');assert.equal(f.sends.length,0);assert.equal(f.reads.length,0);}
});
