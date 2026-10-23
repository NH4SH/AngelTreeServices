import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parseArgs,verifySources,verifyEvidence,sha,canonical,root,stagingRef} from '../scripts/release/verify-staging-bulk-reminder-candidate.mjs';
const read=p=>readFileSync(new URL(p,root));
const candidate=JSON.parse(read('supabase/staging/bulk-reminder-candidate-121.json'));
const files=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort();
const copy=x=>structuredClone(x);
function fixture(){
 const c=copy(candidate),e={projectRef:stagingRef,observedAt:1000,identity:copy(c.identity),approvalSha256:c.expectedApprovalSha256,documentTerms:copy(c.expectedDocumentTerms),
  catalog:[{kind:'routine',key:'app_private.email_source_eligible(c jsonb, p jsonb)',value:{definer:false,bodyHash:'eligibility',acl:[{grantee:'postgres',privilege:'EXECUTE'}]}},
    {kind:'routine',key:'public.cancel_obsolete_visit_reminders(p_source_kind text, p_sources jsonb)',value:{definer:false,bodyHash:'checked-cleanup',acl:[{grantee:'service_role',privilege:'EXECUTE'}]}}],
  ledger:c.migrations.map(f=>{const i=f.name.indexOf('_');return {version:f.name.slice(0,i),name:f.name.slice(i+1,-4),statements:['synthetic native history']};}),
  records:{synthetic:'unchanged'},settings:{automated_sending_enabled:false,appointment_change_notices_enabled:false},recurringSettings:{automated_generation_enabled:false},guard:{synthetic:'unchanged'}};
 e.ledger[120]=copy(c.expectedLastMigration);c.previousLedgerSha256=sha(canonical(e.ledger.slice(0,120)));
 c.expectedCatalog={count:e.catalog.length,sha256:sha(canonical(e.catalog))};
 c.protectedStateSha256=sha(canonical({records:e.records,settings:e.settings,recurringSettings:e.recurringSettings,guard:e.guard}));return {c,e};
}
test('121 maintenance pins original migration sources and its read-only snapshot',()=>{assert.equal(verifySources(candidate).expectedMigrationCount,121);});
test('121 maintenance refuses changed sources, deleted sources and unknown later migrations',()=>{
 for(const target of ['supabase/migrations/20261023232306_bulk_obsolete_visit_reminder_cleanup.sql','supabase/staging/bulk-reminder-snapshot-121.sql'])assert.throws(()=>verifySources(candidate,p=>p===target?Buffer.from('changed'):read(p),files));
 assert.throws(()=>verifySources(candidate,read,files.slice(1)));assert.throws(()=>verifySources(candidate,read,[...files,'99999999999999_unreviewed.sql']));
});
test('121 maintenance refuses production and write flags before invoking external tools',()=>{
 for(const args of [['--project-ref','ddvlnixdugcbnrewktes'],['--project-ref',stagingRef,'--apply'],['--project-ref',stagingRef,'--repair'],['--project-ref',stagingRef,'--deploy']]){
  assert.throws(()=>parseArgs(args));
  const r=spawnSync(process.execPath,[new URL('../scripts/release/verify-staging-bulk-reminder-candidate.mjs',import.meta.url).pathname,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',STAGING_SUPABASE_BIN:'/does/not/exist'}});
  assert.equal(r.status,1);assert.doesNotMatch(r.stderr,/ENOENT|private evidence/);
 }
 assert.deepEqual(parseArgs(['--project-ref',stagingRef,'--print-sql']),{printSql:true});
});
test('121 maintenance cannot authorize production or deployment',()=>{for(const key of ['productionReady','deployed']){const c=copy(candidate);c[key]=true;assert.throws(()=>verifySources(c));}});
test('121 evidence accepts the reviewed target and native history',()=>{const {e,c}=fixture();assert.equal(verifyEvidence(e,c,1000).migrationCount,121);});
test('121 evidence requires a fresh observation of the exact physical staging database',()=>{
 for(const change of [e=>e.observedAt=-1000000,e=>e.observedAt=1001,e=>e.projectRef='ddvlnixdugcbnrewktes',e=>e.identity.systemIdentifier='other']){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('121 evidence refuses original history drift, altered installation statements and extra entries',()=>{
 for(const change of [e=>e.ledger[0].statements.push('changed'),e=>e.ledger[120].statements.push('changed'),e=>e.ledger.pop(),e=>e.ledger.push(copy(e.ledger[120]))]){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('121 evidence rejects widened rights, bulk cleanup or preserved expiry checkpoint drift and missing objects',()=>{
 for(const change of [e=>e.catalog[1].value.acl.push({grantee:'anon',privilege:'EXECUTE'}),e=>e.catalog[0].value.definer=true,e=>e.catalog[1].value.definer=true,e=>e.catalog[0].value.bodyHash='changed',e=>e.catalog[1].value.bodyHash='changed',e=>e.catalog.pop(),e=>e.approvalSha256='changed']){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('121 evidence rejects unbound documents or altered immutable-binding metadata',()=>{
 for(const change of [e=>e.documentTerms.columnCount=1,e=>e.documentTerms.invalidQuotes=1,e=>e.documentTerms.invalidInvoices=1,e=>e.documentTerms.comments.quotes='changed']){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
test('121 evidence rejects altered business history, email guard or enabled automation',()=>{
 for(const change of [e=>e.records.synthetic='changed',e=>e.guard.synthetic='changed',e=>e.settings.automated_sending_enabled=true,e=>e.settings.appointment_change_notices_enabled=true,e=>e.recurringSettings.automated_generation_enabled=true]){const {e,c}=fixture();change(e);assert.throws(()=>verifyEvidence(e,c,1000));}
});
