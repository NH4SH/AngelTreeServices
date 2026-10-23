// Read-only, exact-target maintenance verification. Never installs or repairs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const stagingRef='gbyhdsuiqeslgjdnbqng';
export const root=new URL('../../../../',import.meta.url);
export function canonical(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export const sha=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFileSync(new URL(path,root));
export function parseArgs(args){
 assert.ok(args.length===2||args.length===3,'Only read-only project review is supported.');
 assert.deepEqual(args.slice(0,2),['--project-ref',stagingRef],'Only assigned staging is supported.');
 if(args.length===3)assert.equal(args[2],'--print-sql','Write/repair/deploy flags are forbidden.');
 return {printSql:args.length===3};
}
export function verifySources(candidate,reader=read,inventory=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort()){
 assert.equal(candidate.version,1);assert.equal(candidate.projectRef,stagingRef);
 assert.equal(candidate.previousMigrationCount,116);assert.equal(candidate.expectedMigrationCount,117);
 assert.equal(candidate.productionReady,false);assert.equal(candidate.deployed,false);
 const pinned=candidate.migrations.map(x=>x.name);
 assert.equal(pinned.length,117);assert.equal(pinned.at(-1),'20261023015338_enforce_proposal_expiry.sql');
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
 assert.equal(sha(reader('supabase/staging/proposal-expiry-snapshot-117.sql')),candidate.snapshotSqlSha256,'Snapshot query changed.');
 return candidate;
}
export function verifyEvidence(e,candidate,now=Date.now()){
 assert.equal(e.projectRef,stagingRef);assert.ok(Number.isFinite(e.observedAt)&&e.observedAt<=now&&now-e.observedAt<=900000,'Fresh evidence required.');
 assert.deepEqual(e.identity,candidate.identity,'Physical staging identity changed.');
 assert.equal(e.ledger.length,117);assert.deepEqual(e.ledger.map(x=>({version:x.version,name:x.name})),candidate.migrations.map(f=>{const i=f.name.indexOf('_');return {version:f.name.slice(0,i),name:f.name.slice(i+1,-4)};}),'Exact migration identities required.');
 assert.equal(sha(canonical(e.ledger.slice(0,116))),candidate.previousLedgerSha256,'Original migration history changed.');
 assert.deepEqual(e.ledger.at(-1),candidate.expectedLastMigration,'Migration 117 statement history differs from native local rehearsal.');
 assert.deepEqual(e.catalog,candidate.expectedCatalog,'Unrelated schema, grants/defaults or approval metadata changed.');
 assert.equal(e.approvalSha256,candidate.expectedApprovalSha256,'Approval definition differs from local rehearsal.');
 assert.equal(sha(canonical({records:e.records,settings:e.settings,recurringSettings:e.recurringSettings,guard:e.guard})),candidate.protectedStateSha256,'Business/Auth/history/settings or email guard changed.');
 assert.equal(e.settings.automated_sending_enabled,false);assert.equal(e.settings.appointment_change_notices_enabled,false);assert.equal(e.recurringSettings.automated_generation_enabled,false);
 return {projectRef:stagingRef,migrationCount:117,latestMigration:'20261023015338',catalogObjects:e.catalog.count,originalLedgerAndProtectedStatePreserved:true,approvalMatchesLocalRehearsal:true,readOnly:true,productionReady:false};
}
function run(){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){console.log('verify-staging-proposal-expiry-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng [--print-sql]\nRead-only; exact migration 117, original ledger, protected records/settings/Auth guard, full unrelated catalog and approval permissions/body. No keys, writes, repairs or deployments.');return;}
 const mode=parseArgs(args);const candidate=verifySources(JSON.parse(read('supabase/staging/proposal-expiry-candidate-117.json')));const sql=read('supabase/staging/proposal-expiry-snapshot-117.sql').toString();if(mode.printSql){console.log(sql);return;}
 const directory=mkdtempSync(join(tmpdir(),'ats-staging117-verify-')),file=join(directory,'snapshot.sql');writeFileSync(file,sql,{mode:0o600});
 const r=spawnSync(process.env.STAGING_SUPABASE_BIN||'supabase',['db','query','--linked','--project-ref',stagingRef,'--file',file,'--workdir',directory,'--output-format','json'],{encoding:'utf8',timeout:60000,maxBuffer:40*1024*1024,stdio:['ignore','pipe','pipe']});
 writeFileSync(join(directory,'response.private.log'),(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Read-only staging query failed; inspect '+directory);
 const evidence={projectRef:stagingRef,observedAt:Date.now(),...JSON.parse(r.stdout).rows[0].evidence};const result=verifyEvidence(evidence,candidate);writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,evidenceDirectory:directory},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
