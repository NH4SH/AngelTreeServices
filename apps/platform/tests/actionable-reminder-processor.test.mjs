import {memoryPaymentPrincipal} from './reminder-payment-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {load,memoryDB} from './pr10-test-helpers.mjs';
import {formatBusinessDate} from '../src/lib/business-time.ts';
import {renderCustomerReminderEmailHtml} from '../src/lib/email/customer-reminder-layout.ts';
import {renderCustomerPaymentReceiptHtml} from '../src/lib/email/customer-payment-receipt-layout.ts';
import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import {mapBounded,withDeadline} from '../src/lib/runtime/deadline.ts';

const templates=load('../src/lib/communications/templates.ts',{'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'server-only':{},'@/lib/business-time':{formatBusinessDate},'../email/customer-reminder-layout.ts':{renderCustomerReminderEmailHtml},'../email/customer-payment-receipt-layout.ts':{renderCustomerPaymentReceiptHtml}});
function fixture(type='invoice_payment_reminder',options={}) {
 const quote=type==='quote_follow_up',now=new Date().toISOString(),sends=[];
 const row={id:'synthetic-reminder',customer_id:'synthetic-customer',organization_id:null,invoice_id:quote?null:'synthetic-invoice',quote_id:quote?'synthetic-quote':null,job_id:null,schedule_event_id:null,appointment_id:null,payment_id:null,communication_type:type,recipient_email:'synthetic@example.invalid',status:'pending',attempt_count:0,created_at:now,scheduled_for:now,processing_started_at:null,is_automatic:options.automatic??false};
 const tables={customer_communications:[row],customers:[{id:row.customer_id,display_name:'Synthetic Customer',email:row.recipient_email,status:'active'}],invoices:[{id:row.invoice_id,status:options.status??'sent',total_cents:12500,due_at:'2026-11-05',automatic_reminders_enabled:true,invoice_number:'SYNTHETIC',jobs:null}],quotes:[{id:row.quote_id,status:options.status??'sent',quote_number:'SYNTHETIC',automatic_follow_ups_enabled:true,quote_line_items:[]}],payments:[],email_events:[]};
 const db=memoryDB(tables),settings={automated_sending_enabled:options.enabled??true,minimum_send_interval_hours:24,business_timezone:'America/New_York'};
 const processor=load('../src/lib/communications/processor.ts',{
  'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'../quotes/proposal-number.ts':{formatProposalNumber:x=>x},'@/lib/payments/reconciliation':{getSuccessfulPaymentTotal:memoryPaymentPrincipal},
  '@/lib/communications/portal-links':{getExistingCommunicationPortalUrl:async()=>({tokenId:"00000000-0000-4000-8000-000000000001",url:options.portalUrl??`http://127.0.0.1:3102/portal/${quote?'quote':'invoice'}/synthetic-review`})},
  '@/lib/communications/queue':{syncAutomatedCommunications:async()=>({error:null}),getCommunicationSettingsFromClient:async()=>({data:settings,error:null})},
  '@/lib/communications/templates':templates,'@/lib/email/delivery-context':{emailDeliveryContext},
  '@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('No real email transport is allowed')},'@/lib/supabase/admin':{getServiceRoleClient:()=>assert.fail('Supply the synthetic database')},'@/lib/runtime/deadline':{mapBounded,withDeadline},
 });
 return{row,sends,run:()=>processor.processCommunicationById(row.id,{db,send:async input=>{sends.push(input);return options.unknown?{ok:false,outcome:'unknown',configured:true,historyRecorded:true,providerMessageId:null,retryable:false}:{ok:true,outcome:'accepted',configured:true,historyRecorded:true,providerMessageId:'synthetic-accepted',retryable:false};}})};
}
test('all three reminder types carry real actionable templates through the existing processor with one acceptance and stable request identity',async()=>{
 for(const type of ['invoice_payment_reminder','overdue_invoice_reminder','quote_follow_up']){
  const f=fixture(type);assert.equal((await f.run()).outcome,'accepted');assert.equal((await f.run()).outcome,'accepted');assert.equal(f.sends.length,1);
  const sent=f.sends[0];assert.equal(sent.idempotencyKey,'customer-communication/synthetic-reminder');assert.equal(sent.relatedCommunicationId,f.row.id);assert.ok(sent.expectedSourceSnapshot);assert.deepEqual(sent.deliveryPortalTokens,[{kind:type==='quote_follow_up'?'quote':'invoice',id:'00000000-0000-4000-8000-000000000001'}]);
  assert.match(sent.html,type==='quote_follow_up'?/>Review proposal<\/a>/:/>View invoice<\/a>/);assert.match(sent.html,/href="tel:\+15403888715"/);assert.equal(sent.to,'synthetic@example.invalid');
 }
});
test('an unusable link fails before transport without exposing the capability or provider details',async()=>{
 const f=fixture('invoice_payment_reminder',{portalUrl:'javascript:private-synthetic-token'}),r=await f.run();assert.equal(r.outcome,'not_sent');assert.equal(f.sends.length,0);assert.equal(f.row.status,'failed');assert.doesNotMatch(r.message,/private-synthetic-token|javascript/);
});
test('closed sources and disabled automatic sending still stop before sending the new templates',async()=>{
 for(const [type,status]of [['quote_follow_up','approved'],['quote_follow_up','declined'],['quote_follow_up','cancelled'],['invoice_payment_reminder','paid'],['invoice_payment_reminder','void']]){
  const f=fixture(type,{status});assert.equal((await f.run()).outcome,'not_sent');assert.equal(f.sends.length,0);
 }
 const disabled=fixture('invoice_payment_reminder',{automatic:true,enabled:false});assert.equal((await disabled.run()).outcome,'not_sent');assert.equal(disabled.sends.length,0);assert.equal(disabled.row.status,'pending');
});
test('uncertain acceptance of a newly formatted reminder remains quarantined instead of sending another copy',async()=>{
 const f=fixture('invoice_payment_reminder',{unknown:true});assert.equal((await f.run()).outcome,'unknown');assert.equal(f.row.status,'failed');await f.run();assert.equal(f.sends.length,1);
});
