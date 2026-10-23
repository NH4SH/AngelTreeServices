import assert from 'node:assert/strict';
import {load,memoryDB} from './pr10-test-helpers.mjs';
import {contextFixture,invoiceId,customerId,paymentId} from './portal-payment-context-fixture.mjs';
import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import {withDeadline,mapBounded} from '../src/lib/runtime/deadline.ts';

export function reminderFixture(options={}) {
 const subjectId=options.invoiceId??invoiceId;
 const now=new Date().toISOString(),sends=[],balances=[],reads=[];
 const row={id:'00000000-0000-4000-8000-000000000005',customer_id:customerId,organization_id:null,invoice_id:subjectId,quote_id:null,job_id:null,schedule_event_id:null,appointment_id:null,payment_id:options.confirmation?paymentId:null,communication_type:options.confirmation?'payment_confirmation':options.overdue?'overdue_invoice_reminder':'invoice_payment_reminder',recipient_email:'synthetic@example.invalid',status:'pending',attempt_count:0,created_at:now,scheduled_for:now,processing_started_at:null,is_automatic:false};
 const tables={customer_communications:[row],customers:[{id:customerId,display_name:'Synthetic Customer',email:row.recipient_email,status:'active'}],invoices:[{id:subjectId,status:'sent',total_cents:options.total??2000,due_at:null,automatic_reminders_enabled:true,invoice_number:'SYNTHETIC',jobs:null}],payments:[{id:paymentId,invoice_id:subjectId,status:'succeeded',amount_cents:400,provider:'manual',invoices:{id:subjectId,total_cents:options.total??2000,invoice_number:'SYNTHETIC'}}],email_events:[]};
 if(options.payment)Object.assign(tables.payments[0],options.payment);
 const db=memoryDB(tables),oldFrom=db.from.bind(db),oldRpc=db.rpc.bind(db);
 db.from=table=>{
  if(table==='payments'&&!options.confirmation)assert.fail('Reminder balances must not download a capped payment list');
  return oldFrom(table);
 };
 db.rpc=(name,args)=>{
  if(name!=='get_invoice_payment_principal')return oldRpc(name,args);
  reads.push({name,args});assert.deepEqual(args,{p_invoice_id:subjectId});
  const q={abortSignal(signal){signal.addEventListener('abort',()=>reads.push({aborted:true}));return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(options.readPrincipal)return options.readPrincipal(args);
   if(options.throws)throw Error('Private transport diagnostic');if(options.hangs)return new Promise(()=>{});
   return options.receipt??{data:{invoice_id:subjectId,successful_payment_count:1005,paid_principal_cents:1005},error:null};
  }).then(resolve,reject);}};return q;
 };
 const principal=contextFixture({db,fastDeadline:options.hangs}).reconciliation;
 const template=input=>{balances.push(input.balanceDueCents);return options.template?options.template(input):{subject:'Synthetic reminder',text:'Local only',html:'<p>Local only</p>'};};
 const processor=load('../src/lib/communications/processor.ts',{
  'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'../quotes/proposal-number.ts':{},'@/lib/payments/reconciliation':principal,
  '@/lib/communications/portal-links':{getExistingCommunicationPortalUrl:async()=>({tokenId:"00000000-0000-4000-8000-000000000001",url:'http://127.0.0.1:3102/portal/invoice/synthetic'})},
  '@/lib/communications/queue':{getCommunicationSettingsFromClient:async()=>({data:{automated_sending_enabled:false,minimum_send_interval_hours:24,business_timezone:'America/New_York'},error:null})},
  '@/lib/communications/templates':{invoiceReminderTemplate:template,paymentConfirmationTemplate:template},'@/lib/email/delivery-context':{emailDeliveryContext},
  '@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('No real provider')},'@/lib/supabase/admin':{},'@/lib/runtime/deadline':{withDeadline,mapBounded},
 });
 return{db,row,tables,reads,balances,sends,run:()=>processor.processCommunicationById(row.id,{db,send:async input=>{sends.push(input);return{ok:true,outcome:'accepted',historyRecorded:true,providerMessageId:'synthetic-accepted',retryable:false};}})};
}
