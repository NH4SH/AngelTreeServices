import {test} from 'node:test';import assert from 'node:assert/strict';import {startResticReadProxy} from './restic-read-proxy.mjs';
test('REST adapter serves bounded reads and lists while refusing writes and traversal',async()=>{
 const proxy=await startResticReadProxy([{name:'config',size:5},{name:'data/aa/'+'a'.repeat(64),size:5}],async(o,start,end)=>Buffer.from('hello').subarray(start,end+1));const root=proxy.repo.slice(5);
 try{let r=await fetch(root+'config',{headers:{range:'bytes=1-3'}});assert.equal(r.status,206);assert.equal(await r.text(),'ell');assert.equal(r.headers.get('content-range'),'bytes 1-3/5');
  r=await fetch(root+'data/');assert.deepEqual(await r.json(),[{name:'a'.repeat(64),size:5}]);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await fetch(root+'config',{method})).status,405);
  assert.equal((await fetch(root+'../config')).status,404);assert.equal((await fetch(root+'config',{headers:{range:'bytes=0-99'}})).status,507);
 }finally{await proxy.close();}
});
