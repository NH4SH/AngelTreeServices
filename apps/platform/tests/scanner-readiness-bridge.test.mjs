import assert from'node:assert/strict';import test from'node:test';import{once}from'node:events';import{createScannerBridge}from'../scripts/private-scanner/bridge.mjs';
test('authenticated scan telemetry reports only loaded state and holds a scan if freshness becomes unavailable',async t=>{
 const token='synthetic-scanner-telemetry-credential-000000000';let healthy=true;
 const server=createScannerBridge({token,scan:async()=> 'clean',readiness:async()=>{if(!healthy)throw Error('private detail');return{engineVersion:'1.5.4',signatureVersion:123,signatureAgeSeconds:3600,freshness:'current',unexpectedPrivate:'must not leave the bridge'};}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/scan';
 const request=credential=>fetch(url,{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/octet-stream'},body:'synthetic marker'});
 const unauth=await request('wrong');assert.equal(unauth.status,401);assert.deepEqual(await unauth.json(),{});
 const res=await request(token);assert.equal(res.status,200);const body=await res.json();assert.equal(body.signatureAgeSeconds,3600);assert.equal(body.unexpectedPrivate,undefined);assert.equal(body.status,'clean');assert.equal(body.engine,'clamav');
 healthy=false;const failed=await request(token);assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{});
});
