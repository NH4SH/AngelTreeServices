import assert from 'node:assert/strict';
import test from 'node:test';
import {quoteEditFixture,quoteId,retained,added,other,saveRow,conflictRow} from './quote-edit-confirmation-fixture.mjs';
const invalid={
 absent:null,missingError:{data:saveRow()},falseError:{data:saveRow(),error:false},empty:{data:{},error:null},
 array:{data:[saveRow()],error:null},primitive:{data:true,error:null},missingData:{error:null},
 foreign:{data:saveRow({id:other}),error:null},missingId:{data:saveRow({id:undefined}),error:null},badId:{data:saveRow({id:'-'.repeat(36)}),error:null},
 stale:{data:saveRow({edit_revision:4}),error:null},unchanged:{data:saveRow({edit_revision:5}),error:null},
 fractional:{data:saveRow({edit_revision:6.5}),error:null},missingRevision:{data:saveRow({edit_revision:undefined}),error:null},
 missingLines:{data:saveRow({line_ids:undefined}),error:null},shortLines:{data:saveRow({line_ids:[retained]}),error:null},
 extraLines:{data:saveRow({line_ids:[retained,added,other]}),error:null},duplicateLines:{data:saveRow({line_ids:[retained,retained.toUpperCase()]}),error:null},
 badLine:{data:saveRow({line_ids:[retained,'-'.repeat(36)]}),error:null},swappedLines:{data:saveRow({line_ids:[added,retained]}),error:null},
 foreignRetained:{data:saveRow({line_ids:[other,added]}),error:null},
 mixedConflict:{data:saveRow({...conflictRow}),error:null},malformedConflict:{data:saveRow({conflict:true}),error:null},
 backendError:{data:saveRow(),error:{code:'XX000',message:'PRIVATE_TRANSPORT_DETAIL'}},
};
for(const intent of ['save','save_close'])for(const[name,receipt]of Object.entries(invalid))test(`${intent}: ${name} cannot acknowledge, archive or navigate`,async()=>{
 const f=quoteEditFixture({intent,receipt,lead:true}),r=await f.run();assert.equal(r.status,'error');assert.equal(r.savedRevision,undefined);
 assert.equal(r.savedLineIds,undefined);assert.equal(r.navigateTo,undefined);assert.deepEqual(f.paths,[]);assert.deepEqual(f.archives,[]);
 assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
for(const[name,receipt]of Object.entries(invalid))test(`mobile: ${name} cannot return a successful saved proposal`,async()=>{
 const f=quoteEditFixture({receipt});await assert.rejects(f.runMobile(),e=>e.name==='Error'&&e.status>=400&&!e.message.includes('PRIVATE'));
 assert.equal(f.calls.length,1);assert.equal(f.reads.filter(t=>t==='quotes').length,1); // no success reread
});
test('confirmed save returns the exact newer revision and ordered existing/new IDs',async()=>{
 const f=quoteEditFixture({lead:true}),r=await f.run();assert.equal(r.status,'success');assert.equal(r.savedRevision,8);
 assert.deepEqual(r.savedLineIds,{'retained-client':retained,'new-client':added});assert.equal(f.calls.length,1);assert.equal(f.archives.length,1);
 assert.equal(f.calls[0].args.p_quote_id,quoteId);assert.equal(f.calls[0].args.p_expected_revision,5);assert.equal(f.calls[0].args.p_lines[0].id,retained);
 assert.equal(f.calls[0].args.p_lines[1].id,null);assert.equal(f.signals.length,1);assert.ok(f.paths.includes('/admin/quotes/'+quoteId));
});
test('confirmed save and close preserves return context',async()=>{
 const f=quoteEditFixture({intent:'save_close'}),r=await f.run();assert.equal(r.status,'success');assert.match(r.navigateTo,new RegExp('^/admin/quotes/'+quoteId+'\\?returnTo='));
});
test('confirmed server redirect remains last',async()=>{
 const f=quoteEditFixture({intent:'save_close',serverRedirect:true});await assert.rejects(f.run(),/TEST_REDIRECT/);assert.equal(f.redirects.length,1);
});
test('conflict metadata survives on both clients',async()=>{
 for(const mobile of [false,true]){
  const f=quoteEditFixture({receipt:{data:conflictRow,error:null}});
  if(mobile)await assert.rejects(f.runMobile(),e=>e.status===409&&e.conflict.currentRevision===9&&e.conflict.currentTotalCents===1700);
  else{const r=await f.run();assert.equal(r.status,'error');assert.equal(r.conflict.currentRevision,9);assert.equal(r.conflict.changedBy,'Another editor');}
 }
});
test('mobile confirms then rereads only the requested record',async()=>{
 const f=quoteEditFixture(),r=await f.runMobile();assert.equal(r.id,quoteId);assert.equal(f.calls.length,1);assert.equal(f.reads.filter(t=>t==='quotes').length,2);
});
for(const code of ['40001','42501','23514'])test(`${code} remains a safe rejection for web and mobile`,async()=>{
 const receipt={data:null,error:{code,message:'PRIVATE_TRANSPORT_DETAIL'}};
 const f=quoteEditFixture({receipt});assert.equal((await f.run()).status,'error');assert.deepEqual(f.paths,[]);
 const m=quoteEditFixture({receipt});await assert.rejects(m.runMobile(),e=>e.status===(code==='42501'?403:409)&&!e.message.includes('PRIVATE'));
});
for(const mobile of [false,true])for(const kind of ['throw','hang'])test(`${mobile?'mobile':'web'} ${kind} keeps uncertainty and never replays`,async()=>{
 const f=quoteEditFixture({[kind]:true,timeoutMs:10});if(mobile)await assert.rejects(f.runMobile(),e=>e.status===503);else assert.equal((await f.run()).status,'error');
 assert.equal(f.calls.length,1);if(kind==='hang')assert.equal(f.signals[0].aborted,true);assert.deepEqual(f.paths,[]);assert.deepEqual(f.archives,[]);
});
for(const label of ['unconfigured','signedOut','missing','closed'])test(`${label} still stops before web save`,async()=>{
 const f=quoteEditFixture({[label]:true});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
test('unauthorized source lead cannot reach the quote command',async()=>{
 const f=quoteEditFixture({lead:true,denied:true});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
test('duplicate client IDs and duplicate persisted IDs stop before saving',async()=>{
 for(const key of ['line_item_client_id','line_item_id']){
  const f=quoteEditFixture();f.form.delete(key);for(let i=0;i<2;i++)f.form.append(key,key==='line_item_id'?retained:'same');
  assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
 }
});
test('party changes still need explicit confirmation',async()=>{
 const f=quoteEditFixture();f.form.set('contracting_party','customer:'+added);assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
