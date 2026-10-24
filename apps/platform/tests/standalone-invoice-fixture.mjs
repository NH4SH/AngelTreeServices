import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
import * as party from '../src/lib/contracting-parties.ts';
import * as generation from '../src/lib/invoices/generation-request.ts';
import {getInvoiceDueAt} from '../src/lib/invoices/due-date.ts';
import {withReturnTo} from '../src/lib/drafts/return-context.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
export const requestId='20000000-0000-4000-8000-000000000001',invoiceId='20000000-0000-4000-8000-000000000002';
export const partyId='20000000-0000-4000-8000-000000000003',locationId='20000000-0000-4000-8000-000000000004';
export const actorId='20000000-0000-4000-8000-000000000005',other='20000000-0000-4000-8000-000000000006';
export const standaloneRow=(options={},changes={})=>({request_id:options.requestId??requestId,invoice_id:invoiceId,
 customer_id:options.organization?null:(options.partyId??partyId),organization_id:options.organization?(options.partyId??partyId):null,
 service_location_id:options.newCustomer?locationId:options.locationId??null,replayed:false,invoice_status:'draft',note_warning:false,...changes});
export function standaloneFixture(options={}){
 const calls=[],paths=[],redirects=[],signals=[];
 const helper=load('../src/lib/invoices/standalone-request.ts',{'../documents/terms/firewood-2026-10-24.ts':load('../src/lib/documents/terms/firewood-2026-10-24.ts'),'server-only':{},'../runtime/deadline.ts':{
  withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,options.timeoutMs??ms);},
 },'./generation-request.ts':generation});
 const db={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:actorId}},error:null})},
 from:()=>assert.fail('Standalone action must delegate every mutation to the atomic command'),
 rpc(name,args){calls.push({name,args});assert.equal(name,'create_standalone_invoice');
  const q={abortSignal(signal){signals.push(signal);return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(options.rpc)return options.rpc(name,args);
   if(options.throw)throw Error('PRIVATE_TRANSPORT_DETAIL');if(options.hang)return new Promise(()=>{});
   return Object.hasOwn(options,'receipt')?options.receipt:{data:standaloneRow(options,options.row),error:null};
  }).then(resolve,reject);}};return q;
 }};
 const action=load(options.actionFile??'../src/app/admin/invoices/actions.ts',{
  'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:p=>{redirects.push(p);throw Error('TEST_REDIRECT');}},
  '@/lib/drafts/return-context':{withReturnTo},'@/lib/activity-log':{recordActivity:()=>assert.fail('No second audit outside the transaction')},
  '@/lib/auth/roles':{getUserRoles:async()=>options.denied?[]:['owner'],hasAllowedRole:r=>r.includes('owner'),platformRoleGroups:{internalStaff:['owner']}},
  '@/lib/supabase/server':{createClient:async()=>options.unconfigured?null:db},'@/lib/contracting-parties':party,
  '@/lib/invoices/due-date':{getInvoiceDueAt},'@/lib/invoices/generation-request':generation,'@/lib/invoices/save-confirmation':{},
  '@/lib/invoices/standalone-request':helper,'@/lib/security/errors':{safeStaffMessage:()=>assert.fail('No arbitrary backend detail exposed')},
  '@/lib/invoices/generation-confirmation':{},
 });
 const form=new FormData();
 for(const [k,v]of Object.entries({request_id:options.requestId??requestId,contracting_party:options.newCustomer?'new_customer':`${options.organization?'organization':'customer'}:${options.partyId??partyId}`,
  service_location_id:options.locationId??'',due_date:'2026-11-04',notes:options.notes??'Local internal note',client_navigation:options.serverRedirect?'0':'1',returnTo:'/admin/invoices?q=local',
  invoice_line_item_client_id:'new-line',invoice_line_item_name:'Pruning',invoice_line_item_quantity:'1',invoice_line_item_unit_price:'10',
  new_customer_name:'Synthetic customer',new_customer_email:'synthetic@example.invalid',new_customer_street:'123 Synthetic St',new_customer_city:'Fredericksburg',new_customer_state:'VA'}))form.set(k,v);
 return {form,calls,paths,redirects,signals,run:()=>action.createInvoice({status:'idle',message:''},form)};
}
