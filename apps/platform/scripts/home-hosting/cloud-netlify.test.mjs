import {test} from 'node:test';import assert from 'node:assert/strict';
import handler from './cloud-netlify.mjs';
test('public probes and unauthorized calls never touch credentials or I/O',async()=>{
 let reads=0;const original=globalThis.Netlify;globalThis.Netlify={env:{get(){reads++;return undefined;}}};
 try{
  let r=await handler(new Request('https://lab.test/',{method:'GET'}));assert.equal(r.status,405);assert.equal(reads,0);
  r=await handler(new Request('https://lab.test/',{method:'POST',body:'{}'}));assert.equal(r.status,401);
  assert.equal(reads,1);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(await r.json(),{error:'Unauthorized'});
 }finally{globalThis.Netlify=original;}
});
