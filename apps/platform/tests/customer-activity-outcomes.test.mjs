import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
import {mapBounded} from '../src/lib/runtime/deadline.ts';
import {redactActivityData} from '../src/lib/security/activity-redaction.ts';
const activity=randomUUID(),input={category:'quotes',eventType:'local',idempotencyKey:'local',subjectId:randomUUID(),subjectType:'quote',title:'Local notice',summary:'Local summary',destinationPath:'/admin',metadata:{token:'SECRET',safe:'retained'}};
function fixture(options={}){
 const ids=Array.from({length:options.count??7},()=>randomUUID()),calls=[],sends=[],logs=[];let active=0,peak=0;
 const saved={activity_id:activity,created:true,legacy_hold:false,notification_count:ids.length,delivery_count:ids.length,delivery_ids:ids,...options.saved};
 const mod=load('../src/lib/notifications/customer-activity.ts',{
  'server-only':{},'@/lib/security/activity-redaction':{redactActivityData},'@/lib/runtime/deadline':{mapBounded},
  '@/lib/email/delivery-commands':{callDeliveryCommand:async(db,name,args)=>{calls.push({name,args});return{data:options.error?null:saved,error:options.error?{message:'SECRET diagnostic'}:null};}},
  '@/lib/email/delivery':{dispatchSavedEmail:async id=>{sends.push(id);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;if(options.failFirst&&id===ids[0])throw Error('SECRET transport');return{ok:!options.unknown,outcome:options.unknown?'unknown':'accepted',historyRecorded:true,sourceReconciled:true};}},
  '@/lib/email/delivery-followups':{completeDeliveryFollowups:async(db,id,result)=>({...result,historyRecorded:!options.historyFailure})},
  '@/lib/email/send':{sendEmailTransport:()=>assert.fail('Provider unavailable in this test')},
  '@/lib/email/config':{getEmailSetupState:()=>({configured:options.configured!==false,from:'local@example.invalid',replyTo:'local@example.invalid'})},
  '@/lib/security/app-base-url':{buildCanonicalAppUrl:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>options.noDb?null:{}},
 });
 return{calls,sends,logs,peak:()=>peak,run:async()=>{const old=console.error;console.error=(...a)=>{if(String(a[0]).startsWith("Customer activity"))logs.push(a);else old(...a);};try{await mod.emitCustomerActivity(input);}finally{console.error=old;}}};
}
test('one atomic preparation precedes all saved-request dispatch with a three-send limit above the API row cap',async()=>{
 const f=fixture({count:1230});await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'prepare_customer_activity');assert.equal(f.sends.length,1230);assert.equal(f.peak(),3);assert.deepEqual(f.logs,[]);
 assert.equal(f.calls[0].args.p_event.metadata.token,'[redacted]');assert.equal(f.calls[0].args.p_event.metadata.safe,'retained');assert.ok(!JSON.stringify(f.calls).includes('SECRET'));
});
test('errors, legacy holds and malformed acknowledgements never authorize provider I/O',async()=>{
 for(const options of [{error:true},{noDb:true},...[
  {activity_id:'invalid'},{legacy_hold:true},{legacy_hold:undefined},{created:undefined},{notification_count:-1},
  {notification_count:0},{delivery_count:undefined},{delivery_count:0},{delivery_ids:['invalid']},{delivery_ids:[activity,activity]},{delivery_ids:null},
 ].map(saved=>({saved}))]){const f=fixture(options);await f.run();assert.equal(f.sends.length,0);assert.equal(f.logs.length,1);assert.ok(!JSON.stringify(f.logs).includes('SECRET'));}
});
test('missing sender configuration leaves complete saved requests available for supervised recovery',async()=>{
 const f=fixture({configured:false});await f.run();assert.equal(f.calls.length,1);assert.equal(f.sends.length,0);assert.deepEqual(f.logs,[]);
});
test('same-event replay uses saved delivery identities without composing new payloads',async()=>{
 const f=fixture({saved:{created:false}});await f.run();await f.run();assert.deepEqual(f.sends.slice(0,7),f.sends.slice(7));assert.equal(f.calls.length,2);
});
test('unknown outcomes, missing history and one failed recipient remain visible without abandoning others',async()=>{
 for(const options of [{unknown:true},{historyFailure:true},{failFirst:true}]){const f=fixture(options);await f.run();assert.equal(f.sends.length,7);assert.equal(f.logs.length,1);assert.ok(!JSON.stringify(f.logs).includes('SECRET'));}
});
test('an empty prepared audience is a valid complete transaction',async()=>{
 const f=fixture({count:0});await f.run();assert.equal(f.calls.length,1);assert.deepEqual(f.sends,[]);assert.deepEqual(f.logs,[]);
});
