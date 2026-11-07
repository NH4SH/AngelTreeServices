import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,writeFile,chmod,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyHost} from './ops/host-identity.mjs';
import {runtime} from './native-main.mjs';
import {configuration,databaseOptions,MAC_ORIGIN,DATABASE_PORT,DATABASE_NAME,verifyDatabase} from './native-config.mjs';
import {createPrivateMacbookServer,createHostedServer} from '../render/server.mjs';
const env={FIREWOOD_MACBOOK_RUNTIME_TEST_ENABLED:'1',FIREWOOD_STRIPE_TEST_ACCOUNT_ID:'acct_1UU9U8RAZXGe6tX0',
  FIREWOOD_STRIPE_TEST_SECRET_KEY:'rk_test_synthetic',FIREWOOD_MACBOOK_QA_ORIGIN:MAC_ORIGIN,FIREWOOD_QA_ACCESS_TOKEN:'a'.repeat(64),
  FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET:'whsec_synthetic'};
const config=configuration(env,'web');
test('native startup retries before order work and closes failed account-check connections',async()=>{
  let opens=0,closes=0,checks=0,queries=0;const pause=async()=>{};
  const app=await runtime(env,'worker',{host:async()=>{},database:async()=>{opens++;return {db:{query:async()=>{queries++;return {rows:[]};}},close:async()=>{closes++;}};},providerFor:()=>({verifyAccount:async()=>{if(++checks===1)throw {type:'StripeConnectionError'};}}),retry:{pause}});
  assert.equal(opens,2);assert.equal(closes,1);assert.equal(app.startup.attempts,2);assert.equal(queries,0,'startup must not execute order work');await app.close();assert.equal(closes,2);
});
test('native startup refuses an invalid account without retrying or running orders',async()=>{
  let opens=0,closes=0;
  await assert.rejects(runtime(env,'worker',{host:async()=>{},database:async()=>{opens++;return {db:{query:async()=>assert.fail('order query')},close:async()=>{closes++;}};},providerFor:()=>({verifyAccount:async()=>{throw new Error('dedicated_sandbox_required');}}),retry:{pause:async()=>assert.fail('account guard retried')}}),/dedicated_sandbox_required/u);
  assert.equal(opens,1);assert.equal(closes,1);
});
test('hardware identity accepts the pinned Mac independently of its mutable hostname',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'firewood-host-'));await chmod(directory,0o700);t.after(()=>rm(directory,{recursive:true,force:true}));
  const id='12345678-1234-1234-1234-123456789abc',pin={version:1,uid:501,platformUuidSha256:createHash('sha256').update(id).digest('hex')};
  await writeFile(join(directory,'host-identity.private.json'),JSON.stringify(pin),{mode:0o600});
  const options={directory,uid:501,platform:'darwin',readPlatformId:async()=>id.toUpperCase()};
  assert.deepEqual(await verifyHost(options),{approved:true});
  await assert.rejects(verifyHost({...options,readPlatformId:async()=>id.replace('abc','def')}),/approved_macbook_required/u);
  await assert.rejects(verifyHost({...options,uid:0}),/approved_macbook_required/u);
  await assert.rejects(verifyHost({...options,platform:'linux'}),/approved_macbook_required/u);
});
test('hardware identity refuses missing, shared, symlinked and malformed pins',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'firewood-host-'));await chmod(directory,0o700);t.after(()=>rm(directory,{recursive:true,force:true}));
  const options={directory,uid:501,platform:'darwin',readPlatformId:async()=>assert.fail('invalid pin must refuse before hardware access')},file=join(directory,'host-identity.private.json');
  await assert.rejects(verifyHost(options));
  await writeFile(file,JSON.stringify({version:1,uid:501,platformUuidSha256:'a'.repeat(64)}),{mode:0o600});await chmod(file,0o644);
  await assert.rejects(verifyHost(options),/private_host_identity_required/u);await rm(file);await writeFile(join(directory,'actual'),'{}',{mode:0o600});await symlink(join(directory,'actual'),file);
  await assert.rejects(verifyHost(options),/private_host_identity_required/u);await rm(file);await writeFile(file,'{}',{mode:0o600});
  await assert.rejects(verifyHost(options),/private_host_identity_required/u);
});
test('MacBook entry point refuses live, shared, remote, sending and CRM configuration',()=>{
  for(const [key,value] of [['FIREWOOD_MACBOOK_RUNTIME_TEST_ENABLED','0'],['FIREWOOD_STRIPE_TEST_ACCOUNT_ID','acct_other'],
    ['FIREWOOD_STRIPE_TEST_SECRET_KEY','rk_live_synthetic'],['FIREWOOD_CRM_TEST_ENABLED','1'],['FIREWOOD_TEST_EMAIL_ENABLED','1'],
    ['FIREWOOD_MACBOOK_QA_ORIGIN','http://192.168.1.170:56381'],['FIREWOOD_MACBOOK_QA_ORIGIN','https://angeltreeservices.org'],['FIREWOOD_QA_ACCESS_TOKEN','short']])assert.throws(()=>configuration({...env,[key]:value},'web'));
  assert.throws(()=>configuration(env,'other'));
  assert.throws(()=>configuration({...env,FIREWOOD_STRIPE_TEST_SECRET_KEY:undefined,STRIPE_SECRET_KEY:'rk_test_synthetic'},'web'));
  assert.equal(config.emailEnabled,false);
});
test('database guard confines unencrypted transport to dedicated loopback role, port and database',()=>{
  const url=`postgresql://firewood_macbook_worker:${'b'.repeat(48)}@127.0.0.1:${DATABASE_PORT}/${DATABASE_NAME}`;
  assert.equal(databaseOptions({FIREWOOD_MACBOOK_DATABASE_URL:url}).ssl,false);
  for(const bad of [url.replace('127.0.0.1','localhost'),url.replace('127.0.0.1','10.203.77.1'),url.replace(String(DATABASE_PORT),'5432'),url.replace(DATABASE_NAME,'crm'),url.replace('firewood_macbook_worker','postgres'),url+'?options=-csearch_path=other',url+'#other'])assert.throws(()=>databaseOptions({FIREWOOD_MACBOOK_DATABASE_URL:bad}));
  assert.throws(()=>databaseOptions({FIREWOOD_TEST_DATABASE_URL:url}));
});
test('native database identity must match socket, role, marker and empty CRM queue',async()=>{
  const identity={db:DATABASE_NAME,role:'firewood_macbook_worker',host:'127.0.0.1',port:DATABASE_PORT};
  const marker={origin:config.origin,account_id:config.account};
  const fake=(change={},m=marker,crm=0)=>({query:async sql=>({rows:[sql.includes('current_database')?{...identity,...change}:sql.includes('firewood_macbook_environment')?m:{n:crm}]})});
  await verifyDatabase(fake(),config);
  for(const change of [{db:'crm'},{role:'postgres'},{host:'10.203.77.1'},{port:5432}])await assert.rejects(verifyDatabase(fake(change),config));
  await assert.rejects(verifyDatabase(fake({}, {...marker,origin:'http://127.0.0.1:9'}),config));
  await assert.rejects(verifyDatabase(fake({},marker,1),config));
});
async function http(port,path='/',extra={}){
  return new Promise((yes,no)=>{const r=request({host:'127.0.0.1',port,path,method:extra.method??'GET',headers:{host:'127.0.0.1:56381',...extra.headers}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>yes({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});r.on('error',no);r.end(extra.body);});
}
async function web(t,hosted=false){
  const checkout={db:{query:async()=>({rows:[]})},authorized:async()=>false,login:async value=>{assert.equal(value,config.accessToken);return 'c'.repeat(48);}};
  const options={checkout,worker:{},config,assets:new Map()};
  const app=await(hosted?createHostedServer(options):createPrivateMacbookServer(options));
  const port=await app.listen(0);t.after(()=>app.close());return {app,port};
}
test('private HTTP gate preserves CSRF, HttpOnly cookies and no-store without setting HTTPS-only cookies',async t=>{
  const {port}=await web(t);
  assert.equal((await http(port,'/firewood/checkout/')).status,401);
  const login=await http(port,'/firewood/checkout/access',{method:'POST',headers:{origin:MAC_ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:'code='+config.accessToken});
  assert.equal(login.status,303);assert.match(login.headers['set-cookie'][0],/^ats_firewood_mac_qa_access=/u);
  assert.match(login.headers['set-cookie'][0],/HttpOnly; SameSite=Lax/u);assert.doesNotMatch(login.headers['set-cookie'][0],/Secure/u);
  assert.equal(login.headers['strict-transport-security'],undefined);assert.equal(login.headers['cache-control'],'no-store');
  assert.equal(login.headers['referrer-policy'],'same-origin');
  assert.equal((await http(port,'/firewood/checkout/access',{method:'POST',headers:{origin:'https://evil.invalid'},body:'code='+config.accessToken})).status,403);
});
test('private server rejects LAN binds, host poisoning and proxy-header bypasses',async t=>{
  const {app,port}=await web(t);
  await assert.rejects(app.listen(0,'0.0.0.0'));
  for(const headers of [{host:'localhost:56381'},{host:'angeltreeservices.org'},{'x-forwarded-proto':'https'},{'x-forwarded-host':'other.invalid'},{forwarded:'host=other.invalid'}])assert.equal((await http(port,'/health',{headers})).status,403);
  assert.equal((await http(port,'/health')).status,200);
});
test('Render HTTP entry point still rejects private transport',async t=>{
  const {port}=await web(t,true);
  assert.equal((await http(port,'/firewood/checkout/')).status,403);
});
