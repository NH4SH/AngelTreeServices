// Read-only exact target check. Never repairs migration history or installs SQL.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
export function verifyCloudStage(actual,expected=JSON.parse(readFileSync(new URL('./cloud-stage-profile.json',import.meta.url)))){
 assert.deepEqual(actual,expected,'Staging application history, lab maintenance or permissions changed');
 return {projectRef:actual.projectRef,applicationMigrations:actual.applicationCount,labMaintenanceEntries:actual.maintenance.length,
  originalApplicationVersionsPreserved:true,labClientAccessDenied:true,readOnly:true,productionReady:false};
}
function run(){
 const args=process.argv.slice(2),sql=readFileSync(new URL('./cloud-stage-snapshot.sql',import.meta.url),'utf8');
 if(args.length===1&&args[0]==='--print-sql'){console.log(sql);return;}
 if(args.length===1&&args[0]==='--help'){console.log('verify-cloud-stage.mjs [--print-sql]\nRead-only; hard-bound CRM Staging, exact 129 application entries plus the two reviewed lab entries. No keys, repair, install or deploy.');return;}
 assert.equal(args.length,0);const folder=mkdtempSync(join(tmpdir(),'ats-cloud-stage-')),file=join(folder,'snapshot.sql');writeFileSync(file,sql,{mode:0o600});
 const r=spawnSync(process.env.STAGING_SUPABASE_BIN??'supabase',['db','query','--linked','--project-ref','gbyhdsuiqeslgjdnbqng','--workdir',folder,'--file',file,'--output','json'],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
 writeFileSync(join(folder,'response.private.log'),(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Read-only target query failed; inspect '+folder);
 const output=JSON.parse(r.stdout),rows=Array.isArray(output)?output:output.rows,result=verifyCloudStage(rows[0].evidence);console.log(JSON.stringify({...result,evidenceDirectory:folder}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run();
