import { configuration, openDatabase, sandboxProvider } from './config.mjs';
import { createHostedCheckout } from './checkout.mjs';
import { createHostedWorker } from './worker.mjs';
import { createHostedServer } from './server.mjs';
import { resendTestMailer } from '../email-worker.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runtime(env,role) {
  const config=configuration(env,role);
  const connection=await openDatabase(env,config);
  try {
    const provider=sandboxProvider(config);
    await provider.verifyAccount();
    const checkout=createHostedCheckout({db:connection.db,config,provider});
    const mailer=config.emailEnabled?resendTestMailer({key:config.mailKey,from:config.mailFrom}):null;
    const worker=createHostedWorker({checkout,provider,config,mailer});
    return {...connection,config,checkout,worker};
  } catch(error) { await connection.close();throw error; }
}

export async function main(env,role) {
  if (!['web','worker','status'].includes(role)) throw new Error('Choose web, worker, or status. No service starts by default.');
  const app=await runtime(env,role==='status'?'worker':role);
  if (role==='web') {
    const port=Number(env.PORT ?? 10000);
    if (!Number.isInteger(port)||port<1024||port>65535) {await app.close();throw new Error('invalid_qa_port');}
    const web=await createHostedServer(app);
    try {await web.listen(port,'0.0.0.0');}catch(error){await app.close();throw error;}
    let closing=false;
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{if(closing)return;closing=true;await web.close();await app.close();});
    console.log('Isolated Firewood QA web service started. Test payments only; CRM disabled.');
    return {async close(){await web.close();await app.close();}};
  }
  try {
    const result=role==='worker'?await app.worker.work():null;
    const status=await app.worker.status();
    console.log(JSON.stringify({testOnly:true,...(result?{work:result}:{}),status}));
    if(!status.healthy)process.exitCode=1;
  }finally{await app.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {await main(process.env,process.argv[2]);}
  catch {console.error('Firewood QA refused startup or could not complete its check. Verify isolated configuration; no credential details are logged.');process.exitCode=1;}
}
