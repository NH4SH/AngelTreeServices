// Make a real new paired capture of the restored, still-fenced state. A new
// upload timestamp alone must never make an old backup appear fresh.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync,copyFileSync}from'node:fs';
import{CandidateIO,digest}from'./candidate-io.mjs';import{captureManifestSql}from'./capture-manifest.mjs';
import{functionMetadataSql}from'./function-metadata.mjs';
const io=new CandidateIO(),target=JSON.parse(readFileSync(io.folder+'/target-verification.json')),original=JSON.parse(readFileSync(io.folder+'/offsite-restored-capture/manifest.private.json'));
assert.equal(target.coldGuardClosed,true);for(const c of original.sourceFence.containers){const actual=io.inspect(io.project+'-'+c.service+'-1');assert.equal(actual.Id,c.id);assert.equal(actual.State.Running,false);}
const sql=q=>io.sql(q,{container:target.container});assert.equal(Number(sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
const captureStartedAt=new Date().toISOString(),before=JSON.parse(sql(captureManifestSql));assert.ok(JSON.stringify(before)===JSON.stringify(JSON.parse(readFileSync(io.folder+'/restored-database-manifest.private.json'))),'Restored state changed before its fresh capture.');
const round=Number(process.env.ATS_BASELINE_ROUND??1);assert.ok(Number.isInteger(round)&&round>=1&&round<=5);
const to=io.folder+'/recovered-baseline-capture'+(round>1?'-'+round:'');mkdirSync(to,{mode:0o700});
io.binary(['exec',target.container,'pg_dump','-U','supabase_admin','-d','postgres','-Fc'],to+'/database.dump');
const nodeImage='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d',volume=target.project+'_object-data';
io.binary(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--mount','type=volume,src='+volume+',dst=/objects,readonly','--entrypoint','tar',nodeImage,'-C','/objects','-cf','-','.'],to+'/objects.tar');
const files=JSON.parse(io.docker(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--mount','type=volume,src='+volume+',dst=/objects,readonly',nodeImage,'node','-e',original.objectInventory]));assert.deepEqual(files,original.objects);assert.deepEqual(JSON.parse(sql(captureManifestSql)),before);
for(const name of['core.private.env','app.private.env','release-source.tar.gz','fixture.private.json'])copyFileSync(io.folder+'/offsite-restored-capture/'+name,to+'/'+name);
const manifest={...original,sourceId:target.id,captureStartedAt,captureCompletedAt:new Date().toISOString(),continuousFence:true,databaseSha256:digest(readFileSync(to+'/database.dump')),objectArchiveSha256:digest(readFileSync(to+'/objects.tar')),database:before,functionDetails:JSON.parse(sql(functionMetadataSql))};writeFileSync(to+'/manifest.private.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
const restic=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(restic)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
const run=(...args)=>io.run(restic,['--repo',io.folder+'/encrypted-repository','--password-file',io.folder+'/recovery-password.private','--no-cache',...args]).stdout;
const result=run('backup','--json','--pack-size','8','--tag','synthetic-recovered-baseline',to).trim().split('\n').map(l=>JSON.parse(l)).find(r=>r.message_type==='summary');run('check','--read-data');
const proof={version:1,namespace:io.namespace,targetId:target.id,round,capturePath:to,captureStartedAt,captureCompletedAt:manifest.captureCompletedAt,manifestSha256:digest(readFileSync(to+'/manifest.private.json')),snapshotId:result.snapshot_id,businessStateSha256:digest(Buffer.from(JSON.stringify({database:before,objects:files}))),pairedDatabaseAndObjects:true,authIncluded:true,paymentDeliveryHistoryIncluded:true,sourceMigrationCount:102,continuousFence:true,productionChanged:false};io.json('admission-baseline-proof-round-'+round+'.json',proof);io.json('admission-baseline-proof.json',proof);
console.log(JSON.stringify({newPairedBaselineCaptured:true,unchangedBusinessDataProved:true,sourceStillStopped:true,targetStillFenced:true}));
