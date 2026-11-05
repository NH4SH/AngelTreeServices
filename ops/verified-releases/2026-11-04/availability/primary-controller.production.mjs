// Production adapter: source is enrolled by the owner; cloud signing/managed
// service credentials never live here. Every restart starts without admission.
import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {randomBytes} from 'node:crypto';
import {PrimaryIO} from './primary-io.mjs';import {literal,identifier} from './candidate-io.mjs';import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';import {acceptNextReceipt,clockIsSafe} from './continuous-policy.mjs';
import {captureOnlineNativeCandidate} from './native-online-candidate.mjs';
import{publicAdmissionDirectory,publishAdmission}from'./primary-admission-files.mjs';
import{assertPrimaryHandoff}from'./primary-handoff-approval.mjs';
import{recoveryPlan,fenceServicesForBinding,readProfileLeaseTransition,recoveryRenewalPlan,readProfileServiceReadiness}from'./recovery-profile-context.mjs';
import{PROFILE_ROLES}from'./recovery-operational-policy.mjs';
import{beginProductionProfileWarmup,verifyProductionProfileWarmup,finishProductionProfileWarmup}from'./production-live25-recovery-adapter.mjs';
const io=new PrimaryIO(),[command,id,argument]=process.argv.slice(2);assert.equal(id,io.id);assert.ok(['init','capture','admit','admit-locked','renew-locked','watch','deadline','start','profile-warmup','profile-warmup-locked','profile-start','fence','status'].includes(command));
const self=fileURLToPath(import.meta.url),node=process.execPath,services=['db','app','api-gw','auth','rest','storage','imgproxy'];
const roles=['authenticator','supabase_auth_admin','supabase_storage_admin'];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const boot=()=>fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),monotonic=()=>Number(fs.readFileSync('/proc/uptime','utf8').split(' ')[0])*1000;
const json=name=>JSON.parse(fs.readFileSync(io.folder+'/'+name+'.json','utf8'));
function atomic(name,value){const path=io.folder+'/'+name+'.json';fs.writeFileSync(path+'.new',JSON.stringify(value),{mode:0o600});fs.renameSync(path+'.new',path);}
const publicDirectory=io.root+'/admission-public';
function publish(name,value){publishAdmission(publicDirectory,name,value);}
function config(){const c=json('binding');assert.equal(c.sourceBoot,boot());assert.equal(c.namespace,io.namespace);assert.equal(c.sourceId,io.project);assert.equal(c.environment,'home-primary-v1');assert.deepEqual({...c,...io.productionBinding},c);return c;}
function verifyIds(c){for(const service of fenceServicesForBinding(c)){const info=io.inspect(io.project+'-'+service+'-1');assert.equal(info.Id,c.containers[service]);assert.equal(info.HostConfig.RestartPolicy.Name,'no');assert.equal(info.Config.Labels['com.docker.compose.project'],io.project);assert.equal(info.Config.Labels['com.docker.compose.service'],service);}}
function timerActive(unit){return io.run('/usr/bin/systemctl',['--user','show',unit+'.timer','--property=ActiveState','--value'],{timeout:2000,allowFailure:true}).stdout.trim()==='active';}
function receipt(){const c=config(),active=json('active'),claims=validateNativeWalReceipt(active.envelope,fs.readFileSync(io.folder+'/authority-public.pem'),c);assert.ok(monotonic()<active.deadlineBootMs);assert.ok(clockIsSafe(active.anchor,Date.now(),monotonic()));return{c,active,claims};}
async function fence(reason){
 const c=config(),services=fenceServicesForBinding(c),startedAt=new Date().toISOString();verifyIds(c);fs.writeFileSync(io.folder+'/fenced.latch',reason+'\n',{flag:'a',mode:0o600});publish('fenced.latch',reason+'\n');
 for(const service of services){const id=c.containers[service];assert.match(id,/^[a-f0-9]{64}$/);const group='/sys/fs/cgroup/user.slice/user-501.slice/user@501.service/user.slice/docker-'+id+'.scope';
  if(fs.existsSync(group+'/cgroup.events')&&/populated 1/.test(fs.readFileSync(group+'/cgroup.events','utf8'))){fs.writeFileSync(group+'/cgroup.kill','1');for(let n=0;n<100&&fs.existsSync(group+'/cgroup.events')&&/populated 1/.test(fs.readFileSync(group+'/cgroup.events','utf8'));n++)await sleep(10);assert.ok(!fs.existsSync(group+'/cgroup.events')||!/populated 1/.test(fs.readFileSync(group+'/cgroup.events','utf8')));}}
 const result={reason,startedAt,completedAt:new Date().toISOString(),sourceBoot:c.sourceBoot,services,kernelFence:true};atomic('fence-result',result);return result;
}
// One kernel lock covers receipt selection, native validation/renewal and the
// complete admission/publication transition. The independent deadline and fence
// deliberately do not wait for this lock. A busy watcher never claims renewal.
const leaseLock=io.folder+'/lease-transition.lock',lockConflictExit=75;
function assertLeaseLockHeld(){
 const st=fs.lstatSync(leaseLock);assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.uid===process.getuid()&&(st.mode&0o777)===0o600);
 assert.equal(fs.realpathSync('/proc/'+process.ppid+'/exe'),'/usr/bin/flock','Internal transition requires the kernel-lock parent');
 const held=fs.readFileSync('/proc/locks','utf8').split('\n').some(line=>{const p=line.trim().split(/\s+/);return p[1]==='FLOCK'&&p[2]==='ADVISORY'&&p[3]==='WRITE'&&Number(p[4])===process.ppid&&p[5]?.split(':').at(-1)===String(st.ino);});
 assert(held,'Internal transition requires its held exclusive kernel lock');
 assert(fs.readdirSync('/proc/'+process.ppid+'/fd').some(n=>{try{return fs.readlinkSync('/proc/'+process.ppid+'/fd/'+n)===leaseLock;}catch{return false;}}),'Lock parent must own this exact namespace file');
}
function withLeaseLock(lockedCommand,args=[],{busyAllowed=false}={}){
 const fd=fs.openSync(leaseLock,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);fs.closeSync(fd);
 const st=fs.lstatSync(leaseLock);assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.uid===process.getuid()&&(st.mode&0o777)===0o600);
 // timeout owns a process group, so a timed-out transition cannot leave an
 // orphan renewing roles after its caller fails. Warmup keeps its existing20s
 // intent and renews internally while the ordinary watcher sees a busy lock.
 const seconds=lockedCommand==='profile-warmup-locked'?30:8;
 const r=io.run('/usr/bin/timeout',['--signal=TERM','--kill-after=1s',seconds+'s','/usr/bin/flock','--exclusive','--wait','4','--conflict-exit-code',String(lockConflictExit),'--close',leaseLock,node,self,lockedCommand,io.id,...args],{timeout:(seconds+3)*1000,allowFailure:true});
 if(r.status===lockConflictExit&&busyAllowed)return null;
 assert.equal(r.status,0,r.status===lockConflictExit?'Another lease transition is in progress; no unlocked operation was attempted':'Locked lease transition failed; inspect its private operator log');return r;
}
function renew({busyAllowed=false}={}){return withLeaseLock('renew-locked',[],{busyAllowed})!==null;}
function renewUnlocked(){
 assertLeaseLockHeld();
 assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false,'Operator review required after a fence');const{c,active,claims}=receipt();io.productionBinding=c;io.assertSource();assertPrimaryHandoff(JSON.parse(fs.readFileSync(io.root+'/source-approval.private.json')),c,{verifiedProfile:io.recoveryProfile});assert.ok(timerActive(active.timer));verifyIds(c);
 const transition=readProfileLeaseTransition(io,c),plan=recoveryRenewalPlan(c,io.recoveryProfile,transition);
 const closedProfile=Object.hasOwn(c,'installationOverlaySha256')?Object.values(PROFILE_ROLES).filter(r=>!plan.rolesToRenew.includes(r)):[];
 assert.equal(io.sql('select pg_postmaster_start_time()::text;'),c.databaseBoot);
 assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false,'Operator review required after a fence');
 io.sql(`begin;select pg_advisory_xact_lock(178214,4110);do $lease$ declare at timestamptz:=clock_timestamp();begin
 ${closedProfile.map(r=>'alter role '+identifier(r)+' nologin;').join('\n')}
 ${closedProfile.length?'perform pg_terminate_backend(pid) from pg_stat_activity where pid<>pg_backend_pid() and usename in('+closedProfile.map(literal).join(',')+');':''}
 ${transition?`if (select count(*) from hosting_guard.state)<>1 or not exists(select 1 from hosting_guard.state where singleton and epoch=${transition.transitionEpoch} and topology_verified and topology_fingerprint=${literal(c.topology)} and topology_fingerprint=hosting_guard.catalog_fingerprint() and holder=local_node and local_node='ats-home-primary' and database_started_at=pg_postmaster_start_time() and database_started_at=${literal(c.databaseBoot)}::timestamptz and capture_in_progress=${transition.maintenanceHeld?'true':'false'} and capture_started_at is not null and capture_started_at<=${literal(claims.captureStartedAt)}::timestamptz and issued_at<=clock_timestamp() and capture_started_at<=issued_at ${transition.maintenanceHeld||transition.transitionEpoch===c.generation-1?"and expires_at<=clock_timestamp()":"and expires_at<=issued_at+interval '14 seconds' and expires_at<=capture_started_at+interval '280 seconds'"})then raise exception 'Native boundary changed during lease transition.';end if;
 if ${transition.maintenanceHeld||transition.transitionEpoch===c.generation-1?'true':'false'} and (exists(select 1 from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin')) or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and usename not in('postgres','supabase_admin')) or (select count(*) from app_private.firewood_live_handoff_sources)<>1 or not exists(select 1 from app_private.firewood_live_handoff_sources where not enabled and not collector_enabled and not surcharge_reporting_enabled and not sender_enabled) or (select count(*) from app_private.fwofficev2_control)<>1 or not exists(select 1 from app_private.fwofficev2_control where id and paused))then raise exception 'Initial or held lease transition must remain closed.';end if;`:''}
 if not (select capture_in_progress from hosting_guard.state where singleton) then
 perform hosting_guard.accept_backup_lease(${c.generation},'ats-home-primary',at,least(at+interval '14 seconds',${literal(claims.expiresAt)}::timestamptz),${literal(claims.captureStartedAt)}::timestamptz);
 ${plan.rolesToRenew.map(r=>'alter role '+identifier(r)+' login;').join('\n')}
 end if;end $lease$;commit;`);
}
if(command==='init'){
 if(fs.existsSync(io.folder))assert.ok(fs.readdirSync(io.folder).every(name=>name==='operator-logs'),'Existing enrollment must be preserved');else fs.mkdirSync(io.folder,{mode:0o700});io.assertSource();
 assert.equal(io.run('/usr/bin/systemctl',['--user','list-units','--state=active','--plain','--no-legend','ats-home-deadline-*.timer','ats-home-watch-*.service'],{timeout:3000}).stdout.trim(),'','Retire old source deadlines before a new enrollment');
 assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
 assert.equal(Number(io.sql("select count(*) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin');")),0);
 const containers={};for(const service of io.recoveryProfile?recoveryPlan(io.recoveryProfile.binding,io.recoveryProfile).servicesToFence:services){const info=io.inspect(io.project+'-'+service+'-1');assert.equal(info.HostConfig.RestartPolicy.Name,'no');if(service!=='db')assert.equal(info.State.Running,false);containers[service]=info.Id;}
 io.sql("alter table hosting_guard.state add column if not exists capture_in_progress boolean not null default true;update hosting_guard.state set capture_in_progress=true,expires_at=clock_timestamp()-interval '1 second';");
 const binding={version:1,...io.productionBinding,generation:Number(io.recoveryProfile?.binding.generation??io.approval.generation),sourceBoot:boot(),databaseBoot:io.sql('select pg_postmaster_start_time()::text;'),topology:io.sql('select hosting_guard.catalog_fingerprint();'),containers,sourceDbImage:io.approval.databaseImage,systemIdentifier:io.approval.systemIdentifier,timeline:Number(io.sql('select timeline_id from pg_control_checkpoint();',{user:'postgres'}))};
 assert.ok(Number.isSafeInteger(binding.generation)&&binding.generation>0);atomic('binding',binding);fs.copyFileSync(io.root+'/recovery-password.private',io.folder+'/recovery-password.private',fs.constants.COPYFILE_EXCL);fs.copyFileSync(io.root+'/authority-public.pem',io.folder+'/authority-public.pem',fs.constants.COPYFILE_EXCL);fs.copyFileSync(io.root+'/runtime-source.tar.gz',io.folder+'/release-source-scoped.tar.gz',fs.constants.COPYFILE_EXCL);
 if(fs.existsSync(publicDirectory))fs.renameSync(publicDirectory,io.root+'/admission-held-'+Date.now());publicAdmissionDirectory(publicDirectory);publish('binding.json',binding);publish('authority-public.pem',fs.readFileSync(io.folder+'/authority-public.pem','utf8'));console.log(JSON.stringify(binding));
}else if(command==='capture'){
 const c=config();verifyIds(c);assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false);io.productionBinding=c;io.assertSource();console.log(JSON.stringify(await captureOnlineNativeCandidate(io,c,Number(argument))));
}else if(command==='admit'){
 process.stdout.write(withLeaseLock('admit-locked',[argument]).stdout);
}else if(command==='renew-locked'){
 renewUnlocked();
}else if(command==='admit-locked'){
 assertLeaseLockHeld();const c=config();io.productionBinding=c;io.assertSource();assertPrimaryHandoff(JSON.parse(fs.readFileSync(io.root+'/source-approval.private.json')),c,{verifiedProfile:io.recoveryProfile});verifyIds(c);assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false);const sequence=Number(argument),envelope=json('receipt-'+sequence),claims=validateNativeWalReceipt(envelope,fs.readFileSync(io.folder+'/authority-public.pem'),c);assert.equal(claims.sequence,sequence);
 const old=fs.existsSync(io.folder+'/active.json')?json('active'):null;if(old)acceptNextReceipt(old.claims,claims);
 const remaining=Math.min(Date.parse(claims.expiresAt)-Date.now(),claims.captureStartedBootMs+280000-monotonic());assert.ok(remaining>20000);
 const timer='ats-home-deadline-'+io.id+'-'+sequence;
 io.run('/usr/bin/systemd-run',['--user','--unit='+timer,'--on-active='+Math.floor((remaining-1000)/1000)+'s','--timer-property=AccuracySec=100ms','--timer-property=RandomizedDelaySec=0','--property=Type=oneshot','--property=TimeoutStartSec=10s','--property=MemoryMax=128M','--property=NoNewPrivileges=yes','--setenv=ATS_HOME_PRIMARY_OPERATION=1','--setenv=ATS_HOME_BACKUP_ID='+io.id,node,self,'deadline',io.id,String(sequence)],{timeout:5000});assert.ok(timerActive(timer));
 atomic('active',{envelope,claims,timer,deadlineBootMs:claims.captureStartedBootMs+280000,anchor:{wall:Date.now(),monotonic:monotonic()}});renewUnlocked();assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false,'Operator review required after a fence');publish('active.json',json('active'));if(old)io.run('/usr/bin/systemctl',['--user','stop',old.timer+'.timer',old.timer+'.service'],{timeout:3000,allowFailure:true});console.log(JSON.stringify({admitted:true,sequence,expiresAt:claims.expiresAt}));
}else if(command==='watch'){
 config();try{for(;;){if(renew({busyAllowed:true}))atomic('watch-heartbeat',{at:new Date().toISOString(),bootMs:monotonic()});await sleep(5000);}}catch(error){atomic('watch-failure',{at:new Date().toISOString(),error:String(error.message)});await fence('watchdog-validation-failed');throw error;}
}else if(command==='deadline'){
 let newer=false;try{const{active,claims}=receipt();newer=claims.sequence>Number(argument)&&timerActive(active.timer);}catch{}
 if(!newer)console.log(JSON.stringify(await fence('independent-backup-deadline')));
}else if(command==='start'){
 const c=config();verifyIds(c);renew();for(const service of ['auth','rest','imgproxy','storage','api-gw','app'])io.docker(['start',c.containers[service]],{timeout:10000});console.log(JSON.stringify({servicesStarted:true}));
}else if(command==='profile-warmup'){
 process.stdout.write(withLeaseLock('profile-warmup-locked').stdout);
}else if(command==='profile-warmup-locked'){
 assertLeaseLockHeld();const c=config();verifyIds(c);io.productionBinding=c;io.assertSource();assert.ok(io.recoveryProfile,'Exact registered production profile required');receipt();
 let intent,proof=null;try{
  intent=beginProductionProfileWarmup(c);renewUnlocked();
  for(const service of ['firewood-web','firewood-worker']){assert.ok(Date.now()<intent.expiresAtMs&&monotonic()<intent.expiresAtBootMs);const actual=io.inspect(io.project+'-'+service+'-1');assert.equal(actual.Id,c.containers[service]);assert.equal(actual.State.Running,false,'No implicit restart/retry');io.docker(['start',c.containers[service]],{timeout:5000});}
  for(;;){assert.ok(Date.now()<intent.expiresAtMs&&monotonic()<intent.expiresAtBootMs,'Original status-only startup expired');renewUnlocked();try{proof=verifyProductionProfileWarmup(c,intent);break;}catch{await sleep(250);}}
  finishProductionProfileWarmup(c,{proof});console.log(JSON.stringify(proof));
 }catch{
  if(intent)try{finishProductionProfileWarmup(c,{});}catch{}
  try{io.sql("begin;alter role ats_firewood_request nologin;alter role ats_firewood_worker nologin;alter role ats_firewood_health nologin;select pg_terminate_backend(pid)from pg_stat_activity where pid<>pg_backend_pid()and usename in('ats_firewood_request','ats_firewood_worker','ats_firewood_health');commit;");}catch{}
  await fence('profile-status-only-startup-failed');throw Error('Profile status-only startup withheld; retained intent and current binding require Root review');
 }
}else if(command==='profile-start'){
 const c=config();verifyIds(c);renew();const plan=recoveryPlan(c,io.recoveryProfile,readProfileServiceReadiness(io,c));assert.ok(plan.servicesForProfileStart.length>0,'Separately reviewed profile readiness is required');for(const service of plan.servicesForProfileStart)io.docker(['start',c.containers[service]],{timeout:10000});console.log(JSON.stringify({profileServicesStarted:plan.servicesForProfileStart}));
}else if(command==='fence')console.log(JSON.stringify(await fence('operator-fence')));
else{const{claims}=receipt();console.log(JSON.stringify({admitted:true,sequence:claims.sequence,expiresAt:claims.expiresAt}));}
