import {test} from 'node:test';import assert from 'node:assert/strict';
import {planNativeChainRetention} from './native-chain-retention.mjs';
const now=Date.parse('2026-10-29T12:00:00.000Z'),namespace='ats-rehearsal-continuous-abcdef123456',bindingSha256='a'.repeat(64),day=86400000;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const job=(n,kind,age,verified=true)=>({id:id(n),namespace,bindingSha256,sequence:n,kind,parentJobId:n===1?null:id(n-1),createdAt:new Date(now-age*day).toISOString(),verifiedAt:verified?new Date(now-age*day+1000).toISOString():null,componentSha256:verified?'b'.repeat(64):null});
const plan=jobs=>planNativeChainRetention({namespace,bindingSha256,headJobId:jobs.filter(j=>j.verifiedAt).at(-1).id,jobs,now});
test('a retained delta protects its base and every intervening WAL component',()=>{
  const p=plan([job(1,'base',10),job(2,'delta',9),job(3,'delta',0.1)]);
  assert.deepEqual(p.protectedJobIds,[id(1),id(2),id(3)]);assert.deepEqual(p.eligibleJobIds,[]);
  assert.equal(p.objectDeletionAllowed,false);assert.equal(p.writeAdmission,false);
});
test('a newer full base ends dependency closure but daily points preserve older chains',()=>{
  const p=plan([job(1,'base',9),job(2,'delta',8),job(3,'base',6),job(4,'delta',5),job(5,'base',2),job(6,'delta',1.5)]);
  assert.deepEqual(p.eligibleJobIds,[id(1),id(2)]);assert.deepEqual(p.protectedJobIds,[id(3),id(4),id(5),id(6)]);
});
test('unverified evidence, explicit pins and the 24-hour grace preserve their dependencies',()=>{
  const jobs=[job(1,'base',12),job(2,'delta',11),job(3,'base',10),job(4,'base',9),job(5,'base',0.1),job(6,'delta',0.05,false)];
  const p=planNativeChainRetention({namespace,bindingSha256,headJobId:id(5),jobs,pinned:[id(2)],now});
  assert.ok(p.protectedJobIds.includes(id(1))&&p.protectedJobIds.includes(id(2))&&p.protectedJobIds.includes(id(6)));
  assert.deepEqual(p.eligibleJobIds,[id(3)]);
});
test('missing parents, holes, cyclic parents, foreign scopes and unknown pins fail closed',()=>{
  const original=[job(1,'base',10),job(2,'delta',9),job(3,'base',0.1)];
  for(const change of [j=>j.splice(1,1),j=>j[1].parentJobId=id(3),j=>j[1].namespace='ats-rehearsal-continuous-111111111111',j=>j[1].bindingSha256='c'.repeat(64),j=>{j[0].verifiedAt=null;j[0].componentSha256=null;}]){
    const jobs=structuredClone(original);change(jobs);assert.throws(()=>plan(jobs));
  }
  assert.throws(()=>planNativeChainRetention({namespace,bindingSha256,headJobId:id(3),jobs:original,pinned:[id(99)],now}));
});
test('retry IDs at the same sequence retain failed evidence without confusing the admitted chain',()=>{
  const first=job(1,'base',12),failed={...job(2,'delta',11,false),id:id(99)},retry=job(2,'delta',10),next=job(3,'base',0.1);
  const p=planNativeChainRetention({namespace,bindingSha256,headJobId:next.id,jobs:[next,failed,first,retry],now});
  assert.ok(p.protectedJobIds.includes(first.id)&&p.protectedJobIds.includes(failed.id));
  assert.equal(p.objectDeletionAllowed,false);
  assert.equal(p.observedSourceSha256,planNativeChainRetention({namespace,bindingSha256,headJobId:next.id,jobs:[retry,first,failed,next],now}).observedSourceSha256);
});
test('retirement observations bind the head and immutable component identities',()=>{
  const jobs=[job(1,'base',10),job(2,'base',9),job(3,'base',0.1)],p=plan(jobs);
  const changed=structuredClone(jobs);changed[0].componentSha256='c'.repeat(64);
  assert.notEqual(plan(changed).observedSourceSha256,p.observedSourceSha256);
  assert.notEqual(planNativeChainRetention({namespace,bindingSha256,headJobId:id(2),jobs,now}).observedSourceSha256,p.observedSourceSha256);
});
