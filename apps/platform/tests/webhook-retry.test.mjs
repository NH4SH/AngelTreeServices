import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,deps){const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(name=>{assert.ok(name in deps,name);return deps[name];},m,m.exports);return m.exports;
}
function fixture(options={}){
 const trace=[];
 const client={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:'local_actor'}}})},rpc:async name=>{trace.push(name);return {data:options.denied?null:{phase:'effects_ready',object_id:'cs_fixture',created_at:'2026-10-15T00:00:00Z',livemode:false,event_type:'checkout.session.completed'},error:options.denied?{message:'Invoice not found.'}:null};}};
 const action=load('../src/app/admin/settings/system-health/webhook-actions.ts',{
  'next/cache':{revalidatePath:()=>{}},'@/lib/auth/roles':{getUserRoles:async()=>options.inactive?[]:[options.role??'owner'],hasAllowedRole:(roles,allowed)=>roles.some(r=>allowed.includes(r)),platformRoleGroups:{accessApproval:['owner','admin']}},
  '@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{getServiceRoleClient:()=>{trace.push('service');return {}; }},
  '@/lib/stripe/server':{getStripeServerConfig:()=>{trace.push('stripe');return {configured:false,stripe:null};}},
  '@/lib/payments/webhook-recovery':{processStripeWebhook:async()=>{trace.push('process');return {status:'completed'};}},
  '@/lib/payments/webhook-email':{},'@/lib/payments/checkout-budget':{createCheckoutBudget:()=>({})},'@/lib/communications/queue':{},
  '@/lib/payments/webhook-logging':{safeWebhookLog:()=>({})},'@/lib/security/errors':{safeStaffMessage:m=>m??'Unavailable'},
 }).retryStripeWebhook;
 const form=new FormData();form.set('event_id','evt_fixture');return {trace,action,form};
}
for(const config of [{signedOut:true},{role:'customer'},{role:'crew'},{role:'estimator'},{role:'payroll_admin'},{role:'property_manager'},{role:'owner',inactive:true},{role:'admin',inactive:true}]){
 test(`operator retry rejects ${JSON.stringify(config)} before privileged clients`,async()=>{
  const f=fixture(config);assert.equal((await f.action({},f.form)).status,'error');assert.deepEqual(f.trace,[]);
 });
}
test('target authorization rechecks inside DB before any privileged client',async()=>{
 const f=fixture({denied:true});assert.equal((await f.action({},f.form)).status,'error');assert.deepEqual(f.trace,['request_stripe_webhook_retry']);
});
test('operator retries only an identified retained receipt',async()=>{
 const f=fixture();f.form.set('event_id','anything_else');assert.equal((await f.action({},f.form)).status,'error');assert.deepEqual(f.trace,[]);
});
test('an authorized durable financial checkpoint resumes without a Stripe event fetch',async()=>{
 for(const role of ['owner','admin']){const f=fixture({role});assert.equal((await f.action({},f.form)).status,'success');assert.deepEqual(f.trace,['request_stripe_webhook_retry','service','stripe','process']);}
});
