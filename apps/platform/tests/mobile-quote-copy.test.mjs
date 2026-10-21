import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './pr10-test-helpers.mjs';
import * as editResult from '../src/lib/quotes/edit-result.ts';
import {quoteEditFixture,requestId,quoteId,other,location} from './quote-edit-confirmation-fixture.mjs';
const validation=load('../src/lib/api/mobile-quotes.ts');
const body=()=>({customerId:other,organizationId:null,serviceLocationId:location,requestId,
 customerMessage:'  Copied notes\r\nKeep ending spaces  ',lines:[{id:other,name:'  '+ 'N'.repeat(140)+'  ',description:'Scope\r\n'+'x'.repeat(13000)+'  ',quantity:1,unitPriceCents:1000}]});
test('copy preserves stored names, descriptions and notes without editor normalization',()=>{
 const original=body(),r=validation.validateMobileQuoteCopyInput(original);assert.equal(r.error,'');
 assert.equal(r.value.lines[0].name,original.lines[0].name);assert.equal(r.value.lines[0].description,original.lines[0].description);
 assert.equal(r.value.customerMessage,original.customerMessage);assert.equal(r.value.lines[0].id,undefined);
 assert.equal(r.value.expectedRevision,undefined);
});
test('copy permits the existing SQL capacity and quantity/price ranges',()=>{
 for(const lines of [Array.from({length:51},()=>({name:'Line',quantity:1,unitPriceCents:1})),Array.from({length:1000},()=>({name:'Line',quantity:1,unitPriceCents:1})),
 [{name:'Existing high quantity',quantity:99_999_999.99,unitPriceCents:0}], [{name:'Existing price',quantity:1,unitPriceCents:2_147_483_647}]]){
  const result=validation.validateMobileQuoteCopyInput({...body(),lines});assert.ok(result.value);assert.equal(result.value.lines.length,lines.length);
 }
});
for(const [name,patch]of Object.entries({missingID:{requestId:undefined},nullID:{requestId:null},badID:{requestId:'bad'},bothParties:{organizationId:other},noParty:{customerId:null},noLocation:{serviceLocationId:''},noLines:{lines:[]},tooMany:{lines:Array(1001).fill({name:'Line',quantity:1,unitPriceCents:0})},badNotes:{customerMessage:{}},blankName:{lines:[{name:' ',quantity:1,unitPriceCents:1}]},badDescription:{lines:[{name:'Line',description:{},quantity:1,unitPriceCents:1}]},badQuantity:{lines:[{name:'Line',quantity:Infinity,unitPriceCents:1}]},largeQuantity:{lines:[{name:'Line',quantity:100_000_000,unitPriceCents:1}]},negativePrice:{lines:[{name:'Line',quantity:1,unitPriceCents:-1}]},fractionPrice:{lines:[{name:'Line',quantity:1,unitPriceCents:1.5}]}}))test(`copy rejects ${name}`,()=>assert.equal(validation.validateMobileQuoteCopyInput({...body(),...patch}).value,null));
function routeFixture({roles=['owner'],signedOut=false,error=null}={}){
 const calls=[];const route=load('../src/app/api/mobile/quotes/copy/route.ts',{
  '@/lib/api/responses':{apiSuccess:(data,status)=>({data,status}),apiError:(code,message,status)=>({error:{code,message},status})},
  '@/lib/api/mobile-quotes':validation,'@/lib/quotes/edit-result':editResult,
  '@/lib/auth/apiContext':{getCrewApiContext:async()=>signedOut?{context:null,error:{code:'unauthorized',message:'Sign in.',status:401}}:{context:{roles,user:{id:other},supabase:{local:true}}}},
  '@/lib/data/mobile-quotes':{createMobileQuote:async(...args)=>{calls.push(args);if(error)throw error;return{id:quoteId,creationRequestId:requestId,creationReplayed:true};}},
 });return{calls,run:input=>route.POST(new Request('http://localhost/api/mobile/quotes/copy',{method:'POST',body:JSON.stringify(input)}))};
}
for(const role of ['owner','admin','estimator','payroll_admin'])test(`copy route authorizes ${role} and forwards original scope`,async()=>{
 const f=routeFixture({roles:[role]}),input=body(),r=await f.run(input);assert.equal(r.status,201);assert.equal(r.data.quote.creationReplayed,true);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][2].lines[0].description,input.lines[0].description);assert.equal(f.calls[0][2].requestId,requestId);
});
for(const options of [{signedOut:true},{roles:[]},{roles:['crew']}])test(`copy route denies ${JSON.stringify(options)}`,async()=>{
 const f=routeFixture(options),r=await f.run(body());assert.ok([401,403].includes(r.status));assert.equal(f.calls.length,0);
});
test('copy route rejects missing identity without a write',async()=>{
 const f=routeFixture(),r=await f.run({...body(),requestId:undefined});assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test('copy route does not expose an unexpected diagnostic or fall back',async()=>{
 const f=routeFixture({error:Error('PRIVATE_DIAGNOSTIC')}),r=await f.run(body());assert.equal(r.status,503);assert.equal(f.calls.length,1);assert.equal(r.error.message.includes('PRIVATE'),false);
});
test('large copied scope uses the durable helper without trimming its receipt-bound text',async()=>{
 const f=quoteEditFixture({create:true});const input=validation.validateMobileQuoteCopyInput(body()).value;
 f.input.requestId=input.requestId;f.input.lines=[...input.lines,...input.lines];f.input.customerMessage=input.customerMessage;
 const r=await f.runMobileCreate();assert.equal(r.id,quoteId);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'create_quote_draft_request');
 assert.equal(f.calls[0].args.p_lines[0].description,input.lines[0].description);assert.equal(f.calls[0].args.p_header.customer_message,input.customerMessage);
});
