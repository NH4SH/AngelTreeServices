// Read-only maintenance check for the exact staging101 schema. Never applies SQL.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {currentRequestStatusSources} from './verify-staging-request-status-candidate.mjs';
import {migrationIdentity,sha} from './verify-staging-appointment-candidate.mjs';
import {assertTarget,snapshotSQL,stagingRef} from './staging-permissions.mjs';
const root=new URL('../../../../',import.meta.url);
export function currentConflictSources(){
 const read=p=>readFileSync(new URL(p,root)),previous=currentRequestStatusSources();
 const candidate=JSON.parse(read('supabase/staging/business-conflict-candidate-101.json'));
 assert.equal(candidate.projectRef,stagingRef);assert.equal(candidate.expectedMigrationCount,101);
 assert.equal(candidate.previousCandidateCount,100);assert.equal(candidate.productionReady,false);
 assert.equal(candidate.additionalMigration.name,'20261021215535_business_conflict_responses.sql');
 assert.equal(sha(read('supabase/migrations/'+candidate.additionalMigration.name)),candidate.additionalMigration.sha256);
 const files=[...previous.files,candidate.additionalMigration];
 assert.deepEqual(readdirSync(new URL('supabase/migrations',root)).filter(f=>f.endsWith('.sql')).sort(),files.map(f=>f.name));
 assert.equal(candidate.functions.length,23);assert.equal(new Set(candidate.functions.map(f=>f.signature)).size,23);
 return{candidate,files,catalog:previous.catalog};
}
export function verifyConflictEvidence(e,sources=currentConflictSources()){
 const {candidate,files}=sources;
 assert.deepEqual(e.ledger,files.map(f=>migrationIdentity(f.name)));
 for(const [k,v]of Object.entries(candidate.expectedCatalog))assert.deepEqual(e.snapshot[k],v,'Catalog changed: '+k);
 assert.deepEqual(e.functions,candidate.functions,'Reviewed conflict bodies changed.');
 assert.equal(e.manualSerializationRaises,0);assert.equal(e.communications,false);assert.equal(e.recurring,false);
 assert.equal(e.authGuard,'3217b69110500f25a29e85e4cb945b7f');
 return{projectRef:stagingRef,migrations:101,reviewedFunctions:23,securityCatalogMatches:true,automationOff:true,productionReady:false};
}
export function conflictEvidenceSQL(sources){
 const sigs=sources.candidate.functions.map(f=>"'"+f.signature.replaceAll("'","''")+"'").join(',');
 return `select jsonb_build_object('snapshot',(${snapshotSQL(sources.catalog)}),
 'ledger',(select jsonb_agg(jsonb_build_object('version',version,'name',name)order by version)from supabase_migrations.schema_migrations),
 'functions',(select jsonb_agg(jsonb_build_object('signature',s,'md5',md5(p.prosrc))order by ord)from unnest(array[${sigs}])with ordinality t(s,ord)left join pg_proc p on p.oid=to_regprocedure(s)),
 'manualSerializationRaises',(select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private')and p.prosrc~*$$errcode[[:space:]]*=[[:space:]]*'40001'$$),
 'communications',(select automated_sending_enabled from public.communication_settings),
 'recurring',(select automated_generation_enabled from public.recurring_service_settings),
 'authGuard',(select md5(prosrc)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ats_staging_auth'and p.proname='reject_email'))evidence`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  assert.equal(process.argv[2],'--project-ref');assert.equal(process.argv[3],stagingRef,'Only dedicated staging is supported.');assert.equal(process.argv.length,4);
  const sources=currentConflictSources(),dir=mkdtempSync('/tmp/ats-conflict101-read-');mkdirSync(dir+'/supabase');
  writeFileSync(dir+'/supabase/config.toml','project_id="ats_conflict101_read"\n[db.seed]\nenabled=false\n');
  const cli=process.env.SUPABASE_BIN||'supabase';
  const run=args=>JSON.parse(execFileSync(cli,[...args,'--workdir',dir,'--output-format','json'],{encoding:'utf8',timeout:60000,maxBuffer:12*1024*1024,stdio:['ignore','pipe','pipe']}));
  assertTarget(stagingRef,run(['projects','list']));
  const file=dir+'/read.sql';writeFileSync(file,"begin read only;set local statement_timeout='20s';"+conflictEvidenceSQL(sources)+';commit;');
  console.log(JSON.stringify(verifyConflictEvidence(run(['db','query','--linked','--project-ref',stagingRef,'--file',file]).rows[0].evidence,sources)));
 }catch{console.error('Staging101 verification stopped. Check target, source and private diagnostics; no writes performed.');process.exitCode=1;}
}
