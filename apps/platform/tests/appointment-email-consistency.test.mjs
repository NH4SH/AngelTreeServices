import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync}from'node:fs';
import * as crypto from'node:crypto';
import {load}from'./pr10-test-helpers.mjs';
import {companyBrand}from'../src/lib/company-brand.ts';
import {formatBusinessDate}from'../src/lib/business-time.ts';
import {renderCustomerReminderEmailHtml}from'../src/lib/email/customer-reminder-layout.ts';
import {renderCustomerPaymentReceiptHtml}from'../src/lib/email/customer-payment-receipt-layout.ts';
import {renderCustomerAppointmentEmail}from'../src/lib/email/customer-appointment-layout.ts';
import {escapeEmailHtml}from'../src/lib/email/customer-document-action.ts';
import {callDeliveryCommand}from'../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext}from'../src/lib/email/delivery-context.ts';
const baseline=JSON.parse(readFileSync(new URL('./appointment-email-baseline.json',import.meta.url)));
const deps={'server-only':{},'@/lib/business-time':{formatBusinessDate},'../company-brand.ts':{companyBrand},'../email/customer-reminder-layout.ts':{renderCustomerReminderEmailHtml},'../email/customer-payment-receipt-layout.ts':{renderCustomerPaymentReceiptHtml},'../email/customer-appointment-layout.ts':{renderCustomerAppointmentEmail}};
const templates=load('../src/lib/communications/templates.ts',deps);
test('all eleven independently captured appointment subjects and operational details remain intact and ordered',()=>{
 for(const c of baseline.cases){const input=structuredClone(c.input),r=templates[c.kind](input);assert.equal(r.subject,c.subject,c.id);let last=-1;
  for(const line of c.text.split('\n').filter(x=>x&&!['Thank you,',companyBrand.name].includes(x)&&!x.startsWith('Questions?'))){const index=r.text.indexOf(line,last+1);assert.ok(index>last,c.id+': '+line);last=index;assert.ok(r.html.includes(escapeEmailHtml(line)),c.id+': HTML '+line);}
  assert.deepEqual(input,c.input);
 }
});
test('every appointment variant uses the same brand, reply guidance and single named office phone link',()=>{
 for(const c of baseline.cases){const r=templates[c.kind](c.input);assert.ok(r.html.includes(companyBrand.services));assert.ok(r.text.includes(`Questions? Reply to this email or call ${companyBrand.phone}.`));
  assert.equal((r.html.match(/<a\s/g)||[]).length,1);assert.ok(r.html.includes(`href="${companyBrand.phoneHref}"`));assert.ok(r.html.includes(`Call ${companyBrand.phone}`));assert.doesNotMatch(r.html,/lawn care|<form|<img|<script|mailto:|checkout|portal\/|unsubscribe|tracking/i);
  assert.match(r.html,/<html lang="en">/);assert.match(r.html,/name="viewport"/);assert.match(r.html,/<h1/);assert.match(r.html,/role="presentation"/);assert.match(r.html,/white-space:pre-line/);assert.match(r.html,/word-break:break-word/);
 }
});
test('visit states remain distinct, cancellations apply only to the visit and reinstatement has a matching heading',()=>{
 assert.match(templates.appointmentCommunicationTemplate(baseline.cases[0].input).text,/is scheduled/);
 assert.match(templates.appointmentCommunicationTemplate(baseline.cases[1].input).text,/is coming up/);
 for(const c of baseline.cases.filter(c=>c.id.endsWith('-cancelled'))){const r=templates[c.kind](c.input);assert.match(r.html,/>Visit cancelled<\/h1>/);assert.match(r.text,/this visit only/);assert.match(r.text,/other scheduled visits remain unchanged/);assert.doesNotMatch(r.text,/job has been cancelled|work order cancelled/i);}
 const c=baseline.cases.find(c=>c.id==='reinstated');assert.match(templates[c.kind](c.input).html,/>Visit reinstated<\/h1>/);
});
test('Unicode, long text and markup-like customer or location values stay escaped and do not add links',()=>{
 for(const c of [baseline.cases[0],baseline.cases.find(c=>c.id==='job-changed')]){const r=templates[c.kind]({...c.input,customerName:'Árbol 🌳 業務 <script>bad</script>',location:'<img src=x onerror=bad> '+ 'SYNTHETIC'.repeat(80)});assert.match(r.html,/Árbol/);assert.match(r.html,/業務/);assert.match(r.html,/&lt;script&gt;/);assert.doesNotMatch(r.html,/<script|<img/);assert.equal((r.html.match(/<a\s/g)||[]).length,1);}
});
test('central public branding drives appointment identity and contact in both formats without hardcoded alternatives',()=>{
 const brand={...companyBrand,name:'Synthetic company',services:'Synthetic service',phone:'(555) 010-0119',phoneHref:'tel:+15550100119'};
 const layout=load('../src/lib/email/customer-appointment-layout.ts',{'../company-brand.ts':{companyBrand:brand},'./customer-document-action.ts':{escapeEmailHtml}});
 const t=load('../src/lib/communications/templates.ts',{...deps,'../company-brand.ts':{companyBrand:brand},'../email/customer-appointment-layout.ts':layout});
 const r=t.appointmentCommunicationTemplate(baseline.cases[0].input);assert.match(r.subject,/Synthetic company/);assert.ok(r.text.includes(brand.phone));assert.ok(r.html.includes(brand.phoneHref));assert.ok(r.html.includes(brand.services));assert.doesNotMatch(r.text,/540\) 388/);
});
test('proposal reminders, invoice reminders and payment receipts remain byte-identical to their pre-change outputs',()=>{
 for(const c of baseline.unrelated)assert.equal(crypto.createHash('sha256').update(JSON.stringify(templates[c.kind](c.input))).digest('hex'),c.sha256,c.kind);
});
test('a new appointment layout cannot dispatch or overwrite an accepted or uncertain frozen request',async()=>{
 const {sendDurableEmail}=load('../src/lib/email/delivery.ts',{'server-only':{},'node:crypto':crypto,'@/lib/email/delivery-commands':{callDeliveryCommand},'@/lib/email/delivery-context':{emailDeliveryContext}});
 const c=baseline.cases[0],template=templates[c.kind](c.input);
 for(const state of ['accepted','unknown']){const original={id:crypto.randomUUID(),state,payload:{text:c.text,subject:c.subject},conflict:true},before=structuredClone(original),key='customer-communication/'+crypto.randomUUID(),calls=[];
  const r=await sendDurableEmail({...template,to:'synthetic@example.invalid',emailType:'estimate_confirmation',idempotencyKey:key},{configured:true,envelope:{from:'office@example.invalid',replyTo:'office@example.invalid'},db:{rpc:async(name,args)=>{assert.equal(name,'prepare_outbound_delivery');assert.equal(args.p_request_key,key);assert.notEqual(args.p_payload.text,original.payload.text);calls.push(name);return{data:original,error:null};}},transport:()=>assert.fail('Branding must not authorize another provider call')});
  assert.equal(r.ok,false);assert.equal(r.retryable,false);assert.deepEqual(calls,['prepare_outbound_delivery']);assert.deepEqual(original,before);
 }
});
