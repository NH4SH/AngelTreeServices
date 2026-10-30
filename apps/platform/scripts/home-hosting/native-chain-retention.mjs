// Preview only. No delete client, writer permit, ledger mutation or I/O.
// A future executor must serialize against the observed head and recheck the
// complete inventory before marking/deleting anything from this exact scope.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backupSourceScope} from './backup-source-scope.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const day=86400000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function planNativeChainRetention({namespace,bindingSha256,headJobId,jobs,pinned=[],now=Date.now(),expectedBinding}) {
  const production=expectedBinding?.environment==='home-primary-v1';
  if(production){assert.equal(backupSourceScope(expectedBinding).syntheticOnly,false);assert.equal(namespace,expectedBinding.namespace);}
  else assert.match(namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);
  const maximumJobs=production?65536:8192;
  assert.match(bindingSha256,hash);assert.ok(Number.isSafeInteger(now)&&now>0);
  assert.ok(Array.isArray(jobs)&&jobs.length>0&&jobs.length<=maximumJobs);
  assert.ok(Array.isArray(pinned)&&pinned.length<=maximumJobs);
  const byId=new Map(),sequences=new Set();
  for(const j of jobs) {
    assert.match(j.id,uuid);assert.equal(j.namespace,namespace);
    assert.equal(j.bindingSha256,bindingSha256);assert.ok(!byId.has(j.id));
    // A failed upload and its retry can have separate IDs at the same sequence.
    assert.ok(Number.isSafeInteger(j.sequence)&&j.sequence>0&&j.sequence<=maximumJobs);
    sequences.add(j.sequence);assert.ok(['base','delta'].includes(j.kind));
    assert.ok(Number.isFinite(Date.parse(j.createdAt))&&Date.parse(j.createdAt)<=now);
    if(j.verifiedAt!==null) {
      assert.ok(Number.isFinite(Date.parse(j.verifiedAt))&&Date.parse(j.verifiedAt)>=Date.parse(j.createdAt)&&Date.parse(j.verifiedAt)<=now);
      assert.match(j.componentSha256,hash);
    } else assert.equal(j.componentSha256,null);
    if(j.parentJobId!==null)assert.match(j.parentJobId,uuid);
    byId.set(j.id,j);
  }
  const ordered=[...jobs].sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id));
  // A complete source inventory is required even for a newer base. Missing
  // history is not interpreted as permission to discard unknown ancestors.
  assert.deepEqual([...sequences].sort((a,b)=>a-b),Array.from({length:Math.max(...sequences)},(_,i)=>i+1));
  for(const j of ordered) {
    if(j.sequence===1){assert.equal(j.kind,'base');assert.equal(j.parentJobId,null);}
    else {const parent=byId.get(j.parentJobId);assert.ok(parent,'Missing source parent');assert.equal(parent.sequence,j.sequence-1);}
    if(j.kind==='delta')assert.notEqual(byId.get(j.parentJobId).verifiedAt,null,'Delta has an unverified dependency');
  }
  assert.match(headJobId,uuid);const head=byId.get(headJobId);assert.ok(head&&head.verifiedAt!==null);
  const roots=new Map(),keep=(id,reason)=>{
    assert.ok(byId.has(id),'Unknown retention pin');const reasons=roots.get(id)??new Set();reasons.add(reason);roots.set(id,reasons);
  };
  keep(headJobId,'current-admitted-head');
  for(const id of pinned){assert.match(id,uuid);keep(id,'explicit-pin');}
  const verified=ordered.filter(j=>j.verifiedAt!==null);
  for(const j of verified.slice(-2))keep(j.id,'latest-verified');
  const days=new Set();
  for(const j of [...verified].reverse()) {
    const date=new Date(j.createdAt).toISOString().slice(0,10);
    if(Date.parse(j.createdAt)>=now-7*day&&!days.has(date)){keep(j.id,'daily-recovery-point');days.add(date);}
  }
  for(const j of ordered) {
    if(j.verifiedAt===null)keep(j.id,'unverified-evidence');
    if(Math.max(Date.parse(j.createdAt),j.verifiedAt===null?0:Date.parse(j.verifiedAt))>now-day)keep(j.id,'retirement-grace');
  }
  const protectedIds=new Set();
  for(const root of roots.keys()) {
    let j=byId.get(root),depth=0;
    for(;;) {
      assert.ok(++depth<=2048,'Native recovery dependency chain exceeds its verifier bound');
      protectedIds.add(j.id);if(j.kind==='base')break;
      j=byId.get(j.parentJobId);assert.ok(j,'Missing protected recovery dependency');
    }
  }
  const observed=ordered.map(j=>({id:j.id,sequence:j.sequence,kind:j.kind,parentJobId:j.parentJobId,createdAt:j.createdAt,verifiedAt:j.verifiedAt,componentSha256:j.componentSha256}));
  return {
    version:1,kind:'native-chain-retirement-preview',namespace,bindingSha256,headJobId,
    observedSourceSha256:digest({namespace,bindingSha256,headJobId,jobs:observed}),
    protectedRoots:[...roots].map(([id,reasons])=>({id,reasons:[...reasons].sort()})).sort((a,b)=>a.id.localeCompare(b.id)),
    protectedJobIds:ordered.filter(j=>protectedIds.has(j.id)).map(j=>j.id),
    eligibleJobIds:ordered.filter(j=>!protectedIds.has(j.id)).map(j=>j.id),
    writeAdmission:false,objectDeletionAllowed:false,
  };
}
