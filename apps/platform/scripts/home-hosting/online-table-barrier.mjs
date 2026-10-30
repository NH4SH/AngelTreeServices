// Synthetic candidate only. Storage metadata is held while referenced files are
// pinned; ordinary business writes continue until the short final SQL barrier.
// PostgreSQL owns the timeout, so a dead coordinator cannot hold locks forever.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs';import {randomBytes} from 'node:crypto';
import {captureManifestSql} from './capture-manifest.mjs';
import {onlineBackupSourceScope} from './backup-source-scope.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function openOnlineTableBarrier(io){
 onlineBackupSourceScope(io);io.assertSource();
 const nonce=randomBytes(12).toString('hex'),started=Date.now(),child=spawn('/usr/bin/docker',['exec','--interactive','--env','PGAPPNAME=ATS_PAIR_BARRIER_'+io.id,io.db,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{env:io.env,stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',ended=false,exitCode;child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',data=>{stdout+=data;if(Buffer.byteLength(stdout)>1048576)child.kill();});
 child.stderr.on('data',data=>{stderr+=data;if(Buffer.byteLength(stderr)>65536)child.kill();});
 child.on('error',error=>{stderr+='\n'+error.message;ended=true;});child.on('close',code=>{exitCode=code;ended=true;});child.stdin.on('error',error=>{stderr+='\n'+error.message;});
 let number=0,closed=false;
 async function query(sql){
  assert.equal(closed,false);const begin='ATS_BEGIN_'+nonce+'_'+(++number),end='ATS_END_'+nonce+'_'+number;
  child.stdin.write('\\echo '+begin+'\n'+sql+'\n\\echo '+end+'\n');
  const until=Date.now()+3500;
  for(;;){const from=stdout.indexOf(begin+'\n'),to=stdout.indexOf(end+'\n',from+begin.length+1);
   if(from>=0&&to>=0)return stdout.slice(from+begin.length+1,to).trim();
   if(ended||Date.now()>=until)throw Error('Synthetic table barrier withheld; inspect its private session log');await delay(10);
  }
 }
 async function close(commit=false){
  if(closed)return;closed=true;
  if(!ended)child.stdin.end((commit?'commit;':'rollback;')+'\n');
  for(let n=0;n<100&&!ended;n++)await delay(20);
  if(!ended){child.kill();for(let n=0;n<50&&!ended;n++)await delay(20);}
  fs.writeFileSync(io.folder+'/barrier-'+nonce+'.private.log',stdout+'\n'+stderr,{mode:0o600});
  if(commit)assert.equal(exitCode,0,'SQL barrier did not commit cleanly');
 }
 try{
  await query("begin;set local lock_timeout='1500ms';set local statement_timeout='2500ms';set local idle_in_transaction_session_timeout='8s';lock table storage.buckets,storage.objects in share mode;");
  let finalHeldAt;
  return {
   async objects(){return JSON.parse(await query("select coalesce(jsonb_agg(jsonb_build_object('bucketId',bucket_id,'name',name,'version',version,'size',(metadata->>'size')::bigint,'eTag',metadata->>'eTag') order by bucket_id,name,version),'[]') from storage.objects where coalesce(is_delete_marker,false)=false;"));},
   async capture(){
    assert.equal(finalHeldAt,undefined);finalHeldAt=Date.now();
    await query("do $$ declare r record;begin for r in select schemaname,tablename from pg_tables where schemaname in('public','app_private','auth','storage','supabase_migrations') order by schemaname,tablename loop execute format('lock table %I.%I in share mode',r.schemaname,r.tablename);end loop;end $$;");
    const manifest=JSON.parse(await query(captureManifestSql));
    // A nontransactional WAL marker is harmless on rollback and supplies an
    // exact replay cutoff after all previously committed business writes.
    await query("select pg_logical_emit_message(false,'ats_pair_barrier','"+nonce+"');");
    const targetLsn=await query('select pg_current_wal_insert_lsn()::text;');
    const through=await query('select pg_switch_wal()::text;');
    assert.match(through,/^[0-9A-F]+\/[0-9A-F]+$/);
    const targetWalFile=await query("select pg_walfile_name('"+through+"'::pg_lsn-1);");
    return {manifest,targetLsn,through,targetWalFile};
   },
   async finish(){assert.ok(Number.isFinite(finalHeldAt));await close(true);return {storageBarrierMs:Date.now()-started,businessBarrierMs:Date.now()-finalHeldAt,appSessionsTerminated:false,apiLoginsChanged:false,applicationServicesPaused:false};},
   abort:()=>close(false)
  };
 }catch(error){await close(false);throw error;}
}
