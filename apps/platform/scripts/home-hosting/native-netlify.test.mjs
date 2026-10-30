import {test} from 'node:test';import assert from 'node:assert/strict';import handler from './native-netlify.mjs';import {approvedVerifierRuntime} from './verifier-runtime.mjs';
test('native recovery endpoint withholds all operations before runtime and request authentication',async()=>{
 const previous=globalThis.Netlify;let reads=0;globalThis.Netlify={env:{get(){reads++;return undefined;}}};
 try{assert.equal((await handler(new Request('https://synthetic.invalid'))).status,405);assert.equal(reads,0);
  const allowed=approvedVerifierRuntime(process.versions.node,process.platform,process.arch),r=await handler(new Request('https://synthetic.invalid',{method:'POST',body:'{"operation":"admit"}'}));
  assert.equal(r.status,allowed?401:503);assert.equal(reads,allowed?1:0);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),null);
 }finally{globalThis.Netlify=previous;}
});
