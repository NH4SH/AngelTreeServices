// Read-only maintenance for the reviewed 123 target. No installation path.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,sha,parseArgs,stagingRef,root} from './verify-staging-proposal-expiry-candidate.mjs';
export {canonical,sha,parseArgs,stagingRef,root};
const read=path=>readFileSync(new URL(path,root));
export function verifySources(candidate,reader=read,inventory=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort()){
 assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
 assert.equal(candidate.previousMigrationCount,122);assert.equal(candidate.expectedMigrationCount,123);
 assert.equal(candidate.productionReady,false);assert.equal(candidate.deployed,false);
 const pinned=candidate.migrations.map(x=>x.name);
 assert.equal(pinned.length,123);assert.equal(pinned.at(-1),'20261024014934_atomic_record_reminder_automation.sql');
 const later=inventory.filter(name=>!pinned.includes(name));
 const deferred=JSON.parse(reader('supabase/staging/deferred-migrations.json'));
 assert.equal(deferred.readyForHosting,false);
 for(const name of later){
  const entry=deferred.migrations.find(x=>x.name===name);
  assert.ok(name>pinned.at(-1)&&entry,'Unreviewed later migration.');
  assert.equal(sha(reader('supabase/migrations/'+name)),entry.sha256,'Later source bytes changed.');
 }
 assert.deepEqual(inventory,[...pinned,...later].sort(),'Migration inventory changed.');
 for(const f of candidate.migrations)assert.equal(sha(reader('supabase/migrations/'+f.name)),f.sha256,'Migration bytes changed: '+f.name);
 assert.equal(sha(reader('supabase/staging/record-automation-snapshot-123.sql')),candidate.snapshotSqlSha256,'Snapshot query changed.');
 return candidate;
}
export function verifyEvidence(e,candidate,now=Date.now()){
 assert.equal(e.projectRef,stagingRef);assert.ok(Number.isFinite(e.observedAt)&&e.observedAt<=now&&now-e.observedAt<=900000,'Fresh evidence required.');
 assert.deepEqual(e.identity,candidate.identity,'Physical staging identity changed.');
 assert.equal(e.ledger.length,123);
 assert.deepEqual(e.ledger.map(x=>({version:x.version,name:x.name})),candidate.migrations.map(f=>{const i=f.name.indexOf('_');return {version:f.name.slice(0,i),name:f.name.slice(i+1,-4)};}),'Exact migration identities required.');
 assert.equal(sha(canonical(e.ledger.slice(0,122))),candidate.previousLedgerSha256,'Original migration history changed.');
 assert.deepEqual(e.ledger.at(-1),candidate.expectedLastMigration,'Migration 123 statement history differs from native local rehearsal.');
 assert.deepEqual({count:e.catalog.length,sha256:sha(canonical(e.catalog))},candidate.expectedCatalog,'Schema, permissions, defaults or immutable terms binding changed.');
 assert.equal(e.approvalSha256,candidate.expectedApprovalSha256,'Proposal expiry enforcement changed.');
 assert.deepEqual(e.documentTerms,candidate.expectedDocumentTerms,'Document binding or comments changed.');
 assert.equal(e.documentTerms.columnCount,2);assert.equal(e.documentTerms.invalidQuotes,0);assert.equal(e.documentTerms.invalidInvoices,0);
 assert.equal(sha(canonical({records:e.records,settings:e.settings,recurringSettings:e.recurringSettings,guard:e.guard})),candidate.protectedStateSha256,'Business/Auth/history/settings or email guard changed.');
 assert.equal(e.settings.automated_sending_enabled,false);assert.equal(e.settings.appointment_change_notices_enabled,false);assert.equal(e.recurringSettings.automated_generation_enabled,false);
 return {projectRef:stagingRef,migrationCount:123,latestMigration:'20261024014934',catalogObjects:e.catalog.length,originalLedgerAndProtectedStatePreserved:true,recordAutomationCommandMatchesLocalRehearsal:true,priorFollowupExpiryPreserved:true,approvalExpiryAndTermsPreserved:true,readOnly:true,productionReady:false};
}
function run(){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){console.log('verify-staging-record-automation-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng [--print-sql]\nRead-only; exact migration 123, native statement history, full catalog/permissions, atomic record reminder command, caller rights and effective-access RLS, prior proposal expiry checkpoints, Auth guard and disabled automation. No keys, writes, repairs or deployments.');return;}
 const mode=parseArgs(args),candidate=verifySources(JSON.parse(read('supabase/staging/record-automation-candidate-123.json'))),sql=read('supabase/staging/record-automation-snapshot-123.sql').toString();
 if(mode.printSql){console.log(sql);return;}
 const directory=mkdtempSync(join(tmpdir(),'ats-staging123-verify-')),file=join(directory,'snapshot.sql');writeFileSync(file,sql,{mode:0o600});
 const r=spawnSync(process.env.STAGING_SUPABASE_BIN||'supabase',['db','query','--linked','--project-ref',stagingRef,'--file',file,'--workdir',directory,'--output-format','json'],{encoding:'utf8',timeout:60000,maxBuffer:40*1024*1024,stdio:['ignore','pipe','pipe']});
 writeFileSync(join(directory,'response.private.log'),(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Read-only staging query failed; inspect '+directory);
 const evidence={projectRef:stagingRef,observedAt:Date.now(),...((value)=>{const row=Array.isArray(value)?value[0]:value.rows[0];return row.evidence;})(JSON.parse(r.stdout))};
 const result=verifyEvidence(evidence,candidate);writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,evidenceDirectory:directory},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
