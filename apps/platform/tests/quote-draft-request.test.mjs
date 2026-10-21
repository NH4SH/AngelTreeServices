import assert from 'node:assert/strict';
import test from 'node:test';
import {quoteEditFixture,quoteId,requestId,retained,added,other,location,saveRow} from './quote-edit-confirmation-fixture.mjs';
const row=(changes={})=>saveRow({request_id:requestId,replayed:false,quote_status:'draft',customer_id:other,organization_id:null,service_location_id:location,job_id:null,...changes});
const invalid={absent:null,missingError:{data:row()},falseError:{data:row(),error:false},empty:{data:{},error:null},
 array:{data:[row()],error:null},primitive:{data:true,error:null},foreignRequest:{data:row({request_id:other}),error:null},
 missingRequest:{data:row({request_id:undefined}),error:null},invalidQuote:{data:row({id:'invalid'}),error:null},
 foreignParty:{data:row({customer_id:added}),error:null},bothParties:{data:row({organization_id:added}),error:null},
 foreignLocation:{data:row({service_location_id:added}),error:null},foreignJob:{data:row({job_id:added}),error:null},
 missingReplay:{data:row({replayed:undefined}),error:null},stringReplay:{data:row({replayed:'false'}),error:null},
 nonDraftInitial:{data:row({quote_status:'approved'}),error:null},unknownStatus:{data:row({quote_status:'unknown'}),error:null},
 missingRevision:{data:row({edit_revision:undefined}),error:null},missingLines:{data:row({line_ids:undefined}),error:null},
 incompleteLines:{data:row({line_ids:[retained]}),error:null},duplicateLines:{data:row({line_ids:[retained,retained.toUpperCase()]}),error:null},
 mixedConflict:{data:row({conflict:true}),error:null},backend:{data:row(),error:{code:'XX000',message:'PRIVATE_TRANSPORT_DETAIL'}},
};
for(const intent of ['save','save_close'])for(const[name,receipt]of Object.entries(invalid))test(`create ${intent} ${name} retains recovery and cannot navigate`,async()=>{
 const f=quoteEditFixture({create:true,intent,receipt}),r=await f.runCreate();assert.equal(r.status,'error');assert.equal(r.navigateTo,undefined);
 assert.equal(r.existingQuoteId,undefined);assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);assert.deepEqual(f.archives,[]);assert.equal(f.calls.length,1);
 assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
for(const lead of [false,true])for(const intent of ['save','save_close'])test(`confirmed ${lead?'lead':'standalone'} quote ${intent} uses one durable command`,async()=>{
 const f=quoteEditFixture({create:true,lead,intent}),r=await f.runCreate();assert.equal(r.status,'success');assert.match(r.navigateTo,new RegExp('^/admin/quotes/'+quoteId));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.p_request_id,requestId);assert.equal(f.calls[0].args.p_header.source_lead_job_id,lead?other:null);
 assert.equal(f.archives.length,lead?1:0);assert.equal(f.signals.length,1);assert.ok(f.paths.includes('/admin/quotes'));
});
test('organization quote keeps required contacts and party',async()=>{
 const f=quoteEditFixture({create:true,organization:true}),r=await f.runCreate();assert.equal(r.status,'success');assert.equal(f.calls[0].args.p_header.customer_id,null);
 assert.equal(f.calls[0].args.p_header.organization_id,other);assert.equal(f.calls[0].args.p_header.recipient_contact_id,other);
});
for(const quote_status of ['draft','sent','approved','declined','expired','cancelled','change_requested'])test(`replayed ${quote_status} opens review without acknowledging or archiving`,async()=>{
 const f=quoteEditFixture({create:true,lead:true,row:{replayed:true,quote_status}}),r=await f.runCreate();assert.equal(r.status,'error');assert.equal(r.existingQuoteId,quoteId);
 assert.equal(r.navigateTo,undefined);assert.deepEqual(f.paths,[]);assert.deepEqual(f.archives,[]);assert.equal(f.calls.length,1);
});
for(const requestId of ['', 'bad'])test(`invalid creation request ${JSON.stringify(requestId)} cannot write`,async()=>{
 const f=quoteEditFixture({create:true,requestId});assert.equal((await f.runCreate()).status,'error');assert.equal(f.calls.length,0);
});
for(const kind of ['throw','hang'])test(`create ${kind} keeps request without replay`,async()=>{
 const f=quoteEditFixture({create:true,[kind]:true,timeoutMs:10});assert.equal((await f.runCreate()).status,'error');assert.equal(f.calls.length,1);
 assert.deepEqual(f.paths,[]);assert.deepEqual(f.archives,[]);if(kind==='hang')assert.equal(f.signals[0].aborted,true);
});
test('server navigation happens only after initial confirmation',async()=>{
 const f=quoteEditFixture({create:true,serverRedirect:true});await assert.rejects(f.runCreate(),/TEST_REDIRECT/);assert.equal(f.redirects.length,1);
});
