// Explicit, separate admission contract for the synthetic rehearsal. Archive
// results remain non-writable. An independent verifier must certify the complete
// current encrypted graph, and a durable authority must serialize admission.
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { sha256, inventoryIdentity, validateCloudRequest } from './cloud-policy.mjs';
import { validateCatalog } from './incremental-policy.mjs';
import { verifyProof, signProof } from './failover-proof.mjs';
import { continuousPolicy } from './continuous-policy.mjs';

const fields=['namespace','generation','sourceId','sourceBoot','databaseBoot','topology','sequence',
  'snapshotId','manifestSha256','captureStartedAt','captureStartedBootMs','captureCompletedAt'];
function signedJson(envelope,key,max=40960){
  assert.deepEqual(Object.keys(envelope).sort(),['payload','signature']);
  const bytes=Buffer.from(envelope.payload,'base64url');
  assert.ok(bytes.length<=max&&verify(null,bytes,key,Buffer.from(envelope.signature,'base64url')));
  return JSON.parse(bytes);
}

export function certifiedEvidence({ticket,archiveEnvelope,catalogCertificate},key,now=Date.now()){
  validateCloudRequest({requestId:'00000000-0000-4000-8000-000000000000',mode:'continuous',ticket},ticket.namespace,now);
  const archive=verifyProof(archiveEnvelope,key,{kind:'archive-verification',namespace:ticket.namespace,minimumGeneration:ticket.generation,now});
  assert.equal(archive.generation,ticket.generation);
  assert.equal(archive.writeAdmission,false);
  assert.equal(archive.verificationMode,'incremental-verified-baseline');
  for(const field of fields)assert.equal(archive[field],ticket[field]);
  const c=signedJson(catalogCertificate,key);
  // Validate the catalog using a strictly later hypothetical ticket, then bind
  // it to the actual capture below. This reuses the archive policy unchanged.
  validateCatalog(catalogCertificate,key,{...ticket,sequence:ticket.sequence+1,
    captureStartedAt:new Date(Date.parse(ticket.captureStartedAt)+1).toISOString()},now);
  assert.equal(c.sequence,ticket.sequence);assert.equal(c.snapshotId,ticket.snapshotId);
  assert.equal(c.captureStartedAt,ticket.captureStartedAt);
  for(const name of ['captureStartedBootMs','captureCompletedAt'])assert.equal(c[name],ticket[name]);
  assert.equal(c.artifacts['manifest.private.json'].sha256,ticket.manifestSha256);
  // The verifier's physical inventory hash covers provider identity fields.
  // Signed ciphertext digests/ETags are additional evidence, not fields in the
  // Storage metadata inventory returned by the independent ledger.
  assert.equal(archive.inventorySha256,inventoryIdentity(c.objects));
  for(const o of c.objects)assert.ok(o.etag&&!o.etag.startsWith('W/'),'Strong physical object identity required');
  // Split components are not complete recovery snapshots. They have a separate
  // protocol and cannot become writable through this path.
  assert.equal(c.backupLayout,undefined);
  assert.ok(Date.parse(c.issuedAt)>=Date.parse(ticket.captureCompletedAt));
  assert.equal(c.issuedAt,archive.issuedAt);
  assert.match(c.objectInventorySha256,/^[a-f0-9]{64}$/);
  assert.match(c.runtimeManifestSha256,/^[a-f0-9]{64}$/);assert.equal(archive.runtimeManifestSha256,c.runtimeManifestSha256);
  return {archive,catalog:c};
}

export function validateCertifiedCheckpoint(envelope,key,binding,now=Date.now()){
  const c=verifyProof(envelope,key,{kind:'certified-incremental-backup',namespace:binding.namespace,
    minimumGeneration:binding.generation,now});
  assert.equal(c.generation,binding.generation);
  for(const name of ['sourceId','sourceBoot','databaseBoot','topology'])assert.equal(c[name],binding[name]);
  assert.ok(Number.isSafeInteger(c.sequence)&&c.sequence>0);
  assert.ok(Number.isFinite(c.captureStartedBootMs)&&c.captureStartedBootMs>0);
  for(const name of ['snapshotId','manifestSha256','catalogCertificateSha256','inventorySha256','runtimeManifestSha256'])assert.match(c[name],/^[a-f0-9]{64}$/);
  const start=Date.parse(c.captureStartedAt),end=Date.parse(c.captureCompletedAt),checked=Date.parse(c.offsiteVerifiedAt),
    full=Date.parse(c.fullVerifiedAt),fullExpiry=Date.parse(c.fullExpiresAt),expiry=Date.parse(c.expiresAt);
  assert.ok([start,end,checked,full,fullExpiry,expiry].every(Number.isFinite));
  assert.ok(start<=end&&end<=checked&&checked<=now&&full<=checked&&now-start<280000);
  assert.equal(fullExpiry,full+86400000);
  assert.equal(expiry,Math.min(start+280000,fullExpiry));
  assert.equal(c.verificationMode,'native-new-pack-readback-and-certified-retained-graph');
  for(const name of ['completeSnapshot','allNewPacksReadBack','retainedObjectsPhysicallyObserved','nativeGraphChecked',
    'pairedDatabaseAndFiles','authIncluded','paymentAndDeliveryIncluded','publicAccessDenied','serializedByAuthority'])assert.equal(c[name],true);
  // Deliberately does not claim a new full read of every retained byte.
  assert.equal(c.freshFullRemoteRead,false);
  return c;
}

export function createCheckpointAuthority({namespace,privateKey,ledger,now=()=>Date.now()}){
  const key=createPublicKey(privateKey);
  return async request=>{
    assert.match(request.requestId,/^[a-f0-9-]{36}$/);assert.equal(request.ticket.namespace,namespace);
    const {archive,catalog}=certifiedEvidence(request,key,now()),ticket=request.ticket;
    const at=new Date(now()).toISOString(),claims={version:1,kind:'certified-incremental-backup',
      ...Object.fromEntries(fields.map(f=>[f,ticket[f]])),issuedAt:at,
      expiresAt:new Date(Math.min(Date.parse(ticket.captureStartedAt)+280000,Date.parse(catalog.expiresAt))).toISOString(),
      offsiteVerifiedAt:archive.issuedAt,fullVerifiedAt:catalog.fullVerifiedAt,fullExpiresAt:catalog.expiresAt,
      catalogCertificateSha256:sha256(JSON.stringify(request.catalogCertificate)),inventorySha256:archive.inventorySha256,
      runtimeManifestSha256:catalog.runtimeManifestSha256,
      verificationMode:'native-new-pack-readback-and-certified-retained-graph',completeSnapshot:true,
      allNewPacksReadBack:true,retainedObjectsPhysicallyObserved:true,nativeGraphChecked:true,
      pairedDatabaseAndFiles:true,authIncluded:true,paymentAndDeliveryIncluded:true,publicAccessDenied:true,
      serializedByAuthority:true,freshFullRemoteRead:false};
    validateCertifiedCheckpoint(signProof(claims,privateKey),key,ticket,now());
    // The remote transaction must compare the exact completed verifier job and
    // signed catalog, check the current physical inventory and monotonically
    // advance this source's sequence. A caller-supplied report is not authority.
    const result=await ledger({action:'certify',namespace,requestId:request.requestId,
      bodySha:sha256(JSON.stringify(request)),archive,catalog,claims});
    assert.ok(result&&result.claims);validateCertifiedCheckpoint(signProof(result.claims,privateKey),key,ticket,now());
    for(const field of fields)assert.equal(result.claims[field],ticket[field]);
    return {envelope:signProof(result.claims,privateKey),replayed:result.replayed===true};
  };
}
