import assert from 'node:assert/strict';import test from 'node:test';
import {edgeFixture,privateHeaders}from'./staging-edge-adapter-helper.mjs';
test('actual Edge entry fails closed when platform env, site binding or staging markers are unavailable',async()=>{
 const f=await edgeFixture();assert.deepEqual(f.config,{onError:'fail'});
 for(const options of [{absent:true},{throwEnv:true},{siteId:'6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0'},...['APP_ENV','STAGING_MODE','STAGING_GATE_KEY','STAGING_GATE_VERIFIER'].map(k=>({env:{...f.env,[k]:undefined}})),{env:{...f.env,APP_BASE_URL:'https://wrong.example.invalid'}},{env:{...f.env,NEXT_PUBLIC_STAGING_GATE_KEY:'PRIVATE_CANARY'}}]){const r=await f.invoke(f.request('/api/health/live'),undefined,options);assert.equal(r.status,503);privateHeaders(r);assert.doesNotMatch(await r.text(),/PRIVATE_.*CANARY/);}
});
test('actual Edge entry denies anonymous framework, function, asset, worker and portal requests without next',async()=>{
 const f=await edgeFixture();
 for(const path of ['/admin','/crew','/portal/quote/synthetic','/api/health/live','/api/internal/notifications/process','/.netlify/functions/___netlify-server-handler','/.netlify/edge-functions/next_middleware','/_next/static/chunk.js','/_next/data/deploy/admin.json','/_next/image?url=%2Ficon.png','/favicon.ico'])for(const method of ['GET','HEAD','POST','OPTIONS']){const r=await f.invoke(f.request(path,{method,headers:{'x-deployment-id':'synthetic-older-deploy'}}));assert.equal(r.status,401,path+' '+method);privateHeaders(r);}
});
test('actual Edge entry issues a Secure scoped cookie; malformed and duplicate sessions cannot reach next',async()=>{
 const f=await edgeFixture(),{response,cookie}=await f.login();privateHeaders(response);const value=response.headers.get('set-cookie');
 for(const flag of ['__Host-ats-stage-access=','Secure','HttpOnly','SameSite=Strict','Path=/','Max-Age=14400'])assert.ok(value.includes(flag));
 assert.doesNotMatch(value,/Domain=/);assert.ok(!value.includes(f.credentials.password)&&!value.includes(f.credentials.sessionKey));
 for(const bad of ['__Host-ats-stage-access=bad',cookie+'; '+cookie,cookie.slice(0,-8)+'INVALID']){const r=await f.invoke(f.request('/admin',{headers:{cookie:bad}}));assert.ok([401,503].includes(r.status));privateHeaders(r);}
});
test('actual context.next receives the sanitized Request and unchanged CRM auth/body, never the gate cookie',async()=>{
 const f=await edgeFixture(),{cookie}=await f.login(),bytes=new Uint8Array([0,255,128,13,10]);let calls=0;
 const r=await f.invoke(f.request('/api/synthetic-upload',{method:'POST',headers:{cookie:cookie+'; sb-session=synthetic-existing','authorization':'Bearer synthetic-existing',origin:f.env.APP_BASE_URL},body:bytes}),async request=>{calls++;assert.ok(request instanceof Request);assert.equal(request.headers.get('cookie'),'sb-session=synthetic-existing');assert.equal(request.headers.get('authorization'),'Bearer synthetic-existing');assert.deepEqual(new Uint8Array(await request.arrayBuffer()),bytes);return new Response(bytes,{headers:{'cache-control':'public, max-age=999','etag':'private-validator','last-modified':'old'}});});
 assert.equal(calls,1);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);privateHeaders(r);
});
test('actual Edge entry denies wrong aliases and middleware bypass claims even with a valid session',async()=>{
 const f=await edgeFixture(),{cookie}=await f.login();
 for(const url of ['https://alias.example.invalid/admin','https://old-deploy--stage.example.invalid/admin']){const r=await f.invoke(new Request(url,{headers:{cookie}}));assert.equal(r.status,421);privateHeaders(r);}
 const r=await f.invoke(f.request('/admin',{headers:{cookie,'x-middleware-subrequest':'middleware:middleware'}}));assert.equal(r.status,421);privateHeaders(r);
});
test('actual Edge entry contains upstream errors and requires same-origin logout without bypassing CRM auth',async()=>{
 const f=await edgeFixture(),{cookie}=await f.login();const r=await f.invoke(f.request('/admin',{headers:{cookie}}),()=>{throw Error('PRIVATE_UPSTREAM_CANARY');});assert.equal(r.status,503);privateHeaders(r);assert.doesNotMatch(await r.text(),/PRIVATE_UPSTREAM_CANARY/);
 const bad=await f.invoke(f.request('/__staging-gate/logout',{method:'POST',headers:{cookie,origin:'https://other.example.invalid'}}));assert.equal(bad.status,403);
 const done=await f.invoke(f.request('/__staging-gate/logout',{method:'POST',headers:{cookie,origin:f.env.APP_BASE_URL}}));assert.equal(done.status,303);assert.match(done.headers.get('set-cookie'),/Max-Age=0/);privateHeaders(done);
});
