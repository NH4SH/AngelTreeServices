// Explicitly scoped, synthetic home-VM rehearsal. No production installer.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,renameSync,unlinkSync,readdirSync,statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CandidateIO,digest,literal,identifier } from './candidate-io.mjs';
import { captureManifestSql } from './capture-manifest.mjs';
import { functionMetadataSql } from './function-metadata.mjs';
import { createDatabaseParts } from './database-parts.mjs';
import { continuousPolicy as policy,validateContinuousReceipt,acceptNextReceipt,clockIsSafe } from './continuous-policy.mjs';

assert.equal(process.env.ATS_CONTINUOUS_REHEARSAL,'1');
assert.equal(hostname(),'lima-ats-crm-candidate-20261027');
assert.equal(process.platform,'linux');assert.equal(process.getuid(),501);process.umask(0o077);
const [command,id,argument]=process.argv.slice(2);assert.match(id,/^[a-f0-9]{12}$/);
const payloadLayout=process.env.ATS_BACKUP_PAYLOAD;assert.ok(payloadLayout===undefined||payloadLayout==='parts-v1');
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/continuous-'+id;io.namespace='ats-rehearsal-continuous-'+id;
io.env.XDG_RUNTIME_DIR='/run/user/501';io.env.DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/501/bus';
const self=fileURLToPath(import.meta.url),node=process.execPath,services=['db','app','api-gw','auth','rest','storage','imgproxy'];
const allowedRoles=['authenticator','supabase_auth_admin','supabase_storage_admin','candidate_fence_api'];
const json=name=>JSON.parse(readFileSync(io.folder+'/'+name+'.json','utf8'));
const atomic=(name,value)=>{const p=io.folder+'/'+name+'.json';writeFileSync(p+'.new',JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(p+'.new',p);};
const boot=()=>readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
const monotonic=()=>Number(readFileSync('/proc/uptime','utf8').split(' ')[0])*1000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function run(program,args,options={}){return io.run(program,args,{timeout:5000,...options});}
function config(){const c=json('binding');assert.equal(c.namespace,io.namespace);assert.equal(c.sourceId,io.project);assert.equal(c.sourceBoot,boot());return c;}
function receipt(){const c=config(),active=json('active');const claims=validateContinuousReceipt(active.envelope,readFileSync(io.folder+'/authority-public.pem'),c);assert.ok(monotonic()<active.deadlineBootMs);return{active,claims};}
function cgroupPath(containerId){assert.match(containerId,/^[a-f0-9]{64}$/);return '/sys/fs/cgroup/user.slice/user-501.slice/user@501.service/user.slice/docker-'+containerId+'.scope';}
async function fence(reason){
  const c=config(),startedAt=new Date().toISOString(),startedBootMs=monotonic();
  writeFileSync(io.folder+'/fenced.latch',reason+'\n',{flag:'a',mode:0o600});
  const killed=[];
  // DB first. Kernel cgroup.kill does not need a responding Docker daemon and
  // includes backend processes that forced deferred checks to run early.
  for(const service of services){const group=cgroupPath(c.containers[service]),events=group+'/cgroup.events';
    if(existsSync(events)&&/populated 1/.test(readFileSync(events,'utf8'))){writeFileSync(group+'/cgroup.kill','1');
      for(let n=0;n<100&&existsSync(events)&&/populated 1/.test(readFileSync(events,'utf8'));n++)await sleep(10);
      assert.ok(!existsSync(events)||!/populated 1/.test(readFileSync(events,'utf8')),'A writer cgroup survived');
    }killed.push(service);
  }
  const result={reason,startedAt,completedAt:new Date().toISOString(),startedBootMs,completedBootMs:monotonic(),sourceBoot:c.sourceBoot,services:killed,kernelFence:true,productionChanged:false};
  atomic('fence-result',result);return result;
}
function timerActive(unit){const r=run('/usr/bin/systemctl',['--user','show',unit+'.timer','--property=ActiveState','--value']);return r.stdout.trim()==='active';}
function renewedLease(){
  assert.equal(existsSync(io.folder+'/fenced.latch'),false,'A latched fence requires a new operator rehearsal');
  const {active,claims}=receipt();assert.ok(timerActive(active.timer),'Independent deadline timer is missing');
  const c=config();assert.equal(io.sql('select pg_postmaster_start_time()::text;'),c.databaseBoot);
  const expires=literal(claims.expiresAt),capture=literal(claims.captureStartedAt);
  // The persistent capture flag and advisory lock close a race with the backup
  // worker. A lease renewal can never reopen API logins in the middle of capture.
  io.sql(`begin;select pg_advisory_xact_lock(178214,4110);do $lease$ declare at timestamptz:=clock_timestamp();begin
    if not (select capture_in_progress from hosting_guard.state where singleton) then
      perform hosting_guard.accept_rehearsal_lease(${c.generation},'synthetic-home',at,least(at+interval '14 seconds',${expires}::timestamptz),${capture}::timestamptz);
      ${allowedRoles.map(r=>'alter role '+identifier(r)+' login;').join('\n')}
    end if;end$lease$;commit;`);
}
function verifySourceIds(c){for(const s of services){const info=io.inspect(io.project+'-'+s+'-1');assert.equal(info.Id,c.containers[s]);assert.equal(info.HostConfig.RestartPolicy.Name,'no');assert.equal(info.Config.Labels['com.docker.compose.project'],io.project);}}

if(command==='init'){
  assert.equal(existsSync(io.folder),false);mkdirSync(io.folder,{mode:0o700});
  await io.ready();io.assertSource();
  assert.equal(Number(io.sql("select count(*) from auth.users where banned_until is null or banned_until<clock_timestamp();")),0);
  assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
  const containers={};for(const s of services){const info=io.inspect(io.project+'-'+s+'-1');containers[s]=info.Id;assert.equal(info.HostConfig.RestartPolicy.Name,'no');assert.ok(s==='db'||!info.State.Running);}
  const current=Number(io.sql('select epoch from hosting_guard.state where singleton;'));
  io.sql('alter table hosting_guard.state add column if not exists capture_in_progress boolean not null default true;update hosting_guard.state set capture_in_progress=true,expires_at=clock_timestamp()-interval \'1 second\';');
  const workloadStart=Number(io.sql('select coalesce(max(id),799999)+1 from public.candidate_fence_fixture where id>=800000 and id<900000;'));
  assert.ok(Number.isSafeInteger(workloadStart)&&workloadStart>=800000&&workloadStart+399<900000,'Synthetic fixture range is exhausted');
  const binding={version:1,namespace:io.namespace,generation:current+1,sourceId:io.project,sourceBoot:boot(),databaseBoot:io.sql('select pg_postmaster_start_time()::text;'),topology:io.sql('select hosting_guard.catalog_fingerprint();'),workloadStart,containers};
  atomic('binding',binding);writeFileSync(io.folder+'/recovery-password.private',randomBytes(48).toString('base64')+'\n',{mode:0o600,flag:'wx'});
  const testPassword=randomBytes(32).toString('hex');writeFileSync(io.folder+'/test-password.private',testPassword,{mode:0o600,flag:'wx'});io.sql('alter role candidate_fence_api password '+literal(testPassword)+';');
  console.log(JSON.stringify(binding));
}else if(command==='capture'){
  const c=config();verifySourceIds(c);assert.equal(existsSync(io.folder+'/fenced.latch'),false);
  const sequence=Number(argument);assert.ok(Number.isSafeInteger(sequence)&&sequence>=1&&sequence<=8);
  const out=io.folder+'/capture-'+sequence;mkdirSync(out,{mode:0o700});
  writeFileSync(io.folder+'/capture.lock',String(sequence),{flag:'wx',mode:0o600});
  const startedAt=new Date().toISOString(),startedBootMs=monotonic();let completed=false;const paused=[];
  try{
    io.sql(`begin;select pg_advisory_xact_lock(178214,4110);update hosting_guard.state set capture_in_progress=true;${allowedRoles.map(r=>'alter role '+identifier(r)+' nologin;').join('')}commit;`);
    for(const s of services.filter(s=>s!=='db')){const info=io.inspect(io.project+'-'+s+'-1');if(info.State.Running){io.docker(['pause',info.Id],{timeout:5000});paused.push(info.Id);}}
    io.sql("select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin') and pid<>pg_backend_pid();");
    assert.equal(Number(io.sql("select count(*) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin');")),0);
    const before=JSON.parse(io.sql(captureManifestSql));
    io.binary(['exec',io.db,'pg_dump','-U','supabase_admin','-d','postgres','-Fc',...(payloadLayout?['--compress=none']:[])],out+'/database.dump',{timeout:20000});
    const databaseParts=payloadLayout?createDatabaseParts(out+'/database.dump',out+'/database.parts'):undefined;
    const image='node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d',volume=io.project+'_object-data';
    io.binary(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--memory','128m','--memory-swap','128m','--mount','type=volume,src='+volume+',dst=/objects,readonly','--entrypoint','tar',image,'-C','/objects','-cf','-','.'],out+'/objects.tar',{timeout:20000});
    const inventory=`const fs=require('fs'),p=require('path'),c=require('crypto'),out=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isSymbolicLink())throw Error('Unexpected symlink');if(e.isDirectory())walk(f);else{const b=fs.readFileSync(f);out.push({path:p.relative('/objects',f),size:b.length,sha256:c.createHash('sha256').update(b).digest('hex')});}}}walk('/objects');console.log(JSON.stringify(out.sort((a,b)=>a.path.localeCompare(b.path))));`;
    const objects=JSON.parse(io.docker(['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--memory','128m','--memory-swap','128m','--mount','type=volume,src='+volume+',dst=/objects,readonly',image,'node','-e',inventory]));
    assert.deepEqual(JSON.parse(io.sql(captureManifestSql)),before);
    for(const [from,to] of [['selfhost/core.private.env','core.private.env'],['selfhost/app.private.env','app.private.env'],['release-source.tar.gz','release-source.tar.gz']])copyFileSync(io.root+'/'+from,out+'/'+to);
    const roles=JSON.parse(io.sql("select jsonb_agg(to_jsonb(r) order by rolname) from(select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname !~ '^pg_')r;"));
    const memberships=JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(m) order by role_name,member_name),'[]') from(select r.rolname role_name,u.rolname member_name,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles u on u.oid=a.member)m;"));
    const sequenceOwnerPrivileges=JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(s) order by schema_name,sequence_name),'[]') from(select n.nspname schema_name,c.relname sequence_name,pg_get_userbyid(c.relowner) owner_name,array(select privilege_type from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner)))a where a.grantee=c.relowner and a.grantor=c.relowner order by privilege_type) privileges from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in('public','app_private','auth','storage'))s;"));
    if(existsSync(io.folder+'/fixture.private.json'))copyFileSync(io.folder+'/fixture.private.json',out+'/fixture.private.json');
    const manifest={version:1,syntheticOnly:true,namespace:io.namespace,sequence,sourceMigrationCount:102,captureStartedAt:startedAt,captureStartedBootMs:startedBootMs,captureCompletedAt:new Date().toISOString(),binding:c,sourceDbImage:io.inspect(io.db).Image,roles,memberships,sequenceOwnerPrivileges,database:before,functions:JSON.parse(io.sql(functionMetadataSql)),objects,databaseSha256:digest(readFileSync(out+'/database.dump')),objectArchiveSha256:digest(readFileSync(out+'/objects.tar')),releaseSourceSha256:digest(readFileSync(out+'/release-source.tar.gz'))};
    if(databaseParts)manifest.databaseParts=databaseParts;
    writeFileSync(out+'/manifest.private.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});completed=true;
  }finally{
    if(completed){io.sql('update hosting_guard.state set capture_in_progress=false where singleton;');for(const container of paused)io.docker(['unpause',container],{timeout:5000});unlinkSync(io.folder+'/capture.lock');}
  }
  const pauseMs=monotonic()-startedBootMs,restic=io.root+'/recovery-tools/restic_0.19.1_linux_arm64';assert.equal(digest(readFileSync(restic)),'2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
  const repo=io.folder+'/encrypted-repository',backup=(...args)=>io.run(restic,['--repo',repo,'--password-file',io.folder+'/recovery-password.private','--no-cache',...args],{timeout:45000}).stdout;
  if(!existsSync(repo+'/config'))backup('init','--repository-version','2');
  const result=backup('backup','--json','--pack-size','8','--tag','continuous-synthetic',...(payloadLayout?['--exclude',out+'/database.dump']:[]),out).trim().split('\n').map(s=>JSON.parse(s)).find(x=>x.message_type==='summary');backup('check','--read-data');
  function bytes(p){return readdirSync(p,{withFileTypes:true}).reduce((sum,e)=>sum+(e.isDirectory()?bytes(p+'/'+e.name):statSync(p+'/'+e.name).size),0);}assert.ok(bytes(repo)<128*1024*1024,'Synthetic archive budget exceeded');
  const manifest=JSON.parse(readFileSync(out+'/manifest.private.json'));
  const ticket={...c,sequence,captureStartedAt:startedAt,captureStartedBootMs:startedBootMs,captureCompletedAt:manifest.captureCompletedAt,manifestSha256:digest(readFileSync(out+'/manifest.private.json')),snapshotId:result.snapshot_id,capturePath:out,pausedMs:pauseMs,backupExitCode:0};atomic('ticket-'+sequence,ticket);console.log(JSON.stringify(ticket));
}else if(command==='admit'){
  const c=config();verifySourceIds(c);assert.equal(existsSync(io.folder+'/fenced.latch'),false);
  const sequence=Number(argument),envelope=json('receipt-'+sequence),claims=validateContinuousReceipt(envelope,readFileSync(io.folder+'/authority-public.pem'),c);
  assert.equal(claims.sequence,sequence);const old=existsSync(io.folder+'/active.json')?json('active'):null;
  if(old)acceptNextReceipt(old.claims,claims);
  const remaining=Math.min(Date.parse(claims.expiresAt)-Date.now(),claims.captureStartedBootMs+280000-monotonic());assert.ok(remaining>20000);
  const timer='ats-crm-deadline-'+id+'-'+sequence;
  run('/usr/bin/systemd-run',['--user','--unit='+timer,'--on-active='+Math.floor((remaining-1000)/1000)+'s','--timer-property=AccuracySec=100ms','--timer-property=RandomizedDelaySec=0','--property=Type=oneshot','--property=TimeoutStartSec=10s','--property=MemoryMax=128M','--property=NoNewPrivileges=yes','--setenv=ATS_CONTINUOUS_REHEARSAL=1',node,self,'deadline',id,String(sequence)]);
  assert.ok(timerActive(timer));atomic('active',{envelope,claims,timer,deadlineBootMs:claims.captureStartedBootMs+280000,anchor:{wall:Date.now(),monotonic:monotonic()}});
  renewedLease();
  if(old)run('/usr/bin/systemctl',['--user','stop',old.timer+'.timer',old.timer+'.service'],{allowFailure:true});
  console.log(JSON.stringify({admitted:true,sequence,timer,expiresAt:claims.expiresAt}));
}else if(command==='watch'){
  config();writeFileSync(io.folder+'/watch.pid',String(process.pid));
  try{for(;;){const{active}=receipt();assert.ok(clockIsSafe(active.anchor,Date.now(),monotonic()),'Clock moved unexpectedly');renewedLease();atomic('watch-heartbeat',{at:new Date().toISOString(),bootMs:monotonic()});await sleep(policy.renewalMs);}}
  catch(error){atomic('watch-failure',{error:String(error.message),at:new Date().toISOString()});await fence('watchdog-validation-failed');throw error;}
}else if(command==='deadline'){
  const expected=Number(argument);let newer=false;
  try{const{active,claims}=receipt();newer=claims.sequence>expected&&timerActive(active.timer)&&clockIsSafe(active.anchor,Date.now(),monotonic());}catch{}
  if(!newer)console.log(JSON.stringify(await fence('independent-backup-deadline')));
}else if(command==='start'){
  const c=config();verifySourceIds(c);renewedLease();
  for(const s of['auth','rest','imgproxy','storage','api-gw','app'])io.docker(['start',c.containers[s]],{timeout:10000});
  console.log(JSON.stringify({syntheticServicesStarted:true}));
}else if(command==='seed'){
  config();renewedLease();
  for(let n=0;n<40;n++){
    const r=io.run('/usr/bin/docker',['exec',io.app,'node','--input-type=module','-e',"const r=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY},signal:AbortSignal.timeout(1000)});if(r.status!==200)process.exit(1);"],{timeout:2000,allowFailure:true});
    if(r.status===0)break;if(n===39)throw Error('Synthetic API did not become ready');await sleep(1000);
  }
  io.docker(['exec','-i','-e','HOME_FAILOVER_REHEARSAL=1',io.app,'node','--input-type=module','-'],{input:readFileSync(new URL('./recovery-fixture.mjs',import.meta.url)),timeout:20000});
  writeFileSync(io.folder+'/fixture.private.json',io.docker(['exec',io.app,'cat','/tmp/recovery-fixture.private.json']),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({syntheticFixtureCreated:true,actualPayments:0,emailsSent:0}));
}else if(command==='workload'||command==='long-transaction'){
  const c=config();assert.equal(existsSync(io.folder+'/fenced.latch'),false);
  const first=c.workloadStart??800000;assert.ok(Number.isSafeInteger(first)&&first>=800000&&first+399<900000);
  const password=readFileSync(io.folder+'/test-password.private','utf8'),args=['exec','-i','-e','PGPASSWORD',io.db,'psql','-h','127.0.0.1','-X','-Atq','-v','ON_ERROR_STOP=1','-U','candidate_fence_api','-d','postgres'];
  io.env.PGPASSWORD=password;
  io.env.PGAPPNAME='ATS_CONTINUOUS_'+command.replaceAll('-','_')+'_'+id;args.splice(4,0,'-e','PGAPPNAME');
  if(command==='long-transaction'){
    // Forces the known early-deferred-check bypass. The kernel deadline must
    // kill this backend, even with the JavaScript watchdog and dockerd stopped.
    io.run('/usr/bin/docker',args,{input:'begin;set constraints all immediate;insert into public.candidate_fence_fixture values(990001);select pg_sleep(600);commit;',timeout:650000,allowFailure:true});
  }else{for(let i=0;i<400;i++){const r=io.run('/usr/bin/docker',args,{input:'insert into public.candidate_fence_fixture values('+(first+i)+');',timeout:2000,allowFailure:true});writeFileSync(io.folder+'/workload.ndjson',JSON.stringify({at:new Date().toISOString(),bootMs:monotonic(),id:first+i,committed:r.status===0})+'\n',{flag:'a',mode:0o600});if(existsSync(io.folder+'/fenced.latch'))break;await sleep(2000);}}
}else if(command==='fault-stop'){
  const c=config();assert.ok(timerActive(json('active').timer));
  assert.equal(Number(io.sql("select count(*) from pg_stat_activity where application_name="+literal('ATS_CONTINUOUS_long_transaction_'+id)+" and wait_event='PgSleep' and xact_start is not null;")),1,'Long transaction must be admitted before fault injection');
  const watcher=Number(readFileSync(io.folder+'/watch.pid','utf8'));assert.ok(readFileSync('/proc/'+watcher+'/cmdline','utf8').includes('watch\u0000'+id));
  const daemon=Number(run('/usr/bin/pgrep',['-u','501','-x','dockerd']).stdout.trim());assert.ok(Number.isSafeInteger(daemon)&&daemon>1);
  atomic('fault-injection',{at:new Date().toISOString(),bootMs:monotonic(),watcherPid:watcher,dockerPid:daemon,sourceBoot:c.sourceBoot});
  process.kill(watcher,'SIGSTOP');process.kill(daemon,'SIGSTOP');
  console.log(JSON.stringify({javascriptWatchdogSuspended:true,dockerDaemonSuspended:true,independentTimerStillArmed:true}));
}else if(command==='inspect-fault'){
  config();const injected=json('fault-injection');process.kill(injected.dockerPid,'SIGCONT');
  for(let n=0;n<30;n++){const r=io.run('/usr/bin/docker',['ps','--format','{{.ID}}'],{timeout:1000,allowFailure:true});if(r.status===0)break;await sleep(100);}
  const c=config(),result=json('fence-result');assert.equal(result.reason,'independent-backup-deadline');
  const active=json('active');assert.ok(result.completedBootMs-active.claims.captureStartedBootMs<policy.maximumLossMs);
  for(const s of services){let info;for(let n=0;n<30;n++){info=io.inspect(io.project+'-'+s+'-1');if(!info.State.Running)break;await sleep(100);}assert.equal(info.State.Running,false);assert.equal(info.HostConfig.RestartPolicy.Name,'no');}
  run('/usr/bin/systemctl',['--user','stop','ats-crm-watch-'+id+'.service'],{allowFailure:true});try{process.kill(injected.watcherPid,'SIGCONT');}catch(error){if(error.code!=='ESRCH')throw error;}
  io.docker(['start',c.containers.db]);await io.ready();
  assert.equal(Number(io.sql('select count(*) from public.candidate_fence_fixture where id=990001;')),0);
  io.env.PGPASSWORD=readFileSync(io.folder+'/test-password.private','utf8');const rejected=io.run('/usr/bin/docker',['exec','-i','-e','PGPASSWORD',io.db,'psql','-h','127.0.0.1','-X','-Atq','-v','ON_ERROR_STOP=1','-U','candidate_fence_api','-d','postgres'],{input:'insert into public.candidate_fence_fixture values(990002);',allowFailure:true});
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/CRM writes are temporarily unavailable/);
  const first=c.workloadStart??800000;assert.ok(Number.isSafeInteger(first)&&first>=800000&&first+399<900000);
  const writes=Number(io.sql('select count(*) from public.candidate_fence_fixture where id>='+first+' and id<'+(first+400)+';'));
  assert.ok(writes>5,'The workload did not exercise successful writes');
  if(existsSync(io.folder+'/fixture.private.json')){const f=json('fixture.private');io.sql(`begin;set local session_replication_role=replica;update public.profiles set status='disabled' where id=${literal(f.userId)};update public.employee_records set is_active=false,employment_status='separated' where auth_user_id=${literal(f.userId)};update auth.users set banned_until='infinity' where id=${literal(f.userId)};commit;`);}
  const logins=JSON.parse(io.sql("select coalesce(jsonb_agg(rolname),'[]') from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');"));
  io.sql('update hosting_guard.state set expires_at=clock_timestamp()-interval \'1 second\',capture_in_progress=true;'+logins.map(r=>'alter role '+identifier(r)+' nologin;').join(''));
  io.docker(['stop','--time','3',io.db]);
  const report={passed:true,sourceBoot:c.sourceBoot,lastVerifiedSequence:active.claims.sequence,lossWindowAtHardFenceMs:result.completedBootMs-active.claims.captureStartedBootMs,faults:['failed offsite transport','suspended JavaScript watchdog','suspended rootless Docker daemon','early constraint evaluation in long transaction'],longTransactionRolledBack:true,coldDatabaseRestartRefusedWrite:true,successfulSyntheticWorkloadWrites:writes,allSourceContainersStopped:true,syntheticUsersRetired:true,productionChanged:false};atomic('runtime-result',report);console.log(JSON.stringify(report));
}else if(command==='fence'){console.log(JSON.stringify(await fence('operator-end-of-rehearsal')));
}else{throw Error('Unknown synthetic rehearsal command');}
