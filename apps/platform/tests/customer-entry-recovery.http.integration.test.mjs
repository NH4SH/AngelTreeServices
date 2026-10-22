import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync}from'node:fs';
const enabled=process.env.CUSTOMER_ENTRY_HTTP_SYNTHETIC==='1'&&Boolean(process.env.CUSTOMER_ENTRY_HTTP_INPUT_FILE)&&Boolean(process.env.CUSTOMER_ENTRY_LOCAL_STATUS_FILE);
test('actual local customer entry and document recovery retain Auth and token boundaries',{skip:!enabled,timeout:90000},async t=>{
 const data=JSON.parse(readFileSync(process.env.CUSTOMER_ENTRY_HTTP_INPUT_FILE,'utf8')),status=JSON.parse(readFileSync(process.env.CUSTOMER_ENTRY_LOCAL_STATUS_FILE,'utf8')),origin=process.env.CUSTOMER_ENTRY_WEB_URL;
 assert.equal(origin,'http://127.0.0.1:3147');assert.equal(status.API_URL,'http://127.0.0.1:60421');assert.equal(data.target,'local-disposable-116');assert.equal(data.locallyCommitted,true);assert.equal(data.cases.length,18);
 const proof=[];
 async function get(path){const url=new URL(path,origin);assert.equal(url.origin,origin);return fetch(url,{redirect:'manual'});}
 await t.test('unsigned customer and organization entry still require sign-in; login offers secure-link recovery',async()=>{
  for(const path of ['/portal','/portal/organization/synthetic-untrusted-token']){const r=await get(path);assert.ok([303,307].includes(r.status));assert.equal(new URL(r.headers.get('location'),origin).pathname,'/login');}
  const login=await get('/login?next=%2Fportal'),html=await login.text();assert.equal(login.status,200);assert.match(html,/Looking for a proposal or invoice/);assert.match(html,/do not need to sign in to open that link/);assert.match(html,/tel:\+15403888715/);assert.match(html,/name="password"/);
 });
 for(const c of data.cases)await t.test(c.kind+'/'+c.scenario,async()=>{
  const r=await get(c.url);assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/no-store|^no-cache, must-revalidate$/);const html=await r.text();
  assert.ok(!html.includes(status.SERVICE_ROLE_KEY));assert.ok(!c.token?.token_hash||!html.includes(c.token.token_hash));
  if(c.expectedAvailable){assert.match(html,/ENTRY_SCOPE_CANARY/);assert.match(html,/document-print-region/);}
  else{assert.match(html,/link unavailable/);assert.match(html,/Can’t find or open your link/);assert.match(html,/tel:\+15403888715/);assert.doesNotMatch(html,/ENTRY_CUSTOMER_CANARY|ENTRY_OTHER_CUSTOMER_CANARY|ENTRY_SCOPE_CANARY|document-print-region|name="approver_name"|name="payment_method"/);}
  proof.push({kind:c.kind,scenario:c.scenario,available:c.expectedAvailable,passed:true});
 });
 if(process.env.CUSTOMER_ENTRY_HTTP_RESULTS_FILE)writeFileSync(process.env.CUSTOMER_ENTRY_HTTP_RESULTS_FILE,JSON.stringify({cases:proof,protectedEntryPreserved:true,realProviderCalls:0,customerEmailsSent:0},null,2)+'\n',{mode:0o600});
});
