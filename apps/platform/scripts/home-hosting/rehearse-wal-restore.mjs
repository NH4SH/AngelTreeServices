// Restore a locally encrypted synthetic native backup into a NEW, networkless,
// read-only recovery server. No production, provider, promotion or file claim.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {CandidateIO,digest} from './candidate-io.mjs';
import {captureManifestSql} from './capture-manifest.mjs';
import {verifyWalPair} from './wal-pairing.mjs';
assert.equal(process.env.ATS_WAL_RESTORE_REHEARSAL,'1');
const [sourceId,id]=process.argv.slice(2);for(const v of [sourceId,id])assert.match(v,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/wal-restore-'+id;mkdirSync(io.folder,{mode:0o700});
await io.ready();io.assertSource();
const paired=process.env.ATS_WAL_PAIRED_SOURCE==='1';
const origin=io.root+(paired?'/wal-paired-':'/wal-rehearsal-')+sourceId,result=JSON.parse(readFileSync(origin+'/result.json'));
assert.equal(result.syntheticOnly,true);assert.equal(result.productionChanged,false);
assert.equal(result.sourceDbImage,io.inspect(io.db).Image);
const checkpoint=result.checkpoints.at(-1),binary=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';
assert.equal(digest(readFileSync(binary)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
const restic=args=>io.run(binary,['--repo',origin+'/encrypted-repository','--password-file',origin+'/password.private','--no-cache',...args],{timeout:120000}).stdout;
restic(['check','--read-data']);const restored=io.folder+'/restored';mkdirSync(restored,{mode:0o700});
restic(['restore',checkpoint.snapshotId+':'+origin+'/recovery','--target',restored,'--verify']);
assert.equal(digest(readFileSync(restored+'/checkpoint.private.json')),checkpoint.manifestSha256);
const manifest=JSON.parse(readFileSync(restored+'/checkpoint.private.json'));
assert.equal(manifest.syntheticOnly,true);assert.equal(manifest.sourceId,io.project);assert.equal(manifest.sourceMigrationCount,102);
assert.equal(manifest.sourceDbImage,result.sourceDbImage);assert.equal(manifest.targetLsn,checkpoint.targetLsn);
assert.equal(digest(readFileSync(restored+'/base/backup_manifest')),manifest.baseManifestSha256);
const pairing=paired?await verifyWalPair(restored,manifest.pair,{restoreRuntimeTo:io.folder+'/reconstructed-runtime'}):null;
if(paired)assert.equal(manifest.privateFilesPaired,true);
const image=manifest.sourceDbImage,project='ats_crm_recovery_'+id,target=project+'-db-1';
assert.notEqual(io.run('/usr/bin/docker',['inspect',target],{allowFailure:true}).status,0,'Never replace a recovery container');
const dataVolume=project+'-wal-data',walVolume=project+'-wal-archive',configVolume=project+'-db-config';
for(const v of [dataVolume,walVolume,...(paired?[configVolume]:[])]){assert.notEqual(io.run('/usr/bin/docker',['volume','inspect',v],{allowFailure:true}).status,0);io.docker(['volume','create','--label','ats-purpose=synthetic-wal-recovery',v]);}
const uid=io.docker(['run','--rm','--network','none','--read-only','--entrypoint','id',image,'-u','postgres']).trim();
const gid=io.docker(['run','--rm','--network','none','--read-only','--entrypoint','id',image,'-g','postgres']).trim();
assert.match(uid,/^[0-9]+$/);assert.match(gid,/^[0-9]+$/);assert.match(manifest.targetLsn,/^[0-9A-F]+\/[0-9A-F]+$/);
const settings=['max_connections','max_worker_processes','max_wal_senders','max_prepared_transactions','max_locks_per_transaction'];
const config=["data_directory='/var/lib/postgresql/data'","hba_file='/recovery/pg_hba.conf'","ident_file='/recovery/pg_ident.conf'",
 "listen_addresses=''","unix_socket_directories='/tmp'","shared_buffers='32MB'","wal_level='logical'","hot_standby=on","archive_mode=off",
 "restore_command='gzip -dc /recovery/wal/%f.gz > %p'","recovery_target_lsn='"+manifest.targetLsn+"'","recovery_target_inclusive=on",
 "recovery_target_action='pause'","recovery_target_timeline='"+manifest.timeline+"'","fsync=on","full_page_writes=on"];
for(const name of settings){const value=io.sql('show '+name+';');assert.match(value,/^[0-9]+$/);config.push(name+'='+value);}
writeFileSync(restored+'/recovery.conf',config.join('\n')+'\n',{mode:0o600});
writeFileSync(restored+'/pg_hba.conf','local all all trust\n',{mode:0o600});writeFileSync(restored+'/pg_ident.conf','',{mode:0o600});
const prepare=`set -eu
tar -xzf /read/base/base.tar.gz -C /data --no-same-owner
mkdir -p /data/pg_wal /recovery/wal
tar -xzf /read/base/pg_wal.tar.gz -C /data/pg_wal --no-same-owner
cp /read/base/backup_manifest /data/backup_manifest
pg_verifybackup --exit-on-error /data
cp -a /read/wal/. /recovery/wal/
cp /read/recovery.conf /recovery/postgresql.conf
cp /read/pg_hba.conf /recovery/pg_hba.conf
cp /read/pg_ident.conf /recovery/pg_ident.conf
touch /data/recovery.signal
chmod 700 /data /recovery
chown -R ${uid}:${gid} /data /recovery
${paired?'tar -xf /read/db-config.tar -C /db-config --no-same-owner\nchown -R '+uid+':'+gid+' /db-config':''}
`;
io.docker(['run','--rm','--network','none','--read-only','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--security-opt','no-new-privileges:true',
 '--memory','512m','--memory-swap','512m','--tmpfs','/tmp:size=16m,mode=0700',
 '--mount','type=bind,src='+restored+',dst=/read,readonly','--mount','type=volume,src='+dataVolume+',dst=/data',
 '--mount','type=volume,src='+walVolume+',dst=/recovery',...(paired?['--mount','type=volume,src='+configVolume+',dst=/db-config']:[]),'--entrypoint','/bin/sh',image,'-c',prepare]);
let created=false,report={passed:false,syntheticOnly:true,productionChanged:false};
try{
 io.docker(['run','--detach','--name',target,'--label','com.docker.compose.project='+project,'--label','ats-purpose=synthetic-wal-recovery',
  '--network','none','--read-only','--user',uid+':'+gid,'--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','128',
  '--memory','512m','--memory-swap','512m','--cpus','1','--ulimit','core=0:0','--tmpfs','/tmp:size=16m,uid='+uid+',gid='+gid+',mode=0700',
  '--mount','type=volume,src='+dataVolume+',dst=/var/lib/postgresql/data','--mount','type=volume,src='+walVolume+',dst=/recovery,readonly',
  ...(paired?['--mount','type=volume,src='+configVolume+',dst=/etc/postgresql-custom,readonly']:[]),
  '--entrypoint','postgres',image,'-D','/var/lib/postgresql/data','-c','config_file=/recovery/postgresql.conf']);created=true;
 const query=sql=>io.docker(['exec','-i',target,'psql','-h','/tmp','-X','-Atq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:sql});
 for(let n=0;;n++){
  assert.ok(n<120,'Recovery did not reach the bound target LSN');
  const r=io.run('/usr/bin/docker',['exec',target,'pg_isready','-h','/tmp','-U','supabase_admin','-d','postgres'],{allowFailure:true});
  if(r.status===0&&query('select pg_is_in_recovery() and pg_is_wal_replay_paused();').trim()==='t')break;
  const info=io.inspect(target);assert.equal(info.State.Running,true,'Recovery server stopped before the target');await new Promise(r=>setTimeout(r,250));
 }
 const actual=JSON.parse(query(captureManifestSql));assert.deepEqual(actual,manifest.database);
 assert.equal(query("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');").trim(),'0');
 assert.equal(query('select database_started_at<>pg_postmaster_start_time() from hosting_guard.state;').trim(),'t');
 const denied=io.run('/usr/bin/docker',['exec','-i',target,'psql','-h','/tmp','-X','-Atq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:'insert into public.candidate_fence_fixture values(990003);',allowFailure:true});
 assert.notEqual(denied.status,0);assert.match(denied.stderr,/read-only/);
 assert.deepEqual(io.inspect(target).HostConfig.PortBindings??{},{});
 report={...report,passed:true,nativePgVerifyBackupPassed:true,encryptedRestorePassed:true,
  tableFingerprintsMatched:actual.tables.length,rlsAndPermissionsMatched:true,functionFingerprintMatched:true,
  targetLsn:manifest.targetLsn,replayPaused:true,coldWritesDenied:true,apiLoginsDisabled:true,privateFilesRestored:paired,
  ...(paired?{pairing,databaseConfigurationVolumeRestored:true}:{}),managedRestoreVerified:false};
}finally{
 if(created)io.docker(['stop','--time','3',target]);
 report.targetStopped=!created||!io.inspect(target).State.Running;io.json('result.json',report);
}
console.log(JSON.stringify(report));
