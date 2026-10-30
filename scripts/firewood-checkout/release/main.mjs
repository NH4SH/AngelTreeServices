import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {LIVE_HANDOFF_SOURCE,LIVE_HANDOFF_ENVIRONMENT,LIVE_ACCOUNT} from '../live/live-contract.mjs';
import {readReleaseDescriptor,verifyInstalledSources,readNativeProofAdapter,readMasterSigningIdentity,privateSecret} from './integrity.mjs';
import {createNativeDatabase} from './database.mjs';
import {createProductionTransport} from './transport.mjs';
import {createRuntimeLiveClient} from './live-client.mjs';
import {createRuntimeOfficeClient} from './office-client.mjs';
import {officeOrders,officeStoreIdentity} from './orders.mjs';
import {createReleaseCustomerService} from './service.mjs';
import {releaseServer} from './server.mjs';
import {createReleaseWorker} from './worker.mjs';
import {orderMailer} from './mailer.mjs';
export function validateProductionDescriptor(value,role){
  const gates=['orders','preparation','collection','customerSending','ownerSending','workers'];
  if(!['web','worker'].includes(role)||value?.version!==1||value.profile!=='production-live'||value.sourceId!==LIVE_HANDOFF_SOURCE
    ||value.environmentId!==LIVE_HANDOFF_ENVIRONMENT||value.accountId!==LIVE_ACCOUNT||value.mode!=='live'
    ||!gates.every(k=>typeof value.gates?.[k]==='boolean')||value.gates.customerSending!==value.gates.ownerSending
    ||value.gates.collection&&!value.gates.preparation||value.origin!=='https://checkout.angeltreeservices.org'
    ||value.listenPort!==3000||value.database?.port!==5432||!/^[a-z0-9][a-z0-9.-]{1,100}$/u.test(value.database.host??'')
    ||value.roles?.web!=='ats_firewood_request'||value.roles?.worker!=='ats_firewood_worker'
    ||value.binding?.database!=='postgres'||value.binding.schema!=='app_private'||value.binding.profile!=='production-live')throw Error('exact_production_descriptor_required');
  return Object.freeze({...value,role,roleName:value.roles[role],gates:Object.freeze({...value.gates})});
}
export async function runtime(role){
  if(process.getuid?.()===0)throw Error('unprivileged_runtime_process_required');
  const raw=await readReleaseDescriptor(),config=validateProductionDescriptor(raw,role);
  const root=fileURLToPath(new URL('../../../',import.meta.url));await verifyInstalledSources(root,config);
  const adapter=await readNativeProofAdapter(config);
  const password=await privateSecret('/run/secrets/firewood_database_password');
  if(password.length<32)throw Error('native_database_credential_required');
  // Only the existing private Docker service network is admitted by the paired
  // installer. PostgreSQL has no public or host-published listener.
  const pool=new Pool({host:config.database.host,port:5432,database:'postgres',user:config.roleName,password,
    max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:10000,idle_in_transaction_session_timeout:15000});
  pool.on('error',()=>{});
  let db;
  try{
    const verifiers={};for(const mode of ['status','preparation','office','collection','sending'])verifiers[mode]=await adapter.createAdmissionVerifier({descriptor:config,role,mode,binding:{...config.binding,role:config.roleName}});
    const verifyAdmission=(tx,mode)=>verifiers[mode](tx);
    db=await createNativeDatabase({pool,binding:{...config.binding,role:config.roleName},verifyAdmission});
    const admitted=async(mode='status')=>{try{return await db.runInMode(mode,()=>db.transaction(async()=>true));}catch{return false;}};
    const signing=await readMasterSigningIdentity(config),liveSecret=await privateSecret('/run/secrets/firewood_hmac_live'),officeSecret=await privateSecret('/run/secrets/firewood_hmac_office');
    const fingerprint=value=>createHash('sha256').update(value,'utf8').digest('hex');
    if(config.binding.liveKeyId!==signing.keyId||config.binding.officeKeyId!==signing.keyId||fingerprint(liveSecret)!==signing.fingerprint||fingerprint(officeSecret)!==signing.fingerprint)throw Error('mounted_hmac_custody_mismatch');
    const liveTransport=createProductionTransport({kind:'live',keyId:config.binding.liveKeyId,secret:liveSecret,admitted});
    const officeTransport=createProductionTransport({kind:'office',keyId:config.binding.officeKeyId,secret:officeSecret,admitted});
    const live=createRuntimeLiveClient({transport:liveTransport}),office=createRuntimeOfficeClient({transport:officeTransport});
    const marker=(await db.query('SELECT hash FROM fwofficev2_identity WHERE id=true')).rows[0]?.hash;
    if(marker!==officeStoreIdentity(live,office))throw Error('native_order_store_binding_mismatch');
    const orders=officeOrders({db,live,office}),service=createReleaseCustomerService({db,live,office});
    let mailer=null;
    if(role==='worker'&&config.gates.customerSending){const key=await privateSecret('/run/secrets/firewood_order_sender');
      if(!/^[a-f0-9]{64}$/u.test(config.orderSenderKeyFingerprint??'')||fingerprint(key)!==config.orderSenderKeyFingerprint)throw Error('mounted_order_sender_custody_mismatch');
      mailer=orderMailer({mode:'live',customerSending:true,ownerSending:true,key});}
    const worker=createReleaseWorker({db,orders,admitted,mailer,preparationAllowed:config.gates.preparation});
    return{config,db,admitted,service,worker,gatewaySecret:role==='web'?await privateSecret('/run/secrets/firewood_gateway'):null,close:()=>pool.end()};
  }catch(error){await pool.end();throw error;}
}
export async function main(role){
  const app=await runtime(role);let server,timer,working=null,closing=false;
  const close=async()=>{if(closing)return;closing=true;clearInterval(timer);if(server)await server.close();if(working)await working.catch(()=>{});await app.close();};
  const tick=()=>{if(closing||working)return;working=app.worker.work().then(result=>console.log(JSON.stringify({role:'firewood-worker',...result}))).catch(()=>console.error('firewood_worker_pending')).finally(()=>{working=null;});};
  try{
    if(role==='web'){
      server=await releaseServer({service:app.service,origin:app.config.origin,gatewaySecret:app.gatewaySecret,
        gates:{orders:app.config.gates.orders&&app.config.gates.preparation,collection:app.config.gates.collection},
        activeGates:async()=>({orders:await app.admitted(['preparation','office']),collection:await app.admitted(['collection','office'])}),health:app.admitted});
      await server.listen(3000,'0.0.0.0');
    }else{
      if(!app.config.gates.workers)throw Error('release_worker_disabled');
      tick();timer=setInterval(tick,15000);
    }
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());
    console.log(JSON.stringify({profile:'production-live',role,ready:true,orders:app.config.gates.orders,collection:app.config.gates.collection}));
    return{close};
  }catch(error){await close();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv[2]).catch(()=>{console.error('firewood_release_startup_pending');process.exitCode=1;});
