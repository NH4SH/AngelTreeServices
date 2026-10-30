// Local, closed, synthetic-only capacity test. It never contacts a provider,
// admits writes, alters production or deletes an existing backup repository.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {CandidateIO,digest} from './candidate-io.mjs';
import {captureManifestSql} from './capture-manifest.mjs';
import {createDatabaseParts} from './database-parts.mjs';
assert.equal(process.env.ATS_ROLLING_HEALTH_REHEARSAL,'1');
const [id]=process.argv.slice(2);assert.match(id,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/rolling-health-'+id;mkdirSync(io.folder,{mode:0o700});
await io.ready();io.assertSource();
assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
for(const service of ['app','api-gw','auth','rest','storage','imgproxy'])assert.equal(io.inspect(io.project+'-'+service+'-1').State.Running,false);
assert.equal(Number(io.sql("select count(*) from public.system_health_checks where check_source='ATS_BACKUP_SCALE_V1';")),90000);
const binary=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';
assert.equal(digest(readFileSync(binary)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
const password=io.folder+'/password.private';writeFileSync(password,randomBytes(48).toString('base64'),{mode:0o600,flag:'wx'});
const repository=io.folder+'/encrypted-repository',run=args=>io.run(binary,['--repo',repository,'--password-file',password,'--no-cache',...args],{timeout:60000}).stdout;
run(['init','--repository-version','2']);
const inventory=()=>{
 const rows=[];function walk(dir,prefix=''){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());const name=prefix+e.name;if(e.isDirectory())walk(dir+'/'+e.name,name+'/');else rows.push({name,size:readFileSync(dir+'/'+e.name).length});}}walk(repository);return rows;
};
function capture(name){
 const folder=io.folder+'/'+name;mkdirSync(folder,{mode:0o700});
 const state=JSON.parse(io.sql(captureManifestSql));
 io.binary(['exec',io.db,'pg_dump','-U','supabase_admin','-d','postgres','-Fc','--compress=none'],folder+'/native.dump');
 const parts=createDatabaseParts(folder+'/native.dump',folder+'/database.parts',{partBytes:262144});
 run(['backup','--json','--compression','max','--pack-size','8','--exclude',folder+'/native.dump','--exclude',folder+'/native.dump.private.log',folder]);
 run(['check','--read-data']);return {state,parts,inventory:inventory()};
}
const before=capture('before');
io.sql(`begin;set local session_replication_role=replica;
 delete from public.system_health_checks where id in(select id from public.system_health_checks where check_source='ATS_BACKUP_SCALE_V1' order by id limit 100);
 insert into public.system_health_checks(component_key,status,latency_ms,summary,check_source,details)
 select 'ats_backup_scale','operational',g,'Synthetic capacity fixture; no customer data.','ATS_BACKUP_SCALE_V1',jsonb_build_object('synthetic',true,'proof',md5('ATS_BACKUP_ROLL_'||g::text)) from generate_series(1,100)g;
 commit;`);
const after=capture('after');
assert.deepEqual(before.state.tables.filter(t=>t.name!=='public.system_health_checks'),after.state.tables.filter(t=>t.name!=='public.system_health_checks'));
const known=new Set(before.inventory.map(o=>o.name)),newCipherBytes=after.inventory.filter(o=>!known.has(o.name)).reduce((n,o)=>n+o.size,0);
const report={syntheticOnly:true,healthRows:90000,syntheticRowsPruned:100,syntheticRowsAppended:100,
 beforeArchiveBytes:before.parts.size,afterArchiveBytes:after.parts.size,totalParts:after.parts.parts.length,
 changedParts:after.parts.parts.filter((p,n)=>p.sha256!==before.parts.parts[n]?.sha256).length,
 newCipherBytes,monthlyPayloadLowerBoundBytes:newCipherBytes*720*31,
 otherTableFingerprintsUnchanged:true,nativeEncryptedCheckPassed:true,sourceAPIsStopped:true,
 productionChanged:false,originalRepositoriesPreserved:true};
io.json('result.json',report);console.log(JSON.stringify(report));
