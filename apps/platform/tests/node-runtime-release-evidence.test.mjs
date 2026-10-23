import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyRuntimeEvidence} from '../scripts/release/verify-node-runtime-evidence.mjs';
const deploy='a'.repeat(24),now=1000000;
const fixture=()=>({siteId:'d81d923d-6ccf-4c1e-87cc-263f3d51555d',deployId:deploy,observedAt:now,
 packagedFunctions:[{name:'___netlify-server-handler',runtime:'nodejs22.x'}],deployedFunctions:[{name:'___netlify-server-handler',runtime:'nodejs22.x'}],
 executionRecords:[{functionName:'___netlify-server-handler',deployId:deploy,nodeVersion:'v22.23.4'}]});
test('fresh staging receipt binds actual patched execution to the exact deployed function',()=>assert.equal(verifyRuntimeEvidence(fixture(),'staging',deploy,now).functionsVerified,1));
test('observed expired-cache failure cannot pass from a Node22 artifact manifest alone',()=>{
 const e=fixture();e.deployedFunctions[0].runtime='nodejs24.x';e.executionRecords[0].nodeVersion='v24.21.0';
 assert.throws(()=>verifyRuntimeEvidence(e,'staging',deploy,now));
});
test('an optimistic label, forged patched flag, missing logs or a different deployment cannot replace runtime proof',()=>{
 for(const change of [e=>e.executionRecords[0].nodeVersion='v22.23.3',e=>{e.executionRecords[0].nodeVersion='v24.21.0';e.executionRecords[0].patched=true;},e=>e.executionRecords=[],e=>e.executionRecords[0].deployId='b'.repeat(24),e=>e.deployedFunctions.push({...e.deployedFunctions[0]})]){
  const e=fixture();change(e);assert.throws(()=>verifyRuntimeEvidence(e,'staging',deploy,now));
 }
});
test('unknown targets and stale or future receipts fail without taking any action',()=>{
 for(const change of [e=>e.siteId='different',e=>e.observedAt=0,e=>e.observedAt=now+1,e=>e.deployId='b'.repeat(24)]){const e=fixture();change(e);assert.throws(()=>verifyRuntimeEvidence(e,'staging',deploy,now));}
 assert.throws(()=>verifyRuntimeEvidence(fixture(),'unknown',deploy,now));
});
test('production requires all six functions rather than borrowing the staging server result',()=>{
 const e=fixture();e.siteId='6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0';assert.throws(()=>verifyRuntimeEvidence(e,'production',deploy,now));
});
