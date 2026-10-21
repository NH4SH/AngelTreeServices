import assert from 'node:assert/strict';
import test from 'node:test';
import {generationFixture,jobId,invoiceId,other,generated,completed,context} from './invoice-generation-confirmation-fixture.mjs';
const invalid={absent:null,missingError:{data:generated()},falseError:{data:generated(),error:false},empty:{data:{},error:null},array:{data:[generated()],error:null},
 missingData:{error:null},foreignJob:{data:generated({job_id:other}),error:null},missingInvoice:{data:generated({invoice_id:undefined}),error:null},
 invalidInvoice:{data:generated({invoice_id:'invalid'}),error:null},nonDraftNew:{data:generated({invoice_status:'paid'}),error:null},
 missingFlags:{data:generated({existing:undefined}),error:null},unknownStatus:{data:generated({invoice_status:'unknown'}),error:null},
 coercedStatus:{data:generated({invoice_status:{toString:()=> 'draft'}}),error:null},negativeCount:{data:generated({added_change_order_count:-1}),error:null},
 diagnostic:{data:generated(),error:{code:'XX000',message:'PRIVATE_TRANSPORT_DETAIL'}},
};
for(const mode of ['job','quote','manual'])for(const[name,receipt]of Object.entries(invalid))test(`${mode}: ${name} cannot acknowledge or navigate`,async()=>{
 const f=generationFixture({mode,receipt}),r=await f.run();assert.equal(r.status,'error');assert.equal(r.invoiceId,undefined);assert.equal(r.navigateTo,undefined);
 assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
const completionInvalid={absent:null,missingError:{data:completed()},falseError:{data:completed(),error:false},array:{data:[completed()],error:null},
 foreignJob:{data:completed(true,{job_id:other}),error:null},foreignContext:{data:completed(true,{context:context({job_id:other})}),error:null},
 incomplete:{data:completed(true,{job_completed:false}),error:null},missingDate:{data:completed(true,{context:context({completed_at:null})}),error:null},
 oldRevision:{data:completed(true,{context:context({revision:4})}),error:null},openVisits:{data:completed(true,{context:context({future_count:1})}),error:null},
 stillScheduled:{data:completed(true,{context:context({status:'scheduled'})}),error:null},missingInvoice:{data:completed(true,{invoice_id:undefined}),error:null},
 malformedInvoice:{data:completed(true,{invoice_id:'invalid'}),error:null},missingReplay:{data:completed(true,{replayed:undefined}),error:null},
 negativeClosed:{data:completed(true,{closed_visit_count:-1}),error:null},missingInvoiceContext:{data:completed(true,{context:context({has_invoice:false})}),error:null},
 diagnostic:{data:completed(),error:{code:'XX000',message:'PRIVATE_TRANSPORT_DETAIL'}},
};
for(const[name,receipt]of Object.entries(completionInvalid))test(`combined completion: ${name} validates before any refresh or redirect`,async()=>{
 const f=generationFixture({mode:'completion',receipt}),r=await f.run();assert.equal(r.status,'error');assert.equal(r.context,undefined);
 assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
for(const mode of ['job','quote','manual','completion'])for(const options of [
 {missingRead:true},{invoiceJobId:other},{readReceipt:{data:{id:other,job_id:jobId},error:null}},
 {readReceipt:{data:{id:invoiceId,job_id:jobId}}},{readReceipt:{data:{id:invoiceId,job_id:jobId},error:{message:'PRIVATE_READ_DETAIL'}}},
])test(`${mode}: failed or unrelated authorized invoice lookup keeps uncertainty ${JSON.stringify(options)}`,async()=>{
 const f=generationFixture({mode,...options}),r=await f.run();assert.equal(r.status,'error');assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);
});
for(const mode of ['job','quote','manual'])for(const invoice_status of ['draft','sent','partially_paid','paid','void','overdue'])test(`${mode}: existing ${invoice_status} invoice remains available for review`,async()=>{
 const f=generationFixture({mode,patch:{existing:true,invoice_status}}),r=await f.run();assert.equal(r.status,'success');assert.equal(r.invoiceId,invoiceId);
 assert.equal(r.navigateTo,undefined);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);
});
test('new job and quote invoices navigate only after their invoice/source are checked',async()=>{
 for(const mode of ['job','quote']){const f=generationFixture({mode});await assert.rejects(f.run(),/TEST_REDIRECT/);assert.equal(f.redirects[0],`/admin/invoices/${invoiceId}?created=1`);
  assert.equal(f.calls.length,1);assert.ok(f.reads.includes('invoices'));if(mode==='quote')assert.ok(f.reads.includes('quotes'));}
});
test('manual invoice retains client navigation and return context',async()=>{
 const f=generationFixture({mode:'manual'}),r=await f.run();assert.equal(r.status,'success');assert.match(r.navigateTo,new RegExp('^/admin/invoices/'+invoiceId+'\\?created=1&returnTo='));
});
test('historical pre-PR09 completion receipts remain review-only on replay',async()=>{
 for(const mode of ['job','quote','manual']){
  const f=generationFixture({mode,patch:{job_completed:true,replayed:true}}),r=await f.run();
  assert.equal(r.status,'success');assert.equal(r.invoiceId,invoiceId);assert.equal(r.navigateTo,undefined);assert.deepEqual(f.redirects,[]);
 }
});
test('a new paperwork receipt cannot claim it completed field work',async()=>{
 const f=generationFixture({patch:{job_completed:true}});assert.equal((await f.run()).status,'error');assert.deepEqual(f.paths,[]);
});
test('combined completion checks its context/invoice before navigation',async()=>{
 const f=generationFixture({mode:'completion'});await assert.rejects(f.run(),/TEST_REDIRECT/);assert.equal(f.redirects[0],`/admin/invoices/${invoiceId}?created=1&job_completed=1`);
 assert.ok(f.reads.includes('invoices'));assert.equal(f.calls.length,1);
});
test('complete-only retains an unbilled outcome and accepts already-complete advanced states',async()=>{
 for(const status of ['completed','completed_pending_review','ready_to_invoice','invoiced','paid']){
  const f=generationFixture({mode:'complete',patch:{context:context({status,has_invoice:false})}}),r=await f.run();assert.equal(r.status,'success');assert.equal(r.context.status,status);
  assert.deepEqual(f.reads,[]);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);
 }
 const bad=generationFixture({mode:'complete',patch:{invoice_id:invoiceId}});assert.equal((await bad.run()).status,'error');assert.deepEqual(bad.paths,[]);
});
test('quote lookup must match the resolved work order; legacy reverse links remain supported',async()=>{
 const legacy=generationFixture({mode:'quote',legacyQuote:true,patch:{existing:true}});assert.equal((await legacy.run()).status,'success');assert.deepEqual(legacy.reads,['invoices','quotes','jobs']);
 const foreign=generationFixture({mode:'quote',legacyQuote:true,sourceQuoteId:other});assert.equal((await foreign.run()).status,'error');assert.deepEqual(foreign.paths,[]);
 const wrong=generationFixture({mode:'quote'});wrong.rows.quotes.job_id=other;assert.equal((await wrong.run()).status,'error');assert.deepEqual(wrong.paths,[]);
});
for(const mode of ['job','quote','manual','completion','complete'])for(const kind of (mode==='complete'?['throw','hang']:['throw','hang','readThrow','readHang']))test(`${mode} ${kind} never retries or exposes transport detail`,async()=>{
 const f=generationFixture({mode,[kind]:true,timeoutMs:10}),r=await f.run();assert.equal(r.status,'error');assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);
 assert.equal(f.calls.length,1);assert.equal(r.message.includes('PRIVATE'),false);if(kind.endsWith('ang'))assert.equal(f.signals[0].aborted,true);
});
for(const mode of ['job','quote','manual','completion','complete'])for(const label of ['unconfigured','signedOut','denied'])test(`${mode} ${label} remains blocked before dispatch`,async()=>{
 const f=generationFixture({mode,[label]:true});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);assert.deepEqual(f.paths,[]);
});
