// Synthetic, supervised hard-fence and paired capture. No production activation.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { CandidateIO, digest, literal, identifier } from './candidate-io.mjs';
import { captureManifestSql } from './capture-manifest.mjs';
import { hardFenceProblems } from './failover-proof.mjs';
import { functionMetadataSql } from './function-metadata.mjs';
const reuse=process.env.ATS_FAILOVER_REUSE_FIXTURE==='1';
const resume=reuse||process.env.ATS_FAILOVER_RESUME_PRE_FIXTURE==='1';
const io=new CandidateIO({create:!resume}),capture=io.folder+'/capture';
if(resume){assert.equal(existsSync(capture+'/fixture.private.json'),reuse);assert.equal(existsSync(capture+'/manifest.private.json'),false);assert.equal(existsSync(capture+'/database.dump'),false);}else mkdirSync(capture,{mode:0o700});
assert.match(process.env.ATS_FAILOVER_CHALLENGE,/^[a-f0-9]{64}$/);
const compose=['compose','--env-file',io.root+'/selfhost/core.private.env','-f',io.root+'/selfhost/compose.json'];
const restic=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(restic)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
let writer,completed=false;
try{
  io.docker([...compose,'up','-d','--wait','--wait-timeout','120','db']);await io.ready();const source=io.assertSource();
  const epoch=Number(io.sql('select epoch from hosting_guard.state;'))+1;
  io.sql(`with lease_clock as materialized(select clock_timestamp() as lease_at) select hosting_guard.accept_rehearsal_lease(${epoch},'synthetic-home',lease_at,lease_at+interval '29 seconds',lease_at) from lease_clock;`);
  if(!reuse){
    io.docker([...compose,'up','-d','--wait','--wait-timeout','120','app']);
    const fixtureSource=readFileSync(new URL('./recovery-fixture.mjs',import.meta.url));
    io.docker(['exec','-i','-e','HOME_FAILOVER_REHEARSAL=1',io.app,'node','--input-type=module','-'],{input:fixtureSource});
    const fixtureText=io.docker(['exec',io.app,'cat','/tmp/recovery-fixture.private.json']);writeFileSync(capture+'/fixture.private.json',fixtureText,{mode:0o600});
  }else{
    assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0,'Fixture reuse requires every API login to remain disabled.');
  }
  const roles=reuse?JSON.parse(readFileSync(io.folder+'/desired-role-state.private.json')):JSON.parse(io.sql("select jsonb_agg(to_jsonb(r) order by rolname) from(select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname !~ '^pg_')r;"));
  if(!reuse)io.json('desired-role-state.private.json',roles);
  const memberships=JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(m) order by role_name,member_name),'[]') from(select r.rolname role_name,u.rolname member_name,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles u on u.oid=a.member)m;"));
  const sequenceOwnerPrivileges=JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(s) order by schema_name,sequence_name),'[]') from(select n.nspname schema_name,c.relname sequence_name,pg_get_userbyid(c.relowner) owner_name,array(select privilege_type from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner)))a where a.grantee=c.relowner and a.grantor=c.relowner order by privilege_type) privileges from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in('public','app_private','auth','storage'))s;"));
  const testPassword=randomBytes(32).toString('hex'),application='ATS_LONG_WRITER_'+io.id;
  io.sql(`alter role candidate_fence_api login password ${literal(testPassword)};with lease_clock as materialized(select clock_timestamp() as lease_at) select hosting_guard.accept_rehearsal_lease(${epoch},'synthetic-home',lease_at,lease_at+interval '29 seconds',lease_at) from lease_clock;`);
  writer=spawn('/usr/bin/docker',['exec','-i','-e','PGPASSWORD','-e','PGAPPNAME',io.db,'psql','-h','127.0.0.1','-X','-Atq','-v','ON_ERROR_STOP=1','-U','candidate_fence_api','-d','postgres'],{env:{...io.env,PGPASSWORD:testPassword,PGAPPNAME:application},stdio:['pipe','pipe','pipe']});
  let writerOutput='';writer.stdout.on('data',b=>writerOutput+=b);writer.stderr.on('data',b=>writerOutput+=b);const writerExit=new Promise((resolve,reject)=>{writer.on('error',reject);writer.on('close',code=>resolve(code));});
  writer.stdin.end('begin;set constraints all immediate;insert into public.candidate_fence_fixture values(771001);select pg_sleep(45);commit;');
  let admitted=false;for(let n=0;n<40;n++){if(Number(io.sql(`select count(*) from pg_stat_activity where application_name=${literal(application)} and wait_event='PgSleep' and xact_start is not null;`))===1){admitted=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(admitted,'Long transaction was not admitted.');
  const captureStartedAt=new Date().toISOString();
  const loginRoles=JSON.parse(io.sql("select jsonb_agg(rolname order by rolname) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');"));assert.ok(loginRoles.includes('candidate_fence_api'));
  io.sql('begin;update hosting_guard.state set epoch=epoch+1,expires_at=clock_timestamp()-interval \'1 second\';'+loginRoles.map(role=>'alter role '+identifier(role)+' nologin;').join('')+'commit;');
  io.sql("select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin') and pid<>pg_backend_pid();");
  assert.notEqual(await writerExit,0);writeFileSync(io.folder+'/terminated-writer.private.log',writerOutput,{mode:0o600});
  assert.equal(Number(io.sql('select count(*) from public.candidate_fence_fixture where id=771001;')),0,'The fenced transaction committed.');
  const writesFencedAt=new Date().toISOString();
  const serviceNames=['app','api-gw','auth','rest','storage','imgproxy','db'];
  for(const name of serviceNames){const c=io.inspect(io.project+'-'+name+'-1');assert.equal(c.Config.Labels['com.docker.compose.project'],io.project);assert.equal(c.HostConfig.RestartPolicy.Name,'no');}
  const appConfig=io.inspect(io.app);assert.ok(!appConfig.Config.Env.some(v=>/^(STRIPE_|RESEND_|TWILIO_|GOOGLE_)[^=]*=.+/.test(v)));
  io.docker(['stop','--time','2',...serviceNames.filter(s=>s!=='db').map(s=>io.project+'-'+s+'-1')]);
  const sessions=Number(io.sql("select count(*) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin');"));assert.equal(sessions,0);
  io.sql("do $$declare n integer;begin if to_regclass('cron.job') is not null then execute 'select count(*) from cron.job where active' into n;if n<>0 then raise exception 'A database scheduler is active';end if;elsif exists(select 1 from pg_extension where extname='pg_cron')then raise exception 'Scheduler catalog cannot be verified';end if;end$$;");
  assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
  const before=JSON.parse(io.sql(captureManifestSql));
  io.binary(['exec',io.db,'pg_dump','-U','supabase_admin','-d','postgres','-Fc'],capture+'/database.dump');
  const objectVolume=io.project+'_object-data',nodeImage='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
  const volume=JSON.parse(io.docker(['volume','inspect',objectVolume]))[0];assert.equal(volume.Name,objectVolume);
  io.binary(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','128m','--memory-swap','128m','--mount','type=volume,src='+objectVolume+',dst=/objects,readonly','--entrypoint','tar',nodeImage,'-C','/objects','-cf','-','.'],capture+'/objects.tar');
  const scan=`const fs=require('fs'),p=require('path'),c=require('crypto');const out=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isSymbolicLink())throw Error('Unexpected symbolic link');if(e.isDirectory())walk(f);else{const b=fs.readFileSync(f);out.push({path:p.relative('/objects',f),size:b.length,sha256:c.createHash('sha256').update(b).digest('hex')})}}}walk('/objects');console.log(JSON.stringify(out.sort((a,b)=>a.path.localeCompare(b.path))));`;
  const objects=JSON.parse(io.docker(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--memory','128m','--memory-swap','128m','--mount','type=volume,src='+objectVolume+',dst=/objects,readonly',nodeImage,'node','-e',scan]));assert.ok(objects.length>0&&objects.length<100);
  assert.deepEqual(JSON.parse(io.sql(captureManifestSql)),before,'Source records changed during paired capture.');
  copyFileSync(io.root+'/selfhost/core.private.env',capture+'/core.private.env');copyFileSync(io.root+'/selfhost/app.private.env',capture+'/app.private.env');copyFileSync(io.root+'/release-source.tar.gz',capture+'/release-source.tar.gz');
  const functionDetails=JSON.parse(io.sql(functionMetadataSql));
  io.docker(['stop','--time','3',io.db]);
  const receipt={version:1,namespace:io.namespace,sourceId:io.project,sourceBoot:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),sourceImage:source.Image.replace('sha256:',''),generation:epoch+1,challenge:process.env.ATS_FAILOVER_CHALLENGE,writesFencedAt,nonOperatorSessions:sessions,apiLoginsDisabled:true,longTransactionRolledBack:true,providerCallsDisabled:true,uncertainOutcomesHeld:true,containers:serviceNames.map(service=>{const c=io.inspect(io.project+'-'+service+'-1');return{service,id:c.Id,running:c.State.Running,restart:c.HostConfig.RestartPolicy.Name};})};
  assert.deepEqual(hardFenceProblems(receipt),[]);io.json('hard-fence-receipt.json',receipt);
  const manifest={version:1,namespace:io.namespace,syntheticOnly:true,sourceMigrationCount:102,captureStartedAt,captureCompletedAt:new Date().toISOString(),writesFencedAt,sourceId:io.project,roles,memberships,sequenceOwnerPrivileges,database:before,functionDetails,objects,objectInventory:scan,sourceDbImage:source.Image,sourceAppImage:appConfig.Image,databaseSha256:digest(readFileSync(capture+'/database.dump')),objectArchiveSha256:digest(readFileSync(capture+'/objects.tar')),releaseSourceSha256:digest(readFileSync(capture+'/release-source.tar.gz')),sourceBytesPaired:true,sourceFence:receipt};
  writeFileSync(capture+'/manifest.private.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  const password=io.folder+'/recovery-password.private',repo=io.folder+'/encrypted-repository';writeFileSync(password,randomBytes(48).toString('base64')+'\n',{mode:0o600,flag:'wx'});
  const backup=(...args)=>io.run(restic,['--repo',repo,'--password-file',password,'--no-cache',...args]).stdout;
  backup('init','--repository-version','2');const summary=backup('backup','--json','--pack-size','8','--tag','synthetic-102',capture).trim().split('\n').map(l=>JSON.parse(l)).find(r=>r.message_type==='summary');assert.match(summary.snapshot_id,/^[a-f0-9]{64}$/);backup('check','--read-data');
  const proof={version:1,namespace:io.namespace,captureStartedAt,captureCompletedAt:manifest.captureCompletedAt,manifestSha256:digest(readFileSync(capture+'/manifest.private.json')),snapshotId:summary.snapshot_id,pairedDatabaseAndObjects:true,authIncluded:true,paymentDeliveryHistoryIncluded:true,sourceMigrationCount:102,writesFencedAt,sourceRemainsStopped:true,productionChanged:false,managedDatabaseRecoveryVerified:false};io.json('capture-proof.json',proof);io.json('run-location.json',{id:io.id,folder:io.folder});completed=true;
  console.log(JSON.stringify({id:io.id,pairedCaptureCreated:true,longTransactionRolledBack:true,sourceHardFenced:true,objects:objects.length,productionChanged:false,managedDatabaseRecoveryVerified:false}));
}finally{
  if(!completed){if(writer&&!writer.killed)writer.kill('SIGTERM');try{io.docker(['stop','--time','2',...['app','api-gw','auth','rest','storage','imgproxy','db'].map(s=>io.project+'-'+s+'-1')]);}catch{}io.json('capture-failed.json',{sourceIntendedStopped:true,productionChanged:false});}
}
