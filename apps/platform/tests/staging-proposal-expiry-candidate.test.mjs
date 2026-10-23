import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {parseArgs,verifySources,verifyEvidence,sha,canonical,root,stagingRef} from '../scripts/release/verify-staging-proposal-expiry-candidate.mjs';
const read=p=>readFileSync(new URL(p,root));
const candidate=JSON.parse(read('supabase/staging/proposal-expiry-candidate-117.json'));
const files=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort();
const copy=x=>structuredClone(x);
function fixture(){
 const c=copy(candidate),e={projectRef:stagingRef,observedAt:1000,identity:copy(c.identity),catalog:copy(c.expectedCatalog),approvalSha256:c.expectedApprovalSha256,
  ledger:c.migrations.map(f=>{const i=f.name.indexOf('_');return {version:f.name.slice(0,i),name:f.name.slice(i+1,-4),statements:['synthetic native history']};}),
  records:{synthetic:'unchanged'},settings:{automated_sending_enabled:false,appointment_change_notices_enabled:false},recurringSettings:{automated_generation_enabled:false},guard:{synthetic:'unchanged'}};
 e.ledger[116]=copy(c.expectedLastMigration);c.previousLedgerSha256=sha(canonical(e.ledger.slice(0,116)));c.protectedStateSha256=sha(canonical({records:e.records,settings:e.settings,recurringSettings:e.recurringSettings,guard:e.guard}));return {c,e};
}
test('117 candidate binds every migration and its read-only snapshot source',()=>{assert.equal(verifySources(candidate).expectedMigrationCount,117);});
test('117 candidate refuses changed migration or snapshot bytes and unknown inventory',()=>{
 for(const target of ['supabase/migrations/20261023015338_enforce_proposal_expiry.sql','supabase/staging/proposal-expiry-snapshot-117.sql'])assert.throws(()=>verifySources(candidate,p=>p===target?Buffer.from('changed'):read(p),files));
 assert.throws(()=>verifySources(candidate,read,[...files,'99999999999999_unreviewed.sql']));
});
test('117 maintenance refuses production, apply and other write flags before querying',()=>{
 for(const args of [['--project-ref','ddvlnixdugcbnrewktes'],['--project-ref',stagingRef,'--apply'],['--project-ref',stagingRef,'--repair'],['--project-ref',stagingRef,'--deploy']])assert.throws(()=>parseArgs(args));
 assert.deepEqual(parseArgs(['--project-ref',stagingRef,'--print-sql']),{printSql:true});
});
test('117 candidate cannot grant production or deployment readiness',()=>{for(const key of ['productionReady','deployed']){const c=copy(candidate);c[key]=true;assert.throws(()=>verifySources(c));}});
test('117 exact evidence preserves native history, schema and protected state',()=>{const {e,c}=fixture();assert.equal(verifyEvidence(e,c,1000).migrationCount,117);});
test('117 evidence requires fresh observation and exact physical staging identity',()=>{
 for(const change of [e=>e.observedAt=-1000000,e=>e.observedAt=1001,e=>e.projectRef='ddvlnixdugcbnrewktes',e=>e.identity.systemIdentifier='other']){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('117 evidence rejects changed original history, final statements and extra ledger entries',()=>{
 for(const change of [e=>e.ledger[0].statements.push('changed'),e=>e.ledger[116].statements.push('changed'),e=>e.ledger.pop(),e=>e.ledger.push(copy(e.ledger[116]))]){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('117 evidence rejects wider permissions, body drift and unrelated schema changes',()=>{
 for(const change of [e=>e.catalog.approvalMetadata.acl.push({grantee:'anon',privilege:'EXECUTE'}),e=>e.catalog.unchangedObjectsSha256='changed',e=>e.approvalSha256='changed']){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('117 evidence rejects changed business history, email guard and automation settings',()=>{
 for(const change of [e=>e.records.synthetic='changed',e=>e.guard.synthetic='changed',e=>e.settings.automated_sending_enabled=true,e=>e.settings.appointment_change_notices_enabled=true,e=>e.recurringSettings.automated_generation_enabled=true]){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
