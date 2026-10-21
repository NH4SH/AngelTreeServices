import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
import {withReturnTo} from '../src/lib/drafts/return-context.ts';
import {getInvoiceDueAt} from '../src/lib/invoices/due-date.ts';
import {safeStaffMessage} from '../src/lib/security/errors.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
export const invoiceId='10000000-0000-4000-8000-000000000001';
export const retained='10000000-0000-4000-8000-000000000002';
export const added='10000000-0000-4000-8000-000000000003';
export const other='10000000-0000-4000-8000-000000000004';
export const version='2026-10-20T06:01:02.123456+00:00';
export const savedVersion='2026-10-20T06:02:03.456789+00:00';
export const saveRow=(changes={})=>({id:invoiceId,updated_at:savedVersion,line_ids:[retained,added],...changes});
export function invoiceEditFixture(options={}){
 const calls=[],paths=[],redirects=[],signals=[];
 const helper=load('../src/lib/invoices/save-confirmation.ts',{'server-only':{},'../runtime/deadline.ts':{
  withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,options.timeoutMs??ms);},
 }});
 const db={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:other}},error:null})},from(table){
  assert.equal(table,'invoices');const q={select(){return q;},eq(k,v){assert.equal(k,'id');assert.equal(v,options.id??invoiceId);return q;},
   single:async()=>({data:options.lookupMissing?null:{id:options.id??invoiceId,customer_id:options.organization?null:other,organization_id:options.organization?other:null},error:null})};return q;
 },rpc(name,args){
  assert.equal(name,'save_invoice_details');calls.push({name,args});
  const q={abortSignal(signal){assert.ok(signal instanceof AbortSignal);signals.push(signal);return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(options.rpc)return options.rpc(name,args);
   if(options.throw)throw Error('PRIVATE_TRANSPORT_DETAIL');
   if(options.hang)return new Promise(()=>{});
   return Object.hasOwn(options,'receipt')?options.receipt:{data:saveRow(options.row),error:null};
  }).then(resolve,reject);}};return q;
 }};
 const action=load(options.actionFile??'../src/app/admin/invoices/actions.ts',{
  'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:p=>{redirects.push(p);throw Error('TEST_REDIRECT');}},
  '@/lib/drafts/return-context':{withReturnTo},'@/lib/activity-log':{recordActivity:()=>assert.fail('Editor must use existing transactional audit')},
  '@/lib/auth/roles':{getUserRoles:async()=>options.denied?[]:['owner'],hasAllowedRole:r=>r.includes('owner'),platformRoleGroups:{internalStaff:['owner']}},
  '@/lib/supabase/server':{createClient:async()=>options.unconfigured?null:db},'@/lib/contracting-parties':{},
  '@/lib/invoices/due-date':{getInvoiceDueAt},'@/lib/invoices/save-confirmation':helper,'@/lib/invoices/generation-request':{},
  '@/lib/invoices/standalone-request':{},
  '@/lib/security/errors':{safeStaffMessage},
 });
 const form=new FormData();
 for(const [key,value]of Object.entries({invoice_id:options.id??invoiceId,expected_updated_at:options.version??version,due_date:'2026-11-04',
  submit_intent:options.intent??'save',client_navigation:options.serverRedirect?'0':'1',returnTo:'/admin/invoices?q=local'}))form.set(key,value);
 for(const [id,client,name,price]of [[options.retainedId??retained,'retained-client','Pruning','10'],['','new-client','Cleanup','5']]){
  for(const [key,value]of Object.entries({invoice_line_item_id:id,invoice_line_item_client_id:client,invoice_line_item_name:name,
   invoice_line_item_description:'Saved wording',invoice_line_item_quantity:'1',invoice_line_item_unit_price:price,invoice_line_item_service_category_id:''}))form.append(key,value);
 }
 return {form,calls,paths,redirects,signals,db,run:()=>action.updateInvoice({status:'idle',message:''},form)};
}
