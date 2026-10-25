// Read-only maintenance for the installed 125 target. No installation path.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifySources as priorSources,canonical,sha,parseArgs,stagingRef,root} from './verify-staging-firewood-terms-candidate.mjs';
export {canonical,sha,parseArgs,stagingRef,root};
const read=path=>readFileSync(new URL(path,root));
const addedKeys=[
 'index|app_private.outbound_deliveries_record_context',
 'routine|app_private.read_record_delivery_requests(p_record_type text, p_record_id uuid, p_page integer)',
 'routine|public.list_record_delivery_requests(p_record_type text, p_record_id uuid, p_page integer)',
];
const objectKey=x=>x.kind+'|'+x.key;
export function verifySources(candidate,reader=read,inventory=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort()){
 const prior=priorSources(JSON.parse(reader('supabase/staging/firewood-terms-candidate-124.json')),reader,inventory);
 assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
 assert.equal(candidate.previousMigrationCount,124);assert.equal(candidate.expectedMigrationCount,125);
 assert.equal(candidate.productionReady,false);assert.equal(candidate.deployed,false);
 assert.deepEqual(candidate.migrations.slice(0,124),prior.migrations);
 for(const [next,previous]of [['identity','identity'],['previousCatalog','expectedCatalog'],['expectedApprovalSha256','expectedApprovalSha256'],['expectedDocumentTerms','expectedDocumentTerms'],['protectedStateSha256','protectedStateSha256']])assert.deepEqual(candidate[next],prior[previous],'Prior checkpoint protections changed: '+next);
 const pinned=candidate.migrations.map(x=>x.name);assert.equal(pinned.length,125);assert.equal(pinned.at(-1),'20261025173049_record_delivery_visibility.sql');
 const later=inventory.filter(name=>!pinned.includes(name)),deferred=JSON.parse(reader('supabase/staging/deferred-migrations.json'));
 assert.equal(deferred.readyForHosting,false);
 for(const name of later){const entry=deferred.migrations.find(x=>x.name===name);assert.ok(name>pinned.at(-1)&&entry,'Unreviewed later migration.');assert.equal(sha(reader('supabase/migrations/'+name)),entry.sha256,'Later source bytes changed.');}
 assert.deepEqual(inventory,[...pinned,...later].sort(),'Migration inventory changed.');
 for(const f of candidate.migrations)assert.equal(sha(reader('supabase/migrations/'+f.name)),f.sha256,'Migration bytes changed: '+f.name);
 assert.equal(sha(reader('supabase/staging/record-delivery-snapshot-125.sql')),candidate.snapshotSqlSha256,'Snapshot query changed.');
 assert.equal(sha(reader('supabase/staging/firewood-terms-candidate-124.json')),candidate.previousCandidateSha256,'Prior checkpoint changed.');
 return candidate;
}
export function verifyEvidence(e,candidate,now=Date.now()){
 assert.equal(e.projectRef,stagingRef);assert.ok(Number.isFinite(e.observedAt)&&e.observedAt<=now&&now-e.observedAt<=900000,'Fresh evidence required.');
 assert.deepEqual(e.identity,candidate.identity,'Physical staging identity changed.');assert.equal(e.ledger.length,125);
 assert.deepEqual(e.ledger.map(x=>({version:x.version,name:x.name})),candidate.migrations.map(f=>{const i=f.name.indexOf('_');return {version:f.name.slice(0,i),name:f.name.slice(i+1,-4)};}),'Exact migration identities required.');
 assert.equal(sha(canonical(e.ledger.slice(0,124))),candidate.previousLedgerSha256,'Original native history changed.');assert.deepEqual(e.ledger.at(-1),candidate.expectedLastMigration,'Native migration 125 statements changed.');
 assert.deepEqual({count:e.catalog.length,sha256:sha(canonical(e.catalog))},candidate.expectedCatalog,'Full catalog or permissions changed.');
 const additions=e.catalog.filter(x=>addedKeys.includes(objectKey(x)));assert.deepEqual(additions.map(objectKey).sort(),[...addedKeys].sort(),'Reader or index missing.');
 for(const x of additions){if(x.kind==='index'){assert.deepEqual(x.value,{ready:true,valid:true,definition:'CREATE INDEX outbound_deliveries_record_context ON app_private.outbound_deliveries USING gin (context jsonb_path_ops)'});continue;}
  assert.equal(x.value.definer,x.key.startsWith('app_private.'));assert.equal(x.value.owner,'postgres');assert.equal(x.value.volatility,'s');assert.equal(x.value.language,'plpgsql');assert.equal(x.value.returns,'jsonb');assert.deepEqual(x.value.config,['search_path=""']);
  assert.deepEqual(x.value.acl.map(a=>[a.grantee,a.grantor,a.privilege,a.grantable]),[['authenticated','postgres','EXECUTE',false],['postgres','postgres','EXECUTE',false]],'Reader execution rights changed.');
 }
 // Only the three reviewed additions are removed for the immutable old catalog seal.
 const oldCatalog=e.catalog.filter(x=>!addedKeys.includes(objectKey(x)));
 assert.deepEqual({count:oldCatalog.length,sha256:sha(canonical(oldCatalog))},candidate.previousCatalog,'Prior schema or permissions changed.');
 assert.equal(e.approvalSha256,candidate.expectedApprovalSha256);assert.deepEqual(e.documentTerms,candidate.expectedDocumentTerms);
 assert.equal(sha(canonical({records:e.records,settings:e.settings,recurringSettings:e.recurringSettings,guard:e.guard})),candidate.protectedStateSha256,'Protected business/Auth/history/settings changed.');
 assert.equal(e.settings.automated_sending_enabled,false);assert.equal(e.settings.appointment_change_notices_enabled,false);assert.equal(e.recurringSettings.automated_generation_enabled,false);
 assert.equal(e.documentTerms.columnCount,2);assert.equal(e.documentTerms.invalidQuotes,0);assert.equal(e.documentTerms.invalidInvoices,0);
 assert.match(e.documentTerms.invoiceBindingsSha256,/^[a-f0-9]{64}$/);assert.match(e.documentTerms.quoteBindingsSha256,/^[a-f0-9]{64}$/);
 return {projectRef:stagingRef,migrationCount:125,latestMigration:'20261025173049',catalogObjects:e.catalog.length,originalLedgerAndProtectedStatePreserved:true,readOnlyRecordDeliveryBoundaryPreserved:true,priorTermsRemindersAndApprovalExpiryPreserved:true,readOnly:true,productionReady:false};
}
function run(){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){console.log('verify-staging-record-delivery-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng [--print-sql]\nRead-only; exact migration 125, native history, full catalog/ACLs, invoker/private metadata reader boundary and GIN index, prior immutable terms, effective-access RLS, reminders, Auth guard and OFF automation. No writes, repairs, deployments or keys.');return;}
 const mode=parseArgs(args),candidate=verifySources(JSON.parse(read('supabase/staging/record-delivery-candidate-125.json'))),sql=read('supabase/staging/record-delivery-snapshot-125.sql').toString();
 if(mode.printSql){console.log(sql);return;}
 const directory=mkdtempSync(join(tmpdir(),'ats-staging125-verify-')),file=join(directory,'snapshot.sql');writeFileSync(file,sql,{mode:0o600});
 const r=spawnSync(process.env.STAGING_SUPABASE_BIN||'supabase',['db','query','--linked','--project-ref',stagingRef,'--file',file,'--workdir',directory,'--output-format','json'],{encoding:'utf8',timeout:60000,maxBuffer:40*1024*1024,stdio:['ignore','pipe','pipe']});
 writeFileSync(join(directory,'response.private.log'),(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Read-only staging query failed; inspect '+directory);
 const value=JSON.parse(r.stdout),row=Array.isArray(value)?value[0]:value.rows[0],evidence={projectRef:stagingRef,observedAt:Date.now(),...row.evidence};
 const result=verifyEvidence(evidence,candidate);writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,evidenceDirectory:directory},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
