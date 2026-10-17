import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {createCredentials,handleGate,hostedConfig,validateConfig,returnPath,SESSION_SECONDS,LOGIN_PATH,LOGOUT_PATH} from '../staging/access/gate.mjs';
import {localTarget} from '../staging/access/local.mjs';

const origin='https://stage.example.invalid',siteId='d81d923d-6ccf-4c1e-87cc-263f3d51555d';
const time=1_800_000_000;
async function fixture(){const {password,...keys}=await createCredentials();return {password,config:{...keys,origin,siteId,local:false}};}
const req=(path='/',options={})=>new Request(origin+path,options);
const forbidden=()=>{assert.fail('Unauthorized request reached the upstream');};
async function login(f,{password=f.password,returnTo='/admin',...options}={}){
  return handleGate(req(LOGIN_PATH,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',...options.headers},
    body:new URLSearchParams({password,returnTo}),...options}),f.config,forbidden,{now:time});
}
const sessionCookie=r=>r.headers.get('set-cookie').split(';',1)[0];
async function signedSession(f,change={}){
  const payload=Buffer.from(JSON.stringify({v:1,aud:siteId+'|'+origin,iat:time,exp:time+SESSION_SECONDS,nonce:Buffer.alloc(16,1).toString('base64url'),...change})).toString('base64url');
  const key=await crypto.subtle.importKey('raw',Buffer.from(f.config.sessionKey,'base64url'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('ats-stage-session-v1\0'+payload))).toString('base64url');
  return '__Host-ats-stage-access=v1.'+payload+'.'+signature;
}

test('unauthorized pages, assets, APIs and direct function paths never invoke upstream on any method',async()=>{
  const f=await fixture();
  for(const path of ['/','/login','/admin','/crew','/portal/invoice/synthetic','/api/health/live','/api/mobile/me','/_next/static/chunk.js','/_next/data/test.json','/_next/image?url=%2Fimage.jpg','/favicon.ico','/.netlify/functions/___netlify-server-handler','/.netlify/edge-functions/next_middleware','/robots.txt']){
    for(const method of ['GET','HEAD','POST','PUT','DELETE','OPTIONS']){
      const r=await handleGate(req(path,{method}),f.config,forbidden,{now:time});assert.equal(r.status,401,path+' '+method);assert.match(r.headers.get('cache-control'),/no-store/);
    }
  }
});
test('the access screen is self-contained, accessible, private and does not expose credential material',async()=>{
  const f=await fixture(),r=await handleGate(req('/admin?view=test',{headers:{accept:'text/html','sec-fetch-dest':'document'}}),f.config,forbidden,{now:time}),html=await r.text();
  assert.match(html,/<label for="password">/);assert.match(html,/type="password"/);assert.match(html,/usual CRM login/);
  assert.doesNotMatch(html,/<script|https?:\/\//);assert.ok(!html.includes(f.password)&&!html.includes(f.config.sessionKey)&&!html.includes(f.config.passwordVerifier));
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('referrer-policy'),'same-origin');
});
test('a correct code issues only a scoped signed four-hour HttpOnly Secure cookie and safe redirect',async()=>{
  const f=await fixture(),r=await login(f,{returnTo:'/admin/employees?q=test'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/admin/employees?q=test');
  const cookie=r.headers.get('set-cookie');for(const flag of ['__Host-ats-stage-access=','Path=/','HttpOnly','SameSite=Strict','Secure','Max-Age=14400']) assert.ok(cookie.includes(flag));
  assert.doesNotMatch(cookie,/Domain=/);assert.ok(!cookie.includes(f.password)&&!cookie.includes(f.config.sessionKey));
});
test('wrong codes, cross-site or missing Origin, unsafe methods and malformed forms do not open access',async()=>{
  const f=await fixture();assert.equal((await login(f,{password:'incorrect'})).status,401);
  for(const headers of [{origin:'https://evil.invalid'},{'content-type':'application/x-www-form-urlencoded'},{origin,'sec-fetch-site':'cross-site'}]){
    const r=await handleGate(req(LOGIN_PATH,{method:'POST',headers,body:'password=x'}),f.config,forbidden,{now:time});assert.equal(r.status,403);
  }
  for(const [headers,body] of [[{origin,'content-type':'application/json'},'{}'],[{origin,'content-type':'application/x-www-form-urlencoded'},'password=x&password=y'],[{origin,'content-type':'application/x-www-form-urlencoded'},'password='+('x'.repeat(3000))]]){
    const r=await handleGate(req(LOGIN_PATH,{method:'POST',headers,body}),f.config,forbidden,{now:time});assert.equal(r.status,400);
  }
  assert.equal((await handleGate(req(LOGIN_PATH,{method:'PUT'}),f.config,forbidden,{now:time})).status,405);
});
test('session tampering, expiration, future issuance, wrong audience, key rotation and duplicate cookies deny access',async()=>{
  const f=await fixture(),r=await login(f),cookie=sessionCookie(r);
  const bad=[cookie.slice(0,-5)+'AAAAA','__Host-ats-stage-access=garbage',cookie+'; '+cookie,
    await signedSession(f,{exp:time-1,iat:time-1-SESSION_SECONDS}),await signedSession(f,{iat:time+60,exp:time+60+SESSION_SECONDS}),
    await signedSession(f,{aud:'other|'+origin}),await signedSession(f,{exp:time+86400}),await signedSession(f,{v:2}),await signedSession(f,{nonce:'a'}),await signedSession(f,{extra:true})];
  for(const value of bad) assert.ok([401,503].includes((await handleGate(req('/api/test',{headers:{cookie:value}}),f.config,forbidden,{now:time})).status));
  assert.equal((await handleGate(req('/api/test',{headers:{cookie}}),f.config,forbidden,{now:time+SESSION_SECONDS})).status,401);
  const rotated=await fixture();assert.equal((await handleGate(req('/api/test',{headers:{cookie}}),rotated.config,forbidden,{now:time})).status,401);
});
test('authorized streaming uploads preserve CRM sessions and Bearer authorization; gate cookie stays out of upstream',async()=>{
  const f=await fixture(),cookie=sessionCookie(await login(f)),bytes=new Uint8Array([0,255,44,13,10,128]);let calls=0;
  const r=await handleGate(req('/api/upload',{method:'POST',headers:{cookie:cookie+'; sb-session=original','authorization':'Bearer synthetic-existing-api-token',origin,'content-type':'application/octet-stream'},body:bytes}),f.config,async request=>{
    calls++;assert.equal(request.headers.get('cookie'),'sb-session=original');assert.equal(request.headers.get('authorization'),'Bearer synthetic-existing-api-token');assert.deepEqual(new Uint8Array(await request.arrayBuffer()),bytes);
    const headers=new Headers({'cache-control':'public, max-age=3600','vary':'Accept-Encoding','referrer-policy':'strict-origin-when-cross-origin'});headers.append('set-cookie','sb-a=one; Path=/');headers.append('set-cookie','sb-b=two; Path=/');
    return new Response(bytes,{headers});
  },{now:time});
  assert.equal(calls,1);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);assert.equal(r.headers.getSetCookie().length,2);
  for(const key of ['cache-control','cdn-cache-control','netlify-cdn-cache-control','surrogate-control']) assert.match(r.headers.get(key),/no-store/);
  assert.match(r.headers.get('vary'),/Cookie/);
  assert.equal(r.headers.get('referrer-policy'),'strict-origin-when-cross-origin');
});
test('logout is same-origin POST only and clears just the gate cookie; active status offers a working end-access form',async()=>{
  const f=await fixture(),cookie=sessionCookie(await login(f));
  assert.equal((await handleGate(req(LOGOUT_PATH),f.config,forbidden,{now:time})).status,405);
  assert.equal((await handleGate(req(LOGOUT_PATH,{method:'POST',headers:{origin:'https://evil.invalid'}}),f.config,forbidden,{now:time})).status,403);
  const status=await handleGate(req(LOGIN_PATH,{headers:{cookie}}),f.config,forbidden,{now:time});assert.equal(status.status,200);assert.match(await status.text(),/End preview access/);
  const r=await handleGate(req(LOGOUT_PATH,{method:'POST',headers:{origin,cookie:cookie+'; sb-session=keep'}}),f.config,forbidden,{now:time});
  assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.doesNotMatch(r.headers.get('set-cookie'),/sb-session/);
});
test('even authenticated requests cannot use an alias, middleware bypass header or cross-origin unsafe request',async()=>{
  const f=await fixture(),cookie=sessionCookie(await login(f));
  for(const request of [new Request('https://alias.example.invalid/admin',{headers:{cookie}}),req('/admin',{headers:{cookie,'x-middleware-subrequest':'middleware:middleware'}})]) assert.equal((await handleGate(request,f.config,forbidden,{now:time})).status,421);
  assert.equal((await handleGate(req('/api/test',{method:'POST',headers:{cookie,origin:'https://evil.invalid'}}),f.config,forbidden,{now:time})).status,403);
});
test('missing or production configuration and unexpected upstream failures always fail closed',async()=>{
  const f=await fixture();for(const change of [{sessionKey:''},{passwordVerifier:''},{origin:'https://admin.angeltreeservices.org'},{siteId:'6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0'},{local:true}]){
    assert.equal((await handleGate(req('/'),{...f.config,...change},forbidden,{now:time})).status,503);
  }
  const cookie=sessionCookie(await login(f));const r=await handleGate(req('/api/test',{headers:{cookie}}),f.config,()=>{throw Error('private-upstream-error-do-not-print');},{now:time});
  assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private-upstream/);
});
test('return paths cannot redirect externally after URL normalization or inject form HTML',async()=>{
  for(const path of ['https://evil.invalid','//evil.invalid','/..//evil.invalid','/%2f%2fevil.invalid','/\\evil.invalid','/%0d%0aLocation:evil','/__staging-gate/login']) assert.equal(returnPath(path),'/admin',path);
  const f=await fixture(),r=await login(f,{returnTo:'/..//evil.invalid'});assert.equal(r.headers.get('location'),'/admin');
  const html=await (await handleGate(req('/admin?q=%22%3E%3Cscript%3E',{headers:{accept:'text/html'}}),f.config,forbidden,{now:time})).text();assert.doesNotMatch(html,/<script>/);
});
test('hosted configuration cannot be disabled or reclassified by missing markers or exposed gate variables',async()=>{
  const f=await fixture(),manifest={staging:{appOrigin:origin,netlifySiteId:siteId}},env={APP_ENV:'staging',STAGING_MODE:'core-no-providers',APP_BASE_URL:origin,STAGING_GATE_KEY:f.config.sessionKey,STAGING_GATE_VERIFIER:f.config.passwordVerifier};
  assert.equal(hostedConfig(manifest,env,siteId).local,false);
  for(const change of [{APP_ENV:undefined},{APP_ENV:'production'},{STAGING_MODE:undefined},{STAGING_GATE_KEY:undefined},{APP_BASE_URL:'https://other.invalid'},{NEXT_PUBLIC_STAGING_GATE_KEY:'synthetic-private-value'}]) assert.throws(()=>hostedConfig(manifest,{...env,...change},siteId));
  assert.throws(()=>hostedConfig(manifest,env,'other'));assert.throws(()=>hostedConfig({},env,siteId));
});
test('the local launcher cannot proxy to remote/production targets or use hosted configuration',async()=>{
  for(const value of ['https://admin.angeltreeservices.org','http://localhost:3102','http://127.0.0.1','http://127.0.0.1:80','http://user:password@127.0.0.1:3102','http://127.0.0.1:3102/admin']) assert.throws(()=>localTarget(value));
  const f=await fixture();assert.equal(validateConfig({...f.config,origin:'http://127.0.0.1:3110',local:true}).cookieName,'ats-stage-access-local');
});
test('production has no gate selection; only a new staging export selects uncached catch-all protection',()=>{
  const root=new URL('../../../',import.meta.url);
  const config=readFileSync(new URL('apps/platform/netlify.toml',root),'utf8');assert.doesNotMatch(config,/staging-access|edge_functions/);
  assert.equal(existsSync(new URL('apps/platform/netlify/edge-functions/staging-access.js',root)),false);
  const exporter=readFileSync(new URL('apps/platform/scripts/release/prepare-staging-copy.mjs',root),'utf8');
  assert.match(exporter,/staging\/access\/edge/);assert.match(exporter,/staging\/access\/check.mjs/);assert.ok(exporter.includes('path = "/*"'));
  const entry=readFileSync(new URL('apps/platform/staging/access/edge/staging-access.js',root),'utf8');assert.match(entry,/onError:'fail'/);assert.doesNotMatch(entry,/cache:|bypass/);
});
