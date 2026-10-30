// Completing a backup is not permission to introduce a second production writer.
// This private operator record is written only after the actual cutover checks.
import assert from 'node:assert/strict';
import {recoveryProfileFor} from './recovery-profile-context.mjs';
export function assertPrimaryHandoff(approval,binding,{verifiedProfile}={}){
 if(Object.hasOwn(binding??{},'installationOverlaySha256'))recoveryProfileFor(binding,verifiedProfile);
 assert.equal(approval.version,1);
 assert.equal(approval.project,'ats_crm_primary_20261029');
 assert.equal(approval.vm,'ats-crm-primary-20261029');
 assert.equal(approval.phase,'single-primary-ready','Final single-writer handoff has not been completed');
 assert.equal(approval.oldManagedWriterFenced,true,'The managed writer must be fenced first');
 assert.equal(approval.sourceMigrationCount,102);
 assert.ok(Number.isSafeInteger(approval.generation)&&approval.generation>=2);
 assert.equal(approval.generation,binding.generation);
 assert.equal(approval.systemIdentifier,binding.systemIdentifier);
 const h=approval.handoff;
 assert.ok(h&&typeof h==='object','Final private handoff evidence is required');
 assert.equal(h.managedProject,'ddvlnixdugcbnrewktes');
 assert.equal(h.releaseSource,'8fa9df32c95a2e6d6a72c77422391ae7b9ca7528');
 assert.equal(h.managedApiAccessDenied,true);
 assert.equal(h.managedApiSessions,0);
 for(const name of ['finalSnapshotVerified','historyIdentifiersVerified','integrationCredentialsVerified','customerWorkersHeld','oldSchedulerHeld'])
  assert.equal(h[name],true,'Incomplete handoff: '+name);
 return true;
}
