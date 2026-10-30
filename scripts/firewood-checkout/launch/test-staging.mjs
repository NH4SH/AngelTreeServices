import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {HANDOFF_STAGING,handoffStagingScope} from './staging-profile.mjs';
import {stagingGateTransport} from './staging-access.mjs';
import {handoffClient,handoffStagingClient} from './client.mjs';
import {makePrepareFixture,canonicalHandoff,handoffDigest,signHandoff,PREPARE_PATH,STATUS_PATH} from './contract.mjs';
import {installHandoffStore,handoffStore} from './store.mjs';

const scope={...HANDOFF_STAGING,testOnly:true,production:false,keyId:'website-firewood-v2-staging-012345abcdef',secret:Buffer.alloc(32,0x63).toString('base64url')};
const native={testOnly:true,origin:'http://127.0.0.1:3228',portalOrigin:'http://127.0.0.1:3228',account:scope.account,source:scope.source,keyId:'synthetic-v2',secret:'a'.repeat(64)};
function prepared(f,extra={}){return {...Object.fromEntries(Object.entries(f).filter(([k])=>k!=='order')),invoice_id:randomUUID(),invoice_number:'TEST-FW2-'+f.order_id,
 principal_cents:f.order.principal_cents,preparation_status:'prepared',replayed:false,capability_version:1,receipt_authority:'crm',order_confirmation_authority:'website',
 payment_retry_required:false,delivery_completed:false,payment_execution_ready:false,execution_blockers:['staging_collection_held'],
 portal_url:scope.portalOrigin+'/portal/invoice/'+'b'.repeat(48),expires_at:new Date(Date.now()+900000).toISOString(),...extra};}
async function database(t,environment=scope){const {NetlifyDB}=await import('@netlify/database-dev');const db=new NetlifyDB({logger:()=>{}});await db.start();t.after(()=>db.stop());await installHandoffStore(db,environment);return db;}

test('staging pins the actual isolated account, source, site, backend and HTTPS origins',()=>{
 assert.equal(handoffStagingScope(scope).origin,HANDOFF_STAGING.origin);
 assert.equal(handoffStagingScope({...scope,secret:'c'.repeat(64)}).secret,'c'.repeat(64));
 for(const change of [{profile:'production'},{testOnly:false},{production:true},{account:'acct_wrong'},{source:'other'},
  {origin:'https://admin.angeltreeservices.org'},{origin:scope.origin+'/'},{origin:scope.origin+'?key=secret'},
  {origin:'https://user:password@angel-tree-admin-staging.netlify.app'},{portalOrigin:'https://foreign.invalid'},
  {databaseOrigin:'https://wrong.supabase.co'},{siteId:'wrong'},{environmentId:'wrong'},
  {keyId:'website-firewood-v2-qa-20261029'},{secret:'short'},{secret:'a'.repeat(43)},{secret:scope.secret+'='},{secret:'c'.repeat(63)}])assert.throws(()=>handoffStagingScope({...scope,...change}));
});
test('staging cannot be selected through the native client or by copying a native credential identity',()=>{
 assert.throws(()=>handoffClient(scope),/isolated_handoff_scope_required/);
 assert.throws(()=>handoffStagingClient(native),/isolated_staging_scope_required/);
});
test('staging uses the canonical HMAC and exact-path request with redirects disabled',async()=>{
 const f=makePrepareFixture(),expected=prepared(f);let seen;
 const client=handoffStagingClient(scope,{fetcher:async(url,init)=>{seen={url,init};return Response.json(expected);}});
 assert.deepEqual(await client.prepare(f),expected);assert.equal(seen.url,HANDOFF_STAGING.origin+PREPARE_PATH);
 assert.equal(seen.init.redirect,'error');assert.equal(seen.init.body,canonicalHandoff(f));
 assert.equal(seen.init.headers['X-ATS-Signature'],signHandoff(seen.init.body,seen.init.headers['X-ATS-Timestamp'],scope.secret,PREPARE_PATH));
 for(const extra of [{account_id:'acct_wrong'},{invoice_id:'bad'},{principal_cents:1},{portal_url:'https://foreign.invalid/portal/invoice/'+'b'.repeat(48)}])await assert.rejects(handoffStagingClient(scope,{fetcher:async()=>Response.json({...expected,...extra})}).prepare(f));
});
test('a protected staging gate, redirect, HTML login or arbitrary success never becomes a paid invoice',async t=>{
 const f=makePrepareFixture(),db=await database(t);let response=new Response('Sign in',{status:403});
 const client=handoffStagingClient(scope,{fetcher:async()=>response}),store=handoffStore({db,client});await store.enqueue(f);
 assert.deepEqual(await store.work(),{prepared:0,pending:0,review:1});assert.equal((await store.saved(f.order_id)).invoice_id,null);
 for(const value of [new Response('',{status:302,headers:{location:'https://foreign.invalid'}}),new Response('<html>Sign in</html>'),Response.json({ok:true,paid:true})]){response=value;await assert.rejects(client.prepare(f));}
});
test('a staging lost reply recovers one durable invoice without changing the accepted order',async t=>{
 const db=await database(t),f=makePrepareFixture(),saved=prepared(f);let lost=true,at=Date.now(),calls=0;
 const fetcher=async()=>{calls++;if(lost){lost=false;throw Error('reply_lost_after_commit');}return Response.json({...saved,replayed:true});};
 let store=handoffStore({db,client:handoffStagingClient(scope,{fetcher}),now:()=>at});await store.enqueue(f);
 assert.deepEqual(await store.work(),{prepared:0,pending:1,review:0});at+=6000;
 store=handoffStore({db,client:handoffStagingClient(scope,{fetcher}),now:()=>at});assert.deepEqual(await store.work(),{prepared:1,pending:0,review:0});
 assert.equal((await store.saved(f.order_id)).invoice_id,saved.invoice_id);assert.equal(calls,2);
 const changed=structuredClone(f);changed.order.contact.notes='Changed details';changed.snapshot_hash=handoffDigest(changed.order);
 await assert.rejects(store.enqueue(changed),/immutable_handoff_preparation/);
});
test('staging cannot retrofit the native namespace or replace its pinned identity',async t=>{
 const db=await database(t,native),before=(await db.query('SELECT * FROM fwv2_identity')).rows;
 await assert.rejects(installHandoffStore(db,scope),/handoff_identity_conflict/);
 assert.deepEqual((await db.query('SELECT * FROM fwv2_identity')).rows,before);
});
test('staging still rejects real customer addresses and unverified paid status',async()=>{
 const f=makePrepareFixture(),p=prepared(f);let calls=0;
 const client=handoffStagingClient(scope,{fetcher:async(url)=>{calls++;assert.equal(url,scope.origin+STATUS_PATH);return Response.json({paid:true});}});
 const real=structuredClone(f);real.order.contact.email='customer@example.com';real.snapshot_hash=handoffDigest(real.order);
 await assert.rejects(client.prepare(real));assert.equal(calls,0);
 await assert.rejects(client.status(f,p),/settlement_unconfirmed/);assert.equal(calls,1);
});

function gateCookie(change={}){
 const iat=Math.floor(Date.now()/1000),session={v:1,iat,exp:iat+14400,aud:scope.siteId+'|'+scope.origin,nonce:'a'.repeat(22),...change};
 return '__Host-ats-stage-access=v1.'+Buffer.from(JSON.stringify(session)).toString('base64url')+'.'+'a'.repeat(43);
}
test('staging access is backend-only, exact-destination and still preserves API authentication',async()=>{
 const f=makePrepareFixture(),p=prepared(f),cookie=gateCookie();let seen;
 const client=handoffStagingClient(scope,{gateCookie:cookie,fetcher:async(url,init)=>{seen={url,init};return Response.json(p);}});
 assert.deepEqual(await client.prepare(f),p);assert.equal(seen.url,scope.origin+PREPARE_PATH);
 assert.equal(seen.init.headers.get('Cookie'),cookie);assert.equal(seen.init.headers.get('Origin'),null);
 assert.ok(seen.init.headers.get('X-ATS-Signature')?.startsWith('v1='));assert.equal(seen.init.redirect,'error');assert.equal(seen.init.credentials,'omit');
});
test('expired, foreign or injected staging access cannot send a credential to any other route',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 for(const cookie of [gateCookie({exp:0}),gateCookie({aud:'foreign'}),gateCookie({v:2}),gateCookie()+'; another=secret',gateCookie()+'\r\nHost: foreign.invalid'])assert.throws(()=>stagingGateTransport(scope,{gateCookie:cookie,fetcher}),/staging_access_review/);
 const transport=stagingGateTransport(scope,{gateCookie:gateCookie(),fetcher});
 for(const url of ['https://foreign.invalid'+PREPARE_PATH,scope.origin+'/admin',scope.origin+PREPARE_PATH+'?forward=1'])await assert.rejects(transport(url,{method:'POST',redirect:'error',body:'{}'}),/staging_access_review/);
 await assert.rejects(transport(scope.origin+PREPARE_PATH,{method:'POST',redirect:'error',body:'{}',headers:{Origin:scope.origin}}),/staging_access_review/);
 assert.equal(calls,0);
});
test('access expiring during a staging worker holds for review instead of repeated preparation',async()=>{
 let at=Date.now(),calls=0;
 const client=handoffStagingClient(scope,{gateCookie:gateCookie(),now:()=>at,fetcher:async()=>{calls++;return Response.json({});}});
 at+=14400*1000;
 await assert.rejects(client.prepare(makePrepareFixture()),e=>e.code==='handoff_authorization_review'&&e.retryable===false);
 assert.equal(calls,0);
});
