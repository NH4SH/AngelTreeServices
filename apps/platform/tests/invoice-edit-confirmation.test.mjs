import assert from 'node:assert/strict';
import test from 'node:test';
import {invoiceEditFixture,invoiceId,retained,added,other,version,savedVersion,saveRow} from './invoice-edit-fixture.mjs';

const invalid={
 absent:null,missingError:{data:saveRow()},falseError:{data:saveRow(),error:false},empty:{data:{},error:null},
 array:{data:[saveRow()],error:null},primitive:{data:true,error:null},missingData:{error:null},
 foreign:{data:saveRow({id:other}),error:null},missingId:{data:saveRow({id:undefined}),error:null},
 missingRevision:{data:saveRow({updated_at:undefined}),error:null},dateOnly:{data:saveRow({updated_at:'2026-10-20'}),error:null},
 invalidRevision:{data:saveRow({updated_at:'2026-02-30T06:01:02Z'}),error:null},infinite:{data:saveRow({updated_at:'infinity'}),error:null},
 missingLines:{data:saveRow({line_ids:undefined}),error:null},shortLines:{data:saveRow({line_ids:[retained]}),error:null},
 extraLines:{data:saveRow({line_ids:[retained,added,other]}),error:null},stringLines:{data:saveRow({line_ids:retained}),error:null},
 duplicateLines:{data:saveRow({line_ids:[retained,retained]}),error:null},invalidLine:{data:saveRow({line_ids:[retained,'invalid']}),error:null},
 missingLine:{data:saveRow({line_ids:[retained,null]}),error:null},swappedLines:{data:saveRow({line_ids:[added,retained]}),error:null},
 foreignRetained:{data:saveRow({line_ids:[other,added]}),error:null},
 backendError:{data:saveRow(),error:{code:'XX000',message:'PRIVATE_TRANSPORT_DETAIL'}},
};
for(const intent of ['save','save_close'])for(const[name,receipt]of Object.entries(invalid))test(`${intent}: ${name} cannot clear the draft or navigate`,async()=>{
 const f=invoiceEditFixture({intent,receipt}),result=await f.run();
 assert.equal(result.status,'error');assert.equal(result.savedUpdatedAt,undefined);assert.equal(result.savedLineIds,undefined);assert.equal(result.navigateTo,undefined);
 assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});
test('complete save keeps the exact revision and ordered retained/new line mapping',async()=>{
 const f=invoiceEditFixture(),result=await f.run();assert.equal(result.status,'success');assert.equal(result.savedUpdatedAt,savedVersion);
 assert.deepEqual(result.savedLineIds,{'retained-client':retained,'new-client':added});assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0],{name:'save_invoice_details',args:{p_invoice_id:invoiceId,p_expected_updated_at:version,p_due_at:'2026-11-04T17:00:00.000Z',p_lines:[
  {id:retained,name:'Pruning',description:'Saved wording',service_category_id:null,quantity:1,unit_price_cents:1000,total_cents:1000},
  {id:null,name:'Cleanup',description:'Saved wording',service_category_id:null,quantity:1,unit_price_cents:500,total_cents:500},
 ]}});assert.ok(f.paths.includes('/admin/invoices/'+invoiceId));assert.ok(f.paths.includes('/admin/customers/'+other));
 assert.equal(f.signals.length,1);
});
test('confirmed save and close preserves return context',async()=>{
 const f=invoiceEditFixture({intent:'save_close'}),result=await f.run();assert.equal(result.status,'success');assert.match(result.navigateTo,new RegExp('^/admin/invoices/'+invoiceId+'\\?returnTo='));assert.equal(f.calls.length,1);
});
test('confirmed server redirect is still the final action',async()=>{
 const f=invoiceEditFixture({intent:'save_close',serverRedirect:true});await assert.rejects(f.run(),/TEST_REDIRECT/);assert.equal(f.redirects.length,1);assert.equal(f.calls.length,1);
});
test('organization invoice preserves its existing cache paths',async()=>{
 const f=invoiceEditFixture({organization:true});assert.equal((await f.run()).status,'success');assert.ok(f.paths.includes('/admin/organizations/'+other));assert.equal(f.paths.some(p=>p.includes('/customers/')),false);
});
for(const code of ['40001','42501','23514'])test(`installed ${code} rejection stays safe and never reports success`,async()=>{
 const f=invoiceEditFixture({receipt:{data:null,error:{code,message:'PRIVATE_TRANSPORT_DETAIL'}}}),r=await f.run();assert.equal(r.status,'error');assert.equal(r.message.includes('PRIVATE'),false);assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);
});
test('transport exception retains the draft without leaking backend detail',async()=>{
 const f=invoiceEditFixture({throw:true});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);
});
test('deadline aborts the one request and never automatically repeats the save',async()=>{
 const f=invoiceEditFixture({hang:true,timeoutMs:10});const r=await f.run();assert.equal(r.status,'error');assert.equal(f.signals[0].aborted,true);assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);
});
for(const label of ['unconfigured','signedOut','denied','lookupMissing'])test(`${label} still stops before invoice editing`,async()=>{
 const f=invoiceEditFixture({[label]:true});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);assert.deepEqual(f.paths,[]);
});
for(const v of ['','garbage','2026-02-30T00:00:00Z','infinity'])test(`invalid revision ${JSON.stringify(v)} stops before the write`,async()=>{
 const f=invoiceEditFixture({version:v});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
test('duplicate client identities cannot overwrite a line mapping after save',async()=>{
 const f=invoiceEditFixture();f.form.delete('invoice_line_item_client_id');f.form.append('invoice_line_item_client_id','same');f.form.append('invoice_line_item_client_id','same');assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
test('microsecond revisions are returned intact with either UTC spelling',async()=>{
 for(const updated_at of ['2026-10-20T06:02:03.456789Z','2026-10-20T02:02:03.456789-04:00']){
  const f=invoiceEditFixture({row:{updated_at}});assert.equal((await f.run()).savedUpdatedAt,updated_at);
 }
});
