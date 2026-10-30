import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { scanDocumentBytes } from './document-scanner.ts';
import { createScannerBridge, scanWithClamAV } from '../../../scripts/private-scanner/bridge.mjs';
const token='synthetic-scanner-token-for-local-tests-only',bytes=Buffer.from('Synthetic PR18 document.');
const sha256=createHash('sha256').update(bytes).digest('hex');
const opts={url:'http://127.0.0.1:3311/scan',token,production:false};
for(const status of ['clean','quarantined'])test(`digest-bound ${status} verdict`,async()=>{
 assert.deepEqual(await scanDocumentBytes(bytes,{...opts,fetcher:async()=>Response.json({status,sha256,engine:'clamav'})}),{status,sha256});
});
test('missing credentials, remote plaintext, production plaintext and decorated URLs never send bytes',async()=>{
 for(const extra of [{token:''},{url:'http://example.invalid/scan'},{production:true},{url:'https://example.invalid/scan?key=bad'},{url:'https://user:pass@example.invalid/scan'}])assert.equal((await scanDocumentBytes(bytes,{...opts,...extra,fetcher:()=>assert.fail('must not send')})).status,'unavailable');
});
test('wrong digest/engine, malformed/oversized replies, errors and timeouts fail closed',async()=>{
 for(const body of [{status:'clean',sha256:'0'.repeat(64),engine:'clamav'},{status:'clean',sha256,engine:'unknown'},{status:'maybe',sha256,engine:'clamav'}])assert.equal((await scanDocumentBytes(bytes,{...opts,fetcher:async()=>Response.json(body)})).status,'unavailable');
 for(const reply of [new Response('{'),new Response('x'.repeat(1025)),new Response('{}',{status:503})])assert.equal((await scanDocumentBytes(bytes,{...opts,fetcher:async()=>reply})).status,'unavailable');
 assert.equal((await scanDocumentBytes(bytes,{...opts,fetcher:async()=>{throw Error('timeout')}})).status,'unavailable');assert.equal((await scanDocumentBytes(new Uint8Array(),opts)).status,'unavailable');
});
test('private HTTP bridge authenticates requests and binds actual bytes',async t=>{
 const server=createScannerBridge({token,scan:async b=>{assert.deepEqual(b,bytes);return 'clean'}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}/scan`;
 assert.equal((await fetch(url,{method:'POST',body:bytes})).status,401);
 assert.equal((await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'text/plain'},body:bytes})).status,400);
 assert.deepEqual(await scanDocumentBytes(bytes,{...opts,url}),{status:'clean',sha256});
});
async function fake(t,reply,version=`ClamAV 1.5.4/99999/${new Date().toUTCString().replace(' GMT','')}`){
 const frames=[];const server=createServer(socket=>{const chunks=[];socket.on('data',b=>{chunks.push(b);const all=Buffer.concat(chunks);if(all.subarray(0,9).toString()==='zVERSION\0')socket.end(version+'\0');else if(all.length>10&&all.subarray(-4).equals(Buffer.alloc(4))){frames.push(all);socket.end(reply+'\0');}})});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());return{connection:{host:'127.0.0.1',port:server.address().port},frames};
}
test('ClamAV INSTREAM framing accepts only known complete verdicts',async t=>{
 for(const [reply,status] of [['stream: OK','clean'],['stream: Eicar-Signature FOUND','quarantined']]){const f=await fake(t,reply);assert.equal(await scanWithClamAV(bytes,f.connection),status);assert.equal(f.frames[0].subarray(0,10).toString(),'zINSTREAM\0');assert.equal(f.frames[0].readUInt32BE(10),bytes.length);assert.deepEqual(f.frames[0].subarray(14,-4),bytes);}
 const bad=await fake(t,'stream: size limit ERROR');await assert.rejects(()=>scanWithClamAV(bytes,bad.connection));
});
test('stale signatures prevent scanning',async t=>{const f=await fake(t,'stream: OK','ClamAV 1.5.4/1/Thu Jan 01 00:00:00 2020');await assert.rejects(()=>scanWithClamAV(bytes,f.connection),/stale/);assert.equal(f.frames.length,0);});
