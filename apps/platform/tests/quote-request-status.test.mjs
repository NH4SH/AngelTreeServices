import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
import * as editResult from '../src/lib/quotes/edit-result.ts';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {requestId,quoteId,other,location,retained} from './quote-edit-confirmation-fixture.mjs';
const validation=load('../src/lib/api/mobile-quotes.ts');
const header={customer_id:other,organization_id:null,service_location_id:location,job_id:null};
const lines=[{name:'Scope',quantity:1,unit_price_cents:1000,total_cents:1000,sort_order:0}];
const receipt=()=>({id:quoteId,request_id:requestId,edit_revision:1,line_ids:[retained],replayed:false,quote_status:'draft',...header});
const row=()=>({request_id:requestId,state:'recorded',receipt:receipt(),quote_status:'approved'});
function fixture(response={data:row(),error:null},timeout=100){
 const calls=[],signals=[];
 const helper=load('../src/lib/quotes/request-status.ts',{'server-only':{},'./edit-result':editResult,'../runtime/deadline.ts':{withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(work,timeout);}}});
 const db={rpc(name,args){calls.push({name,args});return{abortSignal(signal){signals.push(signal);return this;},then(resolve,reject){return Promise.resolve().then(()=>typeof response==='function'?response():response).then(resolve,reject);}}},from(){assert.fail('No current-party preflight or table writes');}};
 return{helper,db,calls,signals,run:()=>helper.resolveQuoteDraftRequest({supabase:db,requestId,header,lines})};
}
test('read-only status returns the existing identity after later approval',async()=>{const f=fixture();assert.deepEqual(await f.run(),{requestId,state:'recorded',quoteId});assert.deepEqual(f.calls,[{name:'resolve_quote_draft_request',args:{p_request_id:requestId,p_header:header,p_lines:lines}}]);assert.equal(f.signals.length,1);});
for(const [state,r,status]of [['not_recorded',null,null],['unavailable',receipt(),null]])test(state+' is not a usable quote',async()=>assert.deepEqual(await fixture({data:{request_id:requestId,state,receipt:r,quote_status:status},error:null}).run(),{requestId,state,quoteId:null}));
for(const [name,change]of Object.entries({wrongRequest:r=>r.request_id=other,wrongReceipt:r=>r.receipt.request_id=other,badState:r=>r.state='success',missingReceipt:r=>r.receipt=null,badID:r=>r.receipt.id='bad',badRevision:r=>r.receipt.edit_revision=0,badLines:r=>r.receipt.line_ids=[],badParty:r=>r.receipt.customer_id=quoteId,badProperty:r=>r.receipt.service_location_id=quoteId,wrongJob:r=>r.receipt.job_id=quoteId,replayed:r=>r.receipt.replayed=true,wrongOriginalStatus:r=>r.receipt.quote_status='approved',badStatus:r=>r.quote_status='deleted',missingStatus:r=>delete r.quote_status,unavailableWithStatus:r=>r.state='unavailable',negativeWithReceipt:r=>r.state='not_recorded'}))test('fails closed on '+name,async()=>{const data=row();change(data);assert.equal(await fixture({data,error:null}).run(),null);});
for(const [i,response]of [null,{},[],{data:row()},{data:row(),error:{message:'PRIVATE'}},{data:null,error:null}].entries())test('malformed envelope '+i,async()=>assert.equal(await fixture(response).run(),null));
test('exceptions and timeouts never retry or mutate',async()=>{for(const response of [()=>{throw Error('PRIVATE');},()=>new Promise(()=>{})]){const f=fixture(response,10);assert.equal(await f.run(),null);assert.equal(f.calls.length,1);}});
const request=()=>({customerId:other,organizationId:null,serviceLocationId:location,requestId,customerMessage:'  Copied\r\nnotes  ',expiresAt:'2030-01-01T00:00:00Z',lines:[{name:'  Scope  ',description:'  Keep\r\nending  ',quantity:1.5,unitPriceCents:1000}]});
function routeFixture({roles=['owner'],signedOut=false,throws=false}={}){
 const calls=[];const route=load('../src/app/api/mobile/quotes/request-status/route.ts',{
  '@/lib/api/mobile-quotes':validation,'@/lib/quotes/request-status':{requestStatusUncertain:'Safe check failed. Original kept.'},
  '@/lib/api/responses':{apiSuccess:(data,status=200)=>({data,status}),apiError:(code,message,status)=>({error:{code,message},status})},
  '@/lib/auth/apiContext':{getCrewApiContext:async()=>signedOut?{context:null,error:{code:'unauthorized',message:'Sign in.',status:401}}:{context:{roles,user:{id:other},supabase:{}}}},
  '@/lib/data/mobile-quotes':{resolveMobileQuoteRequest:async(db,input)=>{calls.push(input);if(throws)throw Error('PRIVATE');return{requestId,state:'not_recorded',quoteId:null};}},
 });return{calls,run:body=>route.POST(new Request('http://localhost/api/mobile/quotes/request-status',{method:'POST',body:JSON.stringify(body)}))};
}
for(const role of ['owner','admin','payroll_admin','estimator'])test('status authorizes '+role,async()=>{const f=routeFixture({roles:[role]});assert.equal((await f.run({kind:'create',request:request()})).status,200);assert.equal(f.calls.length,1);});
for(const [i,options]of [{signedOut:true},{roles:[]},{roles:['crew']},{roles:['customer']}].entries())test('status denies non-office '+i,async()=>{const f=routeFixture(options);assert.ok([401,403].includes((await f.run({kind:'create',request:request()})).status));assert.equal(f.calls.length,0);});
for(const [i,body]of [null,{}, {kind:'edit',request:request()},{kind:'emptyCopy',request:request()},{kind:'create',request:{...request(),requestId:undefined}},{kind:'copy',request:{...request(),lines:[]}}].entries())test('unsupported intent '+i,async()=>{const f=routeFixture();assert.equal((await f.run(body)).status,400);assert.equal(f.calls.length,0);});
test('distinct original create/copy normalization is preserved',async()=>{const create=routeFixture(),copy=routeFixture();await create.run({kind:'create',request:request()});await copy.run({kind:'copy',request:request()});assert.equal(create.calls[0].lines[0].name,'Scope');assert.equal(copy.calls[0].lines[0].name,'  Scope  ');assert.equal(copy.calls[0].customerMessage,request().customerMessage);assert.notEqual(create.calls[0].customerMessage,copy.calls[0].customerMessage);});
test('status errors sanitize diagnostics without a save fallback',async()=>{const f=routeFixture({throws:true});const r=await f.run({kind:'create',request:request()});assert.equal(r.status,503);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.equal(f.calls.length,1);});
test('status rebuilds original creation args without current-party checks',async()=>{
 const f=fixture({data:{request_id:requestId,state:'not_recorded',receipt:null,quote_status:null},error:null});
 const mobile=load('../src/lib/data/mobile-quotes.ts',{'server-only':{},'@/lib/quotes/edit-result':editResult,'@/lib/quotes/request-status':f.helper,'@/lib/quotes/draft-request':{},'@/lib/quotes/save-confirmation':{},'@/lib/quotes/proposal-number':{},'@/lib/api/mobile-quotes':{}});
 const input=validation.validateMobileQuoteCopyInput(request()).value;assert.equal((await mobile.resolveMobileQuoteRequest(f.db,input)).state,'not_recorded');
 assert.deepEqual(f.calls[0].args.p_header,{customer_id:other,organization_id:null,service_location_id:location,recipient_contact_id:null,approval_contact_id:null,customer_message:input.customerMessage,expires_at:'2030-01-01T00:00:00.000Z'});
 assert.deepEqual(f.calls[0].args.p_lines,[{id:null,name:'  Scope  ',description:'  Keep\r\nending  ',quantity:1.5,unit_price_cents:1000,total_cents:1500,sort_order:0}]);
});

test('migration100 stays local and cannot enter the historical staging99 verdict',async()=>{
 const {currentQuoteDraftSources}=await import('../scripts/release/verify-staging-quote-draft-candidate.mjs');const sources=currentQuoteDraftSources();assert.equal(sources.files.length,99);assert.equal(sources.candidate.readyForHosting,false);assert.equal(sources.files.some(f=>f.name.endsWith('_quote_request_status.sql')),false);
});
