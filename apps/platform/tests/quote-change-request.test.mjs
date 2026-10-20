import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
const {requestQuoteChanges}=load('../src/lib/quotes/change-request.ts',{'server-only':{}});
const {prepareQuoteChangeAttempt,forgetQuoteChangeAttempt}=load('../src/lib/portal/quote-change-attempt.ts');
const input=()=>({requestId:randomUUID(),tokenHash:'a'.repeat(64),expectedRevision:4,message:'Please adjust scope'});
const receipt=i=>({request_id:i.requestId,quote_id:randomUUID(),note_id:randomUUID(),edit_revision:5,requested_at:new Date().toISOString(),replayed:false,customer_id:randomUUID(),organization_id:null,quote_number:'Q-LOCAL',party_name:'Synthetic customer'});
test('quote change command rejects malformed identity, revision, message and token before database access',async()=>{
 for(const extra of [{requestId:''},{expectedRevision:0},{expectedRevision:1.5},{expectedRevision:2147483648},{message:'ab'},{message:'x'.repeat(1001)},{tokenHash:null}]){
  const r=await requestQuoteChanges({rpc(){assert.fail('invalid command reached database');}},{...input(),...extra});assert.equal(r.ok,false);assert.equal(r.rejected,true);
 }
});
test('one typed RPC and exact acknowledgement are required before success',async()=>{
 const i=input(),saved=receipt(i);let calls=0;
 const r=await requestQuoteChanges({async rpc(name,args){calls++;assert.equal(name,'request_quote_changes_by_portal');assert.deepEqual(args,{p_request_id:i.requestId,p_token_hash:i.tokenHash,p_expected_revision:4,p_message:i.message});return{data:saved,error:null};}},i);
 assert.equal(calls,1);assert.equal(r.ok,true);assert.deepEqual(r.receipt,saved);
});
test('response loss, invalid acknowledgements and backend errors retain retry identity without exposing diagnostics',async()=>{
 const i=input();
 for(const result of [{data:null},{data:{...receipt(i),request_id:randomUUID()}},{data:{...receipt(i),edit_revision:6}},{data:{...receipt(i),note_id:null}},{data:{...receipt(i),requested_at:'bad'}},{error:{code:'XX000',message:'SECRET SQL token'}},'throw']){
  let calls=0;const r=await requestQuoteChanges({async rpc(){calls++;if(result==='throw')throw Error('SECRET transport');return result;}},i);
  assert.equal(calls,1);assert.equal(r.ok,false);assert.equal(r.rejected,false);assert.ok(!r.message.includes('SECRET'));assert.match(r.message,/could not confirm/);
 }
});
test('known SQL rejections have plain responses and retire the unsuccessful attempt',async()=>{
 for(const code of ['42501','40001','23514','22023']){const r=await requestQuoteChanges({rpc:async()=>({error:{code,message:'SECRET'}})},input());assert.equal(r.ok,false);assert.equal(r.rejected,true);assert.ok(!r.message.includes('SECRET'));}
});
test('retry identity survives reload without persisting the link or message',async()=>{
 const rows=new Map(),storage={getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
 const first=await prepareQuoteChangeAttempt('secret-capability','Private customer message',4,storage);
 assert.deepEqual(await prepareQuoteChangeAttempt('secret-capability',' Private customer message ',5,storage),first);assert.equal(first.attempt.revision,4);
 assert.ok(!JSON.stringify([...rows]).includes('secret-capability'));assert.ok(!JSON.stringify([...rows]).includes('Private customer message'));
 const changed=await prepareQuoteChangeAttempt('secret-capability','Different customer message',5,storage);
 assert.notEqual(changed.attempt.requestId,first.attempt.requestId);assert.equal(changed.attempt.revision,4);
 assert.equal((await prepareQuoteChangeAttempt('different-capability','Different customer message',10,storage)).attempt.revision,10);
 forgetQuoteChangeAttempt(first.key,storage);assert.equal((await prepareQuoteChangeAttempt('secret-capability','Private customer message',5,storage)).attempt.revision,5);
});
test('disabled or corrupt storage keeps safe page-local retry identity',async()=>{
 const broken={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};
 const first=await prepareQuoteChangeAttempt('token','Message',7,broken);
 assert.deepEqual(await prepareQuoteChangeAttempt('token','Message',8,broken,first.attempt),first);forgetQuoteChangeAttempt(first.key,broken);
 for(const stored of ['{','null','{"requestId":"bad"}',JSON.stringify({requestId:randomUUID(),revision:-1,messageHash:'a'.repeat(64)})]){
  assert.equal((await prepareQuoteChangeAttempt('token','Message',7,{getItem:()=>stored,setItem(){},removeItem(){}})).attempt.revision,7);
 }
});
