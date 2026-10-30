import {writeFile,readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {configuration} from '../native-config.mjs';
import {ROOT,OPS,CODE,guardRoot,privateDir,privateFile,jsonFile,atomicJson} from './files.mjs';
import {jobs,policy} from './jobs.mjs';

export async function prepare(){
  await guardRoot();const env=parseEnv((await privateFile(resolve(ROOT,'.env.web.private'))).toString());configuration(env);
  if((await privateFile(resolve(ROOT,'backup-key.private'))).length!==32)throw new Error('backup_recovery_key_required');
  for(const folder of [OPS,resolve(OPS,'state'),resolve(OPS,'logs'),resolve(OPS,'backups'),resolve(OPS,'LaunchAgents')])await privateDir(folder);
  const existing=await jsonFile(resolve(OPS,'settings.json'));
  if(existing?.active)throw new Error('stop_private_schedules_before_preparing');
  if(existing&&(!existing.testOnly||existing.root!==ROOT))throw new Error('private_ops_identity_conflict');
  await atomicJson(resolve(OPS,'database.private.json'),{databaseUrl:env.FIREWOOD_MACBOOK_DATABASE_URL});
  await atomicJson(resolve(OPS,'settings.json'),{version:1,testOnly:true,root:ROOT,preparedAt:existing?.preparedAt??Date.now(),active:false,notifications:false,policy});
  const prepared=jobs({root:ROOT,node:process.execPath,code:CODE});
  for(const job of prepared){
    await writeFile(resolve(OPS,'LaunchAgents',job.label+'.plist'),job.plist,{mode:0o600});
    const log=resolve(OPS,'logs',job.role+'.log');
    try{await lstat(log);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(log,'',{flag:'wx',mode:0o600});}
    await privateFile(log);
  }
  return {testOnly:true,preparedJobs:prepared.map(x=>x.role),activated:false,root:ROOT};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await prepare()));}
  catch{console.error('Private Firewood operations preparation refused or failed; no credentials are logged.');process.exitCode=1;}
}
