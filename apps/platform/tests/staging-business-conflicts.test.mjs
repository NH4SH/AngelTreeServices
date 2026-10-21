import assert from 'node:assert/strict';
import test from 'node:test';
import {currentConflictSources,verifyConflictEvidence,conflictEvidenceSQL} from '../scripts/release/verify-staging-business-conflicts.mjs';
import {migrationIdentity} from '../scripts/release/verify-staging-appointment-candidate.mjs';
const sources=currentConflictSources();
const evidence=()=>({ledger:sources.files.map(f=>migrationIdentity(f.name)),snapshot:{...sources.candidate.expectedCatalog},functions:structuredClone(sources.candidate.functions),manualSerializationRaises:0,communications:false,recurring:false,authGuard:'3217b69110500f25a29e85e4cb945b7f'});
test('staging101 binds original migration bytes and the 23 reviewed conflict functions',()=>{
 assert.equal(sources.files.length,101);assert.equal(verifyConflictEvidence(evidence(),sources).productionReady,false);
 assert.match(conflictEvidenceSQL(sources),/manualSerializationRaises/);
});
test('old ledgers, changed security metadata, manual retry codes, automation or Auth guard drift fail closed',()=>{
 for(const mutate of [e=>e.ledger.pop(),e=>e.snapshot.apiAclSeal='changed',e=>e.functions[0].md5='changed',e=>e.manualSerializationRaises=1,e=>e.communications=true,e=>e.recurring=true,e=>e.authGuard='changed']){
  const e=evidence();mutate(e);assert.throws(()=>verifyConflictEvidence(e,sources));
 }
});
