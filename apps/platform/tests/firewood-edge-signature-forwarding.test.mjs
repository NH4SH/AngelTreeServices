import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const root=new URL('../scripts/home-hosting/primary-edge-proxy.mjs',import.meta.url);
const {primaryEdgeProxy}=await import(process.env.EDGE_BASELINE??root.href);
const paths=['/api/integrations/firewood/live/v1/prepare','/api/integrations/firewood/live/v1/renew','/api/integrations/firewood/live/v1/status','/api/integrations/firewood/live/v2/office/price-request','/api/integrations/firewood/live/v2/office/price-status','/api/integrations/firewood/live/v2/office/order-status'];
const secret='synthetic-test-only-secret-12345678901234567890',proxyToken='a'.repeat(64),raw='{"synthetic":true}',timestamp='1793800000';
const sign=path=>'v1='+createHmac('sha256',secret).update('ATS-FIREWOOD-LIVE-V1\n'+timestamp+'\nPOST\n'+path+'\n'+raw).digest('hex');
function request(path,method='POST'){
 return new Request('https://admin.angeltreeservices.org'+path,{method,headers:{'content-type':'application/json','x-ats-key-id':'synthetic-key-id','x-ats-timestamp':timestamp,'x-ats-signature':sign(path),'x-ats-proxy-token':'forged','x-ats-original-client-ip':'192.0.2.99','x-ats-other':'forged','x-forwarded-for':'192.0.2.99','x-nf-client-connection-ip':'192.0.2.99'},...(!['GET','HEAD'].includes(method)?{body:raw}:{})});
}
for(const path of paths)test('HMAC request remains verifiable through edge: '+path,async()=>{
 let calls=0;
 const proxy=primaryEdgeProxy({origin:'https://crm-home.angeltreeservices.org',token:proxyToken,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url.href,'https://crm-home.angeltreeservices.org'+path);assert.equal(options.redirect,'manual');
  assert.equal(options.headers.get('x-ats-proxy-token'),proxyToken);assert.equal(options.headers.get('x-ats-original-client-ip'),'198.51.100.6');
  assert.equal(options.headers.get('x-ats-key-id'),'synthetic-key-id');assert.equal(options.headers.get('x-ats-timestamp'),timestamp);
  const body=await new Response(options.body).text();assert.equal(body,raw);
  const expected='v1='+createHmac('sha256',secret).update('ATS-FIREWOOD-LIVE-V1\n'+timestamp+'\nPOST\n'+path+'\n'+body).digest('hex');
  assert.equal(options.headers.get('x-ats-signature'),expected);
  for(const name of ['x-ats-other','x-nf-client-connection-ip','x-forwarded-for'])assert.equal(options.headers.get(name),null);
  return new Response('{"code":"synthetic_invalid_order"}',{status:422,headers:{'x-ats-internal':'private'}});
 }});
 const response=await proxy(request(path),{ip:'198.51.100.6'});assert.equal(response.status,422);assert.equal(calls,1);assert.equal(response.headers.get('x-ats-internal'),null);assert.equal(response.headers.get('netlify-cdn-cache-control'),'no-store');
});
test('other methods, routes and noncanonical variants cannot forward signature headers',async()=>{
 for(const [path,method]of [['/admin','POST'],['/api/internal/communications/process','POST'],[paths[0]+'?x=1','POST'],[paths[0]+'/','POST'],[paths[0],'GET'],[paths[0],'PUT'],['/api/integrations/firewood/live/v1/%70repare','POST']]){
  const proxy=primaryEdgeProxy({origin:'https://crm-home.angeltreeservices.org',token:proxyToken,fetchImpl:async(url,o)=>{for(const name of ['x-ats-key-id','x-ats-timestamp','x-ats-signature','x-ats-other'])assert.equal(o.headers.get(name),null);return new Response(null,{status:204});}});
  assert.equal((await proxy(request(path,method),{ip:'198.51.100.6'})).status,204);
 }
});
test('missing trusted client identity or wrong host prevents upstream call',async()=>{
 let called=false;const proxy=primaryEdgeProxy({origin:'https://crm-home.angeltreeservices.org',token:proxyToken,fetchImpl:async()=>{called=true;throw Error('forbidden');}});
 assert.equal((await proxy(request(paths[0]),{})).status,503);assert.equal((await proxy(new Request('https://example.invalid/'),{ip:'198.51.100.6'})).status,421);assert.equal(called,false);
});
