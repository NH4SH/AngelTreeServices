import {readFile,writeFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,privateDir,privateFile,jsonFile,atomicJson} from './files.mjs';
import {WATCH_ROOT} from './watch.mjs';
import {watchJob} from './jobs.mjs';
export async function prepareWatch(keyPath,sshConfig){
  const key=await privateFile(resolve(keyPath));if(key.length!==32)throw new Error('backup_recovery_key_required');
  await privateFile(resolve(sshConfig));
  for(const path of [WATCH_ROOT,resolve(WATCH_ROOT,'code'),resolve(WATCH_ROOT,'backups'),resolve(WATCH_ROOT,'LaunchAgents')])await privateDir(path);
  const old=await jsonFile(resolve(WATCH_ROOT,'settings.json'));if(old?.active)throw new Error('stop_watch_schedule_before_preparing');
  if(old&&(!old.testOnly||old.root!==WATCH_ROOT))throw new Error('watch_identity_conflict');
  try{const existing=await privateFile(resolve(WATCH_ROOT,'recovery.key.private'));if(!existing.equals(key))throw new Error('backup_key_identity_conflict');}
  catch(e){if(e.code!=='ENOENT')throw e;await writeFile(resolve(WATCH_ROOT,'recovery.key.private'),key,{flag:'wx',mode:0o600});}
  for(const name of ['watch.mjs','files.mjs','host-identity.mjs','backup.mjs','incidents.mjs'])await cp(new URL(name,import.meta.url),resolve(WATCH_ROOT,'code',name));
  await atomicJson(resolve(WATCH_ROOT,'settings.json'),{version:1,testOnly:true,root:WATCH_ROOT,host:'ats-home-private',remoteRoot:ROOT,sshConfig:resolve(sshConfig),active:false,notifications:false});
  const job=watchJob({root:WATCH_ROOT,node:process.execPath,code:resolve(WATCH_ROOT,'code'),config:resolve(WATCH_ROOT,'settings.json')});
  await writeFile(resolve(WATCH_ROOT,'LaunchAgents',job.label+'.plist'),job.plist,{mode:0o600});
  await writeFile(resolve(WATCH_ROOT,'watch.log'),'',{flag:'a',mode:0o600});
  return {testOnly:true,preparedWatch:true,activated:false,root:WATCH_ROOT};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await prepareWatch(process.argv[2],process.argv[3])));}
  catch{console.error('Private Firewood watch preparation refused or failed; no credentials are logged.');process.exitCode=1;}
}
