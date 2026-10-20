import assert from 'node:assert/strict';
import test from 'node:test';
import {preferenceRouteFixture} from './payment-preference-fixture.mjs';
import {withDeadline} from '../src/lib/runtime/deadline.ts';
import {load} from './pr10-test-helpers.mjs';
const invoice='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
const source='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
const base='https://crm.example.invalid',hash='a'.repeat(64);
const eventRow=(changes={})=>({invoice_id:invoice,preference_changed:true,source_event_id:source,...changes});
const tableRow=(changes={})=>({invoice_id:invoice,preference_changed:true,...changes});

const invalid={absent:{data:null,error:null},empty:{data:[],error:null},object:{data:tableRow(),error:null},
 duplicate:{data:[tableRow(),tableRow()],error:null},foreign:{data:[tableRow({invoice_id:other})],error:null},
 missingInvoice:{data:[{preference_changed:true}],error:null},stringChanged:{data:[tableRow({preference_changed:'true'})],error:null},
 missingChanged:{data:[{invoice_id:invoice}],error:null},missingError:{data:[tableRow()]},falseError:{data:[tableRow()],error:false},
 error:{data:[tableRow()],error:{code:'private diagnostic'}},primitive:{data:true,error:null}};
for(const kind of ['bank','card']){
 for(const[name,receipt]of Object.entries(invalid))test(`${kind}: ${name} preference receipt stops provider preparation`,async()=>{
  const f=preferenceRouteFixture(kind,{receipt});const r=await f.run();assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
  assert.equal(f.next.length,0);assert.equal(f.handoffs.length,0);assert.equal(f.calls.length,1);
 });
 for(const changed of [true,false])test(`${kind}: exact ${changed?'changed':'unchanged'} receipt permits the existing path`,async()=>{
  const f=preferenceRouteFixture(kind,{row:{preference_changed:changed}});assert.equal((await f.run()).status,200);assert.equal(f.next.length,1);
  assert.deepEqual(f.calls,[{name:'record_invoice_payment_preference',args:{p_token_hash:hash,p_preference:kind==='bank'?'ach':'card'}}]);assert.equal(f.handoffs.length,0);
 });
 test(`${kind}: thrown storage diagnostics return a safe unavailable response`,async()=>{
  const f=preferenceRouteFixture(kind,{fault:'throw'});const r=await f.run();assert.equal(r.status,503);assert.equal(JSON.stringify(await r.json()).includes('private'),false);assert.equal(f.next.length,0);
 });
 test(`${kind}: timeout aborts the query and cannot authorize provider work or replay`,async()=>{
  let aborted=false;
  const helper=load('../src/lib/payments/payment-preference.ts',{'server-only':{},'../runtime/deadline.ts':{withDeadline:(work,ms)=>{assert.equal(ms,5000);return withDeadline(signal=>{signal.addEventListener('abort',()=>{aborted=true;});return work(signal);},10);}}});
  const f=preferenceRouteFixture(kind,{fault:'hang',helper});assert.equal((await f.run()).status,503);assert.equal(aborted,true);assert.equal(f.calls.length,1);assert.equal(f.next.length,0);
 });
 test(`${kind}: organization-only billing passes through without a fabricated customer`,async()=>{
  const f=preferenceRouteFixture(kind,{organization:true});assert.equal((await f.run()).status,200);assert.equal(f.next[0].customerId,null);assert.equal(f.next[0].organizationId,other);
 });
 test(`${kind}: lost save acknowledgement never advances; an explicit retry can use the saved selection`,async()=>{
  const f=preferenceRouteFixture(kind,{receipt:{data:null,error:null},once:true,row:{preference_changed:false}});
  assert.equal((await f.run()).status,503);assert.equal(f.next.length,0);assert.equal(f.calls.length,1);
  assert.equal((await f.run()).status,200);assert.equal(f.next.length,1);assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);
 });
}
for(const [name,receipt]of Object.entries({missingError:{data:eventRow()},falseError:{data:eventRow(),error:false},array:{data:[eventRow()],error:null},
 foreign:{data:eventRow({invoice_id:other}),error:null},missingSource:{data:{invoice_id:invoice,preference_changed:false},error:null},
 nullChanged:{data:eventRow({source_event_id:null}),error:null},sourceObject:{data:eventRow({source_event_id:{toString:()=>source}}),error:null},
 primitive:{data:true,error:null},stringChanged:{data:eventRow({preference_changed:'true'}),error:null},
 error:{data:eventRow(),error:{code:'private diagnostic'}}}))test(`form: ${name} cannot report a save or dispatch a notice`,async()=>{
 const f=preferenceRouteFixture('form',{receipt});const r=await f.run();assert.equal(r.status,503);assert.equal(f.handoffs.length,0);assert.equal(f.calls.length,1);
});
for(const method of ['ach','card','cash_check_pickup','check_mail'])test(`form: ${method} retains the exact durable event identity`,async()=>{
 const f=preferenceRouteFixture('form',{method});const r=await f.run();assert.deepEqual(await r.json(),{ok:true,changed:true,notificationFailed:false});
 assert.deepEqual(f.calls,[{name:'record_invoice_preference_with_event',args:{p_preference:method,p_token_hash:hash}}]);assert.deepEqual(f.handoffs,[{id:source}]);
});
for(const [changed,event]of [[false,source],[false,null]])test(`form: unchanged selection with ${event?'saved':'no legacy'} event remains supported`,async()=>{
 const f=preferenceRouteFixture('form',{row:{preference_changed:changed,source_event_id:event}});assert.deepEqual(await(await f.run()).json(),{ok:true,changed,notificationFailed:false});assert.equal(f.handoffs.length,event?1:0);
});
for(const delivery of [null,undefined,{}, {prepared:false},{prepared:'true'}, {prepared:1}])test(`form: uncertain notification ${JSON.stringify(delivery)} preserves the confirmed save`,async()=>{
 const f=preferenceRouteFixture('form',{delivery});assert.deepEqual(await(await f.run()).json(),{ok:true,changed:true,notificationFailed:true});assert.equal(f.calls.length,1);assert.deepEqual(f.handoffs,[{id:source}]);
});
test('form: thrown notification preserves the confirmed save and its recovery identity',async()=>{
 const f=preferenceRouteFixture('form',{deliveryThrows:true});assert.deepEqual(await(await f.run()).json(),{ok:true,changed:true,notificationFailed:true});assert.equal(f.calls.length,1);assert.equal(f.handoffs.length,1);
});
test('form: a thrown storage response is not mistaken for a successful save',async()=>{
 const f=preferenceRouteFixture('form',{fault:'throw'});assert.equal((await f.run()).status,503);assert.equal(f.handoffs.length,0);
});
for(const kind of ['bank','card','form'])for(const [name,options,status]of [
 ['foreign origin',{origin:'https://other.example.invalid'},403],['unavailable limiter',{limit:{available:false}},503],
 ['limited',{limit:{allowed:false,retryAfterSeconds:40}},429],['invalid body',{body:{unexpected:true}},400],['unavailable portal',{unavailable:true},404],
])test(`${kind}: ${name} still stops before preference and provider work`,async()=>{
 const f=preferenceRouteFixture(kind,options),r=await f.run();assert.equal(r.status,status);assert.equal(f.calls.length,0);assert.equal(f.next.length,0);assert.equal(f.handoffs.length,0);if(status===429)assert.equal(r.headers.get('retry-after'),'40');
});
