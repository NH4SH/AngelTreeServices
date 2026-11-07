import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,chmod,symlink,readdir,copyFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {privateFile,privateDir,atomicJson,jsonFile,lease} from './files.mjs';
import {encryptedDump,authenticate,retainedNames,prune} from './backup.mjs';
import {issuesFor} from './monitor.mjs';
import {recordIncident} from './incidents.mjs';
import {receiveBackup,watchIssues} from './watch.mjs';
import {jobs,policy,watchJob} from './jobs.mjs';
import {applyJobs} from './launchd.mjs';
import {retryStartup,stage,diagnostic,workerFailure,classify} from './retry.mjs';
async function directory(t){const p=await mkdtemp(join(tmpdir(),'firewood-ops-'));await chmod(p,0o700);t.after(()=>rm(p,{recursive:true,force:true}));return p;}
test('startup backoff recovers a late database with bounded attempts',async()=>{
  let calls=0,time=0;const sleeps=[];
  const result=await retryStartup(()=>stage('database',async()=>{if(++calls<3)throw Object.assign(new Error('private connection must not be recorded'),{code:'ECONNREFUSED'});return 'ready';}),{now:()=>time,pause:async ms=>{sleeps.push(ms);time+=ms;}});
  assert.equal(result.value,'ready');assert.equal(calls,3);assert.deepEqual(sleeps,[1000,2000]);assert.equal(result.startup.attempts,3);
  assert.deepEqual(result.startup.failures.map(x=>x.code),['database_unavailable','database_unavailable']);
});
test('startup exhaustion and retry window stop an unavailable dependency',async()=>{
  for(const budgetMs of [60000,2500]){
    let calls=0,time=0;
    await assert.rejects(retryStartup(()=>stage('database',async()=>{calls++;throw Object.assign(new Error('private database detail'),{code:'57P03'});}),{budgetMs,now:()=>time,pause:async ms=>{time+=ms;}}),error=>{
      const d=diagnostic(error);assert.equal(d.code,'database_unavailable');assert.equal(d.exhausted,true);assert.equal(d.attempts,calls);return true;
    });
    assert.equal(calls,budgetMs===60000?6:2);
  }
});
test('identity, configuration and credentials fail once without retry or secret logging',async()=>{
  for(const [phase,error] of [['identity',new Error('approved_macbook_required')],['configuration',new Error('private_macbook_qa_required')],['database',Object.assign(new Error('password=secret'),{code:'28P01'})],['stripe_account',{statusCode:403,message:'secret stripe key'}],['operation',new Error('owner@example.com')]]){
    let calls=0;await assert.rejects(retryStartup(()=>stage(phase,async()=>{calls++;throw error;}),{pause:async()=>assert.fail('terminal failure retried')}),e=>{
      const d=diagnostic(e);assert.equal(d.retryable,false);assert.ok(!JSON.stringify(d).includes('secret'));assert.ok(!JSON.stringify(d).includes('owner@'));return true;
    });assert.equal(calls,1);
  }
});
test('known host probe and Stripe transport failures retry without relaxing identity/account checks',()=>{
  assert.equal(classify({killed:true},'identity').code,'host_probe_timeout');
  assert.equal(classify({type:'StripeConnectionError'},'stripe_account').retryable,true);
  assert.equal(classify(new Error('dedicated_sandbox_required'),'stripe_account').retryable,false);
  assert.equal(classify(Object.assign(new Error('other'),{code:'ETIMEDOUT'}),'database').code,'database_timeout');
});
test('worker child diagnostics accept only defined fields and never request batch replay',()=>{
  const safe=workerFailure({stderr:JSON.stringify({testOnly:true,error:{code:'database_unavailable',phase:'database',retryable:true,attempts:6,exhausted:true,message:'secret'}})});
  assert.deepEqual(diagnostic(safe),{code:'database_unavailable',phase:'database',retryable:true,attempts:6,exhausted:true});
  assert.equal(diagnostic(workerFailure({stderr:'password=secret raw provider data'})).code,'worker_failed');
  assert.equal(diagnostic(workerFailure({stderr:JSON.stringify({testOnly:true,error:{code:'secret',phase:'worker'}})})).code,'worker_failed');
  assert.equal(diagnostic(workerFailure({stderr:JSON.stringify({testOnly:true,error:{code:'worker_deadline_exceeded',phase:'worker',retryable:true}})})).retryable,false);
});
test('private file guard rejects shared modes and symlinks',async t=>{
  const d=await directory(t),p=join(d,'key');await writeFile(p,randomBytes(32),{mode:0o600});assert.equal((await privateFile(p)).length,32);
  await chmod(p,0o644);await assert.rejects(privateFile(p));await chmod(p,0o600);await symlink(p,join(d,'alias'));await assert.rejects(privateFile(join(d,'alias')));
});
test('job lock prevents overlap and recovers an abandoned claim',async t=>{
  const d=await directory(t),p=join(d,'lock');let release,entered;
  await atomicJson(p,{pid:2147483647,nonce:'legacy-dead-owner'});
  const wait=new Promise(r=>{release=r;}),start=new Promise(r=>{entered=r;});
  const first=lease(p,async()=>{entered();await wait;return 'done';});await start;
  assert.deepEqual(await lease(p,()=>assert.fail('overlapping job')), {busy:true});release();assert.equal(await first,'done');
  assert.equal(await lease(p,async()=>7),7);
  assert.deepEqual(await readdir(d),['lock']);
  await symlink(p,join(d,'alias'));await assert.rejects(lease(join(d,'alias'),()=>assert.fail('symlink lock')));
});
test('killed lock owner releases its kernel lock and concurrent recovery never overlaps',async t=>{
  const d=await directory(t),p=join(d,'lock');
  const code=`import {lease} from ${JSON.stringify(new URL('./files.mjs',import.meta.url).href)};await lease(${JSON.stringify(p)},async()=>{process.send('locked');setInterval(()=>{},1000);await new Promise(()=>{});});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','ignore','ignore','ipc']});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  const started=once(child,'message',{signal:AbortSignal.timeout(10000)});await started;
  assert.deepEqual(await lease(p,()=>assert.fail('live child overlap')),{busy:true});
  const stopped=once(child,'exit');child.kill('SIGKILL');await stopped;
  let inside=0,maximum=0,entered=0;
  await Promise.all(Array.from({length:16},()=>lease(p,async()=>{inside++;entered++;maximum=Math.max(maximum,inside);await new Promise(r=>setTimeout(r,30));inside--;return true;})));
  assert.equal(maximum,1);assert.ok(entered>=1);assert.equal(await lease(p,async()=>17),17);
});
test('backup encrypts without a plaintext file and rejects corruption and wrong keys',async t=>{
  const d=await directory(t),key=randomBytes(32);
  const meta=await encryptedDump({folder:d,key,command:process.execPath,args:['-e',"process.stdout.write('PGDMP synthetic order records '.repeat(100))"],env:process.env});
  const file=join(d,meta.name);await authenticate(file,key);await assert.rejects(authenticate(file,randomBytes(32)));
  const bytes=await readFile(file);assert.ok(!bytes.includes(Buffer.from('synthetic order')));bytes[25]^=1;await writeFile(join(d,'damaged'),bytes);await assert.rejects(authenticate(join(d,'damaged'),key));
  assert.ok(!(await readdir(d)).some(x=>x.endsWith('.partial')||x.endsWith('.dump')));
});
test('failed dump keeps the previous verified latest backup and removes partial output',async t=>{
  const d=await directory(t),key=randomBytes(32),meta=await encryptedDump({folder:d,key,command:process.execPath,args:['-e',"process.stdout.write('PGDMP valid')"],env:process.env});
  await assert.rejects(encryptedDump({folder:d,key,command:process.execPath,args:['-e',"process.stdout.write('partial');process.exit(1)"],env:process.env}));
  assert.deepEqual(await jsonFile(join(d,'latest.json')),meta);assert.ok(!(await readdir(d)).some(x=>x.endsWith('.partial')));
});
test('retention preserves 24 recent snapshots and seven daily representatives',()=>{
  const items=Array.from({length:240},(_,n)=>({name:String(n),createdAt:Date.UTC(2026,9,26)-n*3600000})),keep=retainedNames(items);
  for(let n=0;n<24;n++)assert.ok(keep.has(String(n)));assert.ok(keep.size<=31);assert.ok(keep.has('121'));assert.ok(!keep.has('239'));
});
test('server retention does not delete snapshots until a verified off-device acknowledgement',async t=>{
  const d=await directory(t),items=[];
  for(let n=0;n<40;n++){
    const createdAt=Date.UTC(2026,9,26)-n*3600000,name='firewood-qa-'+new Date(createdAt).toISOString().replaceAll(/[-:.]/gu,'')+'-'+randomUUID()+'.fwb';
    const item={name,createdAt,sha256:'a'.repeat(64)};await writeFile(join(d,name),'ciphertext',{mode:0o600});await atomicJson(join(d,name+'.json'),item);items.push(item);
  }
  await prune(d,items[0],null);assert.equal((await readdir(d)).filter(x=>x.endsWith('.fwb')).length,40);
  await prune(d,items[0],{name:items[0].name,sha256:'b'.repeat(64)});assert.equal((await readdir(d)).filter(x=>x.endsWith('.fwb')).length,40);
  await prune(d,items[0],items[0]);assert.ok((await readdir(d)).filter(x=>x.endsWith('.fwb')).length<40);
});
test('monitor detects stale workers, review queues, backups and disk shortage',()=>{
  const now=2000000,base={webReady:true,queue:{finished_at:now,last_code:null,review:0,oldest_event:null},backup:{createdAt:now},diskBytes:10*1024**3,now};
  assert.deepEqual(issuesFor(base),[]);
  assert.deepEqual(issuesFor({...base,webReady:false,queue:null,backup:null,diskBytes:0}),['backup_stale','database_unavailable','disk_space_low','web_unavailable']);
  const issues=issuesFor({...base,queue:{finished_at:now-700000,last_code:'failure',review:1,oldest_event:now-700000}});assert.deepEqual(issues,['event_overdue','queue_needs_review','worker_stale']);
  assert.deepEqual(issuesFor({...base,queue:null,backup:null,grace:true}),[]);
});
test('incident notifications avoid unchanged repeats and report recovery once',async t=>{
  const d=await directory(t),file=join(d,'incident'),calls=[];let now=4000000;const notify=async recovered=>calls.push(recovered);
  await recordIncident(file,['server_unreachable'],{now,notify,enabled:true});await recordIncident(file,['server_unreachable'],{now:now+1000,notify,enabled:true});
  await recordIncident(file,[],{now:now+2000,notify,enabled:true});await recordIncident(file,[],{now:now+3000,notify,enabled:true});assert.deepEqual(calls,[false,true]);
  await recordIncident(file,['backup_stale'],{now:now+4000,notify,enabled:false});assert.equal(calls.length,2);
  await recordIncident(file,[],{now:now+5000,notify,enabled:true});assert.equal(calls.length,2);
});
test('off-device receiver verifies ciphertext and authentication before acknowledging',async t=>{
  const d=await directory(t),source=join(d,'source'),dest=join(d,'destination');await privateDir(source);await privateDir(dest);const key=randomBytes(32);
  const meta=await encryptedDump({folder:source,key,command:process.execPath,args:['-e',"process.stdout.write('PGDMP isolated fixture')"],env:process.env});let ack=0;
  const options={root:dest,meta,key,copy:target=>copyFile(join(source,meta.name),target),acknowledge:async()=>{ack++;}};
  await assert.rejects(receiveBackup({...options,key:randomBytes(32)}));assert.equal(ack,0);
  await receiveBackup(options);assert.equal(ack,1);await receiveBackup(options);assert.equal(ack,2);
  await assert.rejects(receiveBackup({...options,meta:{...meta,name:'../../private'}}));
});
test('prepared launch jobs contain no secrets, run as the owner and use bounded schedules',()=>{
  const all=jobs({root:'/Users/owner/.local/share/firewood',node:'/opt/node',code:'/app/ops'});assert.equal(all.length,5);
  assert.equal(all.find(x=>x.role==='postgres').value.KeepAlive,true);assert.equal(all.find(x=>x.role==='web').value.KeepAlive,true);
  for(const [role,seconds] of [['worker',300],['monitor',60],['backup',3600]])assert.equal(all.find(x=>x.role===role).value.StartInterval,seconds);
  assert.equal(watchJob({root:'/watch',node:'/node',code:'/code',config:'/config'}).value.StartInterval,300);
  for(const job of all){assert.equal(job.value.UserName,undefined);assert.equal(job.value.Umask,63);assert.ok(!/rk_test_|sk_live_|PGPASSWORD|DATABASE_URL/u.test(job.plist));}
});
test('watch freshness alarms apply only while the remote server is active',()=>{
  const now=20_000_000,old={createdAt:now-8_000_000},monitor={checkedAt:now-200_000,issues:['worker_stale']};
  assert.deepEqual(watchIssues({active:false,monitor,latest:old},now),[]);
  assert.deepEqual(watchIssues({active:true,monitor,latest:old},now),['server_monitor_stale','off_device_backup_stale']);
  assert.deepEqual(watchIssues({active:true,monitor:{checkedAt:now,issues:[]},latest:{createdAt:now}},now),[]);
  assert.deepEqual(watchIssues({active:true},now),['server_monitor_stale','off_device_backup_missing']);
});
async function jobFixture(t,{active=false}={}){
  const d=await directory(t),folder=join(d,'ops'),agents=join(d,'agents');
  for(const p of [folder,join(folder,'LaunchAgents'),agents])await privateDir(p);
  const items=jobs({root:folder,node:'/node',code:'/ops'}).slice(0,2),settingsFile=join(folder,'settings.json'),settings={testOnly:true,root:folder,active,notifications:active};
  await atomicJson(settingsFile,settings);
  for(const item of items)await writeFile(join(folder,'LaunchAgents',item.label+'.plist'),item.plist,{mode:0o600});
  const loaded=new Set(),calls=[];
  const execute=async(command,args)=>{
    assert.equal(command,'/bin/launchctl');calls.push(args);
    const item=items.find(x=>args[1]?.endsWith('/'+x.label)||args[2]?.endsWith('/'+x.label+'.plist'));
    assert.ok(item,'only fixture-owned labels may be used');
    if(args[0]==='print'){
      if(!loaded.has(item.label))throw Object.assign(new Error('missing'),{code:113});
      return {stdout:'\tpath = '+join(agents,item.label+'.plist')+'\n'};
    }
    if(args[0]==='bootstrap')loaded.add(item.label);
    else if(args[0]==='bootout')loaded.delete(item.label);
    else assert.fail('unexpected command');
    return {stdout:''};
  };
  const options={folder,agents,domain:'gui/fixture',items,settingsFile,settings,execute};
  return {options,loaded,calls,execute,target:item=>join(agents,item.label+'.plist'),state:()=>jsonFile(settingsFile),
    seed:async()=>{for(const item of items){await writeFile(join(agents,item.label+'.plist'),item.plist,{mode:0o600});loaded.add(item.label);}}};
}
test('schedule controller validates every file before creating or starting any job',async t=>{
  const f=await jobFixture(t),last=f.options.items[1];
  await writeFile(f.target(last),'other project',{mode:0o600});
  await assert.rejects(applyJobs({...f.options,activate:true}),/existing_job_conflict/u);
  assert.equal(f.loaded.size,0);assert.ok(f.calls.every(x=>x[0]==='print'));assert.equal((await f.state()).active,false);
  assert.deepEqual(await readdir(f.options.agents),[last.label+'.plist']);
});
test('activation rolls back even when bootstrap reports an error after loading the job',async t=>{
  const f=await jobFixture(t),last=f.options.items[1];
  const execute=async(command,args)=>{const result=await f.execute(command,args);if(args[0]==='bootstrap'&&args[2]===f.target(last))throw new Error('bootstrap_failed');return result;};
  await assert.rejects(applyJobs({...f.options,activate:true,execute}),/bootstrap_failed/u);
  assert.equal(f.loaded.size,0);assert.deepEqual(await readdir(f.options.agents),[]);assert.equal((await f.state()).active,false);
});
test('failed activation rollback retains the running job file and records attention required',async t=>{
  const f=await jobFixture(t),[first,last]=f.options.items;
  const execute=async(command,args)=>{
    if(args[0]==='bootout'&&args[1].endsWith('/'+first.label))throw new Error('bootout_failed');
    const result=await f.execute(command,args);if(args[0]==='bootstrap'&&args[2]===f.target(last))throw new Error('bootstrap_failed');return result;
  };
  await assert.rejects(applyJobs({...f.options,activate:true,execute}),/activation_rollback_failed/u);
  const state=await f.state();assert.equal(state.active,true);assert.equal(state.notifications,true);assert.equal(state.attentionRequired,true);
  assert.deepEqual([...f.loaded],[first.label]);assert.equal(await readFile(f.target(first),'utf8'),first.plist);
  await applyJobs({...f.options,settings:state,activate:false});assert.equal(f.loaded.size,0);assert.equal((await f.state()).active,false);
});
test('deactivation does not claim inactive or delete a file when a job cannot be stopped',async t=>{
  const f=await jobFixture(t,{active:true});await f.seed();
  const execute=async(command,args)=>{if(args[0]==='bootout')throw new Error('stop_failed');return f.execute(command,args);};
  await assert.rejects(applyJobs({...f.options,activate:false,execute}),/stop_failed/u);
  assert.equal(f.loaded.size,2);assert.equal((await readdir(f.options.agents)).length,2);
  const state=await f.state();assert.equal(state.active,true);assert.equal(state.notifications,true);assert.equal(state.attentionRequired,true);
  await applyJobs({...f.options,settings:state,activate:false});assert.equal(f.loaded.size,0);assert.deepEqual(await readdir(f.options.agents),[]);assert.equal((await f.state()).active,false);
});
test('deactivation checks all ownership conflicts before stopping any job',async t=>{
  const f=await jobFixture(t,{active:true});await f.seed();await writeFile(f.target(f.options.items[0]),'conflict');
  await assert.rejects(applyJobs({...f.options,activate:false}),/existing_job_conflict/u);
  assert.equal(f.loaded.size,2);assert.ok(f.calls.every(x=>x[0]==='print'));assert.equal((await f.state()).active,true);
});
test('shutdown and rollback wait for asynchronous launchd removal before deleting files',async t=>{
  for(const activate of [false,true]){
    const f=await jobFixture(t,{active:!activate});if(!activate)await f.seed();
    const terminating=new Map();let pauses=0;
    const execute=async(command,args)=>{
      const item=f.options.items.find(x=>args[1]?.endsWith('/'+x.label)||args[2]?.endsWith('/'+x.label+'.plist'));
      if(args[0]==='print'&&terminating.has(item.label)){
        const remaining=terminating.get(item.label);terminating.set(item.label,remaining-1);
        assert.equal(await readFile(f.target(item),'utf8'),item.plist);
        if(remaining===0){f.loaded.delete(item.label);terminating.delete(item.label);}
      }
      if(args[0]==='bootout'){terminating.set(item.label,2);return {stdout:''};}
      const result=await f.execute(command,args);
      if(activate&&args[0]==='bootstrap'&&item===f.options.items[1])throw new Error('bootstrap_failed');
      return result;
    };
    const options={...f.options,activate,execute,pause:async()=>{pauses++;}};
    if(activate)await assert.rejects(applyJobs(options),/bootstrap_failed/u);else await applyJobs(options);
    assert.equal(f.loaded.size,0);assert.equal(pauses,4);assert.deepEqual(await readdir(f.options.agents),[]);assert.equal((await f.state()).active,false);
  }
});
test('launchctl permission errors and misleading loaded paths fail closed',async t=>{
  const f=await jobFixture(t);
  await assert.rejects(applyJobs({...f.options,activate:true,execute:async()=>{throw Object.assign(new Error('denied'),{code:1});}}),/denied/u);
  await assert.rejects(applyJobs({...f.options,activate:true,execute:async()=>({stdout:'path = '+f.target(f.options.items[0])+'.unrelated\n'})}),/loaded_job_conflict/u);
  assert.deepEqual(await readdir(f.options.agents),[]);assert.equal((await f.state()).active,false);
});
test('controller confirms start and stop before saving the final state',async t=>{
  const f=await jobFixture(t);
  const execute=async(command,args)=>{
    if(['bootstrap','bootout'].includes(args[0])){
      const state=await f.state();assert.equal(state.active,true);assert.equal(state.attentionRequired,true);
      assert.equal(state.controlError,args[0]==='bootstrap'?'activation_incomplete':'deactivation_incomplete');
    }
    return f.execute(command,args);
  };
  await applyJobs({...f.options,activate:true,execute});assert.equal(f.loaded.size,2);
  const active=await f.state();assert.equal(active.active,true);assert.equal(active.attentionRequired,false);
  await applyJobs({...f.options,settings:active,activate:false,execute});assert.equal(f.loaded.size,0);assert.equal((await f.state()).active,false);
});
