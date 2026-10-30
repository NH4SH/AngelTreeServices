import assert from 'node:assert/strict';
import test from 'node:test';
import {customerQuoteState,customerInvoiceState,initialCustomerPaymentPreference} from './customer-states.ts';

const state=(patch={})=>customerInvoiceState({status:'sent',amountDueCents:285000,payments:[],...patch});
const pending=(method)=>({status:'pending',provider:'stripe',payment_method:method});
test('only existing open quote states expose responses; unknown states fail closed',()=>{
 for(const status of ['draft','sent','change_requested'])assert.equal(customerQuoteState(status).canRespond,true,status);
 for(const status of ['approved','declined','cancelled','expired','unknown',''])assert.equal(customerQuoteState(status).canRespond,false,status);
 assert.equal(customerQuoteState('change_requested').kind,'changes');
 assert.match(customerQuoteState('declined').title,/declined/i);assert.match(customerQuoteState('cancelled').message,/cancelled/);
});
test('every closed quote has an outcome and a recovery next step without inviting approval',()=>{
 for(const status of ['declined','cancelled','expired','unknown']){
  const s=customerQuoteState(status);assert.match(s.message,/contact/i);assert.doesNotMatch(s.title,/review your proposal/i);assert.equal(s.canRespond,false);
 }
});
test('void invoices do not masquerade as paid, including zero totals and return hints',()=>{
 for(const amountDueCents of [0,285000])for(const returnedPayment of ['success','processing',undefined]){
  const s=state({status:'void',amountDueCents,returnedPayment});assert.equal(s.kind,'void');assert.equal(s.canChoose,false);assert.doesNotMatch(s.title,/received|paid/i);
 }
});
test('a settled balance never shows another payment choice',()=>{
 const paid=state({status:'paid',amountDueCents:0});assert.equal(paid.label,'Paid');assert.equal(paid.canChoose,false);
 const zero=state({amountDueCents:0});assert.equal(zero.label,'Nothing due');assert.equal(zero.canChoose,false);
 assert.equal(state({status:'paid'}).kind,'review');
});
test('pending payment method controls the explanation, not the last failed attempt or URL',()=>{
 const oldFailure={status:'failed',provider:'stripe',payment_method:'ach',updated_at:'2026-10-01'};
 for(const [method,label] of [['ach','Bank'],['card','Card'],[null,'Payment']]){
  const s=state({payments:[oldFailure,pending(method)],returnedPayment:'cancelled'});
  assert.equal(s.canChoose,false);assert.equal(s.refresh,true);assert.ok(s.label.startsWith(label));assert.match(s.message,/do not submit another payment/);
 }
 const mixed=state({payments:[pending('ach'),pending('card')]});assert.equal(mixed.label,'Payment processing');
});
test('customer-controlled return hints cannot prove success or authorize a second payment',()=>{
 for(const returnedPayment of ['success','processing']){
  const s=state({returnedPayment});assert.equal(s.kind,'confirming');assert.equal(s.canChoose,false);assert.equal(s.refresh,true);assert.doesNotMatch(s.label,/paid|received/i);
 }
 const cancelled=state({returnedPayment:'cancelled'});assert.doesNotMatch(cancelled.message,/No payment was made/);assert.equal(cancelled.canChoose,true);
 assert.equal(state({returnedPayment:'paid'}).kind,'open');
});
test('known failed attempts allow retry only on an open invoice and cannot override pending',()=>{
 const failed={status:'failed',provider:'stripe',payment_method:'card',failed_at:'2026-10-21'};
 assert.equal(state({payments:[failed]}).kind,'failed');assert.equal(state({payments:[failed]}).canChoose,true);
 assert.equal(state({payments:[failed,pending('ach')]}).kind,'processing');
 assert.equal(state({status:'draft',payments:[failed]}).canChoose,false);
});
test('offline payment choices stay usable while unavailable online methods are not selected',()=>{
 assert.equal(initialCustomerPaymentPreference(null,false,false),'cash_check_pickup');
 assert.equal(initialCustomerPaymentPreference('card',false,true),'cash_check_pickup');
 assert.equal(initialCustomerPaymentPreference('ach',false,true),'cash_check_pickup');
 assert.equal(initialCustomerPaymentPreference('check_mail',false,false),'check_mail');
 assert.equal(initialCustomerPaymentPreference('card',true,true),'card');
 assert.equal(initialCustomerPaymentPreference('card',true,false),'ach');
 assert.equal(initialCustomerPaymentPreference(null,true,false),'ach');
});

test('invalid balances and unrecognized invoice states cannot invite collection',()=>{
 for(const amountDueCents of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.equal(state({amountDueCents}).canChoose,false);
 for(const status of ['draft','cancelled','unknown'])assert.equal(state({status}).canChoose,false);
});
