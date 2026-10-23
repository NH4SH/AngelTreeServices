import assert from 'node:assert/strict';
import test from 'node:test';
import {load,memoryDB} from './pr10-test-helpers.mjs';
import {formatBusinessDate} from '../src/lib/business-time.ts';
import {renderCustomerReminderEmailHtml} from '../src/lib/email/customer-reminder-layout.ts';
import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import {mapBounded,withDeadline} from '../src/lib/runtime/deadline.ts';
const templates=load('../src/lib/communications/templates.ts',{'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'server-only':{},'@/lib/business-time':{formatBusinessDate},'../email/customer-reminder-layout.ts':{renderCustomerReminderEmailHtml}});
const notice={status:'ready',kind:'changed',before:{starts_at:'2035-03-12T13:00:00Z',ends_at:'2035-03-12T14:00:00Z',status:'scheduled',type:'estimate'},after:{starts_at:'2035-03-14T13:00:00Z',ends_at:'2035-03-14T14:00:00Z',type:'estimate'},location:{street:'123 Synthetic Lane',city:'Fredericksburg',state:'VA',postal_code:'22401'}};
function fixture(options={}) {
 const now=new Date().toISOString(),row={id:'synthetic-notice',communication_type:options.kind==='cancelled'?'appointment_cancelled':'appointment_changed',customer_id:'synthetic-customer',organization_id:null,job_id:'synthetic-job',appointment_id:'synthetic-appointment',schedule_event_id:null,invoice_id:null,quote_id:null,payment_id:null,recipient_email:'notice@example.invalid',is_automatic:true,status:'pending',attempt_count:0,scheduled_for:now,processing_started_at:null};
 const tables={customer_communications:[row],customers:[{id:row.customer_id,display_name:'Synthetic Customer',email:options.missingEmail?null:row.recipient_email,status:'active'}],email_events:options.accepted?[{related_communication_id:row.id,status:'sent',sent_at:now,provider_message_id:'synthetic-prior'}]:options.otherRevision?[{related_communication_id:'earlier-revision',email_type:row.communication_type,status:'sent',sent_at:now,related_appointment_id:row.appointment_id}]:[]};
 const db=memoryDB(tables),rpc=db.rpc.bind(db),sent=[];
 db.rpc=(name,args)=>name==='get_appointment_change_notice'?Promise.resolve({data:options.lookupFailure?null:{...notice,...options.notice,kind:options.kind??'changed'},error:options.lookupFailure?{code:'XX000'}:null}):rpc(name,args);
 const processor=load('../src/lib/communications/processor.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'../quotes/proposal-number.ts':{},'@/lib/payments/reconciliation':{},'@/lib/communications/portal-links':{},'@/lib/communications/queue':{getCommunicationSettingsFromClient:async()=>({data:{automated_sending_enabled:options.enabled??true,business_timezone:'America/New_York',minimum_send_interval_hours:24}})},'@/lib/communications/templates':templates,'@/lib/runtime/deadline':{mapBounded,withDeadline},'@/lib/email/delivery-context':{emailDeliveryContext},'@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('Real transport forbidden')},'@/lib/supabase/admin':{getServiceRoleClient:()=>assert.fail('Synthetic DB required')}});
 return{row,sent,run:()=>processor.processCommunicationById(row.id,{db,send:async input=>{sent.push(input);return options.unknown?{ok:false,outcome:'unknown',retryable:false,historyRecorded:true}:{ok:true,outcome:'accepted',historyRecorded:true,providerMessageId:'synthetic-acceptance'};}})};
}
test('latest changed and cancelled visits reuse durable request identity and never send twice',async()=>{
 for(const kind of ['changed','cancelled']) {const f=fixture({kind});assert.equal((await f.run()).outcome,'accepted');await f.run();assert.equal(f.sent.length,1);const input=f.sent[0];assert.equal(input.idempotencyKey,'customer-communication/synthetic-notice');assert.ok(input.expectedSourceSnapshot);assert.equal(input.relatedAppointmentId,'synthetic-appointment');assert.match(input.subject,kind==='cancelled'?/cancelled/:/updated/);}
});
test('uncertain preceding deliveries and settling checks wait without consuming a retry',async()=>{
 const f=fixture({notice:{status:'held'}});const r=await f.run();assert.equal(r.status,'pending');assert.equal(f.sent.length,0);assert.equal(f.row.attempt_count,0);assert.ok(Date.parse(f.row.scheduled_for)>Date.now());
});
test('superseded, missing or otherwise obsolete visit intents cancel before transport',async()=>{
 const f=fixture({notice:{status:'obsolete'}});assert.equal((await f.run()).status,'cancelled');assert.equal(f.sent.length,0);
});
test('lookup failure, unavailable recipient and disabled master switch never contact transport',async()=>{
 for(const options of [{lookupFailure:true},{missingEmail:true},{enabled:false}]){const f=fixture(options);assert.equal((await f.run()).outcome,'not_sent');assert.equal(f.sent.length,0);}
});
test('accepted own receipt recovers without resending; a different genuine revision is not a reminder duplicate',async()=>{
 const prior=fixture({accepted:true});assert.equal((await prior.run()).outcome,'accepted');assert.equal(prior.sent.length,0);assert.equal(prior.row.provider_message_id,'synthetic-prior');
 const next=fixture({otherRevision:true});assert.equal((await next.run()).outcome,'accepted');assert.equal(next.sent.length,1);
});
test('uncertain notice delivery is quarantined rather than automatically sent again',async()=>{
 const f=fixture({unknown:true});assert.equal((await f.run()).outcome,'unknown');assert.equal(f.row.status,'failed');await f.run();assert.equal(f.sent.length,1);
});
test('customer templates distinguish visit cancellation from a whole job and show before/after details',()=>{
 const base={...notice,customerName:'Synthetic Customer',timezone:'America/New_York',location:'123 Synthetic Lane'};
 const changed=templates.appointmentChangeTemplate(base),cancelled=templates.appointmentChangeTemplate({...base,kind:'cancelled',before:{...base.before,type:'job'}});
 for(const value of [changed.text,changed.html]){assert.match(value,/Previous date and window/);assert.match(value,/Updated date and window/);assert.match(value,/540\) 388-8715/);assert.match(value,/9:00 AM/);}
 for(const value of [cancelled.text,cancelled.html]){assert.match(value,/this visit only/);assert.match(value,/other scheduled visits remain unchanged/);assert.doesNotMatch(value,/job has been cancelled|work order cancelled/i);}
 const restored=templates.appointmentChangeTemplate({...base,before:{...base.before,status:'cancelled'}});assert.match(restored.subject,/reinstated/);
 const escaped=templates.appointmentChangeTemplate({...base,customerName:'<script>bad</script>',location:'<img src=x>'});assert.doesNotMatch(escaped.html,/<script>|<img/);assert.match(escaped.html,/&lt;script&gt;/);
});

function queueFixture({enabled=true,coverage=[],failure=false}={}) {
 const inserted=[],calls=[],now=new Date().toISOString(),settings={automated_sending_enabled:true,appointment_change_notices_enabled:enabled,estimate_confirmation_enabled:true,estimate_reminder_enabled:true,estimate_reminder_hours_before:24,updated_at:'2000-01-01T00:00:00Z'};
 const jobs={id:'job',lead_disposition:'active',customers:{id:'customer',email:'notice@example.invalid',status:'active'},organizations:null};
 const db={rpc:async name=>{calls.push(name);return{data:coverage,error:failure?{code:'XX000'}:null};},from(table){let op='read',single=false;const q={select(){return q;},eq(){return q;},in(){return q;},not(){return q;},gt(){return q;},gte(){return q;},lte(){return q;},or(){return q;},update(){op='update';return q;},upsert(rows){inserted.push(...rows);op='insert';return q;},maybeSingle(){single=true;return execute();},then(resolve,reject){return execute().then(resolve,reject);}};function execute(){const data=op!=='read'?[]:table==='communication_settings'?settings:table==='schedule_events'?[{id:'visit',job_id:'job',event_type:'estimate',starts_at:'2035-01-01T13:00:00Z',created_at:now,jobs}]:[];return Promise.resolve({data:single?data:data,error:null});}return q;}};
 const queue=load('../src/lib/communications/queue.ts',{'server-only':{}});return{calls,inserted,run:()=>queue.syncAutomatedCommunications(db)};
}
test('polling omits replaced confirmations and nearby reminders; coverage failures stop the batch',async()=>{
 const held=queueFixture({coverage:[{source_kind:'schedule_event',source_id:'visit',suppress_reminder:true}]});assert.equal((await held.run()).error,null);assert.equal(held.inserted.length,0);
 const later=queueFixture({coverage:[{source_kind:'schedule_event',source_id:'visit',suppress_reminder:false}]});await later.run();assert.deepEqual(later.inserted.map(r=>r.communication_type),['estimate_reminder']);
 const failed=queueFixture({failure:true});assert.ok((await failed.run()).error);assert.equal(failed.inserted.length,0);
 const disabled=queueFixture({enabled:false});await disabled.run();assert.equal(disabled.calls.length,0);assert.equal(disabled.inserted.length,2);
});
