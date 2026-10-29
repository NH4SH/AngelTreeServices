// A separate-machine, read-only synthetic restore. No source SSH, source SQL,
// exposed ports, existing-volume reuse, provider sends, or promotion command.
import assert from 'node:assert/strict';import fs from 'node:fs';import {hostname} from 'node:os';import {spawnSync} from 'node:child_process';
import {captureManifestSql} from './capture-manifest.mjs';import {validateDatabaseRuntime} from './database-runtime.mjs';
assert.equal(process.env.ATS_SEPARATE_NATIVE_RECOVERY,'1');assert.equal(hostname(),'lima-pr02-disposable');
assert.equal(process.platform,'linux');assert.equal(process.arch,'arm64');assert.equal(process.getuid(),501);process.umask(0o077);
const [id]=process.argv.slice(2);assert.match(id,/^[a-f0-9]{12}$/);const folder=process.env.HOME+'/ats-native-recovery-'+id;
assert.equal(fs.realpathSync(folder),folder);const input=folder+'/restored';assert.equal(fs.realpathSync(input),input);
const base=JSON.parse(fs.readFileSync(input+'/checkpoint.private.json')),latest=JSON.parse(fs.readFileSync(input+'/latest.private.json'));
assert.equal(base.syntheticOnly,true);assert.equal(latest.syntheticOnly,true);assert.equal(base.sourceId,'ats_crm_candidate_20261027');
assert.deepEqual(latest.binding,base.binding);assert.equal(latest.sourceDbImage,base.sourceDbImage);
assert.equal(latest.baseManifestSha256,base.baseManifestSha256);assert.equal(latest.privatePairSha256,base.privatePairSha256);
validateDatabaseRuntime(base.databaseRuntime,base.sourceDbImage);assert.match(latest.targetLsn,/^[A-F0-9]+\/[A-F0-9]+$/);
const image='public.ecr.aws/supabase/postgres@'+base.sourceDbImage;assert.equal(image,'public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706');
let step=0;const env={HOME:process.env.HOME,PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///run/user/501/docker.sock'};
function execute(args,{input,allowFailure=false,timeout=120000}={}){const r=spawnSync('/usr/bin/docker',args,{env,input,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
 fs.writeFileSync(folder+'/step-'+(++step)+'.private.log',(r.stdout??'')+'\n'+(r.stderr??''));if(!allowFailure)assert.equal(r.status,0,'Separate recovery step failed: '+step);return r;}
const docker=args=>execute(args).stdout.trim();
assert.ok(JSON.parse(docker(['info','--format','{{json .SecurityOptions}}'])).includes('name=rootless'));
docker(['pull',image]);assert.equal(JSON.parse(docker(['image','inspect',image]))[0].Id,base.sourceDbImage);
const project='ats_crm_separate_'+id,target=project+'-db',data=project+'-data',wal=project+'-wal',config=project+'-config';
assert.notEqual(execute(['inspect',target],{allowFailure:true}).status,0);
for(const name of [data,wal,config]){assert.notEqual(execute(['volume','inspect',name],{allowFailure:true}).status,0);docker(['volume','create','--label','ats-purpose=separate-synthetic-native-recovery',name]);}
const sandbox=['--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','128','--memory','512m','--memory-swap','512m','--cpus','1','--ulimit','core=0:0'];
const uid=docker(['run','--rm',...sandbox,'--entrypoint','id',image,'-u','postgres']),gid=docker(['run','--rm',...sandbox,'--entrypoint','id',image,'-g','postgres']);
for(const n of [uid,gid])assert.match(n,/^[0-9]+$/);
const settings=["data_directory='/var/lib/postgresql/data'","hba_file='/recovery/pg_hba.conf'","ident_file='/recovery/pg_ident.conf'","listen_addresses=''","unix_socket_directories='/tmp'","shared_buffers='32MB'","wal_level='logical'","hot_standby=on","archive_mode=off","restore_command='gzip -dc /recovery/wal/%f.gz > %p'","recovery_target_lsn='"+latest.targetLsn+"'","recovery_target_inclusive=on","recovery_target_action='pause'","recovery_target_timeline='"+latest.timeline+"'","fsync=on","full_page_writes=on"];
for(const [name,value] of Object.entries(base.databaseRuntime.effectiveRecoverySettings))settings.push(name+'='+value);
fs.writeFileSync(input+'/recovery.conf',settings.join('\n')+'\n');fs.writeFileSync(input+'/pg_hba.conf','local all supabase_admin trust\nlocal all all reject\n');fs.writeFileSync(input+'/pg_ident.conf','');
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
tar -xf /read/db-config.tar -C /db-config --no-same-owner
touch /data/recovery.signal
chmod 700 /data /recovery
chown -R ${uid}:${gid} /data /recovery /db-config
`;
docker(['run','--rm',...sandbox,'--user','0:0','--cap-add','CHOWN','--tmpfs','/tmp:size=16m,mode=0700','--mount','type=bind,src='+input+',dst=/read,readonly','--mount','type=volume,src='+data+',dst=/data','--mount','type=volume,src='+wal+',dst=/recovery','--mount','type=volume,src='+config+',dst=/db-config','--entrypoint','sh',image,'-c',prepare]);
let created=false;let report={passed:false,syntheticOnly:true,productionChanged:false,sourceConnectionUsed:false};
try{
 docker(['run','--detach','--name',target,'--label','ats-purpose=separate-synthetic-native-recovery',...sandbox,'--user',uid+':'+gid,'--tmpfs','/tmp:size=16m,uid='+uid+',gid='+gid+',mode=0700','--mount','type=volume,src='+data+',dst=/var/lib/postgresql/data','--mount','type=volume,src='+wal+',dst=/recovery,readonly','--mount','type=volume,src='+config+',dst=/etc/postgresql-custom,readonly','--entrypoint','postgres',image,'-D','/var/lib/postgresql/data','-c','config_file=/recovery/postgresql.conf']);created=true;
 const query=sql=>execute(['exec','-i',target,'psql','-h','/tmp','-X','-Atq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:sql}).stdout.trim();
 for(let n=0;;n++){assert.ok(n<160,'Separate replay did not reach target');const r=execute(['exec',target,'pg_isready','-h','/tmp','-U','supabase_admin','-d','postgres'],{allowFailure:true});
  if(r.status===0&&query('select pg_is_in_recovery() and pg_is_wal_replay_paused();')==='t')break;
  assert.equal(JSON.parse(docker(['inspect',target]))[0].State.Running,true);await new Promise(r=>setTimeout(r,250));}
 const actual=JSON.parse(query(captureManifestSql));assert.deepEqual(actual,latest.database);
 const apiLogins=Number(query("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');"));
 if(base.binding.captureMode!=='transaction-barrier')assert.equal(apiLogins,0);
 const apiDenied=execute(['exec',target,'psql','-h','/tmp','-X','-Atq','-U','authenticator','-d','postgres','-c','select 1'],{allowFailure:true});
 assert.notEqual(apiDenied.status,0);assert.match(apiDenied.stderr,/pg_hba.conf rejects connection/);
 assert.equal(query('select database_started_at<>pg_postmaster_start_time() from hosting_guard.state;'),'t');
 const denied=execute(['exec','-i',target,'psql','-h','/tmp','-X','-Atq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:'insert into public.candidate_fence_fixture values(990003);',allowFailure:true});assert.notEqual(denied.status,0);assert.match(denied.stderr,/read-only/);
 assert.deepEqual(JSON.parse(docker(['inspect',target]))[0].HostConfig.PortBindings??{},{});
 report={...report,passed:true,nativePgVerifyBackupPassed:true,recoverySettingsFromEncryptedPackage:true,tableFingerprintsMatched:actual.tables.length,rlsAndPermissionsMatched:true,functionFingerprintMatched:true,targetLsn:latest.targetLsn,replayPaused:true,coldWritesDenied:true,apiLoginsDisabled:apiLogins===0,apiConnectionsDenied:true,configurationVolumeRestored:true,managedRestoreVerified:false};
}finally{
 if(created)docker(['stop','--time','3',target]);report.targetStopped=!created||!JSON.parse(docker(['inspect',target]))[0].State.Running;
 fs.writeFileSync(folder+'/result.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
