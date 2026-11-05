// Synthetic rehearsal policy. It never opens a database or schedules a service.
import { verifyProof } from './failover-proof.mjs';
export const continuousPolicy = Object.freeze({ intervalMs:120000, maximumLossMs:300000,
  hardFenceMarginMs:20000, renewalMs:5000, leaseMs:15000, clockToleranceMs:2000 });
export function validateContinuousReceipt(envelope, publicKey, binding, now=Date.now()) {
  const c=verifyProof(envelope,publicKey,{kind:'continuous-backup',namespace:binding.namespace,now,minimumGeneration:binding.generation});
  for(const name of ['sourceId','sourceBoot','databaseBoot','topology'])
    if(c[name]!==binding[name])throw Error('Backup source binding changed: '+name);
  if(!Number.isSafeInteger(c.sequence)||c.sequence<1)throw Error('Invalid backup sequence');
  if(!Number.isFinite(c.captureStartedBootMs)||c.captureStartedBootMs<=0)throw Error('Missing source monotonic capture time');
  for(const key of ['manifestSha256','snapshotId'])if(!/^[a-f0-9]{64}$/.test(c[key]??''))throw Error('Missing immutable capture identity');
  const start=Date.parse(c.captureStartedAt),end=Date.parse(c.captureCompletedAt),verified=Date.parse(c.offsiteVerifiedAt);
  if(![start,end,verified].every(Number.isFinite)||start>end||end>verified||verified>now||
    start>now||now-start>=continuousPolicy.maximumLossMs-continuousPolicy.hardFenceMarginMs)
    throw Error('Capture is stale or its timeline is invalid');
  if(c.expiresAt!==new Date(start+continuousPolicy.maximumLossMs-continuousPolicy.hardFenceMarginMs).toISOString())
    throw Error('Deadline must derive from capture start');
  for(const key of ['paired','authIncluded','paymentAndDeliveryIncluded','resticCheckPassed','remoteBytesReadBack','sourceArtifactsVerified','publicAccessDenied'])
    if(c[key]!==true)throw Error('Incomplete offsite proof: '+key);
  return c;
}
export function acceptNextReceipt(previous,next) {
  if(previous&&(next.sequence<=previous.sequence||Date.parse(next.captureStartedAt)<=Date.parse(previous.captureStartedAt)))
    throw Error('Backup rollback or duplicate receipt');
  return next;
}
export function clockIsSafe(anchor, wall, monotonic) {
  return Number.isFinite(wall)&&Number.isFinite(monotonic)&&monotonic>=anchor.monotonic&&
    Math.abs((wall-anchor.wall)-(monotonic-anchor.monotonic))<=continuousPolicy.clockToleranceMs;
}
