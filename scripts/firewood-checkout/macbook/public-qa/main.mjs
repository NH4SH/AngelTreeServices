import {createServer} from 'node:https';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration,openDatabase,HTTPS_PORT} from './config.mjs';
import {verifyHost} from '../ops/host-identity.mjs';
import {privateFile} from '../ops/files.mjs';
import {retryStartup,stage,diagnostic} from '../ops/retry.mjs';
import {sandboxProvider} from '../../render/config.mjs';
import {createHostedCheckout} from '../../render/checkout.mjs';
import {createHostedWorker} from '../../render/worker.mjs';
import {createHostedServer,headers} from '../../render/server.mjs';

// This entry point terminates real TLS even on the connector's loopback hop.
// The private HTTP adapter is never proxied or relaxed.
export async function createHttpsQaServer(options,tls) {
  if(!tls?.key||!tls?.cert)throw new Error('origin_tls_required');
  const inner=await createHostedServer(options),canonical=new URL(options.config.origin);
  const server=createServer({key:tls.key,cert:tls.cert,minVersion:'TLSv1.2',requestTimeout:20000,headersTimeout:10000},(req,res)=>{
    const rawHosts=req.rawHeaders.filter((value,index)=>index%2===0&&value.toLowerCase()==='host').length;
    if(!req.socket.encrypted||req.socket.remoteAddress!=='127.0.0.1'||rawHosts!==1||req.headers.host!==canonical.host||
      req.headers.forwarded||(req.headers['x-forwarded-host']&&req.headers['x-forwarded-host']!==canonical.host)||
      (req.headers['x-forwarded-proto']&&req.headers['x-forwarded-proto']!=='https')) {
      res.writeHead(403,{...headers,'Content-Type':'application/json'});res.end('{"error":"Use the configured HTTPS QA address."}');return;
    }
    // Trusted from the authenticated TLS transport, never from a browser flag.
    req.headers['x-forwarded-proto']='https';inner.server.emit('request',req,res);
  });
  server.maxHeadersCount=40;
  return {server,async listen(port=HTTPS_PORT,host='127.0.0.1') {
    if(host!=='127.0.0.1')throw new Error('loopback_tls_bind_required');
    await new Promise((yes,no)=>{server.once('error',no);server.listen(port,host,yes);});return server.address().port;
  },async close(){server.closeAllConnections();await new Promise(yes=>server.close(yes));}};
}
export async function runtime(env,role='web',{host=verifyHost,database=openDatabase,providerFor=sandboxProvider,retry={}}={}) {
  const prepared=await retryStartup(async()=>{
    await stage('identity',()=>host());const config=await stage('configuration',()=>configuration(env,role)),connection=await stage('database',()=>database(env,config));
    try{const provider=providerFor(config);await stage('stripe_account',()=>provider.verifyAccount());return {...connection,config,provider};}
    catch(error){await connection.close();throw error;}
  },retry);
  const {config,provider,...connection}=prepared.value;
  try{const checkout=createHostedCheckout({db:connection.db,config,provider});const worker=createHostedWorker({checkout,provider,config});
    return {...connection,config,checkout,worker,startup:prepared.startup};}
  catch(error){await connection.close();throw error;}
}
export async function main(env,role) {
  if(!['web','worker','status'].includes(role))throw new Error('explicit_qa_role_required');
  const app=await runtime(env,role==='status'?'worker':role);
  if(role==='web') {
    let web;
    try{const key=await privateFile(env.FIREWOOD_PUBLIC_QA_TLS_KEY),cert=await privateFile(env.FIREWOOD_PUBLIC_QA_TLS_CERT);
      web=await createHttpsQaServer(app,{key,cert});await web.listen();}
    catch(error){await app.close();throw error;}
    let closing=false;const close=async()=>{if(closing)return;closing=true;await web.close();await app.close();};
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
    console.log('Firewood HTTPS sandbox QA ready. Owner access required; sending and CRM disabled.');return {close};
  }
  const deadline=setTimeout(()=>process.kill(process.pid,'SIGTERM'),150000);deadline.unref();
  try{console.log(JSON.stringify({testOnly:true,...(role==='worker'?{work:await app.worker.work()}:{}),status:await app.worker.status()}));}
  finally{clearTimeout(deadline);await app.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{await main(process.env,process.argv[2]);}catch(error){console.error(JSON.stringify({testOnly:true,error:diagnostic(error)}));process.exitCode=1;}
}
