import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
import * as editResult from '../src/lib/quotes/edit-result.ts';
import {quoteEditFixture,quoteId,requestId,other,location,retained,saveRow} from './quote-edit-confirmation-fixture.mjs';
const validation=load('../src/lib/api/mobile-quotes.ts');
const body=()=>({customerId:other,organizationId:null,serviceLocationId:location,requestId,lines:[{name:'Pruning',quantity:1,unitPriceCents:1000}]});
for(const id of [null,'','bad',1,[],{},' '+requestId])test(`mobile rejects malformed identity ${JSON.stringify(id)}`,()=>assert.equal(validation.validateMobileQuoteWriteInput({...body(),requestId:id}).value,null));
test('mobile normalizes identity and retains no-ID legacy input',()=>{
 assert.equal(validation.validateMobileQuoteWriteInput({...body(),requestId:requestId.toUpperCase()}).value.requestId,requestId);
 const input=body();delete input.requestId;assert.equal(validation.validateMobileQuoteWriteInput(input).value.requestId,undefined);
 assert.equal(validation.validateMobileQuoteWriteInput([]).value,null);
});
for(const replayed of [false,true])for(const organization of [false,true])test(`mobile organization=${organization} replay=${replayed}`,async()=>{
 const f=quoteEditFixture({create:true,organization,row:{replayed}});f.input.requestId=requestId;
 const result=await f.runMobileCreate();assert.equal(result.id,quoteId);assert.equal(result.creationRequestId,requestId);assert.equal(result.creationReplayed,replayed);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'create_quote_draft_request');assert.equal(f.calls[0].args.p_request_id,requestId);
 assert.equal(f.calls[0].args.p_header.organization_id,organization?other:null);assert.equal(f.signals.length,1);
});
for(const receipt of [null,{data:null,error:null},{data:saveRow(),error:null},{data:saveRow({request_id:other}),error:null},
 {data:saveRow({request_id:requestId,replayed:'false'}),error:null},{data:saveRow({request_id:requestId,replayed:false,line_ids:[retained]}),error:null},
 {data:null,error:{code:'XX000',message:'PRIVATE_DIAGNOSTIC'}}])test(`mobile malformed acknowledgement ${JSON.stringify(receipt)}`,async()=>{
 const f=quoteEditFixture({create:true,receipt});f.input.requestId=requestId;
 await assert.rejects(f.runMobileCreate(),e=>e instanceof editResult.QuoteEditError&&!e.message.includes('PRIVATE'));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'create_quote_draft_request');
});
for(const mode of ['throw','hang','missing'])test(`mobile ${mode} never falls back to unkeyed create`,async()=>{
 const f=quoteEditFixture({create:true,[mode]:true,timeoutMs:10});f.input.requestId=requestId;
 await assert.rejects(f.runMobileCreate(),e=>e instanceof editResult.QuoteEditError);assert.equal(f.calls.length,1);
 if(mode==='hang')assert.equal(f.signals[0].aborted,true);
});
test('older mobile creation retains the legacy command',async()=>{
 const f=quoteEditFixture({create:true,legacyCreate:true});const result=await f.runMobileCreate();assert.equal(result.id,quoteId);
 assert.equal(result.creationRequestId,undefined);assert.equal(f.calls[0].name,'create_quote_draft');
});
function routeFixture({roles=['owner'],signedOut=false,error=null}={}){
 const calls=[];const route=load('../src/app/api/mobile/quotes/draft/route.ts',{
  '@/lib/api/responses':{apiSuccess:(data,status)=>({data,status}),apiError:(code,message,status)=>({error:{code,message},status})},
  '@/lib/api/mobile-quotes':validation,'@/lib/quotes/edit-result':editResult,
  '@/lib/auth/apiContext':{getCrewApiContext:async()=>signedOut?{context:null,error:{code:'unauthorized',message:'Sign in.',status:401}}:{context:{roles,user:{id:other},supabase:{local:true}}}},
  '@/lib/data/mobile-quotes':{createMobileQuote:async(...args)=>{calls.push(args);if(error)throw error;return{id:quoteId,creationRequestId:requestId,creationReplayed:false};}},
 });return{calls,run:value=>route.POST(new Request('http://localhost/api/mobile/quotes/draft',{method:'POST',body:typeof value==='string'?value:JSON.stringify(value)}))};
}
for(const roles of [['owner'],['admin'],['payroll_admin'],['estimator']])test(`new route authorizes ${roles[0]}`,async()=>{
 const f=routeFixture({roles});const r=await f.run({...body(),requestId:requestId.toUpperCase()});assert.equal(r.status,201);assert.equal(f.calls.length,1);assert.equal(f.calls[0][2].requestId,requestId);
});
for(const options of [{signedOut:true},{roles:[]},{roles:['crew']},{roles:['customer']}])test(`new route denies ${JSON.stringify(options)}`,async()=>{
 const f=routeFixture(options),r=await f.run(body());assert.ok([401,403].includes(r.status));assert.equal(f.calls.length,0);
});
for(const input of ['invalid json',{}, {...body(),requestId:undefined},{...body(),requestId:null},{...body(),lines:[]}])test(`new route requires keyed input ${JSON.stringify(input)}`,async()=>{
 const f=routeFixture(),r=await f.run(input);assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
for(const error of [new Error('PRIVATE_DIAGNOSTIC'),new editResult.QuoteEditError('Review saved proposal.',409),new editResult.QuoteEditError('Retry same details.',503)])test(`new route safe failure ${error.status}`,async()=>{
 const f=routeFixture({error}),r=await f.run(body());assert.equal(r.status,error instanceof editResult.QuoteEditError?error.status:503);assert.equal(r.error.message.includes('PRIVATE'),false);assert.equal(f.calls.length,1);
});
