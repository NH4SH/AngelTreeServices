// Synthetic archive evidence only. These certificates NEVER authorize writes.
import assert from 'node:assert/strict';import {verify} from 'node:crypto';
import {sha256,validateInventory} from './cloud-policy.mjs';
import {isDatabasePart} from './database-parts.mjs';
export const incrementalLimits=Object.freeze({objects:96,catalogAgeMs:86400000,bodyBytes:65536,catalogBytes:40960});
export const artifactNames=['manifest.private.json','database.dump','objects.tar','release-source.tar.gz','core.private.env','app.private.env','fixture.private.json','database.dump.private.log','objects.tar.private.log','runtime.private.json'];
export function artifactFingerprint(node){
 assert.ok(node.type==='file'&&(artifactNames.includes(node.name)||isDatabasePart(node.name))&&Number.isSafeInteger(node.size)&&node.size>=0&&node.size<=192*1024*1024);
 assert.ok(Array.isArray(node.content)&&node.content.length<=1024);for(const id of node.content)assert.match(id,/^[a-f0-9]{64}$/);
 const mode=node.mode??0;assert.ok(Number.isSafeInteger(mode)&&((mode&0o077)===0||node.name==='release-source.tar.gz'&&mode===0o644),'Private artifact permissions broadened');
 return sha256(JSON.stringify({size:node.size,content:node.content,mode,uid:node.uid??0,gid:node.gid??0}));
}
export function validateCatalog(envelope,publicKey,ticket,now=Date.now()){
 assert.ok(envelope&&typeof envelope.payload==='string'&&typeof envelope.signature==='string');
 const bytes=Buffer.from(envelope.payload,'base64url');assert.ok(bytes.length<=incrementalLimits.catalogBytes&&verify(null,bytes,publicKey,Buffer.from(envelope.signature,'base64url')),'Untrusted catalog');
 const c=JSON.parse(bytes);assert.equal(c.version,1);assert.equal(c.kind,'restic-verified-catalog');assert.equal(c.writeAdmission,false);
 for(const k of ['namespace','generation','sourceId','sourceBoot','databaseBoot','topology'])assert.equal(c[k],ticket[k],'Catalog source binding changed');
 const full=Date.parse(c.fullVerifiedAt),issued=Date.parse(c.issuedAt),expiry=Date.parse(c.expiresAt);
 assert.ok(Number.isFinite(full)&&full<=issued&&issued<=now&&expiry>now&&expiry===full+incrementalLimits.catalogAgeMs,'Full verification is stale');
 assert.ok(Number.isSafeInteger(c.sequence)&&c.sequence<ticket.sequence&&Date.parse(c.captureStartedAt)<Date.parse(ticket.captureStartedAt),'Checkpoint rollback');
 assert.ok(c.objects.length<=incrementalLimits.objects);validateInventory(c.objects);
 for(const o of c.objects){assert.match(o.sha256,/^[a-f0-9]{64}$/);assert.ok(typeof o.etag==='string'&&o.etag.length>0&&o.etag.length<256);}
 for(const name of artifactNames.slice(0,6).filter(n=>n!=='database.dump'||!c.databaseParts)){assert.match(c.artifacts[name].sha256,/^[a-f0-9]{64}$/);assert.match(c.artifacts[name].fingerprint,/^[a-f0-9]{64}$/);}
 if(c.databaseParts){assert.equal(c.databaseParts,true);assert.ok(Object.keys(c.artifacts).some(isDatabasePart));}
 assert.match(c.objectInventorySha256,/^[a-f0-9]{64}$/);return c;
}
export function compareCatalog(catalog,inventory){
 const current=validateInventory(inventory).rows;assert.ok(current.length<=incrementalLimits.objects);
 const byName=new Map(current.map(o=>[o.name,o])),known=new Set();
 for(const old of catalog.objects){const next=byName.get(old.name);assert.ok(next,'Verified base object missing');
  for(const key of ['id','version','size'])assert.equal(next[key],old[key],'Verified base object replaced');known.add(old.name);}
 const added=current.filter(o=>!known.has(o.name));assert.ok(!added.some(o=>o.name==='config'||o.name.startsWith('keys/')),'Key changes require full verification');
 return {current,added,retained:catalog.objects};
}
export function inspectIndexDelta(indexes,baseObjects,currentObjects){
 const oldNames=new Set(baseObjects.map(o=>o.name)),oldPacks=new Set(baseObjects.filter(o=>o.name.startsWith('data/')).map(o=>o.name.split('/').at(-1))),sizes=new Map(currentObjects.filter(o=>o.name.startsWith('data/')).map(o=>[o.name.split('/').at(-1),o.size]));
 const newPacks=new Set([...sizes.keys()].filter(id=>!oldPacks.has(id))),baseLocations=new Set(),baseBlobs=new Set(),novel=new Map(),covered=new Set();
 const location=(pack,b)=>JSON.stringify([pack,b.type,b.id,b.offset,b.length,b.uncompressed_length??0]);
 function each(index,fn){assert.ok(!index.decoded.supersedes?.length,'Repacked indexes require full verification');assert.ok(Array.isArray(index.decoded.packs));
  for(const pack of index.decoded.packs){assert.ok(sizes.has(pack.id));assert.ok(Array.isArray(pack.blobs)&&pack.blobs.length>0);covered.add(pack.id);
   for(const b of pack.blobs){assert.match(b.id,/^[a-f0-9]{64}$/);assert.ok(['data','tree'].includes(b.type));
    assert.ok(Number.isSafeInteger(b.offset)&&Number.isSafeInteger(b.length)&&b.offset>=0&&b.length>32&&b.offset+b.length<=sizes.get(pack.id));fn(pack.id,b);}
  }
 }
 for(const index of indexes.filter(i=>oldNames.has(i.name)))each(index,(pack,b)=>{assert.ok(oldPacks.has(pack));baseLocations.add(location(pack,b));baseBlobs.add(b.type+':'+b.id);});
 for(const index of indexes.filter(i=>!oldNames.has(i.name)))each(index,(pack,b)=>{
  if(oldPacks.has(pack)){assert.ok(baseLocations.has(location(pack,b)),'New index reinterprets a verified base pack');return;}
  const key=b.type+':'+b.id;assert.ok(!baseBlobs.has(key),'Repacked duplicate requires full verification');const size=b.uncompressed_length||b.length-32;assert.ok(Number.isSafeInteger(size)&&size>0&&size<=32*1024*1024);
  if(novel.has(key))assert.equal(novel.get(key).size,size);novel.set(key,{id:b.id,size});
 });
 for(const id of sizes.keys())assert.ok(covered.has(id),'Unindexed pack');return [...novel.values()];
}
// Pinned Restic 0.19.1 selectPacksByBucket uses ID[0] modulo totalBuckets.
// Enumerate every new pack's group; this never randomly samples new data.
export function requiredPackGroups(objects){return [...new Set(objects.filter(o=>o.name.startsWith('data/')).map(o=>parseInt(o.name.split('/').at(-1).slice(0,2),16)))].sort((a,b)=>a-b).map(n=>(n+1)+'/256');}
export function verifyPackReadCoverage(objects,ranges){
 for(const o of objects.filter(o=>o.name.startsWith('data/'))){const spans=[...(ranges.get(o.name)??[])].sort((a,b)=>a[0]-b[0]);let cursor=0;
  for(const[start,end]of spans){assert.ok(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<o.size&&start<=cursor,'New pack read has a gap');cursor=Math.max(cursor,end+1);}
  assert.equal(cursor,o.size,'Native Restic did not fully read a new pack');
 }
}
