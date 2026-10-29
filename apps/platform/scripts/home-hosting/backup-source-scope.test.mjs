import {test} from 'node:test';import assert from 'node:assert/strict';import {backupSourceScope,onlineBackupSourceScope} from './backup-source-scope.mjs';
const binding={environment:'home-primary-v1',sourceId:'ats_crm_primary_20261029',namespace:'ats-home-continuous-abcdef123456',sourceMigrationCount:102,captureMode:'transaction-barrier',privateFileFormat:'patch-v1',admissionProtocol:'certified-native-wal-v1'};
test('a production archive requires an explicit registered production identity',()=>{
 assert.equal(backupSourceScope().syntheticOnly,true);assert.equal(backupSourceScope(binding).syntheticOnly,false);
 for(const changes of [{environment:undefined},{sourceId:'ats_crm_candidate_20261027'},{namespace:'ats-rehearsal-continuous-abcdef123456'},{sourceMigrationCount:129},{privateFileFormat:undefined},{captureMode:'quiesced-source'},{admissionProtocol:'archive-only'}])assert.throws(()=>backupSourceScope({...binding,...changes}));
});
test('live producer selection also requires its own operation flag and exact local root',()=>{
 const io={project:binding.sourceId,root:'/home/noelsierra.guest/primary',productionBinding:binding};const previous=process.env.ATS_HOME_PRIMARY_OPERATION;
 try{delete process.env.ATS_HOME_PRIMARY_OPERATION;assert.throws(()=>onlineBackupSourceScope(io));process.env.ATS_HOME_PRIMARY_OPERATION='1';assert.equal(onlineBackupSourceScope(io).syntheticOnly,false);
  assert.throws(()=>onlineBackupSourceScope({...io,project:'ats_crm_candidate_20261027'}));assert.throws(()=>onlineBackupSourceScope({...io,root:'/home/noelsierra.guest/candidate'}));
 }finally{if(previous===undefined)delete process.env.ATS_HOME_PRIMARY_OPERATION;else process.env.ATS_HOME_PRIMARY_OPERATION=previous;}
});
