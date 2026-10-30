import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {request} from 'node:https';
import {configuration,databaseOptions,verifyDatabase,DATABASE_NAME,DATABASE_PORT,RUNTIME_ID} from './config.mjs';
import {createHttpsQaServer,runtime} from './main.mjs';
import {CheckoutError} from '../../model.mjs';
const env={FIREWOOD_PUBLIC_HTTPS_QA_ENABLED:'1',FIREWOOD_CRM_TEST_ENABLED:'0',FIREWOOD_TEST_EMAIL_ENABLED:'0',FIREWOOD_STRIPE_TEST_ACCOUNT_ID:'acct_1UU9U8RAZXGe6tX0',FIREWOOD_STRIPE_TEST_SECRET_KEY:'rk_test_synthetic',FIREWOOD_QA_ACCESS_TOKEN:'a'.repeat(64),FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET:'whsec_synthetic',FIREWOOD_PUBLIC_QA_ORIGIN:'https://synthetic-firewood.trycloudflare.com'};
const config=configuration(env);
test('public QA refuses live/shared modes, production origins, weak credentials and sending',()=>{
  for(const [key,value] of [['FIREWOOD_PUBLIC_HTTPS_QA_ENABLED','0'],['FIREWOOD_STRIPE_TEST_ACCOUNT_ID','acct_other'],['FIREWOOD_STRIPE_TEST_SECRET_KEY','rk_live_synthetic'],['FIREWOOD_STRIPE_TEST_SECRET_KEY','sk_test_synthetic'],['FIREWOOD_TEST_EMAIL_ENABLED','1'],['FIREWOOD_CRM_TEST_ENABLED','1'],['FIREWOOD_PUBLIC_QA_ORIGIN','https://angeltreeservices.org'],['FIREWOOD_PUBLIC_QA_ORIGIN',config.origin+'/'],['FIREWOOD_PUBLIC_QA_ORIGIN','http://synthetic-firewood.trycloudflare.com'],['FIREWOOD_PUBLIC_QA_ORIGIN','https://synthetic-firewood.trycloudflare.com:444'],['FIREWOOD_QA_ACCESS_TOKEN','short'],['FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET','bad']])assert.throws(()=>configuration({...env,[key]:value}));
  assert.throws(()=>configuration(env,'unknown'));assert.equal(config.emailEnabled,false);
});
test('public QA database and role guards cannot select the retained native or CRM database',()=>{
  const url=`postgresql://firewood_public_worker:${'b'.repeat(64)}@127.0.0.1:56382/${DATABASE_NAME}`;
  assert.equal(databaseOptions({FIREWOOD_PUBLIC_QA_DATABASE_URL:url}).ssl,false);
  for(const bad of [url.replace(DATABASE_NAME,'firewood_macbook_qa'),url.replace(DATABASE_NAME,'crm'),url.replace('127.0.0.1','localhost'),url.replace('56382','5432'),url.replace('firewood_public_worker','postgres'),url+'?options=x'])assert.throws(()=>databaseOptions({FIREWOOD_PUBLIC_QA_DATABASE_URL:bad}));
  assert.throws(()=>databaseOptions({FIREWOOD_PUBLIC_QA_DATABASE_URL:url},true));
});
test('public QA requires its own immutable origin/account marker and empty CRM queue',async()=>{
  const identity={db:DATABASE_NAME,role:'firewood_public_worker',host:'127.0.0.1',port:DATABASE_PORT};
  const fake=(change={},marker={origin:config.origin,account_id:config.account},crm=0)=>({query:async sql=>({rows:[sql.includes('current_database')?{...identity,...change}:sql.includes('firewood_public_qa_environment')?marker:{n:crm}]})});
  await verifyDatabase(fake(),config);
  for(const change of [{db:'firewood_macbook_qa'},{role:'firewood_macbook_worker'},{host:'10.203.77.1'},{port:5432}])await assert.rejects(verifyDatabase(fake(change),config));
  await assert.rejects(verifyDatabase(fake({},null),config));await assert.rejects(verifyDatabase(fake({}, {origin:'https://other.trycloudflare.com',account_id:config.account}),config));await assert.rejects(verifyDatabase(fake({},undefined,1),config));
  assert.equal(RUNTIME_ID,'angel-firewood-macbook-public-qa');
});
test('public QA closes the database and refuses the wrong Stripe account before order work',async()=>{
  let closed=0;await assert.rejects(runtime(env,'web',{host:async()=>{},database:async()=>({db:{query:async()=>assert.fail('order query')},close:async()=>closed++}),providerFor:()=>({verifyAccount:async()=>{throw new Error('dedicated_sandbox_required');}}),retry:{pause:async()=>assert.fail('account guard retried')}}),/dedicated_sandbox_required/u);assert.equal(closed,1);
});
async function web(t) {
  const dir=await mkdtemp(join(tmpdir(),'firewood-https-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=firewood-public-qa.invalid','-addext','subjectAltName=DNS:firewood-public-qa.invalid'],{stdio:'ignore'});
  const tls={key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))};let ingested=0;
  const checkout={db:{query:async()=>({rows:[]})},authorized:async()=>false,login:async code=>{assert.equal(code,config.accessToken);return 'c'.repeat(48);}};
  const worker={ingest:async(raw,signature)=>{if(signature!=='synthetic-valid')throw new CheckoutError('Invalid test signature.',400);assert.equal(raw.toString(),'raw body unchanged');ingested++;return {received:true};}};
  const app=await createHttpsQaServer({checkout,worker,config,assets:new Map()},tls),port=await app.listen(0);t.after(()=>app.close());
  async function http(path,extra={}) {
    return new Promise((yes,no)=>{const req=request({host:'127.0.0.1',servername:'firewood-public-qa.invalid',port,ca:tls.cert,rejectUnauthorized:true,path,method:extra.method??'GET',headers:{host:new URL(config.origin).host,...extra.headers}},res=>{const parts=[];res.on('data',p=>parts.push(p));res.on('end',()=>yes({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}));});req.on('error',no);req.end(extra.body);});
  }
  return {app,port,http,get ingested(){return ingested;}};
}
test('TLS QA preserves private access, secure cookies, exact origin CSRF and response privacy',async t=>{
  const {http}=await web(t);const page=await http('/firewood/checkout/');assert.equal(page.status,401);assert.match(page.body,/<meta name="referrer" content="same-origin">/u);assert.equal(page.headers['cache-control'],'no-store');assert.match(page.headers['x-robots-tag'],/noindex/u);assert.ok(page.headers['strict-transport-security']);
  const login=await http('/firewood/checkout/access',{method:'POST',headers:{origin:config.origin,'content-type':'application/x-www-form-urlencoded'},body:'code='+config.accessToken});assert.equal(login.status,303);assert.match(login.headers['set-cookie'][0],/Secure; HttpOnly; SameSite=Lax/u);
  const bad=await http('/firewood/checkout/access',{method:'POST',headers:{origin:'https://other.invalid','content-type':'application/x-www-form-urlencoded'},body:'code='+config.accessToken});assert.equal(bad.status,403);
  assert.equal((await http('/firewood/checkout/api/state')).status,401);
});
test('TLS QA rejects LAN binds, poisoned hosts and forwarded transport bypasses on every route',async t=>{
  const {app,http}=await web(t);await assert.rejects(app.listen(0,'0.0.0.0'));
  for(const headers of [{host:'localhost:56383'},{host:'angeltreeservices.org'},{forwarded:'proto=https'},{'x-forwarded-host':'other.invalid'},{'x-forwarded-proto':'http'},{'x-forwarded-proto':'https, http'}])assert.equal((await http('/health',{headers})).status,403);
  assert.equal((await http('/health')).status,200);assert.equal((await http('/robots.txt')).body,'User-agent: *\nDisallow: /\n');
});
test('TLS QA exposes only the signed webhook write route without login and keeps raw bytes intact',async t=>{
  const app=await web(t),path='/firewood/checkout/webhook';
  assert.equal((await app.http(path)).status,405);
  assert.equal((await app.http(path,{method:'POST',headers:{'stripe-signature':'invalid'},body:'raw body unchanged'})).status,400);assert.equal(app.ingested,0);
  assert.equal((await app.http(path,{method:'POST',headers:{'stripe-signature':'synthetic-valid'},body:'raw body unchanged'})).status,200);assert.equal(app.ingested,1);
  assert.equal((await app.http(path,{method:'POST',body:'x'.repeat(256001)})).status,413);
});
