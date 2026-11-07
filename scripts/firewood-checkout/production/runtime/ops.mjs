import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,lstat,statfs,stat,truncate,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawn,execFile} from 'node:child_process';
import {promisify,parseEnv} from 'node:util';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {Pool} from 'pg';
import {loadConfiguration,databaseOptions,verifyDatabase} from './config.mjs';
import {main,runtime} from './main.mjs';
import {requirePower} from './power.mjs';
import {postgresAdapter} from '../../hosted/runtime.mjs';
import {privateFile,privateDir,jsonFile,atomicJson,lease} from '../../macbook/ops/files.mjs';
import {verifyHost} from '../../macbook/ops/host-identity.mjs';
import {encryptedDump,prune,backupName} from '../../macbook/ops/backup.mjs';
import {recordOperationsIncident} from './incidents.mjs';
import {deliverOperationsNotification} from './operations-mail.mjs';
import {applyJobs} from '../../macbook/ops/launchd.mjs';

export function operationsProfile(name='routed-sandbox'){
  if(!['routed-sandbox','production'].includes(name))throw Error('explicit_operations_profile_required');
  const sandbox=name==='routed-sandbox';return Object.freeze({name,sandbox,root:resolve(homedir(),'.local/share',sandbox?'ats-firewood-routed-sandbox-20261028':'ats-firewood-production'),prefix:'com.angeltreeservices.firewood.'+name,database:sandbox?'firewood_candidate_sandbox':'firewood_orders',httpStatus:sandbox?401:200});
}
export const PROFILE=operationsProfile(process.env.FIREWOOD_OPERATIONS_PROFILE);
export const ROOT=PROFILE.root;
export const PREFIX=PROFILE.prefix;
export const PG=resolve(homedir(),'.local/share/ats-firewood-native-qa-20261026/postgres/bin');
const execute=promisify(execFile),pathEnv={HOME:homedir(),PATH:'/opt/homebrew/bin:/usr/bin:/bin'};
export async function notifyOperations(recovered=false,notice,options={}){return deliverOperationsNotification({root:options.root??ROOT,sandbox:PROFILE.sandbox,location:options.location??'server',recovered,notice,
  local:async()=>{const text=recovered?'Firewood monitoring has recovered.':'Firewood needs attention. Open the local health report.';await execute('/usr/bin/osascript',['-e',`display notification "${text}" with title "Angel Firewood"`],{timeout:5000});}});}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function xml(v){if(typeof v==='boolean')return v?'<true/>':'<false/>';if(Number.isInteger(v))return '<integer>'+v+'</integer>';if(typeof v==='string')return '<string>'+esc(v)+'</string>';if(Array.isArray(v))return '<array>'+v.map(xml).join('')+'</array>';return '<dict>'+Object.entries(v).map(([k,x])=>'<key>'+esc(k)+'</key>'+xml(x)).join('')+'</dict>';}
export function jobs({root=ROOT,node=process.execPath}={}){
  const code=resolve(root,'app/scripts/firewood-checkout/production/runtime/ops.mjs');
  return [['postgres',0],['web',0],['worker',30],['backup',3600],['monitor',60]].map(([role,interval])=>{
    const value={Label:PREFIX+'.'+role,ProgramArguments:[node,code,role],WorkingDirectory:resolve(root,'app'),EnvironmentVariables:{...pathEnv,FIREWOOD_OPERATIONS_PROFILE:PROFILE.name},ProcessType:'Background',Umask:63,ThrottleInterval:30,ExitTimeOut:30,
      StandardOutPath:resolve(root,'ops/logs',role+'.log'),StandardErrorPath:resolve(root,'ops/logs',role+'.log'),...(interval?{RunAtLoad:true,StartInterval:interval}:{KeepAlive:true})};
    return {role,label:value.Label,value,plist:'<?xml version="1.0" encoding="UTF-8"?><plist version="1.0">'+xml(value)+'</plist>\n'};
  });
}
export function assertSettings(s,root=ROOT,profile=PROFILE){
  const held=!profile.sandbox&&s?.stage==='prepared'&&s.active===false&&s.livePayments===false&&s.emailEnabled===false;
  if(s?.version!==1||s.sandbox!==profile.sandbox||s.root!==root||s.origin!=='https://checkout.angeltreeservices.org'||s.database!==profile.database||(!held&&(s.livePayments!==!profile.sandbox||s.emailEnabled!==!profile.sandbox))||s.crmEnabled!==false)throw Error('isolated_routed_profile_required');
  return s;
}
export async function retryStartup(operation,{attempts=4,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){for(let n=0;n<attempts;n++)try{return await operation();}catch(e){if(n===attempts-1)throw e;await pause(3000*(n+1));}}
export async function durableCopies(folder,names){await privateDir(folder);for(const name of names){if(!name||name.includes('/')||['.','..'].includes(name))throw Error('owned_backup_name_required');const f=await open(resolve(folder,name),constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('private_backup_file_required');await f.sync();}finally{await f.close();}}const dir=await open(folder,constants.O_RDONLY|constants.O_NOFOLLOW);try{await dir.sync();}finally{await dir.close();}}
async function guardSettings({power=true}={}){
  await privateDir(ROOT);await verifyHost({directory:ROOT});if(power)await requirePower();
  return assertSettings(await jsonFile(resolve(ROOT,'ops/settings.json')));
}
async function context({power=true}={}){
  const settings=await guardSettings({power});
  const env=parseEnv((await privateFile(resolve(ROOT,'.env.web.private'))).toString());
  const config=await loadConfiguration(env);
  // Live mode also passes the runtime's independent protected release-file gates.
  // Selecting a job profile or writing settings alone cannot activate payments.
  if(config.sandbox!==PROFILE.sandbox||config.emailEnabled!==settings.emailEnabled||config.crmEnabled||!config.managedWorker||config.origin!==settings.origin||env.FIREWOOD_CANDIDATE_TLS_BUNDLE!==resolve(ROOT,'tls-bundle.private.json'))throw Error('routed_profile_configuration_mismatch');
  databaseOptions(env,config);return {settings,env,config};
}
export async function controlPreflight(activate,{guard=()=>guardSettings({power:false}),configure=()=>context()}={}){return activate?(await configure()).settings:guard();}
export function issuesFor({ready,publicReady,queues,heartbeat,backup,ack,diskBytes,powerAllowed,privateExpiry,publicExpiry,oldestRetry,jobFailures=[],now=Date.now()}){
  const issues=[];
  if(!ready)issues.push('database_or_web_unavailable');if(!publicReady)issues.push('public_https_unavailable');
  if(!heartbeat||now-Math.max(Number(heartbeat.started)||0,Number(heartbeat.finished)||0)>150000)issues.push('worker_stale');
  if(queues?.some(x=>x.status==='review'&&Number(x.n)>0))issues.push('queue_needs_review');
  if(oldestRetry&&now-Number(oldestRetry)>600000)issues.push('retry_overdue');
  for(const role of jobFailures)if(['worker','backup'].includes(role))issues.push(role+'_job_failed');
  if(!backup||now-Number(backup.createdAt)>5400000)issues.push('backup_stale');
  if(!ack||now-Number(ack.createdAt)>7200000)issues.push('off_device_backup_stale');
  if(!Number.isFinite(diskBytes)||diskBytes<2*1024**3)issues.push('disk_space_low');
  if(!powerAllowed)issues.push('battery_threshold_or_power_unknown');
  if(!Number.isFinite(privateExpiry)||privateExpiry-now<14*86400000)issues.push('private_tls_expiring');
  if(!Number.isFinite(publicExpiry)||publicExpiry-now<14*86400000)issues.push('public_tls_expiring');
  return issues.sort();
}
async function requestHealth(config,bundle){
  const options={hostname:'127.0.0.1',port:56389,servername:'firewood-candidate-backend.invalid',path:'/health',headers:{Host:new URL(config.origin).host},
    ca:await privateFile(bundle.ca),key:await privateFile(bundle.relayKey),cert:await privateFile(bundle.relayCert),rejectUnauthorized:true,
    checkServerIdentity(name,c){return checkServerIdentity(name,c)||(c.fingerprint256.replaceAll(':','').toLowerCase()!==bundle.backendFingerprint?Error('backend_pin_mismatch'):undefined);}};
  return new Promise((yes,no)=>{const r=request(options,res=>{res.resume();res.on('end',()=>yes(res.statusCode===200));});r.on('error',no);r.setTimeout(5000,()=>r.destroy(Error('health_timeout')));r.end();});
}
async function publicHealth(origin){return new Promise((yes,no)=>{const r=request(origin+'/firewood/checkout/',res=>{const publicExpiry=Date.parse(res.socket.getPeerCertificate().valid_to);res.resume();res.on('end',()=>yes({publicReady:res.statusCode===PROFILE.httpStatus,publicExpiry}));});r.on('error',no);r.setTimeout(7000,()=>r.destroy(Error('public_health_timeout')));r.end();});}
export async function monitor(ctx){
  const {settings,config,env}=ctx,now=Date.now();let ready=false,queues=null,heartbeat=null,oldestRetry=null,publicReady=false,publicExpiry=null,privateExpiry=null,powerAllowed=false;
  const bundle=JSON.parse((await privateFile(resolve(ROOT,'tls-bundle.private.json'))).toString());
  try{ready=await requestHealth(config,bundle);}catch{}
  try{({publicReady,publicExpiry}=await publicHealth(config.origin));}catch{}
  const pool=new Pool({...databaseOptions(env,config),max:1,options:'-c default_transaction_read_only=on'});pool.on('error',()=>{});
  try{const db=postgresAdapter(pool);await verifyDatabase(db,config);heartbeat=(await db.query('SELECT * FROM fw_heartbeat WHERE id=true')).rows[0];
    queues=(await db.query("SELECT status,count(*)::int n FROM (SELECT status FROM fw_events UNION ALL SELECT status FROM fw_reconcile UNION ALL SELECT status FROM fw_refunds UNION ALL SELECT status FROM fw_outbox) q GROUP BY status")).rows;
    oldestRetry=(await db.query("SELECT min(created_at) oldest FROM (SELECT created_at FROM fw_events WHERE status='pending' AND last_code IS NOT NULL UNION ALL SELECT created_at FROM fw_reconcile WHERE status='pending' AND last_code IS NOT NULL UNION ALL SELECT created_at FROM fw_refunds WHERE status='pending' AND last_code IS NOT NULL UNION ALL SELECT first_send FROM fw_outbox WHERE status='pending' AND last_code IS NOT NULL) q")).rows[0].oldest;
  }catch{ready=false;}finally{await pool.end();}
  try{await requirePower();powerAllowed=true;}catch{}
  try{privateExpiry=Math.min(...await Promise.all(['backendCert','relayCert','ownerCert','relayServerCert'].map(async k=>Date.parse(new X509Certificate(await privateFile(bundle[k])).validTo))));}catch{}
  const backup=await jsonFile(resolve(ROOT,'ops/backups/latest.json')),ack=await jsonFile(resolve(ROOT,'ops/backups/ack.json')),disk=await statfs(ROOT);
  const jobFailures=[];for(const role of ['worker','backup'])if((await jsonFile(resolve(ROOT,'ops/state',role+'-job.json')))?.ok===false)jobFailures.push(role);
  const issues=issuesFor({ready,publicReady,queues,heartbeat,backup,ack,diskBytes:disk.bavail*disk.bsize,powerAllowed,privateExpiry,publicExpiry,oldestRetry,jobFailures,now});
  if(settings.attentionRequired)issues.push('operations_control_needs_review');
  const incident=await recordOperationsIncident(resolve(ROOT,'ops/state/incident.json'),issues,{now,notify:notifyOperations,enabled:settings.active===true&&settings.notifications===true&&now-Number(settings.activationStartedAt)>180000});
  const reportedIssues=incident.notificationFailed?[...issues,'notification_delivery_failed'].sort():issues;
  const result={sandbox:PROFILE.sandbox,checkedAt:now,healthy:!reportedIssues.length,issues:reportedIssues,ready,publicReady,publicExpiry,privateExpiry,backup,ack,worker:heartbeat,...incident};
  await atomicJson(resolve(ROOT,'ops/state/monitor.json'),result);
  for(const role of ['postgres','web','worker','monitor','backup']){const f=resolve(ROOT,'ops/logs',role+'.log');try{if((await stat(f)).size>1024**2)await truncate(f,0);}catch(e){if(e.code!=='ENOENT')throw e;}}
  return {sandbox:PROFILE.sandbox,healthy:result.healthy,issues:reportedIssues};
}
export async function backup({env,config}){return lease(resolve(ROOT,'ops/state/backup.lock'),async()=>{
  const folder=resolve(ROOT,'ops/backups'),url=new URL(env.FIREWOOD_CANDIDATE_DATABASE_URL);
  const pool=new Pool({...databaseOptions(env,config),max:1});try{await verifyDatabase(postgresAdapter(pool),config);}finally{await pool.end();}
  const latest=await jsonFile(resolve(folder,'latest.json')),ack=await jsonFile(resolve(folder,'ack.json'));if(latest)await prune(folder,latest,ack);
  const {readdir}=await import('node:fs/promises');if((await readdir(folder)).filter(n=>backupName.test(n)).length>=128)throw Error('backup_retention_needs_review');
  const meta=await encryptedDump({folder,key:await privateFile(resolve(ROOT,'backup-key.private')),command:resolve(PG,'pg_dump'),args:['-h','127.0.0.1','-p','56388','-U','firewood_candidate_worker','-d',config.database,'--format=custom','--no-owner','--no-acl'],env:{...pathEnv,PGPASSWORD:decodeURIComponent(url.password),PGOPTIONS:'-c default_transaction_read_only=on'}});
  meta.testOnly=config.sandbox;await atomicJson(resolve(folder,meta.name+'.json'),meta);await atomicJson(resolve(folder,'latest.json'),meta);
  await durableCopies(folder,[meta.name,meta.name+'.json','latest.json']);
  await prune(folder,meta,ack);return {sandbox:config.sandbox,name:meta.name,bytes:meta.bytes};
});}
export async function control(activate){await controlPreflight(activate);const items=jobs(),agents=resolve(homedir(),'Library/LaunchAgents');await mkdir(agents,{recursive:true,mode:0o700});
  const s=await lstat(agents);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o022))throw Error('owned_launchagents_required');
  return lease(resolve(ROOT,'ops/state/control.lock'),async()=>{
    const settings=assertSettings(await jsonFile(resolve(ROOT,'ops/settings.json')));
    if(activate){for(const item of items){const file=resolve(ROOT,'ops/LaunchAgents',item.label+'.plist');await privateFile(file);}
      for(const [port,role] of [[56388,'postgres'],[56389,'web'],[56390,'web']]){let managed=false;try{const {stdout}=await execute('/bin/launchctl',['print','gui/'+process.getuid()+'/'+PREFIX+'.'+role]);managed=stdout.split('\n').some(x=>x.trim()==='path = '+resolve(agents,PREFIX+'.'+role+'.plist'));}catch(e){if(e.code!==113)throw e;}
        if(!managed)try{await execute('/usr/sbin/lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN']);throw Error('occupied_service_port');}catch(e){if(e.code!==1)throw e;}}}
    return {...await applyJobs({activate,folder:resolve(ROOT,'ops'),agents,domain:'gui/'+process.getuid(),items,settings,settingsFile:resolve(ROOT,'ops/settings.json')}),sandbox:PROFILE.sandbox,testOnly:PROFILE.sandbox};
  });}
export async function run(role){const ctx=await context({power:role!=='monitor'});
  if(role==='web')return main(ctx.env,'web');
  if(role==='worker')return lease(resolve(ROOT,'ops/state/worker.lock'),async()=>{const app=await runtime(ctx.env,'worker');try{return {sandbox:PROFILE.sandbox,...await app.worker.work()};}finally{await app.close();}});
  if(role==='monitor')return monitor(ctx);if(role==='backup')return retryStartup(()=>backup(ctx));
  if(role==='postgres'){
    const child=spawn(resolve(PG,'postgres'),['-D',resolve(ROOT,'cluster')],{env:pathEnv,stdio:['ignore','inherit','inherit']});
    let timer=setInterval(()=>requirePower().catch(()=>child.kill('SIGTERM')),15000);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill('SIGTERM'));
    return new Promise((yes,no)=>{child.once('error',e=>{clearInterval(timer);no(e);});child.once('exit',code=>{clearInterval(timer);code===0?yes():no(Error('owned_postgres_stopped'));});});
  }
  throw Error('explicit_operations_role_required');
}
async function report(){const settings=await guardSettings({power:false});return {sandbox:PROFILE.sandbox,active:settings.active===true,attentionRequired:!!settings.attentionRequired,activationStartedAt:settings.activationStartedAt,monitor:await jsonFile(resolve(ROOT,'ops/state/monitor.json')),latest:await jsonFile(resolve(ROOT,'ops/backups/latest.json'))};}
async function acknowledge(name,sha256){await guardSettings({power:false});if(!backupName.test(name??'')||!/^[a-f0-9]{64}$/u.test(sha256??''))throw Error('owned_backup_ack_required');const meta=await jsonFile(resolve(ROOT,'ops/backups',name+'.json'));if(!meta||meta.name!==name||meta.sha256!==sha256)throw Error('backup_ack_mismatch');await atomicJson(resolve(ROOT,'ops/backups/ack.json'),meta);return {sandbox:PROFILE.sandbox,acknowledged:true};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const role=process.argv[2];try{const result=role==='activate'?await control(true):role==='deactivate'?await control(false):role==='report'?await report():role==='ack'?await acknowledge(process.argv[3],process.argv[4]):await run(role);
    if(!['web','postgres'].includes(role)){if(['worker','backup','monitor'].includes(role))await atomicJson(resolve(ROOT,'ops/state',role+'-job.json'),{sandbox:PROFILE.sandbox,finishedAt:Date.now(),ok:true});console.log(JSON.stringify(result));}
  }catch{if(['worker','backup','monitor'].includes(role))await atomicJson(resolve(ROOT,'ops/state',role+'-job.json'),{sandbox:PROFILE.sandbox,finishedAt:Date.now(),ok:false}).catch(()=>{});console.error(JSON.stringify({sandbox:PROFILE.sandbox,role,error:'owned_firewood_operation_failed'}));process.exitCode=1;}
}
