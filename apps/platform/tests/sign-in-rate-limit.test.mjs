import assert from 'node:assert/strict';
import test from 'node:test';
import * as net from 'node:net';
import { performance } from 'node:perf_hooks';
import { load } from './pr10-test-helpers.mjs';
import { hashRateLimitKey } from '../src/lib/security/rate-limit-core.ts';
import { safeLocalRedirect } from '../src/lib/security/local-redirect.ts';
import { withDeadline } from '../src/lib/runtime/deadline.ts';

const allowed = { available:true, allowed:true, remaining:9, retryAfterSeconds:0 };
const limited = { available:true, allowed:false, remaining:0, retryAfterSeconds:300 };
const headers = address => new Headers({'x-nf-client-connection-ip': address});
function guard({consume=async()=>allowed,client={}}={}) {
  return load('../src/lib/security/sign-in-rate-limit.ts',{
    'server-only':{}, 'node:net':net,
    '@/lib/supabase/admin':{getServiceRoleClient:()=>client},
    '@/lib/security/rate-limit-core':{hashRateLimitKey},
    '@/lib/security/rate-limit':{consumeRateLimitWithClient:consume},
    '@/lib/runtime/deadline':{withDeadline},
  });
}
const policy=guard();

test('hosted sign-in requires the connecting-address header and ignores spoofed forwarded chains',()=>{
  assert.equal(policy.signInSourceAddress(new Headers({'x-forwarded-for':'198.51.100.1'})),null);
  for(const value of ['', 'not-an-ip','198.51.100.1, 192.0.2.1','198.51.100.1:443','[2001:db8::1]','fe80::1%lo0']) {
    const h=headers(value);h.set('x-forwarded-for','192.0.2.1');assert.equal(policy.signInSourceAddress(h),null,value);
  }
  const h=headers('198.51.100.1');h.set('x-forwarded-for','192.0.2.99, 192.0.2.100');
  assert.equal(policy.signInSourceAddress(h),'198.51.100.1');
});
test('IPv6 spelling and IPv4-mapped addresses cannot create alternate buckets for one source',()=>{
  assert.equal(policy.signInSourceAddress(headers('2001:0DB8:0:0:0:0:0:1')),'2001:db8::1');
  assert.equal(policy.signInSourceAddress(headers('::ffff:192.0.2.1')),'192.0.2.1');
  assert.equal(policy.signInSourceAddress(headers('::ffff:c000:201')),'192.0.2.1');
});
test('development fallback is restricted to one loopback address plus loopback Host',()=>{
  const h=new Headers({host:'127.0.0.1:3102','x-forwarded-for':'127.0.0.1'});
  assert.equal(policy.signInSourceAddress(h,true),'127.0.0.1');assert.equal(policy.signInSourceAddress(h,false),null);
  h.set('host','localhost:3102');assert.equal(policy.signInSourceAddress(h,true),'127.0.0.1');
  h.set('host','public.example');assert.equal(policy.signInSourceAddress(h,true),null);
  h.set('host','localhost');h.set('x-forwarded-for','198.51.100.1');assert.equal(policy.signInSourceAddress(h,true),null);
  h.set('x-forwarded-for','127.0.0.1, 198.51.100.1');assert.equal(policy.signInSourceAddress(h,true),null);
  h.set('x-forwarded-for','::1');assert.equal(policy.signInSourceAddress(h,true),'::1');
  h.set('x-nf-client-connection-ip','bad');assert.equal(policy.signInSourceAddress(h,true),null);
});
test('email case/spacing share a source-account bucket; different sources do not share account lockout',async()=>{
  const calls=[];const g=guard({consume:async(_,input)=>{calls.push(input);return allowed;}});
  for(const email of [' Staff@Example.invalid ','staff@example.invalid']) assert.equal(await g.checkPasswordSignInRateLimit(email,headers('192.0.2.1')),'allowed');
  assert.equal(calls[1].keyHash,calls[3].keyHash);assert.equal(calls[0].keyHash,calls[2].keyHash);
  assert.equal(calls[0].limit,60);assert.equal(calls[1].limit,10);assert.ok(calls.every(c=>c.windowSeconds===600));
  assert.ok(calls.every(c=>/^[a-f0-9]{64}$/.test(c.keyHash)&&c.signal instanceof AbortSignal));
  assert.doesNotMatch(JSON.stringify(calls),/Staff@|staff@|192\.0\.2\.1/);
  await g.checkPasswordSignInRateLimit('staff@example.invalid',headers('192.0.2.2'));
  assert.notEqual(calls[1].keyHash,calls[5].keyHash);
});
test('IP budget is shared across emails and stops work before consuming another account bucket',async()=>{
  const calls=[];const g=guard({consume:async(_,input)=>{calls.push(input);return input.action.endsWith('.ip')?limited:allowed;}});
  for(const email of ['known@example.invalid','unknown@example.invalid']) assert.equal(await g.checkPasswordSignInRateLimit(email,headers('192.0.2.1')),'limited');
  assert.equal(calls.length,2);assert.equal(calls[0].keyHash,calls[1].keyHash);
});
test('pair limit, missing service client, missing address, malformed input and thrown diagnostics fail safely',async()=>{
  const g=guard({consume:async(_,input)=>input.action.endsWith('.ip')?allowed:limited});
  assert.equal(await g.checkPasswordSignInRateLimit('staff@example.invalid',headers('192.0.2.1')),'limited');
  assert.equal(await guard({client:null}).checkPasswordSignInRateLimit('a@b.invalid',headers('192.0.2.1')),'unavailable');
  const crash=guard({consume:async()=>{throw Error('sensitive-diagnostic');}});
  assert.equal(await crash.checkPasswordSignInRateLimit('a@b.invalid',headers('192.0.2.1')),'unavailable');
  assert.equal(await crash.checkPasswordSignInRateLimit('a@b.invalid',new Headers()),'unavailable');
  assert.equal(await crash.checkPasswordSignInRateLimit('',headers('192.0.2.1')),'unavailable');
  assert.equal(await crash.checkPasswordSignInRateLimit('x'.repeat(321),headers('192.0.2.1')),'unavailable');
});
test('shared-budget outage never proceeds to the second budget',async()=>{
  let calls=0;const g=guard({consume:async()=>{calls++;return {...allowed,available:false};}});
  assert.equal(await g.checkPasswordSignInRateLimit('staff@example.invalid',headers('192.0.2.1')),'unavailable');assert.equal(calls,1);
});
test('one three-second deadline bounds both checks and late completion cannot consume the pair budget',async()=>{
  let calls=0,signal,complete;
  const g=guard({consume:(_,input)=>{calls++;signal=input.signal;return new Promise(resolve=>{complete=resolve;});}});
  const start=performance.now();
  assert.equal(await g.checkPasswordSignInRateLimit('staff@example.invalid',headers('192.0.2.1')),'unavailable');
  assert.ok(performance.now()-start<5000);assert.equal(signal.aborted,true);assert.equal(calls,1);
  complete(allowed);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
});

function shared() {return load('../src/lib/security/rate-limit.ts',{'server-only':{},'@/lib/supabase/admin':{},
  '@/lib/security/rate-limit-core':{hashRateLimitKey,trustedClientIp(){}}});}
function rpcReply(reply,onSignal=()=>{}) {
  return {rpc(){const q={abortSignal(signal){onSignal(signal);return q;},then(resolve,reject){return Promise.resolve(reply).then(resolve,reject);}};return q;}};
}
test('shared limiter preserves ordinary valid responses and passes an optional abort signal to the SDK',async()=>{
  const input={action:'auth.password.ip',keyHash:'a'.repeat(64),limit:60,windowSeconds:600};
  const signal=new AbortController().signal;let seen;
  const result=await shared().consumeRateLimitWithClient(rpcReply({data:[{allowed:true,remaining:59,retry_after_seconds:0}],error:null},s=>{seen=s;}),{...input,signal});
  assert.equal(result.allowed,true);assert.equal(seen,signal);
  const denied=await shared().consumeRateLimitWithClient(rpcReply({data:[{allowed:false,remaining:0,retry_after_seconds:1}],error:null}),input);
  assert.equal(denied.available,true);assert.equal(denied.allowed,false);
});
test('malformed shared-limit replies cannot become authorization through truthy coercion',async()=>{
  const input={action:'auth.password.ip',keyHash:'a'.repeat(64),limit:60,windowSeconds:600};
  for(const row of [null,{allowed:'false',remaining:0,retry_after_seconds:0},{allowed:true},
    {allowed:true,remaining:-1,retry_after_seconds:0},{allowed:true,remaining:61,retry_after_seconds:0},
    {allowed:true,remaining:0,retry_after_seconds:5},{allowed:false,remaining:0,retry_after_seconds:0},
    {allowed:false,remaining:0,retry_after_seconds:601},{allowed:false,remaining:1,retry_after_seconds:5},
    {allowed:true,remaining:'59',retry_after_seconds:0}]) {
    const result=await shared().consumeRateLimitWithClient(rpcReply({data:row?[row]:[],error:null}),input);
    assert.equal(result.available,false);assert.equal(result.allowed,false);
  }
  const duplicate=await shared().consumeRateLimitWithClient(rpcReply({data:[{},{}],error:null}),input);assert.equal(duplicate.allowed,false);
});

function login({status='allowed',authError=null,authThrows=false,configured=true}={}) {
  const events=[];
  const actions=load('../src/app/login/actions.ts',{
    'next/headers':{headers:async()=>headers('192.0.2.1')},
    'next/navigation':{redirect:path=>{events.push(['redirect',path]);throw Error('redirect');}},
    '@/lib/supabase/server':{createClient:async()=>configured?{auth:{
      signInWithPassword:async input=>{events.push(['auth',input]);if(authThrows)throw Error('private-provider-diagnostic');return {error:authError};},
      signOut:async()=>{events.push(['signOut']);},
    }}:null},
    '@/lib/security/local-redirect':{safeLocalRedirect},
    '@/lib/security/sign-in-rate-limit':{checkPasswordSignInRateLimit:async()=>{events.push(['guard']);return status;}},
  });
  const form=new FormData();form.set('email',' Staff@Example.invalid ');form.set('password','synthetic-test-password');form.set('next','/admin/employees');
  return {actions,events,form};
}
const initial={status:'idle',message:''};
test('blocked/unavailable login never calls Auth and exposes only a generic recoverable message',async()=>{
  for(const status of ['limited','unavailable']) {
    const f=login({status});const result=await f.actions.signInWithPassword(initial,f.form);
    assert.equal(result.status,'error');assert.ok(result.message.length>0);assert.deepEqual(f.events,[['guard']]);
    assert.doesNotMatch(result.message,/Staff@|password|private-provider|SUPABASE|\d+\.\d+\.\d+/i);
  }
});
test('accepted credentials run after both budgets and preserve the original local return path',async()=>{
  const f=login();await assert.rejects(f.actions.signInWithPassword(initial,f.form),/redirect/);
  assert.equal(f.events[0][0],'guard');assert.deepEqual(f.events[1],['auth',{email:'Staff@Example.invalid',password:'synthetic-test-password'}]);
  assert.deepEqual(f.events[2],['redirect','/admin/employees']);
  const evil=login();evil.form.set('next','https://attacker.invalid/');await assert.rejects(evil.actions.signInWithPassword(initial,evil.form),/redirect/);
  assert.deepEqual(evil.events.at(-1),['redirect','/admin']);
});
test('unknown account and wrong password use identical messages; thrown provider failures are sanitized',async()=>{
  const results=[];
  for(const authError of [{message:'Unknown user private diagnostic'},{message:'Wrong password private diagnostic'}]) {
    const f=login({authError});results.push(await f.actions.signInWithPassword(initial,f.form));
  }
  assert.deepEqual(results[0],results[1]);
  const f=login({authThrows:true}), result=await f.actions.signInWithPassword(initial,f.form);
  assert.equal(result.status,'error');assert.doesNotMatch(result.message,/private-provider|Staff@|synthetic/);
});
test('empty input skips budget/Auth, and sign-out remains unthrottled',async()=>{
  const f=login();f.form.set('password','');assert.equal((await f.actions.signInWithPassword(initial,f.form)).status,'error');assert.deepEqual(f.events,[]);
  await assert.rejects(f.actions.signOut(),/redirect/);assert.deepEqual(f.events,[['signOut'],['redirect','/login?signedOut=true']]);
});
