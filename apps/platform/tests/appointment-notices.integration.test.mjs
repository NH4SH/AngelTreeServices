import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {load} from './pr10-test-helpers.mjs';
import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import {mapBounded,withDeadline} from '../src/lib/runtime/deadline.ts';
import {formatBusinessDate} from '../src/lib/business-time.ts';
import {renderCustomerReminderEmailHtml} from '../src/lib/email/customer-reminder-layout.ts';
const enabled=process.env.APPOINTMENT_NOTICES_DISPOSABLE==='1'&&Boolean(process.env.APPOINTMENT_NOTICES_STATUS_FILE);
test('appointment notices: native SQL, concurrent workers and synthetic durable transport',{skip:!enabled,timeout:120000},async t=>{
 const status=JSON.parse(readFileSync(process.env.APPOINTMENT_NOTICES_STATUS_FILE,'utf8'));
 assert.equal(status.API_URL,'http://127.0.0.1:58421','Dedicated disposable target only');
 const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const anon=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const ok=r=>{assert.equal(r.error?.code??null,null,r.error?.message);return r.data;};
 const marker=crypto.randomUUID(),sends=[],proof=[];
 const templates=load('../src/lib/communications/templates.ts',{'@/lib/email/config':{getEmailSetupState:()=>({replyTo:'office@example.invalid'})},'server-only':{},'@/lib/business-time':{formatBusinessDate},'../email/customer-reminder-layout.ts':{renderCustomerReminderEmailHtml}});
 const durable=load('../src/lib/email/delivery.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'node:crypto':crypto,'@/lib/email/delivery-context':{emailDeliveryContext}});
 const followups=load('../src/lib/email/delivery-followups.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'@/lib/communications/queue':{syncAutomatedCommunications:()=>assert.fail('Visit notice has no financial follow-up')},'@/lib/runtime/deadline':{withDeadline},'@/lib/email/delivery':durable});
 const processor=load('../src/lib/communications/processor.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'../quotes/proposal-number.ts':{},'@/lib/payments/reconciliation':{},'@/lib/communications/portal-links':{},'@/lib/communications/queue':{getCommunicationSettingsFromClient:async()=>db.from('communication_settings').select('*').eq('singleton',true).single()},'@/lib/communications/templates':templates,'@/lib/email/delivery-context':{emailDeliveryContext},'@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('Real provider transport forbidden')},'@/lib/supabase/admin':{getServiceRoleClient:()=>assert.fail('Explicit disposable DB required')},'@/lib/runtime/deadline':{mapBounded,withDeadline}});
 const send=async input=>{const result=await durable.sendDurableEmail(input,{db,configured:true,envelope:{from:'office@example.invalid',replyTo:'office@example.invalid'},transport:async frozen=>{
  assert.match(frozen.to,/@example\.invalid$/);assert.ok(frozen.deliveryId);assert.equal(frozen.skipLegacyHistory,true);sends.push(frozen);
  return{ok:true,outcome:'accepted',configured:true,historyRecorded:true,providerMessageId:'synthetic-'+crypto.randomUUID(),retryable:false};
 }});return result.ok&&result.deliveryId?followups.completeDeliveryFollowups(db,result.deliveryId,result):result;};
 const settings=ok(await db.from('communication_settings').select('*').eq('singleton',true).single());
 t.after(async()=>{ok(await db.from('communication_settings').update({automated_sending_enabled:settings.automated_sending_enabled,appointment_change_notices_enabled:settings.appointment_change_notices_enabled}).eq('singleton',true));if(process.env.APPOINTMENT_NOTICES_RESULTS_FILE)writeFileSync(process.env.APPOINTMENT_NOTICES_RESULTS_FILE,JSON.stringify({proof,syntheticTransportCalls:sends.length,realProviderCalls:0,productionChanged:false},null,2)+'\n',{mode:0o600});});
 ok(await db.from('communication_settings').update({automated_sending_enabled:true,appointment_change_notices_enabled:true}).eq('singleton',true));
 const customer=ok(await db.from('customers').insert({display_name:'Synthetic notice '+marker,email:'notice-'+marker+'@example.invalid'}).select('*').single());
 const location=ok(await db.from('service_locations').insert({customer_id:customer.id,street:'123 Synthetic Lane',city:'Fredericksburg',state:'VA'}).select('id').single());
 const job=ok(await db.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'new_lead',service_type:'other',requested_scope:'Synthetic notice workflow'}).select('id').single());
 const start=new Date(Date.now()+10*86400000).toISOString(),end=new Date(Date.parse(start)+3600000).toISOString();
 const visit=ok(await db.from('schedule_events').insert({job_id:job.id,service_location_id:location.id,title:'Synthetic estimate',event_type:'estimate',status:'scheduled',starts_at:start,ends_at:end,calendar_notes:'PRIVATE NOTE NEVER FOR EMAIL'}).select('*').single());
 const change=async id=>ok(await db.from('schedule_events').update({ends_at:new Date(Date.parse(end)+3600000*id).toISOString()}).eq('id',visit.id));
 const pending=async()=>ok(await db.from('customer_communications').select('*').eq('schedule_event_id',visit.id).eq('status','pending').single());
 const due=async id=>ok(await db.from('customer_communications').update({scheduled_for:new Date(Date.now()-60000).toISOString()}).eq('id',id));
 const run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,passed:true});});
 await run('real concurrent workers accept one frozen message and retain source reconciliation',async()=>{
  await change(1);const row=await pending();await due(row.id);
  const results=await Promise.all([processor.processCommunicationById(row.id,{db,send}),processor.processCommunicationById(row.id,{db,send})]);
  assert.ok(results.some(r=>r.outcome==='accepted'&&r.recorded));assert.equal(sends.length,1);
  assert.equal(ok(await db.from('customer_communications').select('status').eq('id',row.id).single()).status,'sent');
  assert.equal(sends[0].idempotencyKey,'customer-communication/'+row.id);assert.doesNotMatch(sends[0].text,/PRIVATE NOTE/);
  await processor.processCommunicationById(row.id,{db,send});assert.equal(sends.length,1);
 });
 await run('second end-only revision inside 24 hours has a distinct durable delivery',async()=>{
  await change(2);const row=await pending();await due(row.id);const r=await processor.processCommunicationById(row.id,{db,send});
  assert.equal(r.outcome,'accepted');assert.equal(r.recorded,true);assert.equal(sends.length,2);assert.notEqual(sends[0].deliveryId,sends[1].deliveryId);
 });
 await run('rapid change then cancellation sends only the latest cancellation',async()=>{
  await change(3);const previous=await pending();ok(await db.from('schedule_events').update({status:'cancelled'}).eq('id',visit.id));
  const row=await pending();assert.equal(row.communication_type,'appointment_cancelled');await due(row.id);
  assert.equal(ok(await db.from('customer_communications').select('status').eq('id',previous.id).single()).status,'cancelled');
  assert.equal((await processor.processCommunicationById(previous.id,{db,send})).outcome,'not_sent');
  assert.equal((await processor.processCommunicationById(row.id,{db,send})).outcome,'accepted');assert.equal(sends.length,3);assert.match(sends[2].text,/this visit only/);
 });
 await run('concurrent native preparation/dispatch retains one request, outbox and attempt identity',async()=>{
  ok(await db.from('schedule_events').update({status:'scheduled'}).eq('id',visit.id));const row=await pending();await due(row.id);
  ok(await db.from('customer_communications').update({status:'processing',attempt_count:1,processing_started_at:new Date().toISOString()}).eq('id',row.id));
  const ctx=emailDeliveryContext({to:customer.email,emailType:row.communication_type,relatedCommunicationId:row.id,relatedCustomerId:customer.id,relatedScheduleEventId:visit.id,relatedJobId:job.id});
  const snapshot=ok(await db.rpc('get_outbound_source_snapshot',{p_context:ctx}));
  const args={p_request_key:'customer-communication/'+row.id,p_payload:{from:'office@example.invalid',reply_to:'office@example.invalid',to:[customer.email],cc:[],subject:'Synthetic concurrency',text:'No provider is called.'},p_context:ctx,p_expected_snapshot:snapshot};
  const rows=(await Promise.all([db.rpc('prepare_outbound_delivery',args),db.rpc('prepare_outbound_delivery',args)])).map(ok);
  assert.equal(rows[0].id,rows[1].id);assert.equal(rows[0].conflict,false);assert.equal(rows[1].conflict,false);
  const claims=(await Promise.all([db.rpc('claim_outbound_delivery',{p_delivery_id:rows[0].id}),db.rpc('claim_outbound_delivery',{p_delivery_id:rows[0].id})])).map(ok);
  assert.equal(claims.filter(Boolean).length,1);const claim=claims.find(Boolean);
  ok(await db.rpc('finish_outbound_delivery',{p_delivery_id:rows[0].id,p_attempt_id:claim.attempt_id,p_outcome:'not_attempted',p_provider_message_id:null}));
 });
 await run('new server RPCs remain inaccessible to anonymous clients',async()=>{
  for(const [name,args]of [['get_appointment_change_notice',{p_communication_id:crypto.randomUUID()}],['get_appointment_notice_coverage',{}]])assert.equal((await anon.rpc(name,args)).error?.code,'42501');
 });
});
