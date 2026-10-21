import assert from'node:assert/strict';import test from'node:test';import{load}from'./pr10-test-helpers.mjs';import{withDeadline}from'../src/lib/runtime/deadline.ts';
import * as policy from '../src/lib/security/staging-policy.mjs';
import { stagingFixture } from './staging-fixture.mjs';
const secret='local-test-worker-credential-only-000000000';
function fixture(base='https://admin.angeltreeservices.org',value=secret,env={},targets={}){let calls=0;const previousNetlify=globalThis.Netlify,previousFetch=globalThis.fetch;globalThis.Netlify={env:{get:key=>key in env?env[key]:key==='APP_BASE_URL'?base:key==='SITE_ID'?policy.production.netlifySiteId:key==='WORKER_SECRET'?value:undefined}};const mod=load('../netlify/lib/worker-request.ts',{'../../staging/targets.json':targets,'../../src/lib/security/staging-policy.mjs':policy,'../../src/lib/runtime/deadline.ts':{withDeadline:(fn)=>withDeadline(fn,20)}});return{...mod,calls:()=>calls,mock:fn=>{globalThis.fetch=async(...args)=>{calls++;return fn(...args);};},restore(){globalThis.Netlify=previousNetlify;globalThis.fetch=previousFetch;}};}
test('all scheduled wrappers reject noncanonical destinations before any credential is forwarded',async()=>{for(const url of['http://admin.angeltreeservices.org','https://admin.angeltreeservices.org:8443','https://angeltreeservices.org','https://admin.angeltreeservices.org.evil.invalid','https://user:password@admin.angeltreeservices.org','https://admin.angeltreeservices.org/path','https://admin.angeltreeservices.org/?secret=value','https://admin.angeltreeservices.org/#hash','http://127.0.0.1:3102']){const f=fixture(url);f.mock(()=>assert.fail('Credential must not leave process'));try{await assert.rejects(f.runScheduledWorker('/api/internal/test','WORKER_SECRET','Local worker'));assert.equal(f.calls(),0);}finally{f.restore();}}});
test('canonical worker requests prohibit redirects and require a confirmed clean JSON result',async()=>{for(const body of[{ok:true},{ok:false},{ok:true,errors:1},{ok:true,uncertain:1},{ok:true,acceptedUnrecorded:1},{ok:true,error:'PRIVATE-DIAGNOSTIC'}]){const f=fixture();f.mock(async(url,init)=>{assert.equal(String(url),'https://admin.angeltreeservices.org/api/internal/test');assert.equal(init.headers.Authorization,`Bearer ${secret}`);assert.equal(init.redirect,'error');assert.ok(init.signal);return new Response(JSON.stringify(body),{status:200});});try{if(Object.keys(body).length===1&&body.ok)await f.runScheduledWorker('/api/internal/test','WORKER_SECRET','Local worker');else await assert.rejects(f.runScheduledWorker('/api/internal/test','WORKER_SECRET','Local worker'),e=>!e.message.includes('PRIVATE'));}finally{f.restore();}}});
test('worker transport and stalled body deadlines expose no raw diagnostics or credential',async()=>{for(const impl of[async()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})}),async()=>{throw Error(`PRIVATE ${secret}`);}]){const f=fixture();f.mock(impl);try{await assert.rejects(f.runScheduledWorker('/api/internal/test','WORKER_SECRET','Local worker'),e=>!e.message.includes(secret)&&!e.message.includes('PRIVATE'));}finally{f.restore();}}});
test('all five existing scheduled entry points share the guard and keep their original schedules',async()=>{const entries=[['process-communications','@hourly'],['process-google-calendar','*/5 * * * *'],['manager-notifications','*/5 * * * *'],['run-system-health','*/10 * * * *'],['advance-scheduled-jobs','*/5 * * * *']];for(const[file,schedule]of entries){let invocation;const m=load(`../netlify/functions/${file}.ts`,{'../lib/worker-request':{runScheduledWorker:async(...args)=>invocation=args}});await m.default();assert.match(invocation[0],/^\/api\/internal\//);assert.match(invocation[1],/SECRET$/);assert.equal(m.config.schedule,schedule);}});


test('staging, unassigned/foreign sites and incomplete profiles never read or forward a worker credential', async () => {
 for(const [env,targets] of [
  [{APP_ENV:'staging'},{}], [{STAGING_MODE:'core-no-providers'},{}], [{APP_ENV:'stagng'},{}],
  [{SITE_ID:undefined},{}], [{SITE_ID:stagingFixture().env.SITE_ID},{}], [{},stagingFixture().manifest],
 ]) {
  const f=fixture(undefined,undefined,env,targets); f.mock(()=>assert.fail('No request permitted'));
  try { await assert.rejects(f.runScheduledWorker('/api/internal/test','WORKER_SECRET','Worker'),/disabled/); assert.equal(f.calls(),0); }
  finally { f.restore(); }
 }
});
test('scheduled worker credentials cannot be sent to a path outside the intended internal namespace',async()=>{
 for(const path of ['/api/internal/../../admin','/api/internal/../stripe/webhook','/api/internal/\\evil.invalid','/api/internal/test?redirect=https://evil.invalid','/api/internal/%2e%2e/stripe','//evil.invalid/api/internal/test']) {
  const f=fixture(); f.mock(()=>assert.fail('No request permitted'));
  try { await assert.rejects(f.runScheduledWorker(path,'WORKER_SECRET','Worker'),/Invalid/); assert.equal(f.calls(),0); }
  finally {f.restore();}
 }
});

test('customer email key activates only its worker and never unlocks scheduling',async()=>{
 const f=fixture(undefined,undefined,{CUSTOMER_EMAIL_WORKER_SECRET:secret});f.mock(async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+secret);return{ok:true,json:async()=>({ok:true})};});
 try{await f.runScheduledWorker('/api/internal/communications/process','CUSTOMER_EMAIL_WORKER_SECRET','Email');assert.equal(f.calls(),1);await assert.rejects(f.runScheduledWorker('/api/internal/jobs/advance','COMMUNICATION_WORKER_SECRET','Jobs'),/credential/);assert.equal(f.calls(),1);}finally{f.restore();}
});
test('customer email retains legacy credential compatibility and prefers its dedicated key',async()=>{
 for(const env of[{COMMUNICATION_WORKER_SECRET:secret},{COMMUNICATION_WORKER_SECRET:'old-credential-000000000000000000000',CUSTOMER_EMAIL_WORKER_SECRET:secret}]){const f=fixture(undefined,undefined,env);f.mock(async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+secret);return{ok:true,json:async()=>({ok:true})};});try{await f.runScheduledWorker('/api/internal/communications/process','CUSTOMER_EMAIL_WORKER_SECRET','Email');}finally{f.restore();}}
});
