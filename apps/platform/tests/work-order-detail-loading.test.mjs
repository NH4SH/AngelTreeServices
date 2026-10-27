import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './pr10-test-helpers.mjs';
const id='a0000000-0000-4000-8000-000000000001';
const row=()=>({id,notes:[],quotes:[],invoices:[],appointments:[],schedule_events:[],equipment_assignments:[],change_orders:[]});
function reader(reply={data:row(),error:null}) {
 const calls=[],ops=[],q=new Proxy({}, {get:(_,name)=>(...args)=>{ops.push([name,...args]);return name==='maybeSingle'?Promise.resolve(reply):q;}});
 return {calls,ops,run:()=>load('../src/lib/data/work-order-detail.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>({from:table=>{calls.push(table);return q;}})}}).getWorkOrderDetail(id)};
}
test('work-order sections use one exact-parent caller read without duplicate photos or billing ledgers',async()=>{
 const r=reader();assert.deepEqual(await r.run(),{data:row(),error:null});assert.deepEqual(r.calls,['jobs']);assert.ok(r.ops.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]===id));
 const selection=r.ops.find(x=>x[0]==='select')[1];assert.match(selection,/quotes!quotes_job_id_fkey/);assert.match(selection,/schedule_events!schedule_events_job_id_fkey/);assert.doesNotMatch(selection,/invoice_line_items|payments|job_photos|created_by_profile/);
 assert.deepEqual(r.ops.filter(x=>x[0]==='order').map(x=>x[2].referencedTable),['notes','quotes','invoices','appointments','schedule_events','equipment_assignments','change_orders']);
 assert.ok(r.ops.some(x=>x[0]==='eq'&&x[1]==='notes.visibility'&&x[2]==='crew_visible'));assert.ok(r.ops.some(x=>x[0]==='eq'&&x[1]==='schedule_events.event_type'&&x[2]==='job'));
});
test('missing and failed work orders never become a partial actionable record',async()=>{
 assert.deepEqual(await reader({data:null,error:null}).run(),{data:null,error:null});
 for(const data of [{...row(),id:'foreign'}, {...row(),invoices:null}, {...row(),quotes:[null]}, {...row(),quotes:[{id}]}, {...row(),change_orders:[{change_order_line_items:null}]}]){const r=await reader({data,error:null}).run();assert.equal(r.data,null);assert.match(r.error,/Reload/);}
 const r=await reader({data:row(),error:{message:'Private backend diagnostic'}}).run();assert.equal(r.data,null);assert.doesNotMatch(r.error,/Private backend/);
});
test('marketing context excludes the ledger, notes and private address without altering generated wording',()=>{
 const context=load('../src/lib/jobs/marketing-context.ts'),drafts=load('../src/lib/documents/marketing-drafts.ts');
 const full={id,service_type:'tree_removal',requested_scope:'Remove a damaged limb',customers:{id,display_name:'Synthetic customer',email:'private@example.invalid'},organizations:null,service_locations:{city:'Test City',street:'100 Private Lane',access_notes:'Private gate'},invoices:[{payments:['Private ledger']}],notes:[{body:'Private note'}],job_photos:[{storage_path:'private/path'}]},thin=context.marketingJobContext(full);
 assert.deepEqual(Object.keys(thin),['id','service_type','requested_scope','customers','organizations','service_locations']);assert.deepEqual(thin.customers,{display_name:'Synthetic customer'});assert.deepEqual(thin.service_locations,{city:'Test City'});assert.doesNotMatch(JSON.stringify(thin),/Private|private/);
 assert.deepEqual(drafts.generateCompletedJobReviewRequest(thin,'https://example.invalid/review'),drafts.generateCompletedJobReviewRequest(full,'https://example.invalid/review'));
 assert.deepEqual(drafts.generateCompletedJobSummaryDrafts({job:thin,completionNotes:'Synthetic notes',selectedPhotoCaptions:['Synthetic caption']}),drafts.generateCompletedJobSummaryDrafts({job:full,completionNotes:'Synthetic notes',selectedPhotoCaptions:['Synthetic caption']}));
});
