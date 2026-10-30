// Explicit source identities. Production is never inferred from archive claims:
// the verifier must supply the independently registered expected binding.
import assert from 'node:assert/strict';
export function backupSourceScope(binding){
 if(binding?.environment===undefined){
  if(binding){assert.equal(binding.sourceId,'ats_crm_candidate_20261027');assert.match(binding.namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);}
  return {syntheticOnly:true,project:'ats_crm_candidate_20261027',root:'/home/noelsierra.guest/candidate',tenant:/^ats_candidate_[a-f0-9]{12}$/};
 }
 assert.equal(binding.environment,'home-primary-v1');assert.equal(binding.sourceId,'ats_crm_primary_20261029');
 assert.match(binding.namespace,/^ats-home-continuous-[a-f0-9]{12}$/);assert.equal(binding.sourceMigrationCount,102);
 assert.equal(binding.captureMode,'transaction-barrier');assert.equal(binding.privateFileFormat,'patch-v1');
 assert.equal(binding.admissionProtocol,'certified-native-wal-v1');
 return {syntheticOnly:false,project:'ats_crm_primary_20261029',root:'/home/noelsierra.guest/primary',tenant:/^ats_primary_[a-f0-9]{12}$/};
}
export function onlineBackupSourceScope(io){
 const scope=backupSourceScope(io.productionBinding);
 assert.equal(io.project,scope.project);assert.equal(io.root,scope.root);
 assert.equal(process.env[scope.syntheticOnly?'ATS_TABLE_BARRIER_REHEARSAL':'ATS_HOME_PRIMARY_OPERATION'],'1');
 return scope;
}
