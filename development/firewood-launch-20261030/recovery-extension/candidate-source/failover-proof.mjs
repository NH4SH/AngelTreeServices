// Rehearsal control protocol. No production authority or schedule is installed.
// Public-key signatures protect permits; positive host fencing, not a database
// trigger or DNS change, is required before a different writer may start.
import { sign, verify } from 'node:crypto';
export const maxDataLossMs=300000;
const iso=value=>typeof value==='string'?Date.parse(value):NaN;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const services=['app','api-gw','auth','rest','storage','imgproxy','db'];
export function signProof(claims,privateKey){
  const payload=Buffer.from(JSON.stringify(claims));
  return {payload:payload.toString('base64url'),signature:sign(null,payload,privateKey).toString('base64url')};
}
export function verifyProof(envelope,publicKey,{kind,namespace,now=Date.now(),minimumGeneration=1}={}){
  if(!envelope||!Object.keys(envelope).every(k=>['payload','signature'].includes(k))||typeof envelope.payload!=='string'||typeof envelope.signature!=='string')throw Error('Malformed signed proof.');
  const payload=Buffer.from(envelope.payload,'base64url');
  if(payload.length>65536||!verify(null,payload,publicKey,Buffer.from(envelope.signature,'base64url')))throw Error('Untrusted proof signature.');
  const claims=JSON.parse(payload.toString('utf8'));
  if(claims.version!==1||claims.kind!==kind||claims.namespace!==namespace||!Number.isSafeInteger(claims.generation)||claims.generation<minimumGeneration)throw Error('Proof identity or generation mismatch.');
  if(!Number.isFinite(iso(claims.issuedAt))||!Number.isFinite(iso(claims.expiresAt))||iso(claims.issuedAt)>now||iso(claims.expiresAt)<=now||iso(claims.expiresAt)-iso(claims.issuedAt)>900000)throw Error('Expired or invalid proof time.');
  return claims;
}
export function hardFenceProblems(receipt){
  const problems=[];
  if(!receipt||receipt.version!==1||typeof receipt.namespace!=='string'||!receipt.namespace.startsWith('ats-rehearsal-'))problems.push('invalid_rehearsal_identity');
  if(!Number.isSafeInteger(receipt?.generation)||receipt.generation<1)problems.push('invalid_generation');
  if(!hex(receipt?.challenge)||!hex(receipt?.sourceImage)||typeof receipt?.sourceBoot!=='string'||!receipt.sourceBoot)problems.push('missing_host_binding');
  if(!Number.isFinite(iso(receipt?.writesFencedAt)))problems.push('invalid_fence_time');
  if(!Array.isArray(receipt?.containers)||receipt.containers.length!==services.length||!services.every(service=>receipt.containers.filter(c=>c.service===service&&!c.running&&c.restart==='no'&&hex(c.id)).length===1))problems.push('source_containers_not_proven_stopped');
  if(receipt?.nonOperatorSessions!==0||receipt?.apiLoginsDisabled!==true||receipt?.longTransactionRolledBack!==true)problems.push('database_writers_not_drained');
  if(receipt?.providerCallsDisabled!==true||receipt?.uncertainOutcomesHeld!==true)problems.push('provider_dispatch_not_fenced');
  return problems;
}
export function promotionProblems({fence,capture,offsite,target,permit},now=Date.now()){
  const problems=hardFenceProblems(fence);
  const start=iso(capture?.captureStartedAt),end=iso(capture?.captureCompletedAt),cutoff=iso(fence?.writesFencedAt),verified=iso(offsite?.verifiedAt);
  if(![start,end,cutoff,verified].every(Number.isFinite)||start>cutoff||cutoff>end||end>verified||verified>now)problems.push('invalid_capture_timeline');
  if(Number.isFinite(start)&&Number.isFinite(cutoff)&&cutoff-start>maxDataLossMs)problems.push('loss_window_exceeds_five_minutes');
  if(!hex(capture?.manifestSha256)||!hex(capture?.snapshotId)||capture?.namespace!==fence?.namespace||capture?.pairedDatabaseAndObjects!==true||capture?.authIncluded!==true||capture?.paymentDeliveryHistoryIncluded!==true)problems.push('incomplete_paired_capture');
  if(offsite?.manifestSha256!==capture?.manifestSha256||offsite?.snapshotId!==capture?.snapshotId||offsite?.remoteBytesReadBack!==true||offsite?.resticCheckPassed!==true||offsite?.publicAccessDenied!==true)problems.push('offsite_capture_not_verified');
  if(!target?.databaseVerified||!target?.objectsVerified||!target?.permissionsVerified||!target?.coldGuardClosed||!target?.workersDisabled||target?.id===fence?.sourceId)problems.push('target_not_ready');
  if(permit&&(permit.namespace!==fence?.namespace||permit.generation<=fence.generation||permit.sourceId!==fence.sourceId||permit.targetId!==target?.id||permit.manifestSha256!==capture.manifestSha256||permit.snapshotId!==capture.snapshotId||permit.challenge!==fence.challenge))problems.push('permit_binding_mismatch');
  return problems;
}
export function admissionProblems({baseline,offsite,target,permit},now=Date.now()){
  const problems=[],start=iso(baseline?.captureStartedAt),end=iso(baseline?.captureCompletedAt),verified=iso(offsite?.verifiedAt);
  if(![start,end,verified].every(Number.isFinite)||start>end||end>verified||verified>now||start>now||now-start>=maxDataLossMs)problems.push('fresh_paired_baseline_required');
  if(baseline?.targetId!==target?.id||baseline?.continuousFence!==true||baseline?.pairedDatabaseAndObjects!==true||!hex(baseline?.businessStateSha256)||baseline.businessStateSha256!==target?.businessStateSha256)problems.push('baseline_target_not_proven');
  if(offsite?.manifestSha256!==baseline?.manifestSha256||offsite?.snapshotId!==baseline?.snapshotId||offsite?.remoteBytesReadBack!==true||offsite?.resticCheckPassed!==true||offsite?.publicAccessDenied!==true)problems.push('baseline_offsite_copy_not_verified');
  if(permit&&(permit.admissionManifestSha256!==baseline?.manifestSha256||permit.admissionSnapshotId!==baseline?.snapshotId||permit.admissionCaptureStartedAt!==baseline?.captureStartedAt))problems.push('baseline_permit_binding_mismatch');
  return problems;
}
