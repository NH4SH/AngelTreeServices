import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
import * as contract from '../src/lib/quotes/lookup-contract.ts';
import * as invoiceContract from '../src/lib/invoices/lookup-contract.ts';
import {escapeSearchLike} from '../src/lib/record-search.ts';

const id=randomUUID(),jobId=randomUUID(),locationId=randomUUID();
function reader({job={id:jobId,customer_id:id,organization_id:null,service_location_id:locationId},error=null,missingSelection=false}={}){
 const calls=[],db={from(table){const ops=[];calls.push({table,ops});let single=false;
  const q=new Proxy({then(resolve,reject){return Promise.resolve(single?{data:table==='jobs'?job:{id},error}:{data:missingSelection?[]:[{id:ops.find(x=>x[0]==='eq'&&x[1]==='id')?.[2]??id,display_name:'Synthetic name',phone:'2025550100',street:'Synthetic Lane',requested_scope:'Synthetic work',status:'completed'}],count:missingSelection?0:1105,error}).then(resolve,reject);}},{get(t,key){return key in t?t[key]:(...args)=>{ops.push([key,...args]);if(key==='maybeSingle'||key==='single')single=true;return q;};}});return q;
 }};
 const shared=load('../src/lib/data/quote-lookup-pages.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/business-time':{},'@/lib/record-search':{escapeSearchLike},'@/lib/quotes/lookup-contract':contract});
 const invoice=load('../src/lib/data/invoice-lookup-pages.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/data/quote-lookup-pages':shared,'@/lib/quotes/lookup-contract':contract,'@/lib/invoices/lookup-contract':invoiceContract});
 return{calls,db,...shared,...invoice};
}
test('invoice lookup accepts only its fixed party/location/work-order kinds',()=>{
 const r=reader();for(const q of ['kind=contact&party=organization:'+id,'kind=estimate','kind=job','kind=party&statuses=paid','kind=party&page=0'])assert.equal(r.parseInvoiceLookupRequest(new URLSearchParams(q)),null);
 assert.equal(r.parseInvoiceLookupRequest(new URLSearchParams('kind=job&party=customer:'+id+'&page=56')).page,56);
});
test('invoiceable job filtering runs in the bounded caller-RLS query; quote job choices remain unchanged',async()=>{
 const r=reader(),input=r.parseInvoiceLookupRequest(new URLSearchParams({kind:'job',party:'customer:'+id,page:'56'}));await r.readQuoteLookupPage(r.db,input,true);
 assert.deepEqual(r.calls[1].ops.find(x=>x[0]==='in'),['in','status',['completed','ready_to_invoice']]);assert.deepEqual(r.calls[1].ops.find(x=>x[0]==='range'),['range',1100,1119]);assert.ok(r.calls[1].ops.some(x=>x[0]==='eq'&&x[1]==='customer_id'&&x[2]===id));
 const quote=reader();await quote.readQuoteLookupPage(quote.db,input);assert.equal(quote.calls[1].ops.some(x=>x[0]==='in'),false);
});
test('invoice customer search retains phone and billing-address matching without returning billing/private records',async()=>{
 const r=reader(),input=r.parseInvoiceLookupRequest(new URLSearchParams({kind:'party',q:'%,("\\_'})),page=await r.readQuoteLookupPage(r.db,input,true);
 assert.equal(page.items[0].label,'Synthetic name — 2025550100');assert.deepEqual(Object.keys(page.items[0]).sort(),['label','value']);assert.equal(r.calls[0].ops.find(x=>x[0]==='select')[1],'id, display_name, phone');assert.match(r.calls[0].ops.find(x=>x[0]==='or')[1],/billing_address\.ilike/);
});
test('blank creation performs no directory reads; a work-order prefill resolves only its exact party and property',async()=>{
 const empty=reader();assert.equal((await empty.getInvoiceCreationLookups()).error,null);assert.equal(empty.calls.length,0);
 const r=reader(),result=await r.getInvoiceCreationLookups('',jobId);assert.equal(result.error,null);assert.deepEqual(result.values,{contracting_party:'customer:'+id,service_location_id:locationId,job_id:jobId});assert.equal(Object.keys(result.data).length,3);
 assert.ok(r.calls.every(call=>call.ops.some(x=>x[0]==='eq'&&x[1]==='id')));assert.equal(r.calls[0].ops.find(x=>x[0]==='select')[1],'id, customer_id, organization_id, service_location_id');
});
test('invalid, missing, conflicting and incomplete prefills cannot broaden lookup scope or silently drop IDs',async()=>{
 for(const[options,customer,job]of[[{},'invalid',''],[{job:null},'',jobId],[{},randomUUID(),jobId],[{error:{message:'PRIVATE'}},id,jobId],[{missingSelection:true},id,'']]){
  const r=reader(options),result=await r.getInvoiceCreationLookups(customer,job);assert.ok(result.error);assert.deepEqual(result.data,{});assert.equal(result.values.job_id,job);assert.doesNotMatch(result.error,/PRIVATE/);
 }
});
test('invoice editor projection excludes workflow/private metadata and incomplete billing lines fail closed',async()=>{
 for(const[data,error]of[[{id,invoice_line_items:[]},null],[{id,invoice_line_items:null},null],[{id:jobId,invoice_line_items:[]},null],[{id,invoice_line_items:[]},{message:'PRIVATE'}]]){
  let columns;const q={select(c){columns=c;return q;},eq(){return q;},single:async()=>({data,error})};const m=load('../src/lib/data/invoices.ts',{'@/lib/supabase/server':{createClient:async()=>({from:()=>q})},'@/lib/data/admin-search':{},'@/lib/security/errors':{safeStaffMessage:()=>assert.fail('Raw error must not enter page')}}),result=await m.getInvoiceForEditing(id);
  assert.ok(!columns.startsWith('*'));assert.doesNotMatch(columns,/payment_preference|automatic_reminders|billing_contact|payments\(/);assert.match(columns,/updated_at/);assert.match(columns,/balance_due_cents/);assert.equal(Boolean(result.data),!error&&Array.isArray(data.invoice_line_items)&&data.id===id);assert.doesNotMatch(result.error??'',/PRIVATE/);
 }
});
test('invoice HTTP lookup requires live office access, sets no-store and always enforces invoice filters',async()=>{
 for(const actor of ['anonymous','crew','owner','failure']){let reads=0;const r=reader(),m=load('../src/app/api/admin/invoices/lookups/route.ts',{'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:actor==='anonymous'?null:{id}},error:null})}})},'@/lib/auth/roles':{getUserRoles:async()=>[actor==='failure'?'owner':actor],hasAllowedRole:(roles,allowed)=>roles.some(x=>allowed.includes(x)),platformRoleGroups:{internalStaff:['owner']}},'@/lib/data/invoice-lookup-pages':r,'@/lib/data/quote-lookup-pages':{readQuoteLookupPage:async(db,input,invoice)=>{reads++;assert.equal(invoice,true);if(actor==='failure')throw Error('PRIVATE');return{items:[],page:1,pageSize:20,total:0}}},'@/lib/security/headers':{privateNoStoreHeaders:[{key:'Cache-Control',value:'private, no-store'}]}}),response=await m.GET(new Request('https://crm.example.invalid/api/admin/invoices/lookups?kind=party'));
  assert.equal(response.status,actor==='anonymous'?401:actor==='crew'?403:actor==='failure'?503:200);assert.equal(reads,['owner','failure'].includes(actor)?1:0);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.doesNotMatch(await response.text(),/PRIVATE/);
 }
});
