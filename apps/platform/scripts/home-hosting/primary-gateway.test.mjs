import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createPrimaryGateway} from './primary-gateway.mjs';
const token='a'.repeat(64),host='admin.angeltreeservices.org';
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port))),close=server=>new Promise(r=>server.close(r));
async function request(port,{headers={},method='GET',path='/',body}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,headers:{host,'x-ats-proxy-token':token,'x-ats-original-client-ip':'203.0.113.7',...headers}},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}));});req.on('error',reject);req.end(body);});}
test('public gateway rejects missing authority, untrusted proxies and other hosts before application work',async()=>{
 let called=0;const gateway=createPrimaryGateway({canonicalHost:host,proxyToken:token,admission:()=>{called++;throw Error('expired');}}),port=await listen(gateway);
 try{assert.equal((await request(port)).status,503);assert.equal(called,1);assert.equal((await request(port,{headers:{'x-ats-proxy-token':'invalid'}})).status,403);assert.equal((await request(port,{headers:{host:'scanner.angeltreeservices.org'}})).status,421);assert.equal((await request(port,{headers:{'x-ats-original-client-ip':'127.0.0.1, 1.2.3.4'}})).status,403);assert.equal(called,1);}finally{await close(gateway);}
});
test('forwarding strips spoofed identity and secret headers, preserves customer origins and secure responses',async()=>{
 let got;const upstream=http.createServer((req,res)=>{got={headers:req.headers,url:req.url,method:req.method};res.writeHead(200,{'content-type':'text/plain','cache-control':'public,max-age=300'});res.end('ok');});const upstreamPort=await listen(upstream);
 const gateway=createPrimaryGateway({canonicalHost:host,proxyToken:token,admission:()=>true,appPort:upstreamPort,backendHost:'127.0.0.1',backendPort:upstreamPort}),port=await listen(gateway);
 try{const result=await request(port,{path:'/backend/storage/v1/object/test',method:'POST',body:'synthetic',headers:{'x-forwarded-for':'1.2.3.4','x-nf-client-connection-ip':'1.2.3.4',forwarded:'for=1.2.3.4',origin:'https://angeltreeservices.org'}});assert.equal(result.status,200);assert.equal(result.headers['cache-control'],'private, no-store');assert.equal(got.url,'/storage/v1/object/test');assert.equal(got.headers['x-forwarded-for'],'203.0.113.7');assert.equal(got.headers['x-nf-client-connection-ip'],'203.0.113.7');assert.equal(got.headers['x-forwarded-proto'],'https');assert.equal(got.headers.origin,'https://angeltreeservices.org');assert.equal(got.headers.forwarded,undefined);assert.equal(got.headers['x-ats-proxy-token'],undefined);
 }finally{await close(gateway);await close(upstream);}
});
test('a failed POST is attempted once and never replayed by the gateway',async()=>{
 let attempts=0;const upstream=http.createServer((req,res)=>{attempts++;req.socket.destroy();});const p=await listen(upstream),gateway=createPrimaryGateway({canonicalHost:host,proxyToken:token,admission:()=>true,appPort:p}),port=await listen(gateway);
 try{assert.equal((await request(port,{method:'POST',path:'/api/payments',body:'synthetic'})).status,503);assert.equal(attempts,1);}finally{await close(gateway);await close(upstream);}
});
test('scheduled workers stay held independently of ordinary access and provider webhooks',async()=>{
 let attempts=0;const upstream=http.createServer((req,res)=>{attempts++;res.end('ok');});const p=await listen(upstream),gateway=createPrimaryGateway({canonicalHost:host,proxyToken:token,admission:()=>true,workerDispatchAllowed:()=>false,appPort:p}),port=await listen(gateway);
 try{for(const path of ['/api/internal/communications/process','/api/%69nternal/communications/process','/api//internal/notifications/process','/api/x/../internal/jobs/advance-scheduled'])assert.equal((await request(port,{path,method:'POST'})).status,503);assert.equal(attempts,0);assert.equal((await request(port,{path:'/api/stripe/webhook',method:'POST'})).status,200);assert.equal((await request(port,{path:'/admin'})).status,200);assert.equal(attempts,2);}finally{await close(gateway);await close(upstream);}
});
