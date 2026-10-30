import {statfs,stat,truncate} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {databaseOptions,verifyDatabase,MAC_ORIGIN} from '../native-config.mjs';
import {postgresAdapter} from '../../hosted/runtime.mjs';
import {atomicJson,jsonFile} from './files.mjs';
import {recordIncident} from './incidents.mjs';

export async function readonlyDatabase(databaseUrl){
  const pool=new Pool({...databaseOptions({FIREWOOD_MACBOOK_DATABASE_URL:databaseUrl}),max:1,
    options:'-c default_transaction_read_only=on',connectionTimeoutMillis:3000,statement_timeout:5000});
  pool.on('error',()=>{});const db=postgresAdapter(pool);
  try{await verifyDatabase(db,{origin:MAC_ORIGIN});return {db,close:()=>pool.end()};}
  catch(e){await pool.end();throw e;}
}
export function issuesFor({webReady,queue,backup,diskBytes,now,grace=false}){
  const issues=[];
  if(!webReady)issues.push('web_unavailable');
  if(!queue)issues.push('database_unavailable');
  if(queue){
    if(!queue.finished_at||now-Number(queue.finished_at)>600000)issues.push('worker_stale');
    if(queue.last_code||Number(queue.review)>0)issues.push('queue_needs_review');
    if(queue.oldest_event!==null&&now-Number(queue.oldest_event)>600000)issues.push('event_overdue');
  }
  if(!backup||now-backup.createdAt>5400000)issues.push('backup_stale');
  if(diskBytes<2*1024**3)issues.push('disk_space_low');
  return grace?issues.filter(x=>x==='disk_space_low'):issues.sort();
}
export async function monitor(root,databaseUrl){
  const settings=await jsonFile(resolve(root,'ops/settings.json'));if(!settings?.testOnly)throw new Error('private_ops_settings_required');
  const now=Date.now();let connection,queue=null,webReady=false;
  try{
    const response=await fetch(MAC_ORIGIN+'/health',{signal:AbortSignal.timeout(5000)});webReady=response.status===200;
  }catch{}
  try{
    connection=await readonlyDatabase(databaseUrl);
    queue=(await connection.db.query(`SELECT
      (SELECT finished_at FROM firewood_render_heartbeat WHERE id='worker') AS finished_at,
      (SELECT last_code FROM firewood_render_heartbeat WHERE id='worker') AS last_code,
      ((SELECT count(*) FROM firewood_render_events WHERE status='review')+
       (SELECT count(*) FROM firewood_render_reconciliation WHERE status='review')+
       (SELECT count(*) FROM firewood_test_email_delivery WHERE status='review'))::int AS review,
      (SELECT min(received_at) FROM firewood_render_events WHERE status='pending') AS oldest_event`)).rows[0];
  }catch{}finally{if(connection)await connection.close();}
  const backup=await jsonFile(resolve(root,'ops/backups/latest.json')),space=await statfs(root),diskBytes=space.bavail*space.bsize;
  const grace=settings.active&&now-Number(settings.activationStartedAt)<180000;
  const issues=issuesFor({webReady,queue,backup,diskBytes,now,grace});
  let powerSource='unknown';
  try{powerSource=(await promisify(execFile)('/usr/bin/pmset',['-g','batt'],{timeout:3000})).stdout.split('\n')[0];}catch{}
  if(powerSource.includes("'Battery Power'"))issues.push('on_battery_power');
  for(const role of ['worker','backup']){const job=await jsonFile(resolve(root,'ops/state/'+role+'-job.json'));if(job?.ok===false&&!grace)issues.push(role+'_job_failed');}
  issues.sort();
  const incident=await recordIncident(resolve(root,'ops/state/incident.json'),issues,{now,enabled:!!settings.active&&!!settings.notifications});
  const value={testOnly:true,checkedAt:now,healthy:issues.length===0,issues,webReady,workerFinishedAt:queue?.finished_at??null,
    backupCreatedAt:backup?.createdAt??null,diskFreeBytes:diskBytes,powerSource,sendingEnabled:false,crmEnabled:false,active:!!settings.active,...incident};
  await atomicJson(resolve(root,'ops/state/monitor.json'),value);
  // Truncate these owned files in place so launchd's existing file descriptors
  // remain valid. No credentials or individual order details are logged.
  for(const name of ['web','worker','monitor','backup','postgres']){
    const path=resolve(root,'ops/logs/'+name+'.log');if((await stat(path)).size>1024*1024)await truncate(path,0);
  }
  return {healthy:value.healthy,issues:value.issues};
}
