// Local, closed synthetic benchmark of PostgreSQL's native backup/WAL tools.
// No cloud I/O, production installer, writer admission or private-file claim.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {CandidateIO,digest,literal} from './candidate-io.mjs';
import {captureManifestSql} from './capture-manifest.mjs';
assert.equal(process.env.ATS_WAL_REHEARSAL,'1');
const [id]=process.argv.slice(2);assert.match(id,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/wal-rehearsal-'+id;mkdirSync(io.folder,{mode:0o700});
await io.ready();const source=io.assertSource();
assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
for(const s of ['app','api-gw','auth','rest','storage','imgproxy'])assert.equal(io.inspect(io.project+'-'+s+'-1').State.Running,false);
assert.equal(Number(io.sql("select count(*) from auth.users where banned_until is null or banned_until<clock_timestamp();")),0);
assert.equal(Number(io.sql("select count(*) from pg_tablespace where spcname not in('pg_default','pg_global');")),0);
assert.equal(Number(io.sql('select count(*) from pg_replication_slots;')),0);
assert.equal(io.sql('show full_page_writes;'),'on');assert.equal(io.sql('show wal_level;'),'logical');
const image=source.Image;assert.match(image,/^sha256:[a-f0-9]{64}$/);
io.env.PGPASSWORD=io.config.pg;
const connection=['--env','PGHOST=127.0.0.1','--env','PGPORT=5432','--env','PGUSER=supabase_admin','--env','PGPASSWORD',
 '--env','PGAPPNAME=ATS_WAL_REHEARSAL_'+id];
const common=['--network','container:'+io.db,'--read-only','--user','0:0','--cap-drop','ALL','--security-opt','no-new-privileges:true',
 '--pids-limit','64','--memory','512m','--memory-swap','512m','--cpus','1','--ulimit','core=0:0',
 '--tmpfs','/tmp:size=16m,mode=0700','--mount','type=bind,src='+io.folder+',dst=/output',...connection];
const client=(tool,args,options={})=>io.docker(['run','--rm',...common,'--entrypoint',tool,image,...args],{timeout:120000,...options});
const hba=io.sql('show hba_file;');assert.match(hba,/^\/(?:etc\/postgresql(?:-custom)?|var\/lib\/postgresql\/data)\/pg_hba\.conf$/);
const originalHba=io.docker(['exec',io.db,'cat',hba]);writeFileSync(io.folder+'/pg_hba.original.private.conf',originalHba,{mode:0o600});
const writeHba=content=>{io.docker(['exec','-i',io.db,'/bin/sh','-c','cat > "$1"','sh',hba],{input:content});assert.equal(io.docker(['exec',io.db,'sha256sum',hba]).split(' ')[0],digest(content));assert.equal(io.sql('select pg_reload_conf();'),'t');};
const recovery=io.folder+'/recovery';mkdirSync(recovery,{mode:0o700});mkdirSync(recovery+'/wal',{mode:0o700});
const slot='ats_wal_'+id,receiver='ats_crm_wal_receiver_'+id;let slotCreated=false,receiverCreated=false,hbaChanged=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 hbaChanged=true;writeHba('# Temporary closed synthetic WAL trial '+id+'\nhost replication supabase_admin 127.0.0.1/32 scram-sha-256\n'+originalHba);await sleep(250);
 const identity=client('psql',['-X','-Atq','--no-password','--dbname','replication=true','-c','IDENTIFY_SYSTEM']).trim().split('|');
 assert.match(identity[0],/^[0-9]+$/);assert.match(identity[1],/^[0-9]+$/);
 io.sql('select slot_name from pg_create_physical_replication_slot('+literal(slot)+',true);');slotCreated=true;
 client('pg_basebackup',['--no-password','--pgdata=/output/recovery/base','--format=tar','--compress=gzip:6',
  '--wal-method=stream','--checkpoint=fast','--manifest-checksums=SHA256','--no-clean']);
 const baseBytes=readFileSync(recovery+'/base/backup_manifest','utf8'),baseManifest=JSON.parse(baseBytes);
 assert.equal(baseBytes.match(/"System-Identifier"\s*:\s*([0-9]+)/)?.[1],identity[0]);
 assert.ok(baseManifest['WAL-Ranges'].length>0);
 io.docker(['run','--detach','--name',receiver,'--label','ats-purpose=synthetic-wal-rehearsal',...common,
  '--entrypoint','pg_receivewal',image,'--no-password','--no-loop','--synchronous','--status-interval=1',
  '--slot='+slot,'--directory=/output/recovery/wal','--compress=gzip:6']);receiverCreated=true;
 for(let n=0;;n++){assert.ok(n<50,'Native receiver did not connect');if(Number(io.sql("select count(*) from pg_stat_replication where application_name="+literal('ATS_WAL_REHEARSAL_'+id)))===1)break;await sleep(100);}
 const binary=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(binary)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
 const password=io.folder+'/password.private';writeFileSync(password,randomBytes(48).toString('base64'),{mode:0o600,flag:'wx'});
 const repo=io.folder+'/encrypted-repository',restic=args=>io.run(binary,['--repo',repo,'--password-file',password,'--no-cache',...args],{timeout:60000}).stdout;
 restic(['init','--repository-version','2']);
 const inventory=()=>{const out=[];function walk(dir,prefix=''){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());const n=prefix+e.name;if(e.isDirectory())walk(dir+'/'+e.name,n+'/');else out.push({name:n,size:statSync(dir+'/'+e.name).size});}}walk(repo);return out;};
 async function checkpoint(sequence){
  const startedAt=new Date().toISOString(),startedBootMs=Number(readFileSync('/proc/uptime','utf8').split(' ')[0])*1000;
  const database=JSON.parse(io.sql(captureManifestSql)),challenge=randomBytes(32).toString('hex');
  // A committed native WAL message creates a real cutoff even on an idle DB.
  // The subsequent switch can return the START of the next segment, which is
  // still partial. Verify the completed segment containing the previous byte.
  io.sql('select pg_logical_emit_message(true,\'ats_backup_rehearsal\','+literal(challenge)+');');
  const lsn=io.sql('select pg_current_wal_insert_lsn()::text;'),switchedThroughLsn=io.sql('select pg_switch_wal()::text;');
  const file=io.sql('select pg_walfile_name('+literal(switchedThroughLsn)+'::pg_lsn-1);');
  assert.match(file,/^[A-F0-9]{24}$/);
  for(let n=0;;n++){
   assert.ok(n<40,'Completed and acknowledged native WAL segment unavailable');
   const flushed=io.sql('select coalesce(bool_and(flush_lsn>='+literal(switchedThroughLsn)+'::pg_lsn),false) from pg_stat_replication where application_name='+literal('ATS_WAL_REHEARSAL_'+id)+';');
   if(existsSync(recovery+'/wal/'+file+'.gz')&&flushed==='t')break;
   await sleep(250);
  }
  assert.deepEqual(JSON.parse(io.sql(captureManifestSql)),database,'Synthetic state changed during cutoff');
  const manifest={version:1,syntheticOnly:true,format:'native-pg-base-and-wal-benchmark',sequence,
   sourceId:io.project,sourceDbImage:image,systemIdentifier:identity[0],timeline:Number(identity[1]),
   databaseBoot:io.sql('select pg_postmaster_start_time()::text;'),captureStartedAt:startedAt,captureStartedBootMs:startedBootMs,
   sourceMigrationCount:102,targetLsn:lsn,switchedThroughLsn,targetWalFile:file,challenge,baseManifestSha256:digest(readFileSync(recovery+'/base/backup_manifest')),database,
   sourceWritesAdmitted:false,privateFilesPaired:false};
  writeFileSync(recovery+'/checkpoint.private.json',JSON.stringify(manifest),{mode:0o600});
  const output=restic(['backup','--json','--compression','max','--pack-size','8','--exclude','*.partial',recovery]);restic(['check','--read-data']);
  const summary=output.trim().split('\n').map(s=>JSON.parse(s)).find(s=>s.message_type==='summary');
  return {sequence,snapshotId:summary.snapshot_id,manifestSha256:digest(readFileSync(recovery+'/checkpoint.private.json')),
   targetLsn:lsn,targetWalFile:file,inventory:inventory(),nativeCompressedWalBytes:statSync(recovery+'/wal/'+file+'.gz').size,
   durationMs:Date.now()-Date.parse(startedAt)};
 }
 const first=await checkpoint(1);io.json('checkpoint-1.json',first);
 io.sql(`begin;set local session_replication_role=replica;
  delete from public.system_health_checks where id in(select id from public.system_health_checks where check_source='ATS_BACKUP_SCALE_V1' order by id limit 100);
  insert into public.system_health_checks(component_key,status,latency_ms,summary,check_source,details)
  select 'ats_backup_scale','operational',g,'Synthetic capacity fixture; no customer data.','ATS_BACKUP_SCALE_V1',jsonb_build_object('synthetic',true,'proof',md5('ATS_NATIVE_WAL_ROLL_'||g::text)) from generate_series(1,100)g;
  commit;`);
 const second=await checkpoint(2);io.json('checkpoint-2.json',second);
 const old=new Set(first.inventory.map(o=>o.name)),delta=second.inventory.filter(o=>!old.has(o.name)).reduce((n,o)=>n+o.size,0);
 const result={syntheticOnly:true,nativePostgresTools:true,sourceDbImage:image,systemIdentifier:identity[0],
  initialEncryptedBytes:first.inventory.reduce((n,o)=>n+o.size,0),rollingEncryptedBytes:delta,
  rollingCompressedWalBytes:second.nativeCompressedWalBytes,rollingMonthlyPayloadBytes:delta*720*31,
  checkpoints:[first,second].map(({inventory,...c})=>c),nativeEncryptedCheckPassed:true,
  privateFilesPaired:false,cloudVerified:false,coldRestoreVerified:false,writerAdmission:false,productionChanged:false};
 io.json('result.json',result);console.log(JSON.stringify(result));
}finally{
 const errors=[];
 for(const cleanup of [()=>{if(receiverCreated)io.docker(['stop','--time','5',receiver]);},
  ()=>{if(slotCreated)io.sql('select pg_drop_replication_slot('+literal(slot)+');');},()=>{if(hbaChanged)writeHba(originalHba);}]){
  try{cleanup();}catch(error){errors.push(error.message);}
 }
 io.json('cleanup.json',{receiverStopped:errors.length===0,temporarySlotDropped:errors.length===0,originalHbaRestored:!hbaChanged||io.docker(['exec',io.db,'sha256sum',hba]).split(' ')[0]===digest(originalHba),errors});
 assert.equal(errors.length,0,'Synthetic WAL cleanup needs operator review');
}
