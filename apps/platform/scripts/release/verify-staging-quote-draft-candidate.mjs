// Read-only maintenance verifier for the reviewed 99-migration staging target.
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
import {verifyStandaloneSources,verifyStandaloneTarget,standaloneStateSQL} from './verify-staging-standalone-candidate.mjs';
import {principalStateSQL} from './verify-staging-principal-candidate.mjs';
export const quoteDraftStateSQL=`select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,
 'execute',(select jsonb_object_agg(role,has_function_privilege(role,p.oid,'EXECUTE'))from unnest(array['anon','authenticated','service_role','supabase_auth_admin'])role),
 'table',(select jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'rows',(select count(*)from app_private.quote_draft_requests),
 'apiGrants',(select jsonb_object_agg(role,has_table_privilege(role,c.oid,'SELECT,INSERT,UPDATE,DELETE'))from unnest(array['anon','authenticated','service_role','supabase_auth_admin'])role),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check)order by policyname),'[]'::jsonb)from pg_policies where schemaname='app_private'and tablename='quote_draft_requests'))from pg_class c where c.oid=to_regclass('app_private.quote_draft_requests')))
 from pg_proc p where p.oid=to_regprocedure('public.create_quote_draft_request(uuid,jsonb,jsonb)')`;
export const expectedQuoteDraftState={owner:'postgres',definer:true,volatility:'v',config:['search_path=""','lock_timeout=5s'],
 execute:{anon:false,authenticated:true,service_role:false,supabase_auth_admin:false},
 table:{owner:'postgres',rls:true,forceRls:false,rows:0,apiGrants:{anon:false,authenticated:false,service_role:false,supabase_auth_admin:false},
 policies:[{name:'No direct quote request access',permissive:'RESTRICTIVE',roles:['public'],command:'ALL',using:'false',check:'false'}]}};
const expectedAddedKeys=[...['actor_user_id','created_at','input_hash','quote_id','request_id','result_json'].map(k=>'column|app_private.quote_draft_requests.'+k),
 'constraint|app_private.quote_draft_requests.quote_draft_requests_input_hash_check',
 'constraint|app_private.quote_draft_requests.quote_draft_requests_pkey','index|app_private.quote_draft_requests_pkey',
 'policy|app_private.quote_draft_requests.No direct quote request access','relation|app_private.quote_draft_requests',
 'routine|public.create_quote_draft_request(p_request_id uuid, p_header jsonb, p_lines jsonb)'].sort();
export function verifyQuoteDraftSources(read,inventory){
 const previous=verifyStandaloneSources(read,inventory),candidate=JSON.parse(read('supabase/staging/quote-draft-candidate-99.json'));
 assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
 assert.equal(candidate.previousCandidateCount,98);assert.equal(candidate.expectedMigrationCount,99);
 assert.equal(candidate.previousCandidateSha256,sha(read('supabase/staging/standalone-candidate-98.json')));
 assert.equal(candidate.migrationManifestSha256,previous.candidate.migrationManifestSha256);
 assert.equal(candidate.catalogQuerySha256,sha(read('supabase/verification/release_catalog.sql')));
 assert.equal(candidate.additionalMigration.name,'20261021032121_quote_draft_requests.sql');
 assert.equal(candidate.additionalMigration.sha256,sha(read('supabase/migrations/'+candidate.additionalMigration.name)));
 const files=[...previous.files,candidate.additionalMigration];
 const deferred=JSON.parse(read('supabase/staging/deferred-migrations.json')).migrations.filter(f=>!files.some(known=>known.name===f.name));
 assert.ok(deferred.every(f=>f.name>candidate.additionalMigration.name),'Local-only changes must follow candidate99.');
 assert.deepEqual(inventory,[...files,...deferred].map(f=>f.name).sort(),'Unreviewed migration inventory.');
 assert.equal(candidate.catalogObjectCount,4868);assert.deepEqual(candidate.delta.added.map(x=>x.key).sort(),expectedAddedKeys);
 assert.ok(candidate.delta.added.every(x=>/^[0-9a-f]{64}$/.test(x.hash)));assert.deepEqual(candidate.delta.changed,[]);assert.deepEqual(candidate.delta.removed,[]);
 assert.deepEqual(candidate.allowedOwnedDefaultsSeals,previous.candidate.allowedOwnedDefaultsSeals);
 assert.deepEqual(candidate.allowedManagedDefaultsSeals,previous.candidate.allowedManagedDefaultsSeals);
 for(const key of ['productionWrites','deployed','readyForHosting'])assert.equal(candidate[key],false);
 return {candidate,files};
}
export function currentQuoteDraftSources(){
 const read=p=>readFileSync(new URL(p,root));
 return {...loadSources(),...verifyQuoteDraftSources(read,readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort())};
}
export function verifyQuoteDraftTarget(evidence,profile,activeProfile,now=Date.now(),sources=currentQuoteDraftSources()){
 assert.deepEqual(evidence.quoteDraftState,expectedQuoteDraftState,'QuoteDraft command, private permissions/policy or empty request history changed.');
 assert.deepEqual(evidence.ledger,sources.files.map(f=>migrationIdentity(f.name)),'Exact 99-entry ledger required.');
 return {...verifyStandaloneTarget(evidence,profile,activeProfile,now,sources),quoteDraftRequestsEmpty:true};
}
function run(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('verify-staging-quote-draft-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng --auth-config-file /private/fresh-managed-config.json\nRead-only. Exact99 ledger/catalog and private quote draft request state, private notification and delivery state empty, active Auth guard and OFF switches. No apply, deployment, config patch or key retrieval.');return;
  }
  assert.equal(args.length,4,'Only read-only review arguments are supported.');
  assert.deepEqual(args.slice(0,3),['--project-ref',stagingRef,'--auth-config-file'],'Only assigned staging is supported.');
  const stats=statSync(args[3]);assert.ok(stats.isFile()&&(stats.mode&0o077)===0,'Use a private configuration file.');
  const observedAt=Math.floor(stats.mtimeMs);assert.ok(observedAt<=Date.now()&&Date.now()-observedAt<=900000,'Fresh configuration required.');
  const config=JSON.parse(readFileSync(args[3]));assert.equal(config?.data?.id,stagingRef);
  const sources=currentQuoteDraftSources(),directory=mkdtempSync(join(tmpdir(),'ats-staging99-verify-'));mkdirSync(join(directory,'supabase'));
  writeFileSync(join(directory,'supabase/config.toml'),'project_id="ats_staging99_verify"\n[db.seed]\nenabled=false\n');
  const cli=process.env.STAGING_SUPABASE_BIN||'supabase';
  function call(argv,phase){try{
    const raw=execFileSync(cli,[...argv,'--workdir',directory,'--output-format','json'],{encoding:'utf8',maxBuffer:12*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
    writeFileSync(join(directory,phase+'.private.json'),raw,{mode:0o600});return JSON.parse(raw);
  }catch(e){writeFileSync(join(directory,phase+'.private.log'),String(e.stderr??e.message),{mode:0o600});throw Error('Read-only check failed; inspect '+directory);}}
  const projects=call(['projects','list'],'projects');assertTarget(stagingRef,projects);
  const file=join(directory,'snapshot.sql');writeFileSync(file,`begin read only;set local statement_timeout='20s';select jsonb_build_object('identity',(${identitySQL}),'snapshot',(${snapshotSQL(sources.catalog)}),'guardState',(${guardSQL}),'privateChangeRequests',(select count(*) from app_private.quote_change_requests),'notificationState',(${notificationStateSQL}),'sourceEventState',(${sourceEventStateSQL}),'principalState',(${principalStateSQL}),'standaloneState',(${standaloneStateSQL}),'quoteDraftState',(${quoteDraftStateSQL}),'ledger',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)) evidence;commit;`,{mode:0o600});
  const evidence=call(['db','query','--linked','--project-ref',stagingRef,'--file',file],'database').rows[0].evidence;
  const profile=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/target-review.json',root))),active=JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/active-profile.json',root)));
  const result={...verifyQuoteDraftTarget({...evidence,projects,config,observedAt},profile,active,Date.now(),sources),evidenceDirectory:directory};
  writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
