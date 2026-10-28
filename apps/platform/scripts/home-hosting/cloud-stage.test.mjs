import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {verifyCloudStage} from './verify-cloud-stage.mjs';
const profile=JSON.parse(readFileSync(new URL('./cloud-stage-profile.json',import.meta.url)));
test('reviewed lab entries remain separate from the unchanged application lineage',()=>assert.equal(verifyCloudStage(profile).applicationMigrations,129));
test('unknown maintenance, altered SQL and broadened client access fail the staging check',()=>{
 for(const mutate of [p=>p.maintenance.push({...p.maintenance[0],version:'20261028030000'}),p=>p.maintenance[0].statementsMd5='0'.repeat(32),p=>p.applicationLedgerMd5='0'.repeat(32),p=>p.labPermissionsClosed=false,p=>p.labTablesClosed=false,p=>p.projectRef='production']){
  const changed=structuredClone(profile);mutate(changed);assert.throws(()=>verifyCloudStage(changed));
 }
});
