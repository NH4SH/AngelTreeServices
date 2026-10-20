// Read-only maintenance verifier for the reviewed 94-migration staging target.
// Historical 92/93 source manifests and installation tools remain pinned.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,mkdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {verifySources,sha,migrationIdentity} from './verify-staging-appointment-candidate.mjs';
import {loadSources,verifyActiveTarget,identitySQL,guardSQL} from './staging-auth-activation.mjs';
import {snapshotSQL,assertTarget,stagingRef} from './staging-permissions.mjs';
const root=new URL('../../../../',import.meta.url);
export function verifyQuoteChangeSources(read,inventory){
  const previous=JSON.parse(read('supabase/staging/appointment-candidate-93.json'));
  const historic=verifySources(previous,read,inventory);
  const candidate=JSON.parse(read('supabase/staging/quote-change-candidate-94.json'));
  assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
  assert.equal(candidate.previousCandidateCount,93);assert.equal(candidate.expectedMigrationCount,94);
  assert.equal(candidate.previousCandidateSha256,sha(read('supabase/staging/appointment-candidate-93.json')));
  assert.equal(candidate.catalogQuerySha256,sha(read('supabase/verification/release_catalog.sql')));
  assert.equal(candidate.additionalMigration.name,'20261020051222_atomic_customer_quote_changes.sql');
  assert.equal(candidate.additionalMigration.sha256,sha(read('supabase/migrations/'+candidate.additionalMigration.name)));
  assert.equal(candidate.productionWrites,false);assert.equal(candidate.deployed,false);assert.equal(candidate.readyForHosting,false);
  const files=[...historic,candidate.additionalMigration];
  const deferred=JSON.parse(read('supabase/staging/deferred-migrations.json')).migrations.filter(f=>!files.some(known=>known.name===f.name));
  assert.ok(deferred.every(f=>f.name>candidate.additionalMigration.name),'Local-only changes must follow candidate94.');
  assert.deepEqual(inventory,[...files,...deferred].map(f=>f.name).sort(),'Unreviewed migration inventory.');
  assert.equal(candidate.delta.changed.length,0);assert.equal(candidate.delta.removed.length,0);
  assert.deepEqual(candidate.allowedOwnedDefaultsSeals,previous.allowedOwnedDefaultsSeals);
  assert.deepEqual(candidate.allowedManagedDefaultsSeals,previous.allowedManagedDefaultsSeals);
  return {candidate,files};
}
export function currentQuoteChangeSources(){
  const read=p=>readFileSync(new URL(p,root));
  const selected=verifyQuoteChangeSources(read,readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort());
  return {...loadSources(),...selected};
}
export function verifyQuoteChangeTarget(evidence,profile,activeProfile,now=Date.now(),sources=currentQuoteChangeSources()){
  assert.equal(evidence.privateChangeRequests,0,'Staging retry receipts must remain empty.');
  assert.deepEqual(evidence.ledger,sources.files.map(f=>migrationIdentity(f.name)),'Exact 94-entry ledger required.');
  const result=verifyActiveTarget(evidence,profile,activeProfile,now,sources);
  return {...result,privateChangeRequests:0};
}
function run(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('verify-staging-quote-change-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng --auth-config-file /private/fresh-managed-config.json\nRead-only. Exact94 catalog/ledger, active email guard and empty/OFF state. No apply, deployment, config patch or key retrieval.');return;
  }
  assert.equal(args.length,4,'Only read-only review arguments are supported.');
  assert.deepEqual(args.slice(0,3),['--project-ref',stagingRef,'--auth-config-file'],'Only assigned staging is supported.');
  const stats=statSync(args[3]);assert.ok(stats.isFile()&&(stats.mode&0o077)===0,'Use a private configuration file.');
  const observedAt=Math.floor(stats.mtimeMs);assert.ok(observedAt<=Date.now()&&Date.now()-observedAt<=900000,'Fresh configuration required.');
  const config=JSON.parse(readFileSync(args[3]));assert.equal(config?.data?.id,stagingRef);
  const sources=currentQuoteChangeSources(),directory=mkdtempSync(join(tmpdir(),'ats-staging94-verify-'));mkdirSync(join(directory,'supabase'));
  writeFileSync(join(directory,'supabase/config.toml'),'project_id="ats_staging94_verify"\n[db.seed]\nenabled=false\n');
  const cli=process.env.STAGING_SUPABASE_BIN||'supabase';
  function call(argv,phase){try{
    const raw=execFileSync(cli,[...argv,'--workdir',directory,'--output-format','json'],{encoding:'utf8',maxBuffer:12*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
    writeFileSync(join(directory,phase+'.private.json'),raw,{mode:0o600});return JSON.parse(raw);
  }catch(e){writeFileSync(join(directory,phase+'.private.log'),String(e.stderr??e.message),{mode:0o600});throw Error('Read-only check failed; inspect '+directory);}}
  const projects=call(['projects','list'],'projects');assertTarget(stagingRef,projects);
  const sql=`begin read only;set local statement_timeout='20s';select jsonb_build_object('identity',(${identitySQL}),'snapshot',(${snapshotSQL(sources.catalog)}),'guardState',(${guardSQL}),'privateChangeRequests',(select count(*) from app_private.quote_change_requests),'ledger',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)) evidence;commit;`;
  const file=join(directory,'snapshot.sql');writeFileSync(file,sql,{mode:0o600});
  const database=call(['db','query','--linked','--project-ref',stagingRef,'--file',file],'database').rows[0].evidence;
  const profile=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/target-review.json',root))),active=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/active-profile.json',root)));
  const result={...verifyQuoteChangeTarget({...database,projects,config,observedAt},profile,active,Date.now(),sources),evidenceDirectory:directory};
  writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
