// Real PostgreSQL concurrency test on the existing closed synthetic candidate.
// Operator-only fixture writes exercise locks without opening any API login.
import assert from 'node:assert/strict';import fs from 'node:fs';import {spawn} from 'node:child_process';import {CandidateIO,literal} from './candidate-io.mjs';import {openOnlineTableBarrier} from './online-table-barrier.mjs';
import {captureReferencedObjectFiles} from './referenced-object-files.mjs';import {verifyPrivateArchive} from './cloud-archive.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
assert.equal(process.env.ATS_TABLE_BARRIER_REHEARSAL,'1');const [id,mode]=process.argv.slice(2);assert.match(id,/^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL='1';process.env.ATS_FAILOVER_RUN_ID=id;
const io=new CandidateIO();io.folder=io.root+'/online-barrier-'+id;
if(mode==='hold'){
 assert.equal(fs.existsSync(io.folder),true);const barrier=await openOnlineTableBarrier(io);
 fs.writeFileSync(io.folder+'/holder.pid',String(process.pid));fs.writeFileSync(io.folder+'/holder.ready','ready');
 try{await sleep(60000);}finally{await barrier.abort();}process.exit(0);
}
assert.equal(mode,undefined);fs.mkdirSync(io.folder,{mode:0o700});assert.equal(io.inspect(io.db).State.Running,false);io.docker(['start',io.db]);
function writer(name,sql){const child=spawn('/usr/bin/docker',['exec','-i','--env','PGAPPNAME='+name,io.db,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{env:io.env,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{fs.writeFileSync(io.folder+'/'+name+'.private.log',out+'\n'+err);resolve(code);});});child.stdin.end(sql);return {child,done};}
let barrier,holder;try{
 await io.ready();io.assertSource();for(const service of ['app','api-gw','auth','rest','storage','imgproxy'])assert.equal(io.inspect(io.project+'-'+service+'-1').State.Running,false);
 assert.equal(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');"),'0');
 const first=Number(io.sql('select coalesce(max(id),995100)+1 from public.candidate_fence_fixture where id>=995100 and id<996000;'));assert.ok(first>=995100&&first+1<996000);
 barrier=await openOnlineTableBarrier(io);const references=await barrier.objects();assert.ok(references.length>=4);
 const initial=writer('ATS_BARRIER_EARLY_'+id,'begin;set local session_replication_role=replica;insert into public.candidate_fence_fixture values('+first+');commit;');
 const files=io.folder+'/files';fs.mkdirSync(files,{mode:0o700});const objects=captureReferencedObjectFiles(io,files,references);
 await verifyPrivateArchive(fs.createReadStream(files+'/objects.tar'),objects);
 assert.equal(await initial.done,0,'Storage-only phase blocked a business write');
 const captured=await barrier.capture();const name='ATS_BARRIER_FINAL_'+id;
 const blocked=writer(name,'begin;set local session_replication_role=replica;insert into public.candidate_fence_fixture values('+(first+1)+');commit;');
 let observed=false;for(let n=0;n<80;n++){if(io.sql('select count(*) from pg_stat_activity where application_name='+literal(name)+" and wait_event_type='Lock';")==='1'){observed=true;break;}await sleep(10);}assert.equal(observed,true);
 const timings=await barrier.finish();barrier=undefined;assert.equal(await blocked.done,0,'A waiting business transaction was interrupted');
 assert.equal(io.sql('select count(*) from public.candidate_fence_fixture where id in('+first+','+(first+1)+');'),'2');
 // Suspend only this backup coordinator. The database's own idle timeout must
 // release the backup locks; the normal writer process is never killed.
 holder=spawn(process.execPath,[new URL(import.meta.url).pathname,id,'hold'],{env:{...process.env,ATS_TABLE_BARRIER_REHEARSAL:'1'},stdio:['ignore',fs.openSync(io.folder+'/holder.private.log','w',0o600),fs.openSync(io.folder+'/holder-error.private.log','w',0o600)]});
 for(let n=0;!fs.existsSync(io.folder+'/holder.ready');n++){assert.ok(n<100);await sleep(50);}
 assert.equal(Number(fs.readFileSync(io.folder+'/holder.pid','utf8')),holder.pid);process.kill(holder.pid,'SIGSTOP');
 const crashStarted=Date.now(),waiting=writer('ATS_BARRIER_CRASH_'+id,"begin;set local session_replication_role=replica;update storage.buckets set name=name where id='platform-documents';commit;");
 const released=await Promise.race([waiting.done,sleep(12000).then(()=>{throw Error('Database did not release the abandoned backup lock');})]);assert.equal(released,0);const releaseMs=Date.now()-crashStarted;
 assert.ok(releaseMs>=6000&&releaseMs<12000);process.kill(holder.pid,'SIGCONT');holder.kill('SIGTERM');holder=undefined;
 assert.equal(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');"),'0');
 const report={passed:true,syntheticOnly:true,productionChanged:false,referencedPrivateFiles:references.length,referencedFileBytesAndAttributesMatched:true,businessWriteDuringFilePhaseSucceeded:true,waitingBusinessWriteCommitted:true,allSessionsPreserved:true,abandonedBarrierReleasedMs:releaseMs,...timings,targetLsn:captured.targetLsn,apiLoginsRemainDisabled:true};io.json('result.json',report);console.log(JSON.stringify(report));
}finally{if(barrier)await barrier.abort();if(holder){try{process.kill(holder.pid,'SIGCONT');holder.kill();}catch{}}io.docker(['stop','--time','3',io.db]);}
