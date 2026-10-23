import {renderCustomerAppointmentEmail} from '../src/lib/email/customer-appointment-layout.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {callDeliveryCommand}from'../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext}from'../src/lib/email/delivery-context.ts';
import {load}from'./pr10-test-helpers.mjs';
import {reminderFixture}from'./reminder-principal-fixture.mjs';
import {formatBusinessDate}from'../src/lib/business-time.ts';
import {renderCustomerReminderEmailHtml}from'../src/lib/email/customer-reminder-layout.ts';
import {renderCustomerPaymentReceiptHtml}from'../src/lib/email/customer-payment-receipt-layout.ts';
import {companyBrand}from'../src/lib/company-brand.ts';
const {paymentConfirmationTemplate:receipt}=load('../src/lib/communications/templates.ts',{
 'server-only':{},'@/lib/business-time':{formatBusinessDate},
 '../email/customer-reminder-layout.ts':{renderCustomerReminderEmailHtml},
 '../email/customer-payment-receipt-layout.ts':{renderCustomerPaymentReceiptHtml},'../email/customer-appointment-layout.ts':{renderCustomerAppointmentEmail},'../company-brand.ts':{companyBrand},
});
const input={amountCents:10000,balanceDueCents:5000,customerName:'Synthetic homeowner',invoiceNumber:'SYNTHETIC-119',paidAt:'2026-10-22T16:30:00Z',paymentMethod:'card',reference:null,surchargeCents:300,totalCollectedCents:10300};
test('receipt shows the same payment facts in HTML and plain text without recalculating amounts',()=>{
 const original=structuredClone(input),r=receipt(input);
 for(const body of [r.html,r.text])for(const value of ['SYNTHETIC-119','Payment method','Card','October 22, 2026','Applied to invoice','$100.00','Credit-card surcharge','$3.00','Total received','$103.00','Remaining invoice balance','$50.00'])assert.ok(body.includes(value),value);
 assert.equal(r.subject,'Angel Tree Services: payment received for Invoice #SYNTHETIC-119');assert.deepEqual(input,original);
});
test('recorded cash, check, ACH and other methods are named without guessing from the provider',()=>{
 for(const [paymentMethod,label]of [['cash','Cash'],['check','Check'],['ach','Bank payment (ACH)'],['other','Other']]){
  const r=receipt({...input,paymentMethod,surchargeCents:0,totalCollectedCents:10000});assert.ok(r.text.includes('Payment method: '+label));assert.doesNotMatch(r.text,/surcharge|charged/);assert.match(r.text,/Total received: \$100.00/);
 }
});
test('missing, unknown and object-prototype method names remain unrecorded, never raw internal values',()=>{
 for(const paymentMethod of [null,undefined,'','wire_integration_internal','toString','constructor','__proto__','<script>private</script>']){
  const r=receipt({...input,paymentMethod});assert.match(r.text,/Payment method: Not recorded/);assert.doesNotMatch(r.html,/wire_integration_internal|<script>/);
 }
});
test('missing or invalid payment dates do not become today or a raw invalid date',()=>{
 for(const paidAt of [null,'','not-a-date','2026-02-30']){
  const r=receipt({...input,paidAt});assert.match(r.text,/Payment date: Not recorded/);assert.doesNotMatch(r.html,/Invalid date|not-a-date/);
 }
 assert.match(receipt({...input,paidAt:'2026-10-22T01:00:00Z'}).text,/Payment date: October 21, 2026/);
 assert.match(receipt({...input,paidAt:'2026-10-22'}).text,/Payment date: October 22, 2026/);
});
test('references and Unicode names remain readable but cannot inject HTML, links or tracking',()=>{
 const r=receipt({...input,customerName:'Árbol 🌳 業務 <img src=x>',reference:' <a href="https://private.invalid">Ref & 42</a> '});
 assert.match(r.text,/Reference: <a href=/);assert.match(r.html,/&lt;a href=/);assert.match(r.html,/Árbol/);assert.match(r.html,/業務/);assert.doesNotMatch(r.html,/<img|<script|href="https:\/\/private/);
 assert.doesNotMatch(receipt({...input,reference:'  '}).text,/Reference:/);
});
test('receipt provides semantic facts, responsive email markup and the existing office contact without a pay action',()=>{
 const r=receipt(input);assert.match(r.html,/<html lang="en">/);assert.match(r.html,/name="viewport"/);assert.match(r.html,/<h1[^>]*>Payment received<\/h1>/);assert.match(r.html,/aria-label="Payment details"/);assert.match(r.html,/<th scope="row"/);assert.match(r.html,/table-layout:fixed/);assert.match(r.html,/word-break:break-word/);
 assert.ok(r.html.includes(companyBrand.services));assert.ok(r.html.includes(`href="${companyBrand.phoneHref}"`));assert.doesNotMatch(r.html,/lawn care|<form|<script|<img|checkout|pay now|portal\/invoice/i);
 assert.match(r.text,/when this receipt was prepared/);assert.match(r.text,/Billing questions/);
});
test('real processor forwards recorded method/date, retains the complete principal balance, and sends a receipt only once',async()=>{
 const f=reminderFixture({confirmation:true,payment:{payment_method:'check',paid_at:'2026-10-22',reference:'Synthetic check 42'},template:receipt});
 assert.equal((await f.run()).outcome,'accepted');assert.equal(f.sends.length,1);const sent=f.sends[0];
 assert.match(sent.text,/Payment method: Check/);assert.match(sent.text,/Payment date: October 22, 2026/);assert.match(sent.text,/Reference: Synthetic check 42/);assert.match(sent.text,/Applied to invoice: \$4.00/);assert.match(sent.text,/Remaining invoice balance: \$9.95/);
 assert.equal(sent.idempotencyKey,'customer-communication/'+f.row.id);await f.run();assert.equal(f.sends.length,1);assert.equal(f.reads.filter(x=>x.name).length,1);
});
test('real processor does not fabricate legacy dates/methods or expose Stripe object references',async()=>{
 const f=reminderFixture({confirmation:true,payment:{provider:'stripe',reference:'pi_synthetic_private',payment_method:null,paid_at:null},template:receipt});
 await f.run();assert.equal(f.sends.length,1);assert.match(f.sends[0].text,/Payment date: Not recorded/);assert.match(f.sends[0].text,/Payment method: Not recorded/);assert.doesNotMatch(JSON.stringify(f.sends[0].html),/pi_synthetic_private/);
});
test('real processor retains pending, failed and refunded payment denials',async()=>{
 for(const status of ['pending','processing','failed','refunded']){const f=reminderFixture({confirmation:true,payment:{status},template:receipt});assert.equal((await f.run()).outcome,'not_sent');assert.equal(f.sends.length,0);}
});
test('new receipt presentation cannot dispatch or overwrite an earlier accepted or uncertain frozen request',async()=>{
 const {sendDurableEmail}=load('../src/lib/email/delivery.ts',{'server-only':{},'node:crypto':crypto,'@/lib/email/delivery-commands':{callDeliveryCommand},'@/lib/email/delivery-context':{emailDeliveryContext}});
 for(const state of ['accepted','unknown']){
  const id=crypto.randomUUID(),key='customer-communication/'+crypto.randomUUID(),old={id,state,payload:{subject:'Earlier receipt',text:'Earlier frozen payment details'},conflict:true},before=structuredClone(old),calls=[];
  const r=await sendDurableEmail({...receipt(input),to:'synthetic@example.invalid',emailType:'payment_confirmation',idempotencyKey:key},{configured:true,envelope:{from:'office@example.invalid',replyTo:'office@example.invalid'},db:{rpc:async(name,args)=>{calls.push(name);assert.equal(name,'prepare_outbound_delivery');assert.equal(args.p_request_key,key);assert.notEqual(args.p_payload.text,old.payload.text);return{data:old,error:null};}},transport:()=>assert.fail('A new layout must never authorize another provider call')});
  assert.equal(r.ok,false);assert.equal(r.retryable,false);assert.deepEqual(calls,['prepare_outbound_delivery']);assert.deepEqual(old,before);
 }
});
