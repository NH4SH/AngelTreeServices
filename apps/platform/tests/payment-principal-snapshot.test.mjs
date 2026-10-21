import assert from 'node:assert/strict';
import test from 'node:test';
import {contextFixture,invoiceId} from './portal-payment-context-fixture.mjs';
const row=changes=>({invoice_id:invoiceId,successful_payment_count:1005,paid_principal_cents:1005,...changes});
function fixture({receipt={data:row(),error:null},throws=false,hang=false}={}){
 const calls=[];let aborted=false;
 const db={from:()=>assert.fail('An aggregate read must not download individual payment rows'),rpc(name,args){calls.push({name,args});
  const q={abortSignal(signal){signal.addEventListener('abort',()=>{aborted=true;});return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(throws)throw Error('private RPC diagnostic');if(hang)return new Promise(()=>{});return receipt;
  }).then(resolve,reject);}};return q;}};
 const f=contextFixture({db,fastDeadline:true});return{calls,aborted:()=>aborted,read:(...ids)=>f.reconciliation.getSuccessfulPaymentTotal(db,ids.length?ids[0]:invoiceId)};
}
test('one aggregate acknowledges more successful payments than the Data API row cap',async()=>{
 const f=fixture();assert.deepEqual(await f.read(),{error:null,totalCents:1005});assert.deepEqual(f.calls,[{name:'get_invoice_payment_principal',args:{p_invoice_id:invoiceId}}]);
});
for(const [name,data]of [['zero payments',row({successful_payment_count:0,paid_principal_cents:0})],['fully restored',row({paid_principal_cents:0})],
 ['max principal per row',row({successful_payment_count:1,paid_principal_cents:2147483647})],['large safe aggregate',row({successful_payment_count:5000000,paid_principal_cents:Number.MAX_SAFE_INTEGER-1})]])test(`${name} remains a read-only confirmed amount`,async()=>{
 assert.deepEqual(await fixture({receipt:{data,error:null}}).read(),{error:null,totalCents:data.paid_principal_cents});
});
for(const [name,receipt]of Object.entries({empty:{data:{},error:null},idOnly:{data:{invoice_id:invoiceId},error:null},oldRows:{data:[{amount_cents:1005}],error:null},
 impossible:{data:row({successful_payment_count:1,paid_principal_cents:2147483648}),error:null},emptyMoney:{data:row({successful_payment_count:0,paid_principal_cents:1}),error:null},
 missingFunction:{data:null,error:{code:'42883',message:'private missing function'}},denied:{data:null,error:{code:'42501',message:'private denied'}},
 missingInvoice:{data:null,error:null},missingEnvelope:{data:row()},coercedError:{data:row(),error:0}}))test(`${name} cannot authorize collection or trigger a fallback`,async()=>{
 const f=fixture({receipt});const r=await f.read();assert.ok(r.error);assert.equal(r.totalCents,0);assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r).includes('private'),false);
});
test('uncertain transport is contained without automatic retry',async()=>{const f=fixture({throws:true});assert.ok((await f.read()).error);assert.equal(f.calls.length,1);});
test('a stalled aggregate aborts and fails closed',async()=>{const f=fixture({hang:true});assert.ok((await f.read()).error);assert.equal(f.aborted(),true);assert.equal(f.calls.length,1);});
for(const id of ['invoice',null,'',undefined,123])test(`invalid identity ${id} makes no query`,async()=>{
 const f=fixture();const r=await f.read(id);assert.ok(r.error);assert.equal(f.calls.length,0);
});
test('the new local migration remains deferred from the pinned staging96 candidate',async()=>{
 const {currentSourceEventSources}=await import('../scripts/release/verify-staging-source-event-candidate.mjs');
 const s=currentSourceEventSources();assert.equal(s.files.length,96);assert.equal(s.candidate.readyForHosting,false);
 assert.equal(s.files.some(f=>f.name.includes('invoice_payment_principal_snapshot')),false);
});
