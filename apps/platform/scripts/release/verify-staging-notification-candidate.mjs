// Read-only maintenance verifier for the reviewed 95-migration staging target.
// Earlier installation tools/candidates remain historical and unchanged.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,mkdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {verifyQuoteChangeSources} from './verify-staging-quote-change-candidate.mjs';
import {sha,migrationIdentity} from './verify-staging-appointment-candidate.mjs';
import {loadSources,verifyActiveTarget,identitySQL,guardSQL} from './staging-auth-activation.mjs';
import {snapshotSQL,assertTarget,stagingRef} from './staging-permissions.mjs';
const root=new URL('../../../../',import.meta.url);
export const notificationStateSQL=`select jsonb_build_object(
 'preparations',(select count(*) from app_private.customer_activity_preparations),
 'links',(select count(*) from app_private.customer_activity_deliveries),
 'activities',(select count(*) from public.activity_log),
 'notifications',(select count(*) from public.admin_notifications),
 'deliveries',(select count(*) from app_private.outbound_deliveries),
 'requests',(select count(*) from app_private.outbound_delivery_requests),
 'attempts',(select count(*) from app_private.outbound_delivery_attempts),
 'providerEvents',(select count(*) from app_private.outbound_provider_events),
 'suppressions',(select count(*) from app_private.email_suppressions),
 'emailEvents',(select count(*) from public.email_events))`;
export const emptyNotificationState={preparations:0,links:0,activities:0,notifications:0,deliveries:0,requests:0,attempts:0,providerEvents:0,suppressions:0,emailEvents:0};
export function verifyNotificationSources(read,inventory){
  const previous=verifyQuoteChangeSources(read,inventory);
  const candidate=JSON.parse(read('supabase/staging/notification-candidate-95.json'));
  assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
  assert.equal(candidate.previousCandidateCount,94);assert.equal(candidate.expectedMigrationCount,95);
  assert.equal(candidate.previousCandidateSha256,sha(read('supabase/staging/quote-change-candidate-94.json')));
  assert.equal(candidate.migrationManifestSha256,previous.candidate.migrationManifestSha256);
  assert.equal(candidate.catalogQuerySha256,sha(read('supabase/verification/release_catalog.sql')));
  assert.equal(candidate.additionalMigration.name,'20261020060328_atomic_customer_activity_notifications.sql');
  assert.equal(candidate.additionalMigration.sha256,sha(read('supabase/migrations/'+candidate.additionalMigration.name)));
  const files=[...previous.files,candidate.additionalMigration];
  assert.deepEqual(inventory,files.map(f=>f.name).sort(),'Unreviewed migration inventory.');
  assert.equal(candidate.catalogObjectCount,4782);assert.equal(candidate.delta.added.length,26);
  assert.deepEqual(candidate.delta.changed.map(r=>r.key),['routine|app_private.email_source_eligible(c jsonb, p jsonb)','routine|app_private.email_source_snapshot(c jsonb)']);
  assert.equal(candidate.delta.removed.length,0);
  assert.deepEqual(candidate.allowedOwnedDefaultsSeals,previous.candidate.allowedOwnedDefaultsSeals);
  assert.deepEqual(candidate.allowedManagedDefaultsSeals,previous.candidate.allowedManagedDefaultsSeals);
  assert.equal(candidate.productionWrites,false);assert.equal(candidate.deployed,false);assert.equal(candidate.readyForHosting,false);
  return {candidate,files};
}
export function currentNotificationSources(){
  const read=p=>readFileSync(new URL(p,root));
  return {...loadSources(),...verifyNotificationSources(read,readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort())};
}
export function verifyNotificationTarget(evidence,profile,activeProfile,now=Date.now(),sources=currentNotificationSources()){
  assert.equal(evidence.privateChangeRequests,0,'Staging quote retry receipts must remain empty.');
  assert.deepEqual(evidence.notificationState,emptyNotificationState,'Notification preparation, history and delivery state must remain empty.');
  assert.deepEqual(evidence.ledger,sources.files.map(f=>migrationIdentity(f.name)),'Exact 95-entry ledger required.');
  return {...verifyActiveTarget(evidence,profile,activeProfile,now,sources),privateChangeRequests:0,notificationState:emptyNotificationState};
}
function run(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('verify-staging-notification-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng --auth-config-file /private/fresh-managed-config.json\nRead-only. Exact95 ledger/catalog, private notification and delivery state empty, active Auth guard and OFF switches. No apply, deployment, config patch or key retrieval.');return;
  }
  assert.equal(args.length,4,'Only read-only review arguments are supported.');
  assert.deepEqual(args.slice(0,3),['--project-ref',stagingRef,'--auth-config-file'],'Only assigned staging is supported.');
  const stats=statSync(args[3]);assert.ok(stats.isFile()&&(stats.mode&0o077)===0,'Use a private configuration file.');
  const observedAt=Math.floor(stats.mtimeMs);assert.ok(observedAt<=Date.now()&&Date.now()-observedAt<=900000,'Fresh configuration required.');
  const config=JSON.parse(readFileSync(args[3]));assert.equal(config?.data?.id,stagingRef);
  const sources=currentNotificationSources(),directory=mkdtempSync(join(tmpdir(),'ats-staging95-verify-'));mkdirSync(join(directory,'supabase'));
  writeFileSync(join(directory,'supabase/config.toml'),'project_id="ats_staging95_verify"\n[db.seed]\nenabled=false\n');
  const cli=process.env.STAGING_SUPABASE_BIN||'supabase';
  function call(argv,phase){try{
    const raw=execFileSync(cli,[...argv,'--workdir',directory,'--output-format','json'],{encoding:'utf8',maxBuffer:12*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
    writeFileSync(join(directory,phase+'.private.json'),raw,{mode:0o600});return JSON.parse(raw);
  }catch(e){writeFileSync(join(directory,phase+'.private.log'),String(e.stderr??e.message),{mode:0o600});throw Error('Read-only check failed; inspect '+directory);}}
  const projects=call(['projects','list'],'projects');assertTarget(stagingRef,projects);
  const file=join(directory,'snapshot.sql');writeFileSync(file,`begin read only;set local statement_timeout='20s';select jsonb_build_object('identity',(${identitySQL}),'snapshot',(${snapshotSQL(sources.catalog)}),'guardState',(${guardSQL}),'privateChangeRequests',(select count(*) from app_private.quote_change_requests),'notificationState',(${notificationStateSQL}),'ledger',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)) evidence;commit;`,{mode:0o600});
  const evidence=call(['db','query','--linked','--project-ref',stagingRef,'--file',file],'database').rows[0].evidence;
  const profile=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/target-review.json',root))),active=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/active-profile.json',root)));
  const result={...verifyNotificationTarget({...evidence,projects,config,observedAt},profile,active,Date.now(),sources),evidenceDirectory:directory};
  writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
