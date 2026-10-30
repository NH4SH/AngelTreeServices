import {resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {loadConfiguration,databaseOptions,verifyDatabase,HTTPS_PORT,RELAY_PORT} from './config.mjs';
import {postgresAdapter} from '../../hosted/runtime.mjs';
import {verifyHost} from '../../macbook/ops/host-identity.mjs';
import {privateFile} from '../../macbook/ops/files.mjs';
import {requirePower} from './power.mjs';
import {stripeProvider} from './provider.mjs';
import {createCheckout} from './checkout.mjs';
import {createWorker} from './worker.mjs';
import {backendServer,relayServer} from './server.mjs';
import {migrate} from './migrate.mjs';
import {customerMailer} from './mailer.mjs';
export async function runtime(env,role){if(!isAbsolute(env.FIREWOOD_CANDIDATE_TLS_BUNDLE??''))throw Error('private_candidate_directory_required');
  await verifyHost({directory:dirname(env.FIREWOOD_CANDIDATE_TLS_BUNDLE)});await requirePower();
  // No live release file is created or loaded by the sandbox setup. A future
  // release must supply a private file satisfying every independent gate.
  const config=await loadConfiguration(env),pool=new Pool(databaseOptions(env,config,role==='migrate'));pool.on('error',()=>{});const db=postgresAdapter(pool);
  try{const id=(await db.query('SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
    if(id.db!==config.database||id.host!=='127.0.0.1'||id.port!==56388||id.role!==(role==='migrate'?'firewood_candidate_migrator':'firewood_candidate_worker'))throw Error('native_candidate_identity_required');
    if(role==='migrate'){await migrate(db,config);return {close:()=>pool.end(),config,db};}
    await verifyDatabase(db,config);const provider=stripeProvider(config);await provider.verifyAccount();const checkout=createCheckout({db,config,provider});
    const mailer=config.emailEnabled?customerMailer(config,(await privateFile(env.FIREWOOD_CANDIDATE_MAIL_KEY_FILE)).toString().trim()):null;
    const worker=createWorker(checkout,{mailer});return {config,db,provider,checkout,worker,close:()=>pool.end()};
  }catch(e){await pool.end();throw e;}}
export async function main(env,role){if(!['migrate','web','worker','status'].includes(role))throw Error('explicit_candidate_role_required');const app=await runtime(env,role);
  if(role!=='web'){try{if(role==='worker')console.log(JSON.stringify(await app.worker.work()));else if(role==='status')console.log(JSON.stringify(await app.worker.status()));else console.log('Separate sandbox candidate migration verified.');}finally{await app.close();}return;}
  let backend,relay,timer,workTimer,working=false,closing=false;
  const close=async()=>{if(closing)return;closing=true;clearInterval(timer);clearInterval(workTimer);if(relay)await relay.close();if(backend)await backend.close();await app.close();};
  try{const bundle=JSON.parse((await privateFile(env.FIREWOOD_CANDIDATE_TLS_BUNDLE)).toString());
    const read=async name=>privateFile(bundle[name]);
    const ca=await read('ca');backend=await backendServer(app,{key:await read('backendKey'),cert:await read('backendCert'),ca,relayFingerprint:bundle.relayFingerprint,ownerFingerprint:bundle.ownerFingerprint});await backend.listen(HTTPS_PORT);
    relay=relayServer(app.config,{key:await read('relayServerKey'),cert:await read('relayServerCert'),ca,clientKey:await read('relayKey'),clientCert:await read('relayCert'),backendFingerprint:bundle.backendFingerprint},{backendPort:HTTPS_PORT});await relay.listen(RELAY_PORT);
    timer=setInterval(()=>{requirePower().catch(async()=>{console.error('Sandbox stopped at the owner-approved battery threshold.');await close();process.exitCode=1;});},15000);
    // A managed installation owns retries in its separate scheduled worker.
    // Foreground previews retain their existing worker by default.
    if(!app.config.managedWorker)workTimer=setInterval(async()=>{if(working||closing)return;working=true;try{await requirePower();await app.worker.work();}catch{console.error('Sandbox worker pending; inspect private status.');}finally{working=false;}},2000);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
    console.log('Firewood candidate ready; authenticated TLS and owner-managed availability.');return {close};
  }catch(e){await close();throw e;}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await main(process.env,process.argv[2]);}catch(e){console.error(JSON.stringify({sandbox:true,error:/^[a-z0-9_]+$/u.test(e.message)?e.message:'candidate_startup_or_operation_failed'}));process.exitCode=1;}}
