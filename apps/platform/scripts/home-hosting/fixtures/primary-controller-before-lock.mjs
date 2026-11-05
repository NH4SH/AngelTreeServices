// Production adapter: source is enrolled by the owner; cloud signing/managed
// service credentials never live here. Every restart starts without admission.
import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {randomBytes} from 'node:crypto';
import {PrimaryIO} from './primary-io.mjs';import {literal,identifier} from './candidate-io.mjs';import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';import {acceptNextReceipt,clockIsSafe} from './continuous-policy.mjs';
import {captureOnlineNativeCandidate} from './native-online-candidate.mjs';
import{publicAdmissionDirectory,publishAdmission}from'./primary-admission-files.mjs';
import{assertPrimaryHandoff}from'./primary-handoff-approval.mjs';
const io=new PrimaryIO(),[command,id,argument]=process.argv.slice(2);assert.equal(id,io.id);assert.ok(['init','capture','admit','watch','deadline','start','fence','status'].includes(command));
const self=fileURLToPath(import.meta.url),node=process.execPath,services=['db','app','api-gw','auth','rest','storage','imgproxy'];
const roles=['authenticator','supabase_auth_admin','supabase_storage_admin'];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const boot=()=>fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),monotonic=()=>Number(fs.readFileSync('/proc/uptime','utf8').split(' ')[0])*1000;
const json=name=>JSON.parse(fs.readFileSync(io.folder+'/'+name+'.json','utf8'));
function atomic(name,value){const path=io.folder+'/'+name+'.json';fs.writeFileSync(path+'.new',JSON.stringify(value),{mode:0o600});fs.renameSync(path+'.new',path);}
const publicDirectory=io.root+'/admission-public';
function publish(name,value){publishAdmission(publicDirectory,name,value);}
function config(){const c=json('binding');assert.equal(c.sourceBoot,boot());assert.equal(c.namespace,io.namespace);assert.equal(c.sourceId,io.project);assert.equal(c.environment,'home-primary-v1');assert.deepEqual({...c,...io.productionBinding},c);return c;}
function verifyIds(c){for(const service of services){const info=io.inspect(io.project+'-'+service+'-1');assert.equal(info.Id,c.containers[service]);assert.equal(info.HostConfig.RestartPolicy.Name,'no');assert.equal(info.Config.Labels['com.docker.compose.project'],io.project);}}
function timerActive(unit){return io.run('/usr/bin/systemctl',['--user','show',unit+'.timer','--property=ActiveState','--value'],{timeout:2000,allowFailure:true}).stdout.trim()==='active';}
function receipt(){const c=config(),active=json('active'),claims=validateNativeWalReceipt(active.envelope,fs.readFileSync(io.folder+'/authority-public.pem'),c);assert.ok(monotonic()<active.deadlineBootMs);assert.ok(clockIsSafe(active.anchor,Date.now(),monotonic()));return{c,active,claims};}
async function fence(reason){
 const c=config(),startedAt=new Date().toISOString();fs.writeFileSync(io.folder+'/fenced.latch',reason+'\n',{flag:'a',mode:0o600});publish('fenced.latch',reason+'\n');
 for(const service of services){const id=c.containers[service];assert.match(id,/^[a-f0-9]{64}$/);const group='/sys/fs/cgroup/user.slice/user-501.slice/user@501.service/user.slice/docker-'+id+'.scope';
  if(fs.existsSync(group+'/cgroup.events')&&/populated 1/.test(fs.readFileSync(group+'/cgroup.events','utf8'))){fs.writeFileSync(group+'/cgroup.kill','1');for(let n=0;n<100&&fs.existsSync(group+'/cgroup.events')&&/populated 1/.test(fs.readFileSync(group+'/cgroup.events','utf8'));n++)await sleep(10);assert.ok(!fs.existsSync(group+'/cgroup.events')||!/populated 1/.test(fs.readFileSync(group+'/cgroup.events','utf8')));}}
 const result={reason,startedAt,completedAt:new Date().toISOString(),sourceBoot:c.sourceBoot,services,kernelFence:true};atomic('fence-result',result);return result;
}
function renew(){
 assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false,'Operator review required after a fence');const{c,active,claims}=receipt();assertPrimaryHandoff(JSON.parse(fs.readFileSync(io.root+'/source-approval.private.json')),c);assert.ok(timerActive(active.timer));verifyIds(c);
 assert.equal(io.sql('select pg_postmaster_start_time()::text;'),c.databaseBoot);
 io.sql(`begin;select pg_advisory_xact_lock(178214,4110);do $lease$ declare at timestamptz:=clock_timestamp();begin
 if not (select capture_in_progress from hosting_guard.state where singleton) then
 perform hosting_guard.accept_backup_lease(${c.generation},'ats-home-primary',at,least(at+interval '14 seconds',${literal(claims.expiresAt)}::timestamptz),${literal(claims.captureStartedAt)}::timestamptz);
 ${roles.map(r=>'alter role '+identifier(r)+' login;').join('\n')}
 end if;end $lease$;commit;`);
}
if(command==='init'){
 if(fs.existsSync(io.folder))assert.ok(fs.readdirSync(io.folder).every(name=>name==='operator-logs'),'Existing enrollment must be preserved');else fs.mkdirSync(io.folder,{mode:0o700});io.assertSource();
 assert.equal(io.run('/usr/bin/systemctl',['--user','list-units','--state=active','--plain','--no-legend','ats-home-deadline-*.timer','ats-home-watch-*.service'],{timeout:3000}).stdout.trim(),'','Retire old source deadlines before a new enrollment');
 assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")),0);
 assert.equal(Number(io.sql("select count(*) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin');")),0);
 const containers={};for(const service of services){const info=io.inspect(io.project+'-'+service+'-1');assert.equal(info.HostConfig.RestartPolicy.Name,'no');if(service!=='db')assert.equal(info.State.Running,false);containers[service]=info.Id;}
 io.sql("alter table hosting_guard.state add column if not exists capture_in_progress boolean not null default true;update hosting_guard.state set capture_in_progress=true,expires_at=clock_timestamp()-interval '1 second';");
 const binding={version:1,...io.productionBinding,generation:Number(io.approval.generation),sourceBoot:boot(),databaseBoot:io.sql('select pg_postmaster_start_time()::text;'),topology:io.sql('select hosting_guard.catalog_fingerprint();'),containers,sourceDbImage:io.approval.databaseImage,systemIdentifier:io.approval.systemIdentifier,timeline:Number(io.sql('select timeline_id from pg_control_checkpoint();',{user:'postgres'}))};
 assert.ok(Number.isSafeInteger(binding.generation)&&binding.generation>0);atomic('binding',binding);fs.copyFileSync(io.root+'/recovery-password.private',io.folder+'/recovery-password.private',fs.constants.COPYFILE_EXCL);fs.copyFileSync(io.root+'/authority-public.pem',io.folder+'/authority-public.pem',fs.constants.COPYFILE_EXCL);fs.copyFileSync(io.root+'/runtime-source.tar.gz',io.folder+'/release-source-scoped.tar.gz',fs.constants.COPYFILE_EXCL);
 if(fs.existsSync(publicDirectory))fs.renameSync(publicDirectory,io.root+'/admission-held-'+Date.now());publicAdmissionDirectory(publicDirectory);publish('binding.json',binding);publish('authority-public.pem',fs.readFileSync(io.folder+'/authority-public.pem','utf8'));console.log(JSON.stringify(binding));
}else if(command==='capture'){
 const c=config();verifyIds(c);assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false);io.productionBinding=c;console.log(JSON.stringify(await captureOnlineNativeCandidate(io,c,Number(argument))));
}else if(command==='admit'){
 const c=config();assertPrimaryHandoff(JSON.parse(fs.readFileSync(io.root+'/source-approval.private.json')),c);verifyIds(c);assert.equal(fs.existsSync(io.folder+'/fenced.latch'),false);const sequence=Number(argument),envelope=json('receipt-'+sequence),claims=validateNativeWalReceipt(envelope,fs.readFileSync(io.folder+'/authority-public.pem'),c);assert.equal(claims.sequence,sequence);
 const old=fs.existsSync(io.folder+'/active.json')?json('active'):null;if(old)acceptNextReceipt(old.claims,claims);
 const remaining=Math.min(Date.parse(claims.expiresAt)-Date.now(),claims.captureStartedBootMs+280000-monotonic());assert.ok(remaining>20000);
 const timer='ats-home-deadline-'+io.id+'-'+sequence;
 io.run('/usr/bin/systemd-run',['--user','--unit='+timer,'--on-active='+Math.floor((remaining-1000)/1000)+'s','--timer-property=AccuracySec=100ms','--timer-property=RandomizedDelaySec=0','--property=Type=oneshot','--property=TimeoutStartSec=10s','--property=MemoryMax=128M','--property=NoNewPrivileges=yes','--setenv=ATS_HOME_PRIMARY_OPERATION=1','--setenv=ATS_HOME_BACKUP_ID='+io.id,node,self,'deadline',io.id,String(sequence)],{timeout:5000});assert.ok(timerActive(timer));
 atomic('active',{envelope,claims,timer,deadlineBootMs:claims.captureStartedBootMs+280000,anchor:{wall:Date.now(),monotonic:monotonic()}});renew();publish('active.json',json('active'));if(old)io.run('/usr/bin/systemctl',['--user','stop',old.timer+'.timer',old.timer+'.service'],{timeout:3000,allowFailure:true});console.log(JSON.stringify({admitted:true,sequence,expiresAt:claims.expiresAt}));
}else if(command==='watch'){
 config();try{for(;;){renew();atomic('watch-heartbeat',{at:new Date().toISOString(),bootMs:monotonic()});await sleep(5000);}}catch(error){atomic('watch-failure',{at:new Date().toISOString(),error:String(error.message)});await fence('watchdog-validation-failed');throw error;}
}else if(command==='deadline'){
 let newer=false;try{const{active,claims}=receipt();newer=claims.sequence>Number(argument)&&timerActive(active.timer);}catch{}
 if(!newer)console.log(JSON.stringify(await fence('independent-backup-deadline')));
}else if(command==='start'){
 const c=config();verifyIds(c);renew();for(const service of ['auth','rest','imgproxy','storage','api-gw','app'])io.docker(['start',c.containers[service]],{timeout:10000});console.log(JSON.stringify({servicesStarted:true}));
}else if(command==='fence')console.log(JSON.stringify(await fence('operator-fence')));
else{const{claims}=receipt();console.log(JSON.stringify({admitted:true,sequence:claims.sequence,expiresAt:claims.expiresAt}));}
