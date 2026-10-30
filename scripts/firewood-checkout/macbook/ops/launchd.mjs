import {mkdir,lstat,writeFile,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {ROOT,OPS,CODE,guardRoot,jsonFile,privateFile,atomicJson,lease} from './files.mjs';
import {jobs,watchJob} from './jobs.mjs';
import {WATCH_ROOT} from './watch.mjs';
const exec=promisify(execFile);
async function loadedJob(execute,domain,item,target){
  let result;
  try{result=await execute('/bin/launchctl',['print',domain+'/'+item.label]);}
  catch(e){if(e.code===113)return false;throw e;}
  if(!result.stdout.split('\n').some(line=>line.trim()==='path = '+target))throw new Error('loaded_job_conflict');
  return true;
}
async function stopJob(execute,domain,item,target,pause){
  await execute('/bin/launchctl',['bootout',domain+'/'+item.label]);
  // bootout can return while the owned process is still terminating. Allow
  // its configured 30-second exit timeout before treating cleanup as failed.
  for(let attempt=0;attempt<160;attempt++){
    if(!await loadedJob(execute,domain,item,target))return;
    await pause(250);
  }
  throw new Error('job_still_loaded');
}
// The CLI supplies guarded private paths. Injected commands let tests exercise
// failure/rollback behavior without registering any actual login jobs.
export async function applyJobs({activate,folder,agents,domain,items,settings,settingsFile,execute=exec,save=atomicJson,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
  const planned=[];
  for(const item of items){
    const target=resolve(agents,item.label+'.plist');let exists=true;
    if(activate&&(await privateFile(resolve(folder,'LaunchAgents',item.label+'.plist'))).toString()!==item.plist)throw new Error('staged_job_changed');
    try{if((await privateFile(target)).toString()!==item.plist)throw new Error('existing_job_conflict');}
    catch(e){if(e.code!=='ENOENT')throw e;exists=false;}
    const loaded=await loadedJob(execute,domain,item,target);
    if(loaded&&!exists)throw new Error('loaded_job_file_missing');
    planned.push({item,target,exists,loaded});
  }
  if(activate){
    const attempted=new Set(),created=new Set();
    // Persist an unfinished transition before starting anything. If this
    // controller is killed, a partial startup must not appear safely paused.
    await save(settingsFile,{...settings,active:true,notifications:true,attentionRequired:true,controlError:'activation_incomplete',activationStartedAt:Date.now()});
    try{
      for(const entry of planned){
        const {item,target,exists,loaded}=entry;
        if(!exists){await writeFile(target,item.plist,{flag:'wx',mode:0o600});created.add(entry);}
        if(!loaded){
          attempted.add(entry);
          await execute('/bin/launchctl',['bootstrap',domain,target]);
          if(!await loadedJob(execute,domain,item,target))throw new Error('job_not_loaded');
        }
      }
      await save(settingsFile,{...settings,active:true,notifications:true,attentionRequired:false,controlError:null,activationStartedAt:Date.now()});
      return {testOnly:true,active:true};
    }catch(error){
      const failures=[];
      for(const entry of [...planned].reverse()){
        const {item,target}=entry;
        try{
          if(attempted.has(entry)&&await loadedJob(execute,domain,item,target)){
            await stopJob(execute,domain,item,target,pause);
          }
          if(created.has(entry))await unlink(target);
        }catch(e){failures.push(e);}
      }
      if(failures.length){
        await save(settingsFile,{...settings,active:true,notifications:true,attentionRequired:true,controlError:'activation_rollback_failed'});
        throw new AggregateError([error,...failures],'activation_rollback_failed');
      }
      await save(settingsFile,settings);
      throw error;
    }
  }
  await save(settingsFile,{...settings,active:true,notifications:true,attentionRequired:true,controlError:'deactivation_incomplete'});
  try{
    for(const {item,target,exists,loaded} of [...planned].reverse()){
      if(loaded){
        await stopJob(execute,domain,item,target,pause);
      }
      if(exists)await unlink(target);
    }
    await save(settingsFile,{...settings,active:false,notifications:false,attentionRequired:false,controlError:null});
    return {testOnly:true,active:false};
  }catch(error){
    await save(settingsFile,{...settings,active:true,notifications:true,attentionRequired:true,controlError:'deactivation_failed'});
    throw error;
  }
}
export async function control(mode,activate){
  if(!['server','watch'].includes(mode))throw new Error('private_job_mode_required');
  if(mode==='server')await guardRoot();
  const folder=mode==='server'?OPS:WATCH_ROOT;
  return lease(resolve(folder,'control.lock'),async()=>{
    const settingsFile=resolve(folder,'settings.json'),settings=await jsonFile(settingsFile);
    if(!settings?.testOnly||settings.root!==(mode==='server'?ROOT:WATCH_ROOT))throw new Error('private_ops_identity_required');
    const items=mode==='server'?jobs({root:ROOT,node:process.execPath,code:CODE}):[watchJob({root:WATCH_ROOT,node:process.execPath,code:resolve(WATCH_ROOT,'code'),config:settingsFile})];
    const agents=resolve(homedir(),'Library/LaunchAgents'),domain='gui/'+process.getuid();
    await mkdir(agents,{recursive:true,mode:0o700});const owner=await lstat(agents);
    if(!owner.isDirectory()||owner.isSymbolicLink()||owner.uid!==process.getuid()||(owner.mode&0o022))throw new Error('owned_launchagents_directory_required');
    if(activate&&mode==='server'){
      if(!(await exec('/usr/bin/pmset',['-g','batt'])).stdout.split('\n')[0].includes("'AC Power'"))throw new Error('ac_power_required_for_activation');
      for(const [role,port] of [['postgres',56382],['web',56381]]){
        const item=items.find(x=>x.role===role),managed=await loadedJob(exec,domain,item,resolve(agents,item.label+'.plist'));
        if(!managed){let occupied=false;try{await exec('/usr/sbin/lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN']);occupied=true;}catch(e){if(e.code!==1)throw e;}if(occupied)throw new Error('unmanaged_private_service_conflict');}
      }
    }
    return {...await applyJobs({activate,folder,agents,domain,items,settings,settingsFile}),mode};
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [mode,flag]=process.argv.slice(2);if(!['--activate-private-qa','--deactivate-private-qa'].includes(flag))throw new Error('explicit_private_activation_required');
    console.log(JSON.stringify(await control(mode,flag==='--activate-private-qa')));
  }catch{console.error('Private Firewood login-job action refused or failed. Inspect owned jobs and attentionRequired before retrying; a failed cleanup may leave jobs active. No credentials are logged.');process.exitCode=1;}
}
