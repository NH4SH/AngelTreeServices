import assert from 'node:assert/strict';
import test from 'node:test';
import{mkdtempSync,writeFileSync}from'node:fs';
import{localPaymentTarget,guardPaymentFetch}from'./local-payment-target.mjs';
const dir=mkdtempSync('/tmp/ats-payment-target-test-'),file=dir+'/manifest.json';
const status={API_URL:'http://127.0.0.1:57421',DB_URL:'postgresql://postgres:local-only@127.0.0.1:57422/postgres'};
const fixture={projectId:'ats_payment_aabbccddeeff',container:'supabase_db_ats_payment_aabbccddeeff',createdThisTask:true,api:status.API_URL,databasePort:57422,web:'http://127.0.0.1:3127'};
const env={PAYMENT_FRESH_DISPOSABLE:'1',PAYMENT_FRESH_MANIFEST:file,DOCKER_HOST:'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock'};
test('fresh payment opt-in rejects hosted services, shared fixtures and wrong ports before requests',()=>{
 writeFileSync(file,JSON.stringify(fixture));assert.equal(localPaymentTarget(status,env).fresh,true);
 for(const change of [{API_URL:'https://staging.example.invalid'},{DB_URL:'postgresql://postgres:local-only@127.0.0.1:54322/postgres'},{DB_URL:'postgresql://postgres:local-only@other.example.invalid:57422/postgres'}])assert.throws(()=>localPaymentTarget({...status,...change},env));
 for(const change of [{container:'supabase_db_ats_pr02_disposable'},{projectId:'ats_pr02_disposable'},{createdThisTask:false},{web:'https://admin.example.invalid'}]){writeFileSync(file,JSON.stringify({...fixture,...change}));assert.throws(()=>localPaymentTarget(status,env));}
 assert.throws(()=>localPaymentTarget(status,{...env,PAYMENT_FRESH_DISPOSABLE:'0'}));
});
test('payment fetch boundary blocks provider and ordinary development requests',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('local');
 const guard=guardPaymentFetch({fresh:true,api:fixture.api,web:fixture.web});
 try{
  assert.equal(await(await fetch(fixture.api+'/rest/v1/')).text(),'local');
  assert.throws(()=>fetch('https://api.stripe.com/v1/payment_intents'));assert.throws(()=>fetch('http://127.0.0.1:54321/rest/v1/'));
  assert.equal(guard.state.blocked,2);
 }finally{guard.restore();globalThis.fetch=original;}
});
test('invoice-link regression target is restricted to its exact disposable manifest and loopback ports',()=>{const f={...fixture,projectId:'ats_invlink_aabbccddeeff',container:'supabase_db_ats_invlink_aabbccddeeff',api:'http://127.0.0.1:62421',web:'http://127.0.0.1:3144',databasePort:62422},c={API_URL:f.api,DB_URL:'postgresql://postgres:local-only@127.0.0.1:62422/postgres'},e={INVOICE_LINK_DISPOSABLE:'1',INVOICE_LINK_ENV_FILE:file,DOCKER_HOST:env.DOCKER_HOST};writeFileSync(file,JSON.stringify(f));assert.equal(localPaymentTarget(c,e).fresh,true);assert.throws(()=>localPaymentTarget({...c,API_URL:'https://example.invalid'},e));for(const x of [{projectId:'ats_pr02_disposable'},{createdThisTask:false},{container:'supabase_db_ats_pr02_disposable'},{databasePort:54322},{api:'http://127.0.0.1:54321'}]){writeFileSync(file,JSON.stringify({...f,...x}));assert.throws(()=>localPaymentTarget(c,e));}});

test('quote-link regression target is restricted to its exact disposable manifest and loopback ports',()=>{const f={...fixture,projectId:'ats_quotelink_aabbccddeeff',container:'supabase_db_ats_quotelink_aabbccddeeff',api:'http://127.0.0.1:61421',web:'http://127.0.0.1:3145',databasePort:61422},c={API_URL:f.api,DB_URL:'postgresql://postgres:local-only@127.0.0.1:61422/postgres'},e={QUOTE_LINK_DISPOSABLE:'1',QUOTE_LINK_ENV_FILE:file,DOCKER_HOST:env.DOCKER_HOST};writeFileSync(file,JSON.stringify(f));assert.equal(localPaymentTarget(c,e).fresh,true);assert.throws(()=>localPaymentTarget({...c,API_URL:'https://example.invalid'},e));for(const x of [{projectId:'ats_pr02_disposable'},{createdThisTask:false},{container:'supabase_db_ats_pr02_disposable'},{databasePort:54322},{api:'http://127.0.0.1:54321'}]){writeFileSync(file,JSON.stringify({...f,...x}));assert.throws(()=>localPaymentTarget(c,e));}});
