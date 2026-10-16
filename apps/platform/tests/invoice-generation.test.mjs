import assert from 'node:assert/strict';
import test from 'node:test';
import { getInvoiceGenerationRequest, isGenerationRequestId, parseGeneratedInvoice, existingInvoiceMessage } from '../src/lib/invoices/generation-request.ts';
const one='00000000-0000-4000-8000-000000000001',two='00000000-0000-4000-8000-000000000002';
test('invoice generation persists identity before dispatch and retains it through a reload',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 assert.equal(getInvoiceGenerationRequest(storage,'owner','job.1',()=>one),one);
 assert.equal(getInvoiceGenerationRequest(storage,'owner','job.1',()=>{throw Error('Must reuse')}),one);
 assert.equal(getInvoiceGenerationRequest(storage,'other','job.1',()=>two),two);
 assert.equal(getInvoiceGenerationRequest(storage,'owner','job.2',()=>two),two);
});
test('unavailable or corrupted storage fails closed rather than silently replacing an uncertain request',()=>{
 assert.throws(()=>getInvoiceGenerationRequest({getItem:()=>null,setItem:()=>{throw Error('Full')}},'a','b',()=>one),/Full/);
 assert.throws(()=>getInvoiceGenerationRequest({getItem:()=>'{broken}',setItem:()=>assert.fail()},'a','b',()=>one),/Saved invoice/);
});
test('unknown invoice command results cannot authorize a redirect or release request identity',()=>{
 for(const value of [null,{},'ok',{invoice_id:one}, {invoice_id:one,job_id:two,existing:false,replayed:false,job_completed:true,invoice_status:'draft',added_change_order_count:-1}]) assert.equal(parseGeneratedInvoice(value),null);
 const row={invoice_id:one,job_id:two,existing:false,replayed:false,job_completed:true,invoice_status:'draft',added_change_order_count:2};
 assert.deepEqual(parseGeneratedInvoice(row),row);assert.equal(isGenerationRequestId('wrong'),false);
 assert.match(existingInvoiceMessage('void'),/voided invoice/);assert.match(existingInvoiceMessage('paid'),/no duplicate/);
});
