// Candidate infrastructure policy; no application or production authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const cloudLimits=Object.freeze({repositoryBytes:128*1024*1024,objectBytes:32*1024*1024,
  objects:256,restoredBytes:192*1024*1024,dailyReadBytes:96*1024*1024,
  monthlyReadBytes:512*1024*1024,metadataReservationBytes:256*1024,bodyBytes:16384});
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateInventory(rows){
  assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=cloudLimits.objects,'Invalid repository inventory');
  const seen=new Set();let total=0;
  for(const r of rows){
    assert.match(r.name,/^(config|keys\/[a-f0-9]{64}|index\/[a-f0-9]{64}|snapshots\/[a-f0-9]{64}|data\/[a-f0-9]{2}\/[a-f0-9]{64})$/);
    assert.ok(!seen.has(r.name));seen.add(r.name);
    assert.match(r.id,/^[a-f0-9-]{36}$/);assert.ok(typeof r.version==='string'&&r.version.length>0&&r.version.length<100,'Missing immutable object version');
    assert.ok(Number.isSafeInteger(r.size)&&r.size>0&&r.size<=cloudLimits.objectBytes);total+=r.size;
  }
  assert.ok(seen.has('config')&&total<=cloudLimits.repositoryBytes,'Repository exceeds storage cap');
  return {rows:[...rows].sort((a,b)=>a.name.localeCompare(b.name)),total};
}
// PostgreSQL jsonb and JavaScript do not preserve the same object-key order.
// Canonicalize the physical identity fields and keep ciphertext/ETag evidence
// in its separately signed catalog. Extra fields never silently change this ID.
export const inventoryIdentity=rows=>sha256(JSON.stringify(validateInventory(rows).rows.map(r=>({id:r.id,name:r.name,size:r.size,version:r.version}))));
export function validateCloudRequest(request,namespace,now=Date.now()){
  assert.match(namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);
  assert.match(request.requestId,/^[a-f0-9-]{36}$/);
  assert.ok(['archive','continuous'].includes(request.mode));const t=request.ticket;
  assert.equal(t.namespace,namespace);assert.equal(t.sourceId,'ats_crm_candidate_20261027');
  assert.ok(Number.isSafeInteger(t.sequence)&&t.sequence>0&&Number.isSafeInteger(t.generation)&&t.generation>0);
  for(const k of ['snapshotId','manifestSha256'])assert.match(t[k],/^[a-f0-9]{64}$/);
  // Existing candidate topology is a PostgreSQL catalog MD5, not a blob SHA.
  assert.match(t.topology,/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/);
  for(const k of ['sourceBoot','databaseBoot'])assert.ok(typeof t[k]==='string'&&t[k].length>0&&t[k].length<100);
  assert.match(t.capturePath,/^\/home\/noelsierra\.guest\/candidate\/continuous-[a-f0-9]{12}\/capture-[1-9][0-9]*$/);
  assert.equal(t.capturePath,`/home/noelsierra.guest/candidate/continuous-${namespace.slice(-12)}/capture-${t.sequence}`);
  const start=Date.parse(t.captureStartedAt),end=Date.parse(t.captureCompletedAt);
  assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&start<=end&&end<=now);
  assert.ok(Number.isFinite(t.captureStartedBootMs)&&t.captureStartedBootMs>0);assert.equal(t.backupExitCode,0);
  if(request.mode==='continuous')assert.ok(now-start<260000,'Capture too old to begin admission verification');
  return t;
}
export function retentionPreview(snapshots,{pinned=[],keepLast=2,dailyDays=7,now=Date.now()}={}){
  assert.ok(keepLast>=2&&Number.isSafeInteger(keepLast)&&dailyDays>=0&&dailyDays<=31);
  assert.ok(Array.isArray(snapshots)&&snapshots.length<=4096);
  const ordered=[...snapshots].sort((a,b)=>Date.parse(b.captureStartedAt)-Date.parse(a.captureStartedAt)||b.snapshotId.localeCompare(a.snapshotId));
  const ids=new Set();for(const s of ordered){assert.match(s.snapshotId,/^[a-f0-9]{64}$/);assert.ok(Number.isFinite(Date.parse(s.captureStartedAt))&&Date.parse(s.captureStartedAt)<=now);assert.ok(!ids.has(s.snapshotId));ids.add(s.snapshotId);}
  for(const id of pinned)assert.ok(ids.has(id),'Unknown retention pin');
  // Unverified roots are held for investigation, never silently discarded.
  const keep=new Set([...pinned,...ordered.filter(s=>s.verified!==true).map(s=>s.snapshotId),...ordered.filter(s=>s.verified===true).slice(0,keepLast).map(s=>s.snapshotId)]);
  const days=new Set();for(const s of ordered.filter(s=>s.verified===true)){
    const day=s.captureStartedAt.slice(0,10);if(now-Date.parse(s.captureStartedAt)<=dailyDays*86400000&&!days.has(day)){days.add(day);keep.add(s.snapshotId);}
  }
  return {previewOnly:true,protectedSnapshots:ordered.filter(s=>keep.has(s.snapshotId)).map(s=>s.snapshotId),
    retirementCandidates:ordered.filter(s=>!keep.has(s.snapshotId)).map(s=>s.snapshotId),
    objectDeletionAllowed:false,requiredBeforeDeletion:'Copy retained roots to a new generation, fully verify it, review a grace period and explicitly approve retirement.'};
}
export function transferProjection({repositoryBytes,newBytesPerCapture=0,metadataBytesPerCapture=cloudLimits.metadataReservationBytes,capturesPerDay=720,coldStartsPerDay=1}){
  for(const x of [repositoryBytes,newBytesPerCapture,metadataBytesPerCapture,capturesPerDay,coldStartsPerDay])assert.ok(Number.isSafeInteger(x)&&x>=0);
  const dailyBytes=repositoryBytes*coldStartsPerDay+(newBytesPerCapture+metadataBytesPerCapture)*capturesPerDay;
  return {dailyBytes,monthlyBytes:dailyBytes*31,withinDailyLimit:dailyBytes<=cloudLimits.dailyReadBytes,withinMonthlyLimit:dailyBytes*31<=cloudLimits.monthlyReadBytes,accountWideFreeUsageGuaranteed:false};
}
