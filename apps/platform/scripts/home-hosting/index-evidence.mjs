// Signed compact evidence of previously native-decoded indexes. Ciphertext is
// still freshly read/hashed; only repeated native decoding is avoided.
import assert from 'node:assert/strict';
import {sha256} from './cloud-policy.mjs';
const ids=objects=>objects.filter(o=>o.name.startsWith('index/')).map(o=>o.name).sort();
const packs=objects=>objects.filter(o=>o.name.startsWith('data/')).map(o=>o.name.split('/').at(-1)).sort();
const encode=set=>Buffer.concat([...set].sort().map(h=>Buffer.from(h,'hex'))).toString('base64url');
function decode(value){assert.ok(typeof value==='string'&&value.length<=175000);const b=Buffer.from(value,'base64url');assert.equal(b.length%32,0);assert.equal(b.toString('base64url'),value);const result=[];for(let n=0;n<b.length;n+=32)result.push(b.subarray(n,n+32).toString('hex'));assert.deepEqual(result,[...new Set(result)].sort());return new Set(result);}
export function validateIndexEvidence(e,objects){
 assert.equal(e.version,1);assert.equal(e.indexNamesSha256,sha256(JSON.stringify(ids(objects))));assert.deepEqual(e.packs,packs(objects));
 return {locations:decode(e.locations),blobs:decode(e.blobs),covered:new Set(e.packs)};
}
export function inspectIndexEvidence(indexes,baseObjects,currentObjects,previous){
 const oldNames=new Set(ids(baseObjects)),oldPacks=new Set(packs(baseObjects)),sizes=new Map(currentObjects.filter(o=>o.name.startsWith('data/')).map(o=>[o.name.split('/').at(-1),o.size]));
 const prior=previous?validateIndexEvidence(previous,baseObjects):{locations:new Set(),blobs:new Set(),covered:new Set()};
 const baseLocations=new Set(prior.locations),baseBlobs=new Set(prior.blobs),allLocations=new Set(prior.locations),allBlobs=new Set(prior.blobs),covered=new Set(prior.covered),novel=new Map();
 const location=(pack,b)=>sha256(JSON.stringify([pack,b.type,b.id,b.offset,b.length,b.uncompressed_length??0]));
 const blobKey=b=>sha256(b.type+':'+b.id);
 function each(index,fn){assert.ok(!index.decoded.supersedes?.length,'Repacked indexes require full verification');assert.ok(Array.isArray(index.decoded.packs));
  for(const pack of index.decoded.packs){assert.ok(sizes.has(pack.id));assert.ok(Array.isArray(pack.blobs)&&pack.blobs.length>0);covered.add(pack.id);
   for(const b of pack.blobs){assert.match(b.id,/^[a-f0-9]{64}$/);assert.ok(['data','tree'].includes(b.type));assert.ok(Number.isSafeInteger(b.offset)&&Number.isSafeInteger(b.length)&&b.offset>=0&&b.length>32&&b.offset+b.length<=sizes.get(pack.id));fn(pack.id,b);allLocations.add(location(pack.id,b));allBlobs.add(blobKey(b));}
  }
 }
 assert.deepEqual(indexes.map(i=>i.name).sort(),previous?ids(currentObjects).filter(n=>!oldNames.has(n)):ids(currentObjects),'Incomplete native index evidence');
 for(const index of indexes.filter(i=>oldNames.has(i.name)))each(index,(pack,b)=>{assert.ok(oldPacks.has(pack));baseLocations.add(location(pack,b));baseBlobs.add(blobKey(b));});
 for(const index of indexes.filter(i=>!oldNames.has(i.name)))each(index,(pack,b)=>{
  if(oldPacks.has(pack)){assert.ok(baseLocations.has(location(pack,b)),'New index reinterprets a verified base pack');return;}
  const key=blobKey(b);assert.ok(!baseBlobs.has(key),'Repacked duplicate requires full verification');const size=b.uncompressed_length||b.length-32;assert.ok(Number.isSafeInteger(size)&&size>0&&size<=32*1024*1024);if(novel.has(key))assert.equal(novel.get(key).size,size);novel.set(key,{id:b.id,size});
 });
 assert.deepEqual([...covered].sort(),packs(currentObjects),'Unindexed pack');
 return {novel:[...novel.values()],evidence:{version:1,indexNamesSha256:sha256(JSON.stringify(ids(currentObjects))),packs:[...covered].sort(),locations:encode(allLocations),blobs:encode(allBlobs)}};
}
