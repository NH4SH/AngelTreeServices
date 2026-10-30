import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {rotationPlan,validateRotationProof,retirementPreview,rotationGraceMs,rotationInventorySha256} from './rotation-policy.mjs';import {signProof} from './failover-proof.mjs';import {inventoryIdentity} from './cloud-policy.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519'),now=Date.now(),ns='ats-rehearsal-continuous-abcdef123456',ids=['1','2','3','4'].map(x=>x.repeat(64));
const obj=(name)=>({name,id:randomUUID(),version:'v1',size:100});const source=[obj('config'),...ids.map(id=>obj('snapshots/'+id))],target=[obj('config'),...['a','b','c'].map(x=>obj('snapshots/'+x.repeat(64)))];
const plan=rotationPlan({namespace:ns,sourceRepositoryId:'d'.repeat(64),targetRepositoryId:'e'.repeat(64),sourceInventory:source,snapshots:ids.map((id,i)=>({snapshotId:id,captureStartedAt:new Date(now-4000+i*1000).toISOString()})),verified:ids.slice(1),now});
const claims={version:1,kind:'archive-rotation',namespace:ns,planId:plan.planId,sourceRepositoryId:plan.sourceRepositoryId,targetRepositoryId:plan.targetRepositoryId,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString(),writeAdmission:false,fullRemoteRead:true,nativeFullCheck:true,allProtectedRootsRestored:true,targetInventorySha256:inventoryIdentity(target),roots:plan.protectedSnapshotIds.map((id,i)=>({sourceSnapshotId:id,targetSnapshotId:target[i+1].name.slice(10),manifestSha256:'f'.repeat(64),artifactsSha256:'f'.repeat(64),sourceArtifactsMatched:true}))};
test('rotation retains the last two verified roots and every unverified root',()=>{assert.deepEqual(new Set(plan.protectedSnapshotIds),new Set([ids[0],ids[2],ids[3]]));assert.deepEqual(plan.retirementRootCandidates,[ids[1]]);validateRotationProof(signProof(claims,privateKey),publicKey,plan,{sourceInventory:source,targetInventory:target,now});});
test('inventory binding is stable across PostgreSQL key ordering and excludes unrelated metadata',()=>{assert.equal(rotationInventorySha256(source),rotationInventorySha256(source.map(({name,id,version,size})=>({size,version,id,name,etag:'separate-physical-observation'}))));});
test('an explicit pin protects an older verified root and unknown pins are refused',()=>{
 const input={namespace:ns,sourceRepositoryId:plan.sourceRepositoryId,targetRepositoryId:plan.targetRepositoryId,sourceInventory:source,snapshots:ids.map((id,i)=>({snapshotId:id,captureStartedAt:new Date(now-4000+i*1000).toISOString()})),verified:ids.slice(1),now};
 const held=rotationPlan({...input,pinned:[ids[1]]});assert.ok(held.protectedSnapshotIds.includes(ids[1]));assert.equal(held.retirementRootCandidates.length,0);assert.throws(()=>rotationPlan({...input,pinned:['9'.repeat(64)]}));
});
test('unknown pins, changed source/target, missing mappings and foreign signers fail closed',()=>{
 assert.throws(()=>rotationPlan({namespace:ns,sourceRepositoryId:plan.sourceRepositoryId,targetRepositoryId:plan.targetRepositoryId,sourceInventory:source,snapshots:[],now}));
 const envelope=signProof(claims,privateKey);for(const changed of [source.map((o,i)=>i===0?{...o,version:'new'}:o),source.slice(1)])assert.throws(()=>validateRotationProof(envelope,publicKey,plan,{sourceInventory:changed,targetInventory:target,now}));
 assert.throws(()=>validateRotationProof(envelope,publicKey,plan,{sourceInventory:source,targetInventory:target.map(o=>({...o,version:'changed'})),now}));
 assert.throws(()=>validateRotationProof(signProof({...claims,roots:claims.roots.slice(1)},privateKey),publicKey,plan,{sourceInventory:source,targetInventory:target,now}));
 assert.throws(()=>validateRotationProof(signProof(claims,generateKeyPairSync('ed25519').privateKey),publicKey,plan,{sourceInventory:source,targetInventory:target,now}));
});
test('retirement needs elapsed grace, fresh full verification, explicit approval and uploader fencing',()=>{
 const envelope=signProof(claims,privateKey),args={plan,envelope,publicKey,sourceInventory:source,targetInventory:target,readyAt:new Date(now).toISOString(),now};const held=retirementPreview(args);assert.equal(held.eligibleForReviewedRetirement,false);assert.ok(held.pending.includes('grace-period'));assert.equal(held.objectDeletionAllowed,false);
 assert.throws(()=>retirementPreview({...args,now:now+rotationGraceMs,operatorApproved:true,uploadersFenced:true}));
 const refreshed=signProof({...claims,issuedAt:new Date(now+rotationGraceMs).toISOString(),expiresAt:new Date(now+rotationGraceMs+600000).toISOString()},privateKey);
 const later=retirementPreview({...args,envelope:refreshed,now:now+rotationGraceMs,operatorApproved:true,uploadersFenced:true});assert.equal(later.eligibleForReviewedRetirement,true);assert.equal(later.objectDeletionAllowed,false);
});
