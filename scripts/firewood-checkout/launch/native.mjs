import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {privateFile} from '../macbook/ops/files.mjs';
import {requirePower} from '../production/runtime/power.mjs';
import {postgresAdapter} from '../hosted/runtime.mjs';
import {handoffClient,handoffTestScope} from './client.mjs';
import {installOrderStore,handoffOrders} from './orders.mjs';
import {testOrderServer} from './server.mjs';
import {verifyHandoffStore} from './store.mjs';

export function nativeTestConfiguration(value){
  const scope=handoffTestScope(value?.handoff);
  if(value?.sandbox!==true||value.live!==false||value.emailSending!==false||value.listenPort!==3227||value.browserOrigin!=='http://127.0.0.1:55849'||scope.origin!=='http://127.0.0.1:3228'||scope.portalOrigin!==scope.origin)throw Error('native_test_scope_required');
  const c=value.database;let u;try{u=new URL(c?.databaseUrl);}catch{throw Error('native_test_database_required');}
  if(c.sandbox!==true||c.production!==false||c.database!=='fw_invoice_v2_qa_20261029'||c.role!=='fw_invoice_v2_web_20261029'||c.schema!=='fw_website_v2'||
    u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='56388'||u.pathname!=='/'+c.database||u.username!==c.role||u.password.length<32||u.search||u.hash)throw Error('native_test_database_required');
  return {...value,handoff:scope};
}
export async function nativeTestRuntime(configFile,{install=false,open=false}={}){
  await requirePower();const config=nativeTestConfiguration(JSON.parse((await privateFile(configFile)).toString()));
  const pool=new Pool({connectionString:config.database.databaseUrl,max:4,connectionTimeoutMillis:5000,statement_timeout:10000,allowExitOnIdle:true});pool.on('error',()=>{});
  const db=postgresAdapter(pool);
  try{const id=(await db.query('SELECT current_database() db,current_user role,current_schema() schema,host(inet_server_addr()) host,inet_server_port() port')).rows[0];
    if(id.db!==config.database.database||id.role!==config.database.role||id.schema!==config.database.schema||id.host!=='127.0.0.1'||id.port!==56388)throw Error('native_test_database_identity_mismatch');
    if(install)await installOrderStore(db,config.handoff);
    await verifyHandoffStore(db,config.handoff);
    if(open)await db.query('UPDATE fwv2_control SET paused=false WHERE id=true');
    const orders=handoffOrders({db,client:handoffClient(config.handoff)});
    return{orders,config,db,close:()=>pool.end()};
  }catch(e){await pool.end();throw e;}
}
export async function main(file,role){
  if(!['install','web','worker','status','open-test'].includes(role))throw Error('native_test_role_required');
  const app=await nativeTestRuntime(file,{install:role==='install',open:role==='open-test'});
  if(role!=='web'){try{
    if(role==='worker')console.log(JSON.stringify(await app.orders.work()));
    else if(role==='status')console.log(JSON.stringify({sandbox:true,live:false,emailSending:false,counts:(await app.db.query("SELECT (SELECT count(*)::int FROM fwv2_orders) orders,(SELECT count(*)::int FROM fwv2_confirmations) captured_confirmations,(SELECT paused FROM fwv2_control WHERE id=true) paused")).rows[0]}));
    else console.log(role==='install'?'Isolated order tables verified.':'Only the isolated test order flow is open.');
  }finally{await app.close();}return;}
  const http=await testOrderServer({orders:app.orders,origin:app.config.browserOrigin,testOnly:true});let timer,closing=false;
  const close=async()=>{if(closing)return;closing=true;clearInterval(timer);await http.close();await app.close();};
  try{await http.listen(app.config.listenPort);let working=false;timer=setInterval(async()=>{if(working||closing)return;working=true;try{await requirePower();await app.orders.work();}catch(e){if(/power|battery|charge/iu.test(e.message)){await close();process.exitCode=1;}else console.error('The isolated test worker is pending; inspect private status.');}finally{working=false;}},5000);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);console.log('Isolated Firewood v2 order runtime ready; live payments and email sending remain off.');return{close};
  }catch(e){await close();throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv[2],process.argv[3]).catch(e=>{console.error(/^[a-z_]+$/u.test(e.message)?e.message:'isolated_runtime_failed');process.exitCode=1;});
