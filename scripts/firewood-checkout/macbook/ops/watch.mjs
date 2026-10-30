import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,rename,unlink,stat,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {ROOT,privateDir,privateFile,jsonFile,atomicJson,lease} from './files.mjs';
import {backupName,authenticate,retainedNames} from './backup.mjs';
import {recordIncident} from './incidents.mjs';
export const WATCH_ROOT=resolve(homedir(),'.local/share/ats-firewood-qa-ops');
export function watchIssues(report,now=Date.now()){
  if(!report.active)return [];
  const issues=[];
  if(!report.monitor||!Number.isFinite(report.monitor.checkedAt)||now-report.monitor.checkedAt>180000)issues.push('server_monitor_stale');
  else issues.push(...report.monitor.issues);
  if(!report.latest)issues.push('off_device_backup_missing');
  else if(!Number.isFinite(report.latest.createdAt)||now-report.latest.createdAt>7200000)issues.push('off_device_backup_stale');
  return issues;
}
async function sha(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
export async function receiveBackup({root,meta,key,copy,acknowledge}){
  if(!backupName.test(meta?.name??'')||!/^[a-f0-9]{64}$/u.test(meta.sha256??'')||!Number.isInteger(meta.bytes)||meta.bytes<36||meta.bytes>256*1024**2||!Number.isFinite(meta.createdAt)||meta.createdAt>Date.now()+300000)throw new Error('invalid_remote_manifest');
  const folder=resolve(root,'backups');await privateDir(folder);
  const final=resolve(folder,meta.name),previous=await jsonFile(final+'.json');
  if(!previous||previous.sha256!==meta.sha256){
    const incoming=resolve(folder,randomUUID()+'.incoming');
    try{
      await copy(incoming);await privateFile(incoming);
      if((await stat(incoming)).size!==meta.bytes||await sha(incoming)!==meta.sha256)throw new Error('backup_copy_mismatch');
      await authenticate(incoming,key);await rename(incoming,final);await atomicJson(final+'.json',meta);
    }finally{await unlink(incoming).catch(()=>{});}
  }else{
    if(await sha(final)!==meta.sha256)throw new Error('stored_backup_mismatch');await authenticate(final,key);
  }
  await atomicJson(resolve(folder,'latest.json'),meta);await acknowledge(meta);
  const items=[];for(const name of await readdir(folder))if(backupName.test(name)){const item=await jsonFile(resolve(folder,name+'.json'));if(item?.name===name)items.push(item);}
  const keep=retainedNames(items);keep.add(meta.name);
  for(const item of items)if(!keep.has(item.name)){await unlink(resolve(folder,item.name));await unlink(resolve(folder,item.name+'.json'));}
  return {name:meta.name,createdAt:meta.createdAt,authenticated:true};
}
export async function watch(configFile){
  if(resolve(configFile)!==resolve(WATCH_ROOT,'settings.json'))throw new Error('private_watch_config_required');
  const settings=await jsonFile(configFile);
  if(!settings?.testOnly||settings.root!==WATCH_ROOT||settings.host!=='ats-home-private'||settings.remoteRoot!==ROOT)throw new Error('private_watch_identity_required');
  await privateDir(WATCH_ROOT);
  const exec=promisify(execFile),ssh=['-F',settings.sshConfig,'-o','BatchMode=yes','-o','ConnectTimeout=10',settings.host];
  return lease(resolve(WATCH_ROOT,'watch.lock'),async()=>{
    let report,backup=null,issues=[];
    try{
      const {stdout}=await exec('/usr/bin/ssh',[...ssh,'/opt/homebrew/bin/node',resolve(ROOT,'app/scripts/firewood-checkout/macbook/ops/remote-status.mjs')],{timeout:20000,maxBuffer:32768});
      report=JSON.parse(stdout);if(report.testOnly!==true)throw new Error('wrong_remote_environment');
      issues.push(...watchIssues(report));
      if(report.latest){
        const key=await privateFile(resolve(WATCH_ROOT,'recovery.key.private'));
        backup=await receiveBackup({root:WATCH_ROOT,meta:report.latest,key,
          copy:destination=>exec('/usr/bin/scp',['-q','-F',settings.sshConfig,'-o','BatchMode=yes','-o','ConnectTimeout=10',settings.host+':'+resolve(ROOT,'ops/backups',report.latest.name),destination],{timeout:45000}),
          acknowledge:meta=>exec('/usr/bin/ssh',[...ssh,'/opt/homebrew/bin/node',resolve(ROOT,'app/scripts/firewood-checkout/macbook/ops/ack.mjs'),meta.name,meta.sha256],{timeout:20000,maxBuffer:1024})});
      }
    }catch{issues.push(report?'backup_pull_failed':'server_unreachable');}
    issues=[...new Set(issues)].sort();
    const incident=await recordIncident(resolve(WATCH_ROOT,'incident.json'),issues,{enabled:!!settings.active&&!!settings.notifications});
    const state={testOnly:true,checkedAt:Date.now(),healthy:issues.length===0,issues,serverActive:!!report?.active,backup,...incident};
    await atomicJson(resolve(WATCH_ROOT,'status.json'),state);return {healthy:state.healthy,issues,backup};
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await watch(process.argv[2]);console.log(JSON.stringify({testOnly:true,...result}));if(!result.healthy)process.exitCode=1;}
  catch{console.error('Private Firewood backup/watch check failed. No credentials are logged.');process.exitCode=1;}
}
