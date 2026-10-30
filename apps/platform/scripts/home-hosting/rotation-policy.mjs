// Archive-only rotation. Builds a fresh repository and preserves the old one.
// No routing change, remote deletion, credential rotation or write permit here.
import assert from 'node:assert/strict';import {verify} from 'node:crypto';
import {sha256,inventoryIdentity,retentionPreview,validateInventory} from './cloud-policy.mjs';
const hex=v=>assert.match(v,/^[a-f0-9]{64}$/),rows=a=>a.map(({name,id,version,size})=>({name,id,version,size}));
export const rotationInventorySha256=a=>inventoryIdentity(rows(a));
export const rotationGraceMs=86400000;
export function rotationPlan({namespace,sourceRepositoryId,targetRepositoryId,sourceInventory,snapshots,verified=[],pinned=[],now=Date.now()}){
 assert.match(namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);hex(sourceRepositoryId);hex(targetRepositoryId);assert.notEqual(sourceRepositoryId,targetRepositoryId);
 const inventory=validateInventory(rows(sourceInventory)).rows;assert.ok(inventory.length<=96);const all=inventory.filter(o=>o.name.startsWith('snapshots/')).map(o=>o.name.slice(10)).sort();
 assert.deepEqual(snapshots.map(s=>s.snapshotId).sort(),all,'Incomplete source snapshot inventory');for(const id of verified)assert.ok(all.includes(id));
 const keep=retentionPreview(snapshots.map(s=>({...s,verified:verified.includes(s.snapshotId)})),{pinned,keepLast:2,dailyDays:7,now});
 const plan={version:1,kind:'archive-rotation-plan',namespace,sourceRepositoryId,targetRepositoryId,sourceInventorySha256:rotationInventorySha256(inventory),sourceSnapshotIds:all,
  protectedSnapshotIds:keep.protectedSnapshots,retirementRootCandidates:keep.retirementCandidates,createdAt:new Date(now).toISOString(),minimumGraceMs:rotationGraceMs,writeAdmission:false};
 return {...plan,planId:sha256(JSON.stringify(plan))};
}
export function validateRotationProof(envelope,publicKey,plan,{sourceInventory,targetInventory,now=Date.now()}={}){
 const {planId,...body}=plan;assert.equal(planId,sha256(JSON.stringify(body)),'Rotation plan changed');
 const bytes=Buffer.from(envelope.payload,'base64url');assert.ok(bytes.length<=65536&&verify(null,bytes,publicKey,Buffer.from(envelope.signature,'base64url')),'Untrusted rotation result');const p=JSON.parse(bytes);
 assert.equal(p.version,1);assert.equal(p.kind,'archive-rotation');assert.equal(p.planId,planId);assert.equal(p.namespace,plan.namespace);assert.equal(p.writeAdmission,false);
 assert.equal(p.sourceRepositoryId,plan.sourceRepositoryId);assert.equal(p.targetRepositoryId,plan.targetRepositoryId);assert.notEqual(p.sourceRepositoryId,p.targetRepositoryId);
 const at=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);assert.ok(at<=now&&expires>now&&expires-at<=900000,'Fresh rotation verification required');
 assert.equal(rotationInventorySha256(sourceInventory),plan.sourceInventorySha256,'Source changed during rotation');assert.equal(rotationInventorySha256(targetInventory),p.targetInventorySha256,'Replacement changed after verification');
 assert.equal(p.fullRemoteRead,true);assert.equal(p.nativeFullCheck,true);assert.equal(p.allProtectedRootsRestored,true);assert.ok(Array.isArray(p.roots));
 assert.deepEqual(p.roots.map(r=>r.sourceSnapshotId).sort(),[...plan.protectedSnapshotIds].sort(),'Protected recovery root missing');
 const targets=new Set();for(const r of p.roots){hex(r.targetSnapshotId);hex(r.manifestSha256);hex(r.artifactsSha256);assert.equal(r.sourceArtifactsMatched,true);assert.ok(!targets.has(r.targetSnapshotId));targets.add(r.targetSnapshotId);}
 assert.deepEqual([...targets].sort(),targetInventory.filter(o=>o.name.startsWith('snapshots/')).map(o=>o.name.slice(10)).sort(),'Replacement snapshot set differs');return p;
}
export function retirementPreview({plan,envelope,publicKey,sourceInventory,targetInventory,readyAt,operatorApproved=false,uploadersFenced=false,now=Date.now()}){
 validateRotationProof(envelope,publicKey,plan,{sourceInventory,targetInventory,now});const at=Date.parse(readyAt);assert.ok(Number.isFinite(at)&&at<=now);
 const pending=[];if(now<at+rotationGraceMs)pending.push('grace-period');if(!operatorApproved)pending.push('operator-retirement-approval');if(!uploadersFenced)pending.push('positive-uploader-fence');
 return {previewOnly:true,eligibleForReviewedRetirement:pending.length===0,objectDeletionAllowed:false,deletionImplemented:false,
  retireAfter:new Date(at+rotationGraceMs).toISOString(),pending,sourceObjectCount:sourceInventory.length,protectedRecoveryRoots:plan.protectedSnapshotIds.length};
}
