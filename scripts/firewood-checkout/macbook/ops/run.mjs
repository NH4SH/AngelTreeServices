import {execFile} from 'node:child_process';
import {promisify,parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration} from '../native-config.mjs';
import {main} from '../native-main.mjs';
import {ROOT,OPS,guardRoot,privateFile,jsonFile,lease,atomicJson} from './files.mjs';
import {readonlyDatabase,monitor} from './monitor.mjs';
import {backup} from './backup.mjs';
import {retryStartup,stage,diagnostic,workerFailure} from './retry.mjs';

export async function run(role){
  if(!['web','worker','monitor','backup'].includes(role))throw new Error('unknown_private_ops_job');
  const prepared=await retryStartup(async()=>{
    await stage('identity',()=>guardRoot());
    return stage('configuration',async()=>{
      const settings=await jsonFile(resolve(OPS,'settings.json'));
      if(!settings?.testOnly||settings.root!==ROOT)throw new Error('private_ops_settings_required');
      if(role==='web'||role==='worker'){
        const env=parseEnv((await privateFile(resolve(ROOT,'.env.web.private'))).toString());configuration(env);return {env};
      }
      return {databaseUrl:(await jsonFile(resolve(OPS,'database.private.json'))).databaseUrl};
    });
  },{budgetMs:20000});
  if(role==='web')return main(prepared.value.env,'web');
  if(role==='worker')return lease(resolve(OPS,'state/worker.lock'),async()=>{
    let stdout;
    try{({stdout}=await promisify(execFile)(process.execPath,['--max-old-space-size=256','--env-file='+resolve(ROOT,'.env.web.private'),resolve(ROOT,'app/scripts/firewood-checkout/macbook/native-main.mjs'),'worker'],
      {env:{HOME:resolve(ROOT,'../../..'),PATH:'/opt/homebrew/bin:/usr/bin:/bin'},timeout:240000,maxBuffer:32768}));}
    catch(error){throw workerFailure(error);}
    let result;try{result=JSON.parse(stdout);}catch{throw new Error('unexpected_worker_response');}
    if(result.testOnly!==true)throw new Error('unexpected_worker_response');
    return {worker:true,healthy:result.status.healthy,work:result.work,startup:result.startup};
  });
  const {databaseUrl}=prepared.value;
  if(role==='monitor')return monitor(ROOT,databaseUrl);
  const result=await retryStartup(async()=>{
    const connection=await stage('database',()=>readonlyDatabase(databaseUrl));await connection.close();
    return stage('backup',()=>backup(ROOT,databaseUrl));
  });
  return {...result.value,startup:result.startup};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const role=process.argv[2];
  try{
    const result=await run(role);
    if(role!=='web'){
      await atomicJson(resolve(OPS,'state/'+role+'-job.json'),{testOnly:true,finishedAt:Date.now(),ok:true,result});
      console.log(JSON.stringify({testOnly:true,job:role,...result}));
      if(role==='monitor'&&!result.healthy)process.exitCode=1;
    }
  }catch(error){
    if(['web','worker','monitor','backup'].includes(role))await atomicJson(resolve(OPS,'state/'+role+'-job.json'),{testOnly:true,finishedAt:Date.now(),ok:false,...diagnostic(error)}).catch(()=>{});
    console.error(JSON.stringify({testOnly:true,job:['web','worker','monitor','backup'].includes(role)?role:'unknown',error:diagnostic(error)}));process.exitCode=1;
  }
}
