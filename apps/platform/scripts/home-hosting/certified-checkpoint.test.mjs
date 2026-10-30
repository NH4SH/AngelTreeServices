import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createCheckpointAuthority,certifiedEvidence,validateCertifiedCheckpoint} from './certified-checkpoint.mjs';
import {signProof} from './failover-proof.mjs';
import {validateContinuousReceipt} from './continuous-policy.mjs';
import {inventoryIdentity,sha256} from './cloud-policy.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519'),now=1800000000000;
const iso=n=>new Date(n).toISOString(),hex=x=>x.repeat(64);
function fixture(){
 const ticket={namespace:'ats-rehearsal-continuous-abcdef123456',sourceId:'ats_crm_candidate_20261027',generation:3,sequence:4,
  sourceBoot:'source-boot',databaseBoot:'db-boot',topology:hex('a'),snapshotId:hex('b'),manifestSha256:hex('c'),
  captureStartedAt:iso(now-30000),captureStartedBootMs:100000,captureCompletedAt:iso(now-20000),backupExitCode:0,
  capturePath:'/home/noelsierra.guest/candidate/continuous-abcdef123456/capture-4'};
 const objects=[{name:'config',id:'00000000-0000-4000-8000-000000000001',version:'v1',size:100,sha256:hex('d'),etag:'"strong"'}];
 const artifacts=Object.fromEntries(['manifest.private.json','database.dump','objects.tar','release-source.tar.gz','core.private.env','app.private.env']
  .map(name=>[name,{size:100,fingerprint:hex('e'),sha256:name==='manifest.private.json'?hex('c'):hex('f')}]));
 const catalog={version:1,kind:'restic-verified-catalog',writeAdmission:false,
  ...Object.fromEntries(['namespace','sourceId','generation','sequence','sourceBoot','databaseBoot','topology','snapshotId','captureStartedAt','captureStartedBootMs','captureCompletedAt'].map(k=>[k,ticket[k]])),
  objects,artifacts,objectInventorySha256:hex('1'),runtimeManifestSha256:hex('2'),fullVerifiedAt:iso(now-100000),issuedAt:iso(now-1000),expiresAt:iso(now-100000+86400000)};
 const archive={version:1,kind:'archive-verification',writeAdmission:false,
  ...Object.fromEntries(['namespace','sourceId','generation','sequence','sourceBoot','databaseBoot','topology','snapshotId','manifestSha256','captureStartedAt','captureStartedBootMs','captureCompletedAt'].map(k=>[k,ticket[k]])),
  issuedAt:catalog.issuedAt,expiresAt:iso(now+59000),verificationMode:'incremental-verified-baseline',remoteBytesReadBack:false,
  inventorySha256:inventoryIdentity(objects.map(({name,id,version,size})=>({name,id,version,size}))),runtimeManifestSha256:hex('2')};
 const request={requestId:'00000000-0000-4000-8000-000000000010',ticket,archiveEnvelope:signProof(archive,privateKey),catalogCertificate:signProof(catalog,privateKey)};
 return {ticket,catalog,archive,request};
}
test('complete current snapshot needs both independent signatures and exact physical/artifact/source bindings',()=>{
 const f=fixture();assert.equal(certifiedEvidence(f.request,publicKey,now).catalog.sequence,4);
 for(const change of [x=>x.ticket.sourceBoot='another',x=>x.ticket.captureStartedBootMs=0,
  x=>x.ticket.manifestSha256=hex('0'),x=>x.ticket.snapshotId=hex('0'),x=>x.ticket.captureCompletedAt=iso(now),
  x=>x.archiveEnvelope.signature='bad',x=>x.catalogCertificate.signature='bad']){
  const r=structuredClone(f.request);change(r);assert.throws(()=>certifiedEvidence(r,publicKey,now));
 }
 for(const change of [c=>c.objects[0].etag='W/"weak"',c=>c.objects[0].version='replaced',
  c=>c.artifacts['manifest.private.json'].sha256=hex('0'),c=>c.backupLayout='data-only-v1',
  c=>delete c.artifacts['app.private.env'],c=>c.fullVerifiedAt=iso(now-86400001),c=>c.sequence--]){
  const c=structuredClone(f.catalog);change(c);assert.throws(()=>certifiedEvidence({...f.request,catalogCertificate:signProof(c,privateKey)},publicKey,now));
 }
});
test('authority requires durable completion and issues a distinct, honest incremental receipt',async()=>{
 const f=fixture();let calls=0;
 const authority=createCheckpointAuthority({namespace:f.ticket.namespace,privateKey,now:()=>now,ledger:async p=>{
  calls++;assert.deepEqual(p.archive,f.archive);assert.deepEqual(p.catalog,f.catalog);assert.equal(p.claims.freshFullRemoteRead,false);
  assert.equal(p.claims.catalogCertificateSha256,sha256(JSON.stringify(f.request.catalogCertificate)));return {claims:p.claims};
 }});
 const result=await authority(f.request),c=validateCertifiedCheckpoint(result.envelope,publicKey,f.ticket,now);
 assert.equal(calls,1);assert.equal(c.expiresAt,iso(now-30000+280000));
 assert.throws(()=>validateContinuousReceipt(result.envelope,publicKey,f.ticket,now));
 assert.throws(()=>validateCertifiedCheckpoint(f.request.archiveEnvelope,publicKey,f.ticket,now));
 const noLedger=createCheckpointAuthority({namespace:f.ticket.namespace,privateKey,now:()=>now,ledger:async()=>{throw Error('Ledger unavailable');}});
 await assert.rejects(noLedger(f.request),/Ledger unavailable/);
 const bad=structuredClone(f.request);bad.catalogCertificate.signature='bad';await assert.rejects(authority(bad));assert.equal(calls,1);
});
test('every integrity guarantee, both clocks, exact epoch and full scrub expiry are mandatory',async()=>{
 const f=fixture();const authority=createCheckpointAuthority({namespace:f.ticket.namespace,privateKey,now:()=>now,ledger:async p=>({claims:p.claims})});
 const result=await authority(f.request),c=JSON.parse(Buffer.from(result.envelope.payload,'base64url'));
 for(const flag of ['completeSnapshot','allNewPacksReadBack','retainedObjectsPhysicallyObserved','nativeGraphChecked',
  'pairedDatabaseAndFiles','authIncluded','paymentAndDeliveryIncluded','publicAccessDenied','serializedByAuthority']){
  assert.throws(()=>validateCertifiedCheckpoint(signProof({...c,[flag]:false},privateKey),publicKey,f.ticket,now));
 }
 for(const change of [x=>x.freshFullRemoteRead=true,x=>x.generation++,x=>x.sourceBoot='another',
  x=>x.expiresAt=iso(now+280000),x=>x.captureCompletedAt=iso(now+1),x=>x.fullExpiresAt=iso(now+172800000)]){
  const bad=structuredClone(c);change(bad);assert.throws(()=>validateCertifiedCheckpoint(signProof(bad,privateKey),publicKey,f.ticket,now));
 }
 f.catalog.fullVerifiedAt=iso(now-86400000+2000);f.catalog.expiresAt=iso(now+2000);
 f.request.catalogCertificate=signProof(f.catalog,privateKey);
 const short=await authority(f.request);assert.equal(validateCertifiedCheckpoint(short.envelope,publicKey,f.ticket,now).expiresAt,iso(now+2000));
 assert.throws(()=>validateCertifiedCheckpoint(short.envelope,publicKey,f.ticket,now+2001));
});
