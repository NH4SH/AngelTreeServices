import {test} from 'node:test';import assert from 'node:assert/strict';import {assertPrimaryHandoff} from './primary-handoff-approval.mjs';
const binding={generation:2,systemIdentifier:'7701955335415689249'};
function complete(){return {version:1,project:'ats_crm_primary_20261029',vm:'ats-crm-primary-20261029',phase:'single-primary-ready',oldManagedWriterFenced:true,sourceMigrationCount:102,...binding,handoff:{managedProject:'ddvlnixdugcbnrewktes',releaseSource:'8fa9df32c95a2e6d6a72c77422391ae7b9ca7528',managedApiAccessDenied:true,managedApiSessions:0,finalSnapshotVerified:true,historyIdentifiersVerified:true,integrationCredentialsVerified:true,customerWorkersHeld:true,oldSchedulerHeld:true}};}
test('a valid backup does not authorize the pre-copy to become a second writer',()=>{
 const a=complete();a.phase='precopy-readonly';a.oldManagedWriterFenced=false;assert.throws(()=>assertPrimaryHandoff(a,binding));
 assert.throws(()=>assertPrimaryHandoff({...complete(),handoff:undefined},binding));
 for(const name of ['finalSnapshotVerified','historyIdentifiersVerified','integrationCredentialsVerified','customerWorkersHeld','oldSchedulerHeld','managedApiAccessDenied']){
  const a=complete();a.handoff[name]=false;assert.throws(()=>assertPrimaryHandoff(a,binding),name);
 }
 const active=complete();active.handoff.managedApiSessions=1;assert.throws(()=>assertPrimaryHandoff(active,binding));
});
test('handoff is bound to the exact published release, database and writer generation',()=>{
 assert.equal(assertPrimaryHandoff(complete(),binding),true);
 for(const change of [{generation:1},{generation:3},{systemIdentifier:'7701955335415689250'},{sourceMigrationCount:129},{oldManagedWriterFenced:false}])
  assert.throws(()=>assertPrimaryHandoff({...complete(),...change},binding));
 for(const change of [{releaseSource:'unreleased-main'},{managedProject:'gbyhdsuiqeslgjdnbqng'}])
  assert.throws(()=>assertPrimaryHandoff({...complete(),handoff:{...complete().handoff,...change}},binding));
 const a=complete();delete a.handoff.integrationCredentialsVerified;assert.throws(()=>assertPrimaryHandoff(a,binding));
});
