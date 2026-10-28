// Independent incremental ARCHIVE verification. Existing write admission stays
// full-read-only. Native Restic authenticates all new blobs and the current graph.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';import {join} from 'node:path';import {Readable} from 'node:stream';import {createPublicKey} from 'node:crypto';
import {signProof} from './failover-proof.mjs';import {sha256,validateCloudRequest,validateInventory,inventoryIdentity} from './cloud-policy.mjs';
import {artifactNames,artifactFingerprint,validateCatalog,compareCatalog,inspectIndexDelta,requiredPackGroups,verifyPackReadCoverage,incrementalLimits} from './incremental-policy.mjs';
import {verifyPrivateArchive} from './cloud-archive.mjs';import {startResticReadProxy} from './restic-read-proxy.mjs';import {nativeResticReader} from './native-restic-read.mjs';
const binding=t=>Object.fromEntries(['namespace','generation','sourceId','sourceBoot','databaseBoot','topology'].map(k=>[k,t[k]]));
const nodesFrom=tree=>{assert.ok(Array.isArray(tree.nodes)&&tree.nodes.length<=32);const nodes=tree.nodes.map(n=>({...n,size:n.size??0,content:n.content??[]})),seen=new Set();let size=0;for(const n of nodes){artifactFingerprint(n);assert.ok(!seen.has(n.name));seen.add(n.name);size+=n.size;}assert.ok(size<=192*1024*1024);for(const name of artifactNames.slice(0,6))assert.ok(seen.has(name));return nodes;};
export function fullCatalogIssuer({storage,privateKey,now=()=>Date.now()}){
 return async({repo,recovered,inventory,ticket,manifest,execute})=>{
  assert.ok(inventory.length<=incrementalLimits.objects);const nodes=nodesFrom(JSON.parse(execute(['cat','tree',ticket.snapshotId+':'+ticket.capturePath])));
  const objects=[];for(const o of inventory){const identity=storage.fullReadIdentity(o.name),probe=await storage.read(o,0,0);assert.equal(probe.bytes.length,1);assert.ok(probe.etag);
   assert.equal(identity.size,o.size);assert.equal(identity.sha256,sha256(readFileSync(join(repo,o.name))));assert.equal(probe.etag,identity.etag,'Provider identity changed after full read');
   objects.push({...o,sha256:identity.sha256,etag:identity.etag});}
  const at=new Date(now()).toISOString(),catalog={version:1,kind:'restic-verified-catalog',writeAdmission:false,...binding(ticket),sequence:ticket.sequence,snapshotId:ticket.snapshotId,
   captureStartedAt:ticket.captureStartedAt,fullVerifiedAt:at,issuedAt:at,expiresAt:new Date(Date.parse(at)+incrementalLimits.catalogAgeMs).toISOString(),
   objects,artifacts:Object.fromEntries(nodes.map(n=>[n.name,{fingerprint:artifactFingerprint(n),sha256:sha256(readFileSync(join(recovered,n.name)))}])),objectInventorySha256:sha256(JSON.stringify(manifest.objects))};
  assert.ok(Buffer.byteLength(JSON.stringify(catalog))<=incrementalLimits.catalogBytes,'Catalog requires reviewed generation rotation');
  return {catalogCertificate:signProof(catalog,privateKey),writeAdmission:false};
 };
}
export function createIncrementalVerifier({namespace,scratchRoot,restic,resticSha256,password,privateKey,storage,ledger,now=()=>Date.now()}){
 let active=false;
 return async request=>{
  if(active)throw Error('Incremental verifier busy');active=true;let proxy,work,phase='policy',job;
  const started=now(),deadline=started+50000;
  try{
   const ticket=validateCloudRequest({...request,mode:'archive'},namespace,started),parent=validateCatalog(request.catalogCertificate,createPublicKey(privateKey),ticket,started),bodySha=sha256(JSON.stringify(request));
   job={namespace,requestId:request.requestId,bodySha};const rpc=(action,fields={})=>ledger({...job,action,...fields});
   phase='reserve';const opened=await rpc('start');if(opened.completed)return {envelope:signProof(opened.claims,privateKey),report:opened.report,replayed:true};
   phase='base-inventory';const initial=validateInventory(await rpc('inventory')).rows,{added}=compareCatalog(parent,initial),identity=inventoryIdentity(initial);
   const before=new Map(parent.objects.map(o=>[o.name,o])),cache=new Map(),observed=new Map();let downloadedBytes=0,retainedPackRangeBytes=0,storageReads=0;
   async function read(o,start,end){
    assert.ok(now()<deadline);const amount=end-start+1;await rpc('charge',{bytes:amount});
    const result=await storage.read(o,start,end);storageReads++;assert.equal(result.bytes.length,amount);assert.ok(result.etag);
    if(before.has(o.name))assert.equal(result.etag,before.get(o.name).etag,'Verified base provider identity changed');downloadedBytes+=amount;return result;
   }
   phase='base-probes';
   for(const o of parent.objects)await read(o,0,0);
   phase='new-objects';
   for(const o of initial){
    if(o.name.startsWith('data/')&&before.has(o.name))continue;
    const result=await read(o,0,o.size-1),hash=sha256(result.bytes);
    if(o.name!=='config')assert.equal(hash,o.name.split('/').at(-1),'Restic object hash mismatch');
    if(before.has(o.name))assert.equal(hash,before.get(o.name).sha256,'Verified metadata changed');
    cache.set(o.name,result.bytes);observed.set(o.name,{...o,sha256:hash,etag:result.etag});
   }
   const newData=added.filter(o=>o.name.startsWith('data/')),groups=requiredPackGroups(newData),prefixes=new Set(newData.map(o=>o.name.split('/').at(-1).slice(0,2)));let collisionScrubBytes=0;
   // If an old pack shares a selected native bucket, fully read and verify it
   // too. It is charged rather than hidden as an incidental range read.
   for(const o of parent.objects.filter(o=>o.name.startsWith('data/')&&prefixes.has(o.name.split('/').at(-1).slice(0,2)))){
    const result=await read(o,0,o.size-1);assert.equal(sha256(result.bytes),o.sha256);cache.set(o.name,result.bytes);collisionScrubBytes+=o.size;
   }
   const ranges=new Map(),packCoverage=new Map(),newNames=new Set(newData.map(o=>o.name));let checkingPacks=false;
   proxy=await startResticReadProxy(initial,async(o,start,end)=>{
    if(checkingPacks&&newNames.has(o.name)){if(!packCoverage.has(o.name))packCoverage.set(o.name,[]);packCoverage.get(o.name).push([start,end]);}
    if(cache.has(o.name))return cache.get(o.name).subarray(start,end+1);
    const key=o.name+':'+start+':'+end;if(ranges.has(key))return ranges.get(key);
    assert.ok(retainedPackRangeBytes+end-start+1<=2*1024*1024,'Old range allowance exceeded; full verification required');
    retainedPackRangeBytes+=end-start+1;const r=await read(o,start,end);ranges.set(key,r.bytes);return r.bytes;
   });
   mkdirSync(scratchRoot,{recursive:true,mode:0o700});work=join(scratchRoot,'incremental-'+request.requestId);mkdirSync(work,{mode:0o700});const passwordFile=join(work,'password');writeFileSync(passwordFile,password,{mode:0o600});
   const run=nativeResticReader({binary:restic,expectedSha256:resticSha256,repo:proxy.repo,passwordFile,scratch:work,deadline});
   phase='restic-pack-checks';checkingPacks=true;
   if(groups.length){for(const group of groups)await run(['check','--read-data-subset='+group]);verifyPackReadCoverage(newData,packCoverage);}else await run(['check']);
   checkingPacks=false;
   const snapshot=JSON.parse(await run(['cat','snapshot',ticket.snapshotId]));assert.deepEqual(snapshot.paths,[ticket.capturePath]);
   const indexes=[];
   for(const index of initial.filter(o=>o.name.startsWith('index/'))){
    indexes.push({name:index.name,decoded:JSON.parse(await run(['cat','index',index.name.slice(6)]))});
   }
   const novel=inspectIndexDelta(indexes,parent.objects,initial);
   // Successful native full reads of every new pack authenticate all its blobs.
   // Index checks above additionally prevent reinterpretation of the base.
   const nodes=nodesFrom(JSON.parse(await run(['cat','tree',ticket.snapshotId+':'+ticket.capturePath]))),byName=new Map(nodes.map(n=>[n.name,n])),plaintext=new Map();
   async function materialize(name){if(!plaintext.has(name)){const n=byName.get(name);plaintext.set(name,await run(['dump',ticket.snapshotId,ticket.capturePath+'/'+name],{binaryOutput:true,maxBytes:n.size+1024}));assert.equal(plaintext.get(name).length,n.size);}return plaintext.get(name);}
   phase='paired-artifacts';const manifestBytes=await materialize('manifest.private.json');assert.ok(manifestBytes.length<=1024*1024);assert.equal(sha256(manifestBytes),ticket.manifestSha256);const m=JSON.parse(manifestBytes);
   assert.equal(m.syntheticOnly,true);assert.equal(m.sequence,ticket.sequence);assert.equal(m.namespace,namespace);
   for(const k of ['captureStartedAt','captureStartedBootMs','captureCompletedAt'])assert.equal(m[k],ticket[k]);for(const[k,v]of Object.entries(binding(ticket)))assert.equal(m.binding[k],v);
   for(const name of ['auth.users','public.payments','public.invoices','public.email_events','app_private.outbound_delivery_requests','app_private.outbound_delivery_attempts'])assert.ok(m.database.tables.some(t=>t.name===name));
   const artifacts={};let reusedArtifacts=0;
   for(const n of nodes){const fingerprint=artifactFingerprint(n),old=parent.artifacts[n.name];if(old?.fingerprint===fingerprint){artifacts[n.name]={fingerprint,sha256:old.sha256};reusedArtifacts++;}else artifacts[n.name]={fingerprint,sha256:sha256(await materialize(n.name))};}
   for(const[file,key]of[['database.dump','databaseSha256'],['objects.tar','objectArchiveSha256'],['release-source.tar.gz','releaseSourceSha256']])assert.equal(artifacts[file].sha256,m[key]);
   const objectInventorySha256=sha256(JSON.stringify(m.objects));
   if(artifacts['objects.tar'].sha256!==parent.artifacts['objects.tar'].sha256||objectInventorySha256!==parent.objectInventorySha256)await verifyPrivateArchive(Readable.from([await materialize('objects.tar')]),m.objects,{deadline});
   phase='final-inventory';assert.equal(inventoryIdentity(await rpc('inventory')),identity,'Repository changed during verification');assert.equal(await storage.publicDenied(),true);
   assert.ok(Date.parse(parent.expiresAt)>now(),'Full verification expired during this job');
   const at=new Date(now()).toISOString(),catalog={...parent,sequence:ticket.sequence,snapshotId:ticket.snapshotId,captureStartedAt:ticket.captureStartedAt,issuedAt:at,
    parentCertificateSha256:sha256(JSON.stringify(request.catalogCertificate)),objects:initial.map(o=>observed.get(o.name)??before.get(o.name)),artifacts,objectInventorySha256};
   assert.ok(Buffer.byteLength(JSON.stringify(catalog))<=incrementalLimits.catalogBytes,'Catalog requires reviewed generation rotation');
   const certificate=signProof(catalog,privateKey),claims={version:1,kind:'archive-verification',...binding(ticket),sequence:ticket.sequence,snapshotId:ticket.snapshotId,
    manifestSha256:ticket.manifestSha256,captureStartedAt:ticket.captureStartedAt,issuedAt:at,expiresAt:new Date(now()+60000).toISOString(),verificationMode:'incremental-verified-baseline',remoteBytesReadBack:false,writeAdmission:false,inventorySha256:identity};
   const report={mode:'incremental',repositoryBytes:initial.reduce((s,o)=>s+o.size,0),downloadedBytes,retainedPackRangeBytes,newObjects:added.length,newBlobsAuthenticated:novel.length,newPacksFullyVerified:newData.length,nativePackGroups:groups.length,collisionScrubBytes,
    reusedArtifacts,storageReads,durationMs:now()-started,resticStructuralCheckPassed:true,fullDataRead:false,receiptPermitsWrites:false,fullVerifiedAt:parent.fullVerifiedAt,catalogExpiresAt:parent.expiresAt,catalogCertificate:certificate,productionChanged:false};
   assert.ok(now()<deadline);phase='commit';const result=await rpc('finish',{inventory:initial,claims,report});return {envelope:signProof(result.claims,privateKey),report:result.report,replayed:false};
  }catch{if(job)try{await ledger({...job,action:'fail',phase});}catch{}throw Object.assign(Error('Incremental verification withheld'),{phase});}
  finally{if(proxy)await proxy.close();if(work)rmSync(work,{recursive:true,force:true});active=false;}
 };
}
