// This gateway is not sufficient on its own: the independent kernel deadline,
// SQL admission guard and sole cloud authority are required before public use.
import assert from 'node:assert/strict';import fs from 'node:fs';import {spawn} from 'node:child_process';
import {validateNativeWalReceipt} from './native-wal-checkpoint.mjs';import {clockIsSafe} from './continuous-policy.mjs';import {createPrimaryGateway} from './primary-gateway.mjs';import {backupSourceScope} from './backup-source-scope.mjs';
assert.equal(process.platform,'linux');assert.equal(process.getuid(),1000);assert.equal(process.env.ATS_HOME_HOSTED,'1');assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://admin.angeltreeservices.org/backend');assert.equal(process.env.APP_BASE_URL,'https://admin.angeltreeservices.org');
const app=['/srv/server.js','/srv/apps/platform/server.js'].find(fs.existsSync);assert.ok(app);
const child=spawn(process.execPath,[app],{cwd:app.slice(0,app.lastIndexOf('/')),stdio:'inherit',env:{...process.env,PORT:'3251',HOSTNAME:'127.0.0.1',NEXT_TELEMETRY_DISABLED:'1'}});
function admission(){
 const binding=JSON.parse(fs.readFileSync('/admission/binding.json'));assert.equal(backupSourceScope(binding).syntheticOnly,false);
 assert.equal(fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),binding.sourceBoot);
 const active=JSON.parse(fs.readFileSync('/admission/active.json')),claims=validateNativeWalReceipt(active.envelope,fs.readFileSync('/admission/authority-public.pem'),binding);
 const uptime=Number(fs.readFileSync('/proc/uptime','utf8').split(' ')[0])*1000;
 assert.ok(uptime<claims.captureStartedBootMs+280000);assert.ok(clockIsSafe(active.anchor,Date.now(),uptime));assert.equal(fs.existsSync('/admission/fenced.latch'),false);return true;
}
function workerDispatchAllowed(){const binding=JSON.parse(fs.readFileSync('/admission/binding.json')),released=JSON.parse(fs.readFileSync('/admission/workers-released.json'));assert.equal(released.namespace,binding.namespace);assert.equal(released.generation,binding.generation);assert.equal(released.providerReconciliationVerified,true);return true;}
const server=createPrimaryGateway({canonicalHost:'admin.angeltreeservices.org',proxyToken:process.env.ATS_HOME_PROXY_TOKEN,admission,workerDispatchAllowed});let closing=false;
function stop(code){if(closing)return;closing=true;server.close();server.closeAllConnections();child.kill('SIGTERM');setTimeout(()=>process.exit(code),5000).unref();}
child.on('error',()=>stop(1));child.on('exit',()=>stop(1));server.on('error',()=>stop(1));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>stop(0));server.listen(3250,'0.0.0.0');
