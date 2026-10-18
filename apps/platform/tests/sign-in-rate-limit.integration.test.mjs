import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import * as net from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { load } from './pr10-test-helpers.mjs';
import { hashRateLimitKey } from '../src/lib/security/rate-limit-core.ts';
import { safeLocalRedirect } from '../src/lib/security/local-redirect.ts';
import { withDeadline } from '../src/lib/runtime/deadline.ts';

const enabled=process.env.SIGNIN_DISPOSABLE_STACK==='1' && Boolean(process.env.SIGNIN_LOCAL_STATUS_FILE);
test('sign-in protection: real local shared counters, permissions, concurrency and Auth action', {skip:!enabled,timeout:120000},async t=>{
  const config=JSON.parse(readFileSync(process.env.SIGNIN_LOCAL_STATUS_FILE,'utf8'));
  assert.equal(config.API_URL,'http://127.0.0.1:54321','Only the existing disposable API is allowed.');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
  const anon=()=>createClient(config.API_URL,config.ANON_KEY,options);
  const marker=randomBytes(8).toString('hex');
  const email=`signin-local-${marker}@example.invalid`, password=randomBytes(32).toString('base64url');
  const address=n=>`2001:db8:${marker.slice(0,4)}:${marker.slice(4,8)}:${marker.slice(8,12)}:${marker.slice(12,16)}::${n}`;
  const requestHeaders=n=>new Headers({'x-nf-client-connection-ip':address(n)});
  const results=[];
  const check=(result,label='Local fixture request')=>{assert.equal(result.error?.code??null,null,label);return result.data;};
  const shared=load('../src/lib/security/rate-limit.ts',{'server-only':{},'@/lib/supabase/admin':{},
    '@/lib/security/rate-limit-core':{hashRateLimitKey,trustedClientIp(){throw Error('Unexpected legacy address fallback');}}});
  const policy=load('../src/lib/security/sign-in-rate-limit.ts',{'server-only':{},'node:net':net,
    '@/lib/supabase/admin':{getServiceRoleClient:()=>service},
    '@/lib/security/rate-limit-core':{hashRateLimitKey}, '@/lib/security/rate-limit':shared,
    '@/lib/runtime/deadline':{withDeadline}});
  const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,passed:true});});
  let userId,sessionClient;
  t.after(async()=>{
    if(sessionClient) await sessionClient.auth.signOut({scope:'global'});
    if(userId) {
      check(await service.from('profiles').update({status:'disabled'}).eq('id',userId),'Disable new fixture profile');
      check(await service.auth.admin.updateUserById(userId,{ban_duration:'876000h'}),'Disable new fixture Auth account');
    }
    if(process.env.SIGNIN_RESULTS_FILE)writeFileSync(process.env.SIGNIN_RESULTS_FILE,JSON.stringify({
      scope:'Disposable local API only; synthetic actors and counters retained',results,
      existingSchemaChanged:false,productionChanged:false,credentialsReported:false,
    },null,2));
  });
  userId=check(await service.auth.admin.createUser({email,password,email_confirm:true}),'Create synthetic local account').user.id;
  const accountClient=anon();check(await accountClient.auth.signInWithPassword({email,password}),'Sign in synthetic local account');

  await run('anonymous and ordinary JWT clients cannot consume or read shared counters',async()=>{
    for(const client of [anon(),accountClient]) {
      assert.ok((await client.rpc('consume_security_rate_limit',{p_action_name:'auth.password.ip',p_key_hash:hashRateLimitKey([address(1)]),p_limit:60,p_window_seconds:600})).error);
      assert.ok((await client.from('security_rate_limits').select('*').limit(1)).error);
    }
    check(await accountClient.auth.signOut({scope:'global'}));
  });
  await run('twenty concurrent attempts admit exactly ten for one IP/email pair across independent callers',async()=>{
    const attempts=await Promise.all(Array.from({length:20},(_,i)=>policy.checkPasswordSignInRateLimit(i%2?email.toUpperCase():` ${email} `,requestHeaders(2))));
    assert.equal(attempts.filter(x=>x==='allowed').length,10);assert.equal(attempts.filter(x=>x==='limited').length,10);
    const pairKey=hashRateLimitKey([policy.signInSourceAddress(requestHeaders(2)),email]);
    const rows=check(await service.from('security_rate_limits').select('request_count,window_started_at,expires_at').eq('action_name','auth.password.ip-account').eq('key_hash',pairKey));
    assert.equal(rows.length,1);assert.equal(rows[0].request_count,20);
    assert.equal(Date.parse(rows[0].expires_at)-Date.parse(rows[0].window_started_at),4200000);
  });
  await run('denials do not extend the fixed window or lock the same account on a different source',async()=>{
    const pairKey=hashRateLimitKey([policy.signInSourceAddress(requestHeaders(2)),email]);
    const before=check(await service.from('security_rate_limits').select('window_started_at,expires_at').eq('action_name','auth.password.ip-account').eq('key_hash',pairKey).single());
    assert.equal(await policy.checkPasswordSignInRateLimit(email,requestHeaders(2)),'limited');
    const after=check(await service.from('security_rate_limits').select('window_started_at,expires_at').eq('action_name','auth.password.ip-account').eq('key_hash',pairKey).single());
    assert.deepEqual(after,before);assert.equal(await policy.checkPasswordSignInRateLimit(email,requestHeaders(3)),'allowed');
  });
  await run('changing submitted email cannot bypass the broader source budget',async()=>{
    const attempts=[];
    for(let i=0;i<61;i++) attempts.push(await policy.checkPasswordSignInRateLimit(`unknown-${i}-${marker}@example.invalid`,requestHeaders(4)));
    assert.equal(attempts.filter(x=>x==='allowed').length,60);assert.equal(attempts[60],'limited');
  });
  function action(source,client,events) {
    return load('../src/app/login/actions.ts',{
      'next/headers':{headers:async()=>requestHeaders(source)},
      'next/navigation':{redirect:path=>{events.push(['redirect',path]);throw Error('local-success-redirect');}},
      '@/lib/supabase/server':{createClient:async()=>({auth:{signInWithPassword:async input=>{
        events.push(['auth']);return client.auth.signInWithPassword(input);
      }}})},
      '@/lib/security/local-redirect':{safeLocalRedirect},
      '@/lib/security/sign-in-rate-limit':policy,
    });
  }
  const form=(submitted=email,secret=password)=>{const f=new FormData();f.set('email',submitted);f.set('password',secret);f.set('next','/admin/employees');return f;};
  const initial={status:'idle',message:''};
  await run('real sign-in action refuses correct credentials after the pair cap without calling Auth',async()=>{
    const events=[], result=await action(2,anon(),events).signInWithPassword(initial,form());
    assert.equal(result.status,'error');assert.match(result.message,/Too many/);assert.deepEqual(events,[]);
  });
  await run('the real action still signs in a permitted source and preserves its local redirect',async()=>{
    const events=[];sessionClient=anon();
    await assert.rejects(action(5,sessionClient,events).signInWithPassword(initial,form()),/local-success-redirect/);
    assert.deepEqual(events,[['auth'],['redirect','/admin/employees']]);
    const current=check(await sessionClient.auth.getUser(),'Read only the new synthetic session');assert.equal(current.user.id,userId);
  });
  await run('wrong password and nonexistent account produce the same real-action result',async()=>{
    const wrong=await action(6,anon(),[]).signInWithPassword(initial,form(email,'wrong-local-password'));
    const missing=await action(6,anon(),[]).signInWithPassword(initial,form(`missing-${marker}@example.invalid`,'wrong-local-password'));
    assert.deepEqual(wrong,missing);assert.equal(wrong.status,'error');assert.match(wrong.message,/not accepted/);
  });
  if(process.env.SIGNIN_BUILD_DIRECTORY) await run('compiled Next HTTP action enforces the shared cap and trusted address before issuing cookies',async()=>{
    const directory=process.env.SIGNIN_BUILD_DIRECTORY;assert.ok(isAbsolute(directory));
    assert.equal(JSON.parse(readFileSync(join(directory,'package.json'),'utf8')).name,'@angel-tree/platform');
    const manifest=JSON.parse(readFileSync(join(directory,'.next/server/server-reference-manifest.json'),'utf8'));
    const actionId=Object.entries(manifest.node).find(([,entry])=>entry.filename==='src/app/login/actions.ts'&&entry.exportedName==='signInWithPassword')?.[0];
    assert.ok(actionId,'The actual production build must include the sign-in action.');
    const require=createRequire(import.meta.url);
    const {encodeReply}=require('next/dist/compiled/react-server-dom-webpack/client.node.js');
    const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
    const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
    const origin=`http://127.0.0.1:${port}`;
    const child=spawn(process.execPath,[join(directory,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{
      cwd:directory,stdio:['ignore','ignore','ignore'],env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
        NEXT_PUBLIC_SUPABASE_URL:config.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY},
    });
    const closed=new Promise(resolve=>child.once('exit',resolve));
    try {
      let ready=false;
      for(let i=0;i<100;i++) {
        assert.equal(child.exitCode,null,'New owned test server exited before readiness.');
        try {if((await fetch(origin+'/api/health/live',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{}
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      assert.ok(ready,'New loopback-only test server did not become ready.');
      const page=await fetch(origin+'/login');assert.equal(page.status,200);assert.match(await page.text(),/Sign in/);
      async function post(extraHeaders) {
        const response=await fetch(origin+'/login',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
          headers:{'Next-Action':actionId,Accept:'text/x-component',Origin:origin,...extraHeaders},
          body:await encodeReply([initial,form()]),
        });
        return {response,body:await response.text()};
      }
      for(let i=0;i<10;i++) assert.equal(await policy.checkPasswordSignInRateLimit(email,requestHeaders(9)),'allowed');
      const blocked=await post({'x-nf-client-connection-ip':address(9)});
      assert.match(blocked.body,/Too many sign-in attempts/);assert.equal(blocked.response.headers.get('x-action-redirect'),null);
      assert.doesNotMatch(blocked.response.headers.get('set-cookie')??'',/auth-token/);
      const untrusted=await post({'x-forwarded-for':address(10)});
      assert.match(untrusted.body,/Sign-in is temporarily unavailable/);assert.doesNotMatch(untrusted.response.headers.get('set-cookie')??'',/auth-token/);
      const success=await post({'x-nf-client-connection-ip':address(11)});
      assert.match(success.response.headers.get('x-action-redirect')??'',/^\/admin\/employees(?:;|$)/);
      assert.match(success.response.headers.get('set-cookie')??'',/auth-token/);
    } finally {
      if(child.exitCode===null)child.kill('SIGTERM');await closed;
    }
  });
});
