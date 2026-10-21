import assert from 'node:assert/strict';
import {load} from './pr10-test-helpers.mjs';
import * as editResult from '../src/lib/quotes/edit-result.ts';
import * as parties from '../src/lib/contracting-parties.ts';
import {withReturnTo} from '../src/lib/drafts/return-context.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
export const quoteId='a0000000-0000-4000-8000-000000000001',retained='a0000000-0000-4000-8000-000000000002',
 added='a0000000-0000-4000-8000-000000000003',other='a0000000-0000-4000-8000-000000000004',location='a0000000-0000-4000-8000-000000000005';
export const saveRow=(patch={})=>({id:quoteId,edit_revision:8,line_ids:[retained,added],...patch});
export const conflictRow={conflict:true,current_revision:9,current_total_cents:1700,current_status:'sent',changed_by:'Another editor',changed_at:null};
export const requestId='a0000000-0000-4000-8000-000000000006';
export function quoteEditFixture(options={}){
 const calls=[],paths=[],redirects=[],archives=[],reads=[],signals=[];
 const id=options.id??quoteId,party=options.party??other,loc=options.location??location,actor=options.actor??other;
 const receiptHelper=load('../src/lib/quotes/save-confirmation.ts',{'server-only':{},'./edit-result':editResult,'../runtime/deadline.ts':{
  withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,options.timeoutMs??ms);},
 }});
 const draftHelper=load('../src/lib/quotes/draft-request.ts',{'server-only':{},'./edit-result':editResult,'../runtime/deadline.ts':{
  withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,options.timeoutMs??ms);},
 }});
 const detail={id,edit_revision:8,quote_number:'LOCAL',customer_id:options.organization?null:party,organization_id:options.organization?party:null,
  service_location_id:loc,status:options.closed?'approved':'sent',total_cents:1500,quote_line_items:[]};
 const db={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:actor}},error:null})},from(table){
  reads.push(table);const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},in(){return q;},
   single:async()=>({data:table==='quotes'?(options.missing?null:{...detail,job_id:options.lead?other:null}):table==='customers'||table==='organizations'?{id:party,status:'active'}:
    table==='service_locations'?{id:loc,customer_id:options.organization?null:party,organization_id:options.organization?party:null}:
     table==='jobs'?{id:other,customer_id:party,organization_id:null,service_location_id:loc,website_submission_id:'local-test'}:assert.fail('Unexpected table '+table),error:null}),
   maybeSingle:async()=>({data:null,error:null}),then(resolve,reject){return Promise.resolve({data:table==='organization_contacts'?[{id:other,organization_id:party,is_active:true}]:[],error:null}).then(resolve,reject);}};return q;
 },rpc(name,args){
  assert.equal(name,options.create?(options.legacyCreate?'create_quote_draft':'create_quote_draft_request'):'save_quote_details');calls.push({name,args});
  const q={abortSignal(signal){signals.push(signal);return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(options.rpc)return options.rpc(name,args);
   if(options.throw)throw Error('PRIVATE_TRANSPORT_DETAIL');if(options.hang)return new Promise(()=>{});
   return Object.hasOwn(options,'receipt')?options.receipt:{data:saveRow({id,...(options.create?{
    request_id:options.requestId??requestId,replayed:false,quote_status:'draft',customer_id:options.organization?null:party,
    organization_id:options.organization?party:null,service_location_id:loc,job_id:options.lead?other:null,...options.row}: {})}),error:null};
  }).then(resolve,reject);}};return q;
 }};
 const action=load(options.actionFile??'../src/app/admin/quotes/actions.ts',{
  'next/cache':{revalidatePath:p=>paths.push(p)},'next/navigation':{redirect:p=>{redirects.push(p);throw Error('TEST_REDIRECT');}},
  '@/lib/drafts/return-context':{withReturnTo},'@/lib/business-time':{parseBusinessDateTime:()=>assert.fail('No expiry in fixture')},
  '@/lib/auth/roles':{getCurrentUserRolesFromClient:async()=>options.denied?[]:['owner'],hasAllowedRole:r=>r.includes('owner'),platformRoleGroups:{internalStaff:['owner']}},
  '@/lib/supabase/server':{createClient:async()=>options.unconfigured?null:db},'@/lib/contracting-parties':parties,
  '@/lib/leads/archive':{archiveWebsiteLead:async(...args)=>{archives.push(args);return{status:options.archiveError?'error':'success'};}},
  '@/lib/quotes/lead-prefill':{isMatchingQuoteLeadSource:()=>true},'@/lib/security/errors':{safeStaffMessage:()=> 'Safe error'},
  '@/lib/quotes/edit-result':editResult,'@/lib/quotes/save-confirmation':receiptHelper,
  '@/lib/quotes/draft-request':draftHelper,
 });
 const mobile=load(options.mobileFile??'../src/lib/data/mobile-quotes.ts',{'server-only':{},'@/lib/quotes/edit-result':editResult,
  '@/lib/quotes/save-confirmation':receiptHelper,'@/lib/quotes/proposal-number':{formatProposalNumber:n=>n},'@/lib/api/mobile-quotes':{}});
 const form=new FormData();for(const[k,v]of Object.entries({quote_id:id,contracting_party:`${options.organization?'organization':'customer'}:${party}`,
  service_location_id:loc,expected_revision:'5',submit_intent:options.intent??'save',client_navigation:options.serverRedirect?'0':'1',returnTo:'/admin/quotes?q=local'}))form.set(k,v);
 form.set('request_id',options.requestId??requestId);
 if(options.organization){form.set('recipient_contact_id',other);form.set('approval_contact_id',other);}
 if(options.lead){form.set('job_id',other);form.set('source_lead_job_id',other);}
 const lineId=options.retainedId??retained;
 for(const[persisted,client,name,price]of [[options.create?'':lineId,'retained-client','Pruning','10'],['','new-client','Cleanup','5']])
  for(const[k,v]of Object.entries({line_item_id:persisted,line_item_client_id:client,line_item_name:name,line_item_description:'Saved wording',
   line_item_quantity:'1',line_item_unit_price:price}))form.append(k,v);
 const input={customerId:options.organization?null:party,organizationId:options.organization?party:null,serviceLocationId:loc,expectedRevision:5,
  lines:[{id:lineId,name:'Pruning',description:'Saved wording',quantity:1,unitPriceCents:1000},
   {name:'Cleanup',description:'Saved wording',quantity:1,unitPriceCents:500}]};
 return{form,input,db,calls,reads,paths,redirects,archives,signals,
  run:()=>action.updateQuote({status:'idle',message:''},form),runCreate:()=>action.createQuote({status:'idle',message:''},form),runMobile:()=>mobile.updateMobileQuote(db,actor,id,input)};
}
