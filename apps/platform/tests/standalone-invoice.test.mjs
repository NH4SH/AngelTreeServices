import assert from 'node:assert/strict';
import test from 'node:test';
import {standaloneFixture,standaloneRow,requestId,partyId,invoiceId,other} from './standalone-invoice-fixture.mjs';
const invalid={absent:null,missingError:{data:standaloneRow()},falseError:{data:standaloneRow(),error:false},
 empty:{data:{},error:null},array:{data:[standaloneRow()],error:null},primitive:{data:true,error:null},
 foreignRequest:{data:standaloneRow({},{request_id:other}),error:null},missingRequest:{data:standaloneRow({},{request_id:undefined}),error:null},
 invalidInvoice:{data:standaloneRow({},{invoice_id:'garbage'}),error:null},foreignParty:{data:standaloneRow({},{customer_id:other}),error:null},
 bothParties:{data:standaloneRow({},{organization_id:other}),error:null},missingParty:{data:standaloneRow({},{customer_id:undefined}),error:null},
 foreignLocation:{data:standaloneRow({},{service_location_id:other}),error:null},missingLocation:{data:standaloneRow({},{service_location_id:undefined}),error:null},
 missingReplay:{data:standaloneRow({},{replayed:undefined}),error:null},stringReplay:{data:standaloneRow({},{replayed:'false'}),error:null},
 missingWarning:{data:standaloneRow({},{note_warning:undefined}),error:null},stringWarning:{data:standaloneRow({},{note_warning:'false'}),error:null},
 unknownStatus:{data:standaloneRow({},{invoice_status:'unknown'}),error:null},nonDraftInitial:{data:standaloneRow({},{invoice_status:'paid'}),error:null},
 privateError:{data:standaloneRow(),error:{code:'XX000',message:'PRIVATE_TRANSPORT_DETAIL'}},
};
for(const[name,receipt]of Object.entries(invalid))test(`standalone ${name}: no success, redirect or second write`,async()=>{
 const f=standaloneFixture({receipt}),r=await f.run();assert.equal(r.status,'error');assert.equal(r.navigateTo,undefined);assert.equal(r.invoiceId,undefined);
 assert.deepEqual(f.paths,[]);assert.deepEqual(f.redirects,[]);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
for(const organization of [false,true])test(`standalone ${organization?'organization':'individual'} uses one durable request`,async()=>{
 const f=standaloneFixture({organization}),r=await f.run();assert.equal(r.status,'success');assert.match(r.navigateTo,new RegExp('^/admin/invoices/'+invoiceId+'\\?created=1'));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.p_request_id,requestId);assert.equal(f.calls[0].args.p_new_customer,null);
 assert.deepEqual(f.calls[0].args.p_header,{customer_id:organization?null:partyId,organization_id:organization?partyId:null,service_location_id:null,due_at:'2026-11-04T17:00:00.000Z'});
 assert.deepEqual(f.calls[0].args.p_lines,[{name:'Pruning',description:null,service_category_id:null,quantity:1,unit_price_cents:1000,total_cents:1000}]);
 assert.equal(f.calls[0].args.p_notes,'Local internal note');assert.equal(f.signals.length,1);
});
test('new customer, location, invoice and note delegate together; no compensating delete',async()=>{
 const f=standaloneFixture({newCustomer:true}),r=await f.run();assert.equal(r.status,'success');assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0].args.p_new_customer,{name:'Synthetic customer',email:'synthetic@example.invalid',phone:null,street:'123 Synthetic St',city:'Fredericksburg',state:'VA',postal_code:null});
 assert.equal(f.calls[0].args.p_header.customer_id,null);assert.equal(f.calls[0].args.p_header.service_location_id,null);
});
for(const status of ['draft','sent','partially_paid','paid','void','overdue'])test(`replayed ${status} invoice is opened for review without clearing recovery`,async()=>{
 const f=standaloneFixture({row:{replayed:true,invoice_status:status}}),r=await f.run();assert.equal(r.status,'success');assert.equal(r.existingInvoice,true);assert.equal(r.invoiceId,invoiceId);assert.equal(r.navigateTo,undefined);assert.equal(f.calls.length,1);
});
test('organization-only note warning remains visible in the destination',async()=>{
 const f=standaloneFixture({organization:true,row:{note_warning:true}});assert.match((await f.run()).navigateTo,/note_warning=1/);
});
test('confirmed server redirect still happens after the transaction',async()=>{
 const f=standaloneFixture({serverRedirect:true});await assert.rejects(f.run(),/TEST_REDIRECT/);assert.equal(f.redirects.length,1);assert.equal(f.calls.length,1);
});
for(const [name,options]of [['throw',{throw:true}],['timeout',{hang:true,timeoutMs:10}]])test(`standalone ${name} preserves the request without automatic replay`,async()=>{
 const f=standaloneFixture(options),r=await f.run();assert.equal(r.status,'error');assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);if(name==='timeout')assert.equal(f.signals[0].aborted,true);
});
for(const name of ['unconfigured','signedOut','denied'])test(`standalone ${name} stops before the command`,async()=>{
 const f=standaloneFixture({[name]:true});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
for(const requestId of ['','invalid'])test(`standalone invalid request ${JSON.stringify(requestId)} cannot write`,async()=>{
 const f=standaloneFixture({requestId});assert.equal((await f.run()).status,'error');assert.equal(f.calls.length,0);
});
test('known duplicate contact guidance is safe, while arbitrary details are never returned',async()=>{
 const message='A customer already uses that contact information. Select the existing customer instead.';
 const f=standaloneFixture({receipt:{data:null,error:{code:'23514',message}}});assert.deepEqual(await f.run(),{status:'error',message});
});
