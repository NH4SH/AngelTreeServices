// Read-only maintenance verifier for the reviewed 100-migration staging target.
// Earlier installation tools/candidates remain historical and unchanged.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,mkdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {sourceEventStateSQL} from './verify-staging-source-event-candidate.mjs';
import {notificationStateSQL} from './verify-staging-notification-candidate.mjs';
import {sha,migrationIdentity} from './verify-staging-appointment-candidate.mjs';
import {loadSources,identitySQL,guardSQL} from './staging-auth-activation.mjs';
import {snapshotSQL,assertTarget,stagingRef} from './staging-permissions.mjs';
const root=new URL('../../../../',import.meta.url);
import {standaloneStateSQL} from './verify-staging-standalone-candidate.mjs';
import {principalStateSQL} from './verify-staging-principal-candidate.mjs';
import {verifyQuoteDraftSources,verifyQuoteDraftTarget,quoteDraftStateSQL} from './verify-staging-quote-draft-candidate.mjs';
export const requestStatusStateSQL=`select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,
 'execute',(select jsonb_object_agg(role,has_function_privilege(role,p.oid,'EXECUTE'))from unnest(array['anon','authenticated','service_role','supabase_auth_admin'])role))
 from pg_proc p where p.oid=to_regprocedure('public.resolve_quote_draft_request(uuid,jsonb,jsonb)')`;
export const expectedRequestStatusState={owner:'postgres',definer:true,volatility:'v',config:['search_path=""','lock_timeout=2s'],
 execute:{anon:false,authenticated:true,service_role:false,supabase_auth_admin:false}};
const expectedAddedKeys=['routine|public.resolve_quote_draft_request(p_request_id uuid, p_header jsonb, p_lines jsonb)'];
export function verifyRequestStatusSources(read,inventory){
 const previous=verifyQuoteDraftSources(read,inventory),candidate=JSON.parse(read('supabase/staging/request-status-candidate-100.json'));
 assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
 assert.equal(candidate.previousCandidateCount,99);assert.equal(candidate.expectedMigrationCount,100);
 assert.equal(candidate.previousCandidateSha256,sha(read('supabase/staging/quote-draft-candidate-99.json')));
 assert.equal(candidate.migrationManifestSha256,previous.candidate.migrationManifestSha256);
 assert.equal(candidate.catalogQuerySha256,sha(read('supabase/verification/release_catalog.sql')));
 assert.equal(candidate.additionalMigration.name,'20261021060037_quote_request_status.sql');
 assert.equal(candidate.additionalMigration.sha256,sha(read('supabase/migrations/'+candidate.additionalMigration.name)));
 const files=[...previous.files,candidate.additionalMigration];
 const deferred=JSON.parse(read('supabase/staging/deferred-migrations.json')).migrations.filter(f=>!files.some(known=>known.name===f.name));
 assert.ok(deferred.every(f=>f.name>candidate.additionalMigration.name),'Local-only changes must follow candidate100.');
 assert.deepEqual(inventory,[...files,...deferred].map(f=>f.name).sort(),'Unreviewed migration inventory.');
 assert.equal(candidate.catalogObjectCount,4869);assert.deepEqual(candidate.delta.added.map(x=>x.key).sort(),expectedAddedKeys);
 assert.ok(candidate.delta.added.every(x=>/^[0-9a-f]{64}$/.test(x.hash)));assert.deepEqual(candidate.delta.changed,[]);assert.deepEqual(candidate.delta.removed,[]);
 assert.deepEqual(candidate.allowedOwnedDefaultsSeals,previous.candidate.allowedOwnedDefaultsSeals);
 assert.deepEqual(candidate.allowedManagedDefaultsSeals,previous.candidate.allowedManagedDefaultsSeals);
 for(const key of ['productionWrites','deployed','readyForHosting'])assert.equal(candidate[key],false);
 return {candidate,files};
}
export function currentRequestStatusSources(){
 const read=p=>readFileSync(new URL(p,root));
 return {...loadSources(),...verifyRequestStatusSources(read,readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort())};
}
export function verifyRequestStatusTarget(evidence,profile,activeProfile,now=Date.now(),sources=currentRequestStatusSources()){
 assert.deepEqual(evidence.requestStatusState,expectedRequestStatusState,'Request resolver metadata or effective permissions changed.');
 assert.deepEqual(evidence.ledger,sources.files.map(f=>migrationIdentity(f.name)),'Exact 100-entry ledger required.');
 return {...verifyQuoteDraftTarget(evidence,profile,activeProfile,now,sources),requestStatusAccessVerified:true};
}
function run(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('verify-staging-request-status-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng --auth-config-file /private/fresh-managed-config.json\nRead-only. Exact100 ledger/catalog, request resolver permissions and private quote request state, private notification and delivery state empty, active Auth guard and OFF switches. No apply, deployment, config patch or key retrieval.');return;
  }
  assert.equal(args.length,4,'Only read-only review arguments are supported.');
  assert.deepEqual(args.slice(0,3),['--project-ref',stagingRef,'--auth-config-file'],'Only assigned staging is supported.');
  const stats=statSync(args[3]);assert.ok(stats.isFile()&&(stats.mode&0o077)===0,'Use a private configuration file.');
  const observedAt=Math.floor(stats.mtimeMs);assert.ok(observedAt<=Date.now()&&Date.now()-observedAt<=900000,'Fresh configuration required.');
  const config=JSON.parse(readFileSync(args[3]));assert.equal(config?.data?.id,stagingRef);
  const sources=currentRequestStatusSources(),directory=mkdtempSync(join(tmpdir(),'ats-staging100-verify-'));mkdirSync(join(directory,'supabase'));
  writeFileSync(join(directory,'supabase/config.toml'),'project_id="ats_staging100_verify"\n[db.seed]\nenabled=false\n');
  const cli=process.env.STAGING_SUPABASE_BIN||'supabase';
  function call(argv,phase){try{
    const raw=execFileSync(cli,[...argv,'--workdir',directory,'--output-format','json'],{encoding:'utf8',maxBuffer:12*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
    writeFileSync(join(directory,phase+'.private.json'),raw,{mode:0o600});return JSON.parse(raw);
  }catch(e){writeFileSync(join(directory,phase+'.private.log'),String(e.stderr??e.message),{mode:0o600});throw Error('Read-only check failed; inspect '+directory);}}
  const projects=call(['projects','list'],'projects');assertTarget(stagingRef,projects);
  const file=join(directory,'snapshot.sql');writeFileSync(file,`begin read only;set local statement_timeout='20s';select jsonb_build_object('identity',(${identitySQL}),'snapshot',(${snapshotSQL(sources.catalog)}),'guardState',(${guardSQL}),'privateChangeRequests',(select count(*) from app_private.quote_change_requests),'notificationState',(${notificationStateSQL}),'sourceEventState',(${sourceEventStateSQL}),'principalState',(${principalStateSQL}),'standaloneState',(${standaloneStateSQL}),'quoteDraftState',(${quoteDraftStateSQL}),'requestStatusState',(${requestStatusStateSQL}),'ledger',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)) evidence;commit;`,{mode:0o600});
  const evidence=call(['db','query','--linked','--project-ref',stagingRef,'--file',file],'database').rows[0].evidence;
  const profile=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/target-review.json',root))),active=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/active-profile.json',root)));
  const result={...verifyRequestStatusTarget({...evidence,projects,config,observedAt},profile,active,Date.now(),sources),evidenceDirectory:directory};
  writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
