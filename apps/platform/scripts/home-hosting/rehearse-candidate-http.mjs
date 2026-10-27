// Synthetic HTTP acceptance checks for the isolated 102-migration candidate.
// No production credentials, scan payloads, payment provider or email provider.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
assert.equal(process.env.HOME_CANDIDATE_TEST, '1');
assert.equal(process.env.ATS_CANDIDATE_ISOLATED, '1');
assert.equal(process.platform, 'linux');
assert.equal(process.getuid(), 1000); process.umask(0o077);
const config = {api:process.env.NEXT_PUBLIC_SUPABASE_URL,app:process.env.APP_BASE_URL,anon:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY};
config.id=JSON.parse(Buffer.from(config.service.split('.')[1],'base64url')).ref;
assert.match(config.id, /^ats_candidate_[a-f0-9]{12}$/);
assert.equal(config.api, 'http://127.0.0.1:3240/backend');
assert.equal(config.app, 'http://127.0.0.1:3240');
const require = createRequire('/tmp/candidate-test/package.json');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(config.api, config.service, opts);
const anon = createClient(config.api, config.anon, opts);
const marker = randomUUID().slice(0, 8), actors = [], results = [];
const reportPath = '/tmp/candidate-http-report.json';
let current = 'initialization';
const report = { syntheticOnly: true, marker, results, actualScannerInvoked: false, syntheticScanVerdictFixture: true,
  paymentProvidersContacted: false, emailsSent: 0, productionChanged: false, productionReady: false };
function save() { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
function ok(r) { assert.ifError(r.error && Error(r.error.message + ' [' + r.error.code + ']')); return r.data; }
async function check(name, fn) { current = name; await fn(); results.push({ name, passed: true }); save(); console.log(name + ': passed'); }
async function actor(role) {
  const password = randomBytes(32).toString('hex');
  const user = ok(await db.auth.admin.createUser({ email: `candidate-${role}-${marker}@example.invalid`, password, email_confirm: true })).user;
  actors.push(user.id); assert.match(user.id, /^[a-f0-9-]{36}$/);
  ok(await db.from('profiles').upsert({ id: user.id, full_name: 'Synthetic ' + role + ' ' + marker, email: user.email, status: 'active', user_type: role }));
  const employee = ok(await db.from('employee_records').upsert({ auth_user_id: user.id, legal_name: 'Synthetic ' + role + ' ' + marker, is_active: true, employment_status: 'active' }, {onConflict:'auth_user_id'}).select('id').single());
  let rr = ok(await db.from('roles').select('id').eq('name', role).maybeSingle());
  if (!rr) rr = ok(await db.from('roles').insert({ name: role, description: 'Synthetic candidate role' }).select('id').single());
  ok(await db.from('user_roles').insert({ user_id: user.id, role_id: rr.id }));
  const client = createClient(config.api, config.anon, opts);
  const session = ok(await client.auth.signInWithPassword({ email: user.email, password })).session;
  assert.ok(session?.access_token);
  return { id: user.id, employee: employee.id, client, token: session.access_token, email: user.email, password };
}
const request = (path, who, headers = {}) => fetch(config.app + path, { redirect: 'manual', headers: { ...(who ? { Authorization: 'Bearer ' + who.token } : {}), ...headers }, signal: AbortSignal.timeout(30000) });
let owner, crew, documentId, objectPath;
try {
  await check('Anonymous mobile access is refused', async () => assert.equal((await request('/api/mobile/bootstrap')).status, 401));
  await check('Real GoTrue password sign-in with fresh synthetic users', async () => {
    owner = await actor('owner'); crew = await actor('crew');
    assert.equal(ok(await owner.client.rpc('has_effective_platform_access')), true);
    assert.equal(ok(await crew.client.rpc('has_effective_platform_access')), true);
  });
  await check('Authenticated Next mobile bootstrap preserves owner and crew roles', async () => {
    for (const [who, role] of [[owner, 'owner'], [crew, 'crew']]) {
      const r = await request('/api/mobile/bootstrap', who); assert.equal(r.status, 200);
      const data = await r.json(); assert.ok(JSON.stringify(data).includes(role)); assert.ok(JSON.stringify(data).includes(who.id));
    }
  });
  await check('SSR cookie sign-in opens the CRM without a login redirect', async () => {
    const cookies = new Map();
    const ssr = createServerClient(config.api, config.anon, { cookies: { getAll: () => [...cookies].map(([name,value]) => ({name,value})), setAll: entries => entries.forEach(c => cookies.set(c.name,c.value)) } });
    ok(await ssr.auth.signInWithPassword({email:owner.email,password:owner.password})); assert.ok(cookies.size);
    const r = await request('/admin/customers', null, { Cookie: [...cookies].map(([k,v]) => k+'='+v).join('; ') });
    assert.equal(r.status, 200); const page = await r.text(); assert.ok(page.includes('Customers')); assert.ok(!page.includes('NEXT_HTTP_ERROR_FALLBACK;500'));
  });
  await check('Concurrent invoice creation and payment retries retain one financial effect', async () => {
    const input = { p_request_id: randomUUID(), p_header: {}, p_lines: [{name:'Synthetic hosting check',quantity:1,unit_price_cents:10000,total_cents:10000}], p_notes: 'Synthetic only; never send',
      p_new_customer: {name:'Synthetic candidate '+marker,email:`customer-${marker}@example.invalid`,street:'123 Synthetic Test Street',city:'Fredericksburg',state:'VA',postal_code:'22407'} };
    const drafts = (await Promise.all([owner.client.rpc('create_standalone_invoice',input),owner.client.rpc('create_standalone_invoice',input)])).map(ok);
    assert.equal(drafts[0].invoice_id,drafts[1].invoice_id); const id=drafts[0].invoice_id;
    ok(await owner.client.rpc('record_invoice_delivery',{p_invoice_id:id,p_manual:true}));
    const payment={p_request_id:randomUUID(),p_invoice_id:id,p_amount_cents:10000,p_paid_at:new Date().toISOString(),p_method:'cash',p_reference:'Synthetic '+marker,p_notes:'No money moved'};
    const paid=(await Promise.all([owner.client.rpc('record_manual_invoice_payment_request',payment),owner.client.rpc('record_manual_invoice_payment_request',payment)])).map(ok);
    assert.equal(paid[0].payment_id,paid[1].payment_id);
    assert.equal(ok(await db.from('payments').select('id').eq('invoice_id',id)).length,1);
    assert.equal(ok(await db.from('invoices').select('balance_due_cents').eq('id',id).single()).balance_due_cents,0);
    const denied=await crew.client.rpc('record_manual_invoice_payment_request',{...payment,p_request_id:randomUUID()}); assert.equal(denied.error?.code,'42501');
  });
  await check('Accepted and uncertain email histories cannot be claimed a second time', async () => {
    for(const outcome of ['accepted','unknown']) {
      const p=ok(await db.rpc('prepare_outbound_delivery',{p_request_key:'candidate/'+marker+'/'+outcome,p_payload:{from:'office@example.invalid',reply_to:'office@example.invalid',to:[`customer-${marker}@example.invalid`],cc:[],subject:'Synthetic candidate',text:'No provider is contacted.'},p_context:{kind:'other',email_type:'lead_internal_notice'}}));
      const a=ok(await db.rpc('claim_outbound_delivery',{p_delivery_id:p.id})); assert.ok(a?.attempt_id);
      ok(await db.rpc('finish_outbound_delivery',{p_delivery_id:p.id,p_attempt_id:a.attempt_id,p_outcome:outcome,p_provider_message_id:outcome==='accepted'?'synthetic_'+marker:null}));
      assert.equal(ok(await db.rpc('claim_outbound_delivery',{p_delivery_id:p.id})),null);
    }
  });
  const bytes=Buffer.from('Synthetic private candidate file '+marker+'\n'), digest=createHash('sha256').update(bytes).digest('hex');
  await check('Private uploaded bytes stay blocked until a matching clean verdict', async () => {
    assert.equal(ok(await owner.client.rpc('document_scan_mode')),true,'Operator must enable scan gating on this isolated fixture before running.');
    objectPath=owner.id+'/'+randomUUID()+'.txt';
    ok(await owner.client.storage.from('platform-documents').upload(objectPath,bytes,{contentType:'text/plain',upsert:false}));
    const d=ok(await owner.client.from('documents').insert({title:'Synthetic sensitive file '+marker,document_type:'employee',storage_path:objectPath,mime_type:'text/plain',file_size_bytes:bytes.length,access_classification:'employee_sensitive',uploaded_by_user_id:owner.id}).select('id').single()); documentId=d.id;
    assert.ok((await owner.client.storage.from('platform-documents').download(objectPath)).error);
    const claim=ok(await db.rpc('claim_document_scan',{p_document:documentId,p_actor:owner.id,p_expected_sha256:digest}));
    assert.ok(claim.token);
    assert.equal(ok(await db.rpc('finish_document_scan',{p_document:documentId,p_actor:owner.id,p_token:claim.token,p_verdict:'clean',p_sha256:digest})),true);
    // This verdict is a labeled fixture. It does not claim the real scanner ran.
    const downloaded=ok(await owner.client.storage.from('platform-documents').download(objectPath));
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
    assert.ok((await crew.client.storage.from('platform-documents').download(objectPath)).error);
    assert.ok((await anon.storage.from('platform-documents').download(objectPath)).error);
    const publicResponse=await fetch(config.api+'/storage/v1/object/public/platform-documents/'+objectPath); assert.notEqual(publicResponse.status,200); await publicResponse.body?.cancel();
  });
  await check('Next private-file metadata, ranged bytes and stale-version denial work', async () => {
    const path='/files/platform_document/'+documentId;
    const info=await request(path+'?info=1',owner); assert.equal(info.status,200);
    assert.match(info.headers.get('cache-control'),/no-store/); const meta=await info.json(); assert.equal(meta.size,bytes.length);
    const headers={range:'bytes=0-'+(bytes.length-1),'x-ats-file-version':meta.version};
    const download=await request(path,owner,headers); assert.equal(download.status,206); assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
    assert.equal((await request(path,owner,{...headers,'x-ats-file-version':'"stale"'})).status,412);
    assert.equal((await request(path,owner,{...headers,range:'bytes=0-1048576'})).status,416);
    assert.equal((await request(path+'?info=1',crew)).status,404);
    assert.equal((await request(path+'?info=1')).status,404);
  });
  await check('Offboarding invalidates retained JWT access; reactivation keeps clock disabled', async () => {
    ok(await owner.client.rpc('set_employee_access_status',{p_employee_id:crew.employee,p_status:'inactive',p_reason:'Synthetic offboarding check'}));
    assert.equal((await request('/api/mobile/bootstrap',crew)).status,403);
    const beforeRoles=ok(await db.from('user_roles').select('role_id').eq('user_id',crew.id)); assert.ok(beforeRoles.length);
    ok(await owner.client.rpc('set_employee_access_status',{p_employee_id:crew.employee,p_status:'active',p_reason:'Synthetic reactivation check'}));
    assert.equal((await request('/api/mobile/bootstrap',crew)).status,200);
    assert.deepEqual(ok(await db.from('user_roles').select('role_id').eq('user_id',crew.id)),beforeRoles);
    assert.equal(ok(await db.from('time_clock_permissions').select('is_enabled').eq('user_id',crew.id).single()).is_enabled,false);
    // The owner also loses an already-issued JWT's file access immediately.
    ok(await db.from('profiles').update({status:'disabled'}).eq('id',owner.id));
    assert.equal((await request('/files/platform_document/'+documentId+'?info=1',owner)).status,404);
    assert.ok((await owner.client.storage.from('platform-documents').download(objectPath)).error);
  });
  report.passed=true;
} catch(error) {
  report.passed=false; report.failedCheck=current; report.error=String(error.message).slice(0,1500); throw error;
} finally {
  // Preserve synthetic financial/email/audit history; retire identities instead
  // of deleting linked rows. Provider egress and schedulers remain unavailable.
  for(const id of actors) {
    ok(await db.from('profiles').update({status:'disabled'}).eq('id',id));
    ok(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',id));
    ok(await db.auth.admin.updateUserById(id,{ban_duration:'876000h'}));
  }
  report.syntheticActorsRetired=actors.length; save();
}
console.log(JSON.stringify({passed:report.passed,checks:results.length,syntheticActorsRetired:actors.length,productionChanged:false,productionReady:false}));
