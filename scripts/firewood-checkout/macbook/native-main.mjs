import {resolve} from 'node:path';
import {writeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {configuration,openDatabase} from './native-config.mjs';
import {verifyHost} from './ops/host-identity.mjs';
import {retryStartup,stage,diagnostic} from './ops/retry.mjs';
import {sandboxProvider} from '../render/config.mjs';
import {createHostedCheckout} from '../render/checkout.mjs';
import {createHostedWorker} from '../render/worker.mjs';
import {createPrivateMacbookServer} from '../render/server.mjs';

export async function runtime(env,role='web',{host=verifyHost,database=openDatabase,providerFor=sandboxProvider,retry={}}={}){
  const prepared=await retryStartup(async()=>{
    await stage('identity',()=>host());
    const config=await stage('configuration',()=>configuration(env,role));
    const connection=await stage('database',()=>database(env,config));
    try{
      const provider=providerFor(config);await stage('stripe_account',()=>provider.verifyAccount());
      return {...connection,config,provider};
    }catch(error){await connection.close();throw error;}
  },retry);
  const {config,provider,...connection}=prepared.value;
  try{
    const checkout=createHostedCheckout({db:connection.db,config,provider});
    const worker=createHostedWorker({checkout,provider,config});
    return {...connection,config,checkout,worker,startup:prepared.startup};
  }catch(error){await connection.close();throw error;}
}

export async function main(env,role){
  if(!['web','worker','status'].includes(role))throw new Error('Choose web, worker or status. No startup service is installed.');
  const app=await runtime(env,role==='status'?'worker':role);
  if(role==='web'){
    const web=await createPrivateMacbookServer(app);
    try{await web.listen(56381,'127.0.0.1');}catch(error){await app.close();throw error;}
    let closing=false;
    const close=async()=>{if(closing)return;closing=true;await web.close();await app.close();};
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
    console.log('Private MacBook Firewood QA ready on loopback. Test payments only; sending and CRM disabled.');
    return {close};
  }
  const deadline=role==='worker'?setTimeout(()=>{writeSync(2,JSON.stringify({testOnly:true,error:{code:'worker_deadline_exceeded',phase:'worker',retryable:false,attempts:1,exhausted:false}})+'\n');process.kill(process.pid,'SIGTERM');},150000):null;deadline?.unref();
  try{
    const work=role==='worker'?await stage('worker',()=>app.worker.work()):null,status=await stage('worker',()=>app.worker.status());
    console.log(JSON.stringify({testOnly:true,...(work?{work}:{}),status,startup:app.startup}));
    if(!status.healthy)process.exitCode=1;
  }finally{clearTimeout(deadline);await app.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main(process.env,process.argv[2]);}
  catch(error){console.error(JSON.stringify({testOnly:true,error:diagnostic(error)}));process.exitCode=1;}
}
