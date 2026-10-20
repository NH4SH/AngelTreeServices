import * as preference from '../src/lib/payments/payment-preference.ts';
import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';import {load} from './pr10-test-helpers.mjs';import {mapBounded} from '../src/lib/runtime/deadline.ts';
const id=randomUUID(),activity=randomUUID(),review=randomUUID(),deliveries=Array.from({length:7},()=>randomUUID());
const validator=load('../src/lib/notifications/customer-activity.ts',{'server-only':{},'@/lib/security/activity-redaction':{},'@/lib/runtime/deadline':{},'@/lib/email/delivery-commands':{},'@/lib/email/delivery':{},'@/lib/email/delivery-followups':{},'@/lib/email/send':{},'@/lib/email/config':{},'@/lib/security/app-base-url':{},'@/lib/supabase/admin':{}});
function fixture(options={}){
 const calls=[],sends=[],logs=[];let active=0,peak=0;
 const mod=load('../src/lib/notifications/source-events.ts',{'server-only':{},'@/lib/supabase/admin':{getServiceRoleClient:()=>options.noDb?null:{}},'@/lib/email/delivery-commands':{callDeliveryCommand:async(db,name,args)=>{calls.push({name,args});if(options.error===name)return{error:{message:'SECRET diagnostic'},data:null};return{error:null,data:name==='prepare_customer_source_event'?{source_event_id:id,activity_id:activity,legacy_hold:false,created:true,notification_count:7,delivery_count:7,delivery_ids:deliveries,...options.receipt}:options.legacy?null:{id,destination_path:'/admin',...options.lookup}};}},'@/lib/email/config':{getEmailSetupState:()=>({configured:options.configured!==false,from:'local@example.invalid',replyTo:'local@example.invalid'})},'@/lib/email/delivery':{dispatchSavedEmail:async d=>{sends.push(d);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return{ok:!options.unknown,outcome:options.unknown?'unknown':'accepted',historyRecorded:true,sourceReconciled:true};}},'@/lib/email/delivery-followups':{completeDeliveryFollowups:async(db,id,r)=>r},'@/lib/email/send':{sendEmailTransport:()=>assert.fail('Provider not available in a unit test')},'@/lib/notifications/customer-activity':validator,'@/lib/security/app-base-url':{buildCanonicalAppUrl:()=>null},'@/lib/runtime/deadline':{mapBounded}});
 async function run(manual=false){const old=console.error;console.error=(...a)=>{if(String(a[0]).startsWith('Customer source'))logs.push(a);else old(...a);};try{return manual?await mod.prepareReviewedCustomerSourceEvent(id,review):await mod.deliverCustomerSourceEvent({id});}finally{console.error=old;}}
 return{mod,calls,sends,logs,peak:()=>peak,run};
}
test('automatic source handoff sends only positively acknowledged saved requests, with three-way fan-out',async()=>{const f=fixture();assert.equal((await f.run()).prepared,true);assert.equal(f.peak(),3);assert.deepEqual(f.sends,deliveries);assert.deepEqual(f.calls.map(c=>c.name),['get_customer_source_event','prepare_customer_source_event']);assert.equal(f.calls[1].args.p_source_id,id);assert.equal(f.calls[1].args.p_review_id,null);assert.ok(!('p_event'in f.calls[1].args));assert.deepEqual(f.logs,[]);});
test('reviewed preparation NEVER dispatches even with email configured',async()=>{const f=fixture();assert.equal((await f.run(true)).prepared,true);assert.equal(f.calls[1].args.p_review_id,review);assert.equal(f.sends.length,0);});
test('missing sender configuration persists preparation without claiming transport',async()=>{const f=fixture({configured:false});assert.equal((await f.run()).prepared,true);assert.equal(f.calls.length,2);assert.equal(f.sends.length,0);});
test('pre-existing source pages are not backfilled by a missing source lookup',async()=>{const f=fixture({legacy:true});assert.equal((await f.run()).prepared,false);assert.equal(f.calls.length,1);assert.deepEqual(f.logs,[]);assert.equal(f.sends.length,0);});
test('unknown saves, legacy holds and incomplete/mismatched receipts cannot authorize sending',async()=>{
 for(const options of [{noDb:true},{error:'get_customer_source_event'},{error:'prepare_customer_source_event'},{lookup:{id:randomUUID()}},{lookup:{destination_path:'https://wrong.example.invalid'}},...[
  {source_event_id:randomUUID()},{legacy_hold:true},{delivery_ids:[]},{activity_id:'invalid'},{delivery_count:undefined},
 ].map(receipt=>({receipt}))]){const f=fixture(options);assert.equal((await f.run()).prepared,false);assert.equal(f.sends.length,0);assert.ok(f.logs.length);assert.ok(!JSON.stringify(f.logs).includes('SECRET'));}
});
test('an uncertain delivery does not rotate keys or create a second preparation identity',async()=>{const f=fixture({unknown:true});await f.run();await f.run();assert.deepEqual(f.sends.slice(0,7),f.sends.slice(7));assert.ok(f.calls.filter(c=>c.name==='prepare_customer_source_event').every(c=>c.args.p_source_id===id));assert.equal(f.logs.length,2);});
test('recovery action requires exact authenticated review acknowledgement before its no-send helper',async()=>{
 for(const change of [{},{source_event_id:randomUUID()},{review_id:randomUUID()}]){
  let prepared=0;const actions=load('../src/app/admin/communications/delivery-review/actions.ts',{'@/lib/email/delivery-commands':{callDeliveryCommand:async()=>({data:{source_event_id:id,review_id:review,...change},error:null})},'next/cache':{revalidatePath:()=>{}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})}})},'@/lib/supabase/admin':{},'@/lib/auth/roles':{getUserRoles:async()=>['owner'],hasAllowedRole:()=>true,platformRoleGroups:{accessApproval:['owner']}},'@/lib/email/delivery-followups':{},'@/lib/email/delivery':{},'@/lib/email/send':{},'@/lib/email/config':{},'@/lib/email/provider-events':{},'@/lib/leads/notifications':{},'@/lib/notifications/source-events':{prepareReviewedCustomerSourceEvent:async(source,authority)=>{assert.equal(source,id);assert.equal(authority,review);prepared++;return{prepared:true};}}});
  const form=new FormData();form.set('source_event_id',id);form.set('request_id',review);form.set('reason','Synthetic reviewed recovery');const result=await actions.prepareMissingSourceActivity({status:'idle',message:''},form);assert.equal(prepared,Object.keys(change).length?0:1);assert.equal(result.status,Object.keys(change).length?'error':'success');assert.match(result.message,/No email was sent/);
 }
});

function invoiceRoute(receipt,options={}){
 const calls=[],handoffs=[],invoiceId=options.invoiceId??activity;
 const route=load('../src/app/api/portal/invoice/[token]/payment-preference/route.ts',{
  '@/lib/payments/payment-preference':preference,
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/data/portal-invoice':{getInvoiceByPortalToken:async()=>({status:'ready',invoice:{id:invoiceId}})},
  '@/lib/payments/payment-options':{isInvoicePaymentPreference:v=>v==='ach'},
  '@/lib/notifications/source-events':{deliverCustomerSourceEvent:async source=>{handoffs.push(source);return{prepared:true};}},
  '@/lib/portal/tokens':{hashPortalToken:()=> 'a'.repeat(64)},
  '@/lib/supabase/admin':{getServiceRoleClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:receipt,error:null};}})},
  '@/lib/security/rate-limit':{enforceSharedRateLimit:async()=>({available:true,allowed:true})},
  '@/lib/security/app-base-url':{getCanonicalAppBaseUrl:()=> 'http://127.0.0.1:3102'},
 });
 return{calls,handoffs,run:(origin='http://127.0.0.1:3102')=>route.POST(new Request('http://127.0.0.1:3102/api/portal/invoice/synthetic/payment-preference',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({preference:'ach'})}),{params:Promise.resolve({token:'synthetic'})})};
}
test('invoice endpoint recovers the saved source on changed and unchanged retries, without inventing an event for legacy no-ops',async()=>{
 for(const [changed,source]of [[true,id],[false,id],[false,null]]){const f=invoiceRoute({invoice_id:activity,preference_changed:changed,source_event_id:source});const r=await f.run();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,changed,notificationFailed:false});assert.equal(f.handoffs.length,source?1:0);if(source)assert.deepEqual(f.handoffs[0],{id:source});assert.equal(f.calls[0].name,'record_invoice_preference_with_event');}
});
test('invoice endpoint cannot authorize handoff from incomplete or mismatched transaction receipts',async()=>{
 for(const receipt of [null,{invoice_id:randomUUID(),preference_changed:true,source_event_id:id},{invoice_id:activity,preference_changed:true,source_event_id:null},{invoice_id:activity,preference_changed:true},{invoice_id:activity,preference_changed:'true',source_event_id:id}]){const f=invoiceRoute(receipt);assert.equal((await f.run()).status,503);assert.equal(f.handoffs.length,0);}
});
test('invoice endpoint still refuses cross-origin requests before source or notification work',async()=>{const f=invoiceRoute({invoice_id:activity,preference_changed:true,source_event_id:id});assert.equal((await f.run('https://other.example.invalid')).status,403);assert.equal(f.calls.length,0);assert.equal(f.handoffs.length,0);});
