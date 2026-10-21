import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
import * as generation from '../src/lib/invoices/generation-request.ts';
import * as completion from '../src/lib/jobs/completion-request.ts';
import * as parties from '../src/lib/contracting-parties.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {withReturnTo} from '../src/lib/drafts/return-context.ts';
import {getInvoiceDueAt} from '../src/lib/invoices/due-date.ts';
export const jobId='b0000000-0000-4000-8000-000000000001',quoteId='b0000000-0000-4000-8000-000000000002',
 invoiceId='b0000000-0000-4000-8000-000000000003',requestId='b0000000-0000-4000-8000-000000000004',other='b0000000-0000-4000-8000-000000000005';
export const generated=(patch={})=>({invoice_id:invoiceId,job_id:jobId,existing:false,replayed:false,invoice_status:'draft',job_completed:false,added_change_order_count:0,...patch});
export const context=(patch={})=>({job_id:jobId,revision:6,status:'completed',completed_at:'2026-10-20T12:00:00Z',future_count:0,has_invoice:true,closeout_status:null,
 visits:[],snapshot:{visits:[],scope_items:[],checklist:[],closeout:null},...patch});
export const completed=(combined=true,patch={})=>({job_id:jobId,job_completed:true,already_completed:false,closed_visit_count:1,replayed:false,
 context:context({has_invoice:combined}),...(combined?generated({job_completed:true}):{}),...patch});
export function generationFixture(options={}){
 const calls=[],paths=[],redirects=[],reads=[],signals=[];
 const helper=load('../src/lib/invoices/generation-confirmation.ts',{'server-only':{},'./generation-request.ts':generation,'../jobs/completion-request.ts':completion,
  '../runtime/deadline.ts':{withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,options.timeoutMs??ms);}}});
 const mode=options.mode??'job',isCompletion=mode==='completion'||mode==='complete';
 const rows={invoices:{id:invoiceId,job_id:options.invoiceJobId??jobId},quotes:{id:quoteId,job_id:options.legacyQuote?null:jobId},
  jobs:{id:jobId,source_quote_id:options.sourceQuoteId??quoteId,customer_id:other,organization_id:null,service_location_id:other,status:'scheduled'},
  customers:{id:other,status:'active'},service_locations:{id:other,customer_id:other,organization_id:null}};
 const db={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:other}},error:null})},from(table){
  let confirming=false,filterId;
  const q={select(){return q;},eq(key,value){if(key==='id')filterId=value;return q;},abortSignal(signal){confirming=true;signals.push(signal);return q;},single:async()=>{
   reads.push(table);if(mode==='manual'&&!confirming)return {data:rows[table],error:null};
   if(options.read)return options.read(table,filterId);
   if(options.readThrow)throw Error('PRIVATE_READ_DETAIL');if(options.readHang)return new Promise(()=>{});
   return Object.hasOwn(options,'readReceipt')?options.readReceipt:{data:options.missingRead?null:rows[table],error:null};
  }};return q;
 },rpc(name,args){
  calls.push({name,args});const q={abortSignal(signal){signals.push(signal);return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(options.rpc)return options.rpc(name,args);if(options.throw)throw Error('PRIVATE_TRANSPORT_DETAIL');if(options.hang)return new Promise(()=>{});
   return Object.hasOwn(options,'receipt')?options.receipt:{data:isCompletion?completed(mode==='completion',options.patch):generated(options.patch),error:null};
  }).then(resolve,reject);}};return q;
 }};
 const deps={
  'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:p=>{redirects.push(p);throw Error('TEST_REDIRECT');}},
  '@/lib/activity-log':{},'@/lib/auth/roles':{getUserRoles:async()=>options.denied?[]:['owner'],hasAllowedRole:r=>r.includes('owner'),platformRoleGroups:{internalStaff:['owner']}},
  '@/lib/supabase/server':{createClient:async()=>options.unconfigured?null:db},'@/lib/quotes/workflow':{},'@/lib/payments/invoice-void':{},
  '@/lib/stripe/server':{},'@/lib/supabase/admin':{},'@/lib/communications/queue':{},'@/lib/payments/reconciliation':{},
  '@/lib/invoices/generation-request':generation,'@/lib/invoices/generation-confirmation':helper,'@/lib/security/errors':{safeStaffMessage:()=> 'Safe error'},
  '@/lib/jobs/completion-request':completion,'@/lib/drafts/return-context':{withReturnTo},'@/lib/contracting-parties':parties,
  '@/lib/invoices/due-date':{getInvoiceDueAt},'@/lib/invoices/save-confirmation':{},'@/lib/invoices/standalone-request':{},
 };
 const file=options.actionFile??(isCompletion?'../src/lib/actions/job-completion.ts':mode==='manual'?'../src/app/admin/invoices/actions.ts':'../src/lib/actions/workflow.ts');
 const actions=load(file,deps),form=new FormData();
 for(const[k,v]of Object.entries({job_id:jobId,quote_id:quoteId,request_id:requestId,expected_revision:'5',expected_snapshot:JSON.stringify(context().snapshot),
  mode:mode==='completion'?'complete_and_invoice':'complete',contracting_party:'customer:'+other,service_location_id:other,due_date:'2026-11-04',
  invoice_line_item_name:'Synthetic work',invoice_line_item_quantity:'1',invoice_line_item_unit_price:'10',returnTo:'/admin/invoices?q=local',client_navigation:options.serverRedirect?'0':'1'}))form.set(k,v);
 const action=isCompletion?actions.completeJobWork:mode==='manual'?actions.createInvoice:mode==='quote'?actions.createInvoiceFromQuote:actions.createInvoiceFromJob;
 return{form,db,rows,calls,paths,redirects,reads,signals,run:()=>action({status:'idle',message:''},form)};
}
