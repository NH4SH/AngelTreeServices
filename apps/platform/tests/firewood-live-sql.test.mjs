import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT, LIVE_ACCOUNT,
  LIVE_ACCEPTED_TERMS, LIVE_PAYMENT_POLICY, liveHandoffDigest, priceLiveOrder, signLiveHandoff,
  LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH, LIVE_PORTAL_ORIGIN } from '../src/lib/firewood/handoff/live-contract.mjs';
import { handleLiveHandoff } from '../src/lib/firewood/handoff/live-handler.mjs';
import { nativeLiveDatabase } from '../src/lib/firewood/handoff/live-database.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from '../src/lib/firewood/handoff/live-profile.mjs';

// In-memory SQL behavior only. No listeners, provider credentials or real data.
const install = readFileSync(new URL('../../../supabase/review/firewood-live/boundary.sql', import.meta.url), 'utf8');
const fixture = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;create schema app_private;revoke all on schema app_private from public;
grant usage on schema auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);
create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_private.has_platform_admin_role()returns boolean language sql stable as $$select current_setting('test.admin',true)='true'$$;
create table public.customers(id uuid primary key default gen_random_uuid(),display_name text,email text,phone text,customer_type text default 'residential',status text default 'active',organization_id uuid,archived_at timestamptz);
create table public.service_locations(id uuid primary key default gen_random_uuid(),customer_id uuid,organization_id uuid,street text,city text,state text,postal_code text,archived_at timestamptz);
create table public.invoices(id uuid primary key default gen_random_uuid(),invoice_number text unique,customer_id uuid,organization_id uuid,service_location_id uuid,job_id uuid,total_cents integer,subtotal_cents integer,tax_cents integer,balance_due_cents integer,status text,due_at timestamptz,purchase_order_reference text,payment_terms text,payment_preference text,automatic_reminders_enabled boolean default false,document_terms_version text constraint invoices_document_terms_version_known check(document_terms_version in('legacy-2026-10-22','firewood-household-2026-10-24','firewood-handoff-test-2026-10-29')));
create table public.invoice_portal_tokens(id uuid primary key default gen_random_uuid(),invoice_id uuid,customer_id uuid,organization_id uuid,token_hash text,token_hint text,token_encrypted text,expires_at timestamptz,revoked_at timestamptz,created_by_user_id uuid);
create table public.invoice_line_items(id uuid primary key default gen_random_uuid(),invoice_id uuid,name text,description text,quantity numeric,unit_price_cents integer,total_cents integer,sort_order integer);
create table public.payments(id uuid primary key default gen_random_uuid(),invoice_id uuid,amount_cents integer,total_collected_cents integer,surcharge_cents integer,status text check(status in('pending','succeeded','failed','refunded','cancelled')),currency text default 'usd',succeeded_at timestamptz,refunded_principal_cents integer default 0,refunded_surcharge_cents integer default 0,disputed_principal_cents integer default 0,disputed_surcharge_cents integer default 0,disputed_gross_cents integer default 0,dispute_status text);
create table public.invoice_checkout_sessions(id uuid primary key default gen_random_uuid(),invoice_id uuid,status text);
create table app_private.stripe_refund_observations(refund_id text primary key,payment_id uuid,amount_cents integer,currency text,status text);
create table public.activity_log(id uuid primary key default gen_random_uuid(),actor_type text check(actor_type in('owner','admin','staff','crew','customer','portal','system')),actor_user_id uuid,subject_type text,subject_id uuid,event_type text,metadata_json jsonb);
`;
const source = LIVE_HANDOFF_SOURCE, owner = randomUUID();
const q = async (db, sql, args = []) => (await db.query(sql, args)).rows;
async function role(db, name, sql, args = [], { user = null, admin = false } = {}) {
  await q(db, "select set_config('test.uid',$1,false),set_config('test.admin',$2,false)", [user ?? '', String(admin)]);
  await db.exec(`set role ${name}`);
  try { return await q(db, sql, args); }
  finally { await db.exec('reset role'); await db.exec("select set_config('test.uid','',false),set_config('test.admin','false',false)"); }
}
const service = (db, sql, args) => role(db, 'service_role', sql, args);
const admin = (db, sql, args) => role(db, 'authenticated', sql, args, { user: owner, admin: true });
function request(overrides = {}) {
  const orderId = randomUUID();
  const order = { ...priceLiveOrder({ quantity: 'full', stacking: true }), tax_basis: 'va_domestic_use_locality_exempt',
    terms: structuredClone(LIVE_ACCEPTED_TERMS), accepted_at_ms: Date.now(), office_approval: null,
    contact: { name: 'Synthetic Local Reviewer', email: `review-${orderId}@angeltreeservice.org`, phone: '5405550123',
      address: '1 Synthetic Fixture Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407', notes: 'Synthetic local SQL test; never send.' },
    payment_policy: structuredClone(LIVE_PAYMENT_POLICY), ...overrides };
  return { contract: LIVE_HANDOFF_CONTRACT, source_id: source, environment_id: LIVE_HANDOFF_ENVIRONMENT, account_id: LIVE_ACCOUNT,
    mode: 'live', order_id: orderId, reference: `FW-${orderId.slice(0, 8).toUpperCase()}`, snapshot_hash: liveHandoffDigest(order), order };
}
const rehash = value => ({ ...value, snapshot_hash: liveHandoffDigest(value.order) });
const capability = () => ({ token_hash: 'a'.repeat(64), token_hint: 'AbCdEf', token_encrypted: 'v1.YQ.Yg.Yw', expires_at: new Date(Date.now() + 1_200_000).toISOString() });
const prepare = async (db, value) => (await service(db, 'select public.prepare_firewood_live_handoff($1,$2,$3) value', [source, value, capability()]))[0].value;
async function ready(db) {
  await db.exec(fixture); await db.exec("select set_config('ats.firewood_live_review','isolated-synthetic-only',false)");
  await db.exec('begin'); await db.exec(install); await db.exec('commit');
  await q(db, 'insert into auth.users values($1)', [owner]);
  await q(db, 'insert into app_private.firewood_live_handoff_sources(id,stripe_account_id,environment_id)values($1,$2,$3)', [source, LIVE_ACCOUNT, LIVE_HANDOFF_ENVIRONMENT]);
}
test('live review SQL refuses implicit installation and never changes the global/staging ledger', async () => {
  const db = new PGlite(); try {
    await assert.rejects(db.exec(install), /Explicit isolated synthetic live review/);
    assert.equal((await q(db, "select to_regclass('app_private.firewood_live_handoffs')is null absent"))[0].absent, true);
    assert.doesNotMatch(install, /supabase_migrations|insert into app_private\.firewood_live_handoff_sources/i);
  } finally { await db.close(); }
});
test('adding separate live objects preserves frozen sandbox functions, constraints, ACLs and source rows', async () => {
  const db = new PGlite(); try {
    const oldInstall = readFileSync(new URL('../../../supabase/staging/firewood-v2/migrations/20261030004004_firewood_v2_staging_boundary.sql', import.meta.url), 'utf8').split('-- BEGIN REVIEWED INSTALL BODY')[1];
    await db.exec(fixture); await db.exec(oldInstall);
    await db.exec("insert into app_private.firewood_handoff_sources(id,stripe_account_id,environment_id)values('website_firewood_invoice_v2','acct_1UU9U8RAZXGe6tX0','ats_fwhandoff_staging_gbyhdsuiqeslgjdnbqng')");
    const snapshot = async () => ({
      routines: await q(db, "select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid)definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private')and(p.proname like'%firewood_handoff%'or p.proname='get_firewood_collector_context')order by 1"),
      constraints: await q(db, "select c.conname name,pg_get_constraintdef(c.oid)definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='app_private'and t.relname like'firewood_handoff%'order by 1"),
      sources: await q(db, 'select *from app_private.firewood_handoff_sources'),
    });
    const before = await snapshot(); assert.equal(before.routines.length, 13);
    await db.exec("select set_config('ats.firewood_live_review','isolated-synthetic-only',false)"); await db.exec(install);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await q(db, 'select count(*)::integer n from app_private.firewood_live_handoff_sources'))[0].n, 0);
    for (const terms of ['legacy-2026-10-22', 'firewood-household-2026-10-24', 'firewood-handoff-test-2026-10-29', LIVE_ACCEPTED_TERMS.version]) await q(db, 'insert into public.invoices(document_terms_version)values($1)', [terms]);
    await assert.rejects(db.exec("insert into public.invoices(document_terms_version)values('unknown')"), /check constraint/);
  } finally { await db.close(); }
});
test('signed handler and fixed native adapter use the real SQL boundary for prepare, replay, renew and ledger status', async () => {
  const db = new PGlite(); try {
    await ready(db); await db.exec('update app_private.firewood_live_handoff_sources set enabled=true');
    const config = { ...FIREWOOD_LIVE_REVIEW_PROFILE, profile: 'live', enabled: true,
      keyId: 'isolated-memory-live-key', signingSecret: randomBytes(32).toString('base64url'), encryptionKey: randomBytes(32), collectorReady: false };
    const adapter = nativeLiveDatabase({ async query({ text, values }) {
      await db.exec('set role service_role'); try { return await db.query(text, values); } finally { await db.exec('reset role'); }
    } });
    const invoke = async (path, input) => {
      const raw = JSON.stringify(input), timestamp = String(Math.floor(Date.now() / 1000));
      return handleLiveHandoff(new Request(LIVE_PORTAL_ORIGIN + path, { method: 'POST', body: raw, headers: {
        'content-type': 'application/json', 'x-ats-key-id': config.keyId, 'x-ats-timestamp': timestamp,
        'x-ats-signature': signLiveHandoff(raw, timestamp, config.signingSecret, path) } }), { config, db: adapter });
    };
    const value = request(); value.order.contact.notes = 'Synthetic delivery notes\nSecond line\tallowed'; const input = rehash(value);
    const first = await invoke(LIVE_PREPARE_PATH, input); assert.equal(first.status, 201);
    const receipt = await first.json(); assert.equal(receipt.invoice_number, `INV-FW-${input.order_id.toUpperCase()}`); assert.equal(receipt.payment_execution_ready, false);
    const repeat = await invoke(LIVE_PREPARE_PATH, input); assert.equal(repeat.status, 200); const replay = await repeat.json(); assert.equal(replay.invoice_id, receipt.invoice_id); assert.equal(replay.portal_url, receipt.portal_url);
    const { order, ...binding } = input;
    const renew = await invoke(LIVE_RENEW_PATH, { ...binding, invoice_id: receipt.invoice_id, expected_capability_version: 1 }); assert.equal(renew.status, 200); const rotated = await renew.json(); assert.equal(rotated.invoice_id, receipt.invoice_id); assert.equal(rotated.capability_version, 2); assert.notEqual(rotated.portal_url, receipt.portal_url);
    const status = await invoke(LIVE_STATUS_PATH, { ...binding, invoice_id: receipt.invoice_id, known_revision: null }); assert.equal(status.status, 200); const financial = await status.json();
    assert.equal(financial.payment_state, 'unpaid'); assert.equal(financial.fulfillment_ready, false); assert.equal(financial.payment_retry_required, false); assert.equal(financial.observation_revision, 1);
    const paid = randomUUID(); await q(db, "insert into public.payments(id,invoice_id,amount_cents,total_collected_cents,surcharge_cents,status,succeeded_at)values($1,$2,60000,61800,1800,'succeeded',clock_timestamp())", [paid, receipt.invoice_id]); await q(db, "update public.invoices set status='paid',balance_due_cents=0 where id=$1", [receipt.invoice_id]);
    const paidResponse = await invoke(LIVE_STATUS_PATH, { ...binding, invoice_id: receipt.invoice_id, known_revision: 1 }); assert.equal(paidResponse.status, 200); const paidStatus = await paidResponse.json(); assert.equal(paidStatus.payment_state, 'paid'); assert.equal(paidStatus.fulfillment_ready, true); assert.equal(paidStatus.observation_revision, 2);
    await q(db, "insert into app_private.stripe_refund_observations values('re_local_handler',$1,61800,'usd','pending')", [paid]);
    const held = await invoke(LIVE_STATUS_PATH, { ...binding, invoice_id: receipt.invoice_id, known_revision: 2 }); assert.equal(held.status, 200); const heldStatus = await held.json(); assert.equal(heldStatus.payment_state, 'processing'); assert.equal(heldStatus.review_required, true); assert.equal(heldStatus.fulfillment_ready, false); assert.equal(heldStatus.observation_revision, 3); assert.deepEqual(heldStatus.original_paid_evidence, paidStatus.original_paid_evidence);
    assert.equal((await q(db, 'select count(*)::integer n from public.invoices'))[0].n, 1); assert.equal((await q(db, 'select count(*)::integer n from public.payments'))[0].n, 1);
    assert.equal((await q(db, 'select sender_enabled from app_private.firewood_live_handoff_sources'))[0].sender_enabled, false);
  } finally { await db.close(); }
});
test('live commands are isolated, default closed, atomic and refund aware', async t => {
  const db = new PGlite(); try {
    await ready(db);
    await t.test('source account, flags and terms are exact; no test authority is widened', async () => {
      const flags = (await q(db, 'select enabled,collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources'))[0];
      assert.deepEqual(flags, { enabled: false, collector_enabled: false, surcharge_reporting_enabled: false, sender_enabled: false });
      await assert.rejects(service(db, 'select public.get_firewood_live_handoff_context($1)', [source]), /source unavailable/);
      await assert.rejects(q(db, "update app_private.firewood_live_handoff_sources set stripe_account_id='acct_1UU9U8RAZXGe6tX0'"), /check constraint/);
      assert.equal((await q(db, "select to_regclass('app_private.firewood_handoffs')is null absent"))[0].absent, true);
      await db.exec('update app_private.firewood_live_handoff_sources set enabled=true');
      const context = (await service(db, 'select public.get_firewood_live_handoff_context($1) value', [source]))[0].value;
      assert.equal(context.account_id, LIVE_ACCOUNT); assert.equal(context.livemode, true); assert.equal(context.environment_id, LIVE_HANDOFF_ENVIRONMENT);
      assert.equal(context.collector_enabled, false); assert.equal(context.sender_enabled, false);
    });
    await t.test('all five private tables deny every API role and only exact entrypoints have execute rights', async () => {
      const tables = await q(db, "select c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') a,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') u,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') s from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'and c.relname like 'firewood_live_%'and c.relkind='r'");
      assert.equal(tables.length, 5); for (const row of tables) assert.deepEqual(row, { rls: true, a: false, u: false, s: false });
      const functions = await q(db, "select n.nspname schema,p.proname name,p.prosecdef definer,p.proconfig config,has_function_privilege('anon',p.oid,'EXECUTE') a,has_function_privilege('authenticated',p.oid,'EXECUTE') u,has_function_privilege('service_role',p.oid,'EXECUTE') s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like '%firewood_live_%'");
      assert.equal(functions.filter(x => x.schema === 'public').length, 8);
      for (const f of functions) { const office = ['approve_firewood_live_price', 'revoke_firewood_live_price'].includes(f.name); assert.equal(f.a, false); assert.equal(f.u, office); assert.equal(f.s, f.schema === 'public' && !office); if (f.definer) assert.ok(f.config.includes('search_path=""')); }
      await assert.rejects(role(db, 'authenticated', 'select public.get_firewood_live_handoff_context($1)', [source], { user: owner, admin: true }), /permission denied/);
      await assert.rejects(role(db, 'service_role', 'select public.get_firewood_live_handoff_context($1)', [source], { user: owner }), /server operation only/);
      const prepareDefinition = (await q(db, "select pg_get_functiondef('public.prepare_firewood_live_handoff(text,jsonb,jsonb)'::regprocedure)definition"))[0].definition;
      assert.ok(prepareDefinition.indexOf("pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:") < prepareDefinition.indexOf('app_private.validate_firewood_live_handoff_request(p_source,p_request)'), 'Prepare and approval issuance acquire the same order lock before any approval row lock.');
    });
    const accepted = request(); let receipt;
    await t.test('one accepted order produces one immutable business invoice, token and exact replay', async () => {
      receipt = await prepare(db, accepted); const replay = await prepare(db, accepted);
      assert.equal(receipt.invoice_id, replay.invoice_id); assert.equal(replay.replayed, true); assert.equal(receipt.payment_execution_ready, false);
      assert.equal(receipt.invoice_number, `INV-FW-${accepted.order_id.toUpperCase()}`); assert.equal(receipt.environment_id, LIVE_HANDOFF_ENVIRONMENT);
      assert.equal((await q(db, 'select count(*)::integer n from public.invoices'))[0].n, 1);
      const changed = structuredClone(accepted); changed.order.contact.address = '2 Changed Fixture Lane'; await assert.rejects(prepare(db, rehash(changed)), /identity changed/);
      await assert.rejects(prepare(db, { ...accepted, environment_id: 'ats_fwhandoff_staging_gbyhdsuiqeslgjdnbqng' }), /Invalid Firewood/);
      for (const sql of ["update public.invoices set total_cents=1", "update public.invoices set payment_terms='Changed'", "update app_private.firewood_live_handoffs set reference='Changed'", "delete from app_private.firewood_live_handoffs", "update public.invoice_line_items set invoice_id=gen_random_uuid()"] ) await assert.rejects(db.exec(sql), /frozen|immutable/);
      await assert.rejects(db.exec("update public.invoices set status='void'"), /coordinated cancellation/);
    });
    await t.test('bad capabilities roll back every customer, location and invoice insertion', async () => {
      const bad = request(); const before = (await q(db, 'select count(*)::integer n from public.invoices'))[0].n;
      for (const invalid of [{ ...capability(), token_hash: 'wrong' }, { ...capability(), expires_at: null },
        Object.fromEntries(Object.entries(capability()).filter(([key]) => key !== 'expires_at')), { ...capability(), extra: true },
        { ...capability(), expires_at: new Date(Date.now() + 3_600_000).toISOString() }]) {
        await assert.rejects(service(db, 'select public.prepare_firewood_live_handoff($1,$2,$3)', [source, bad, invalid]), /Invalid Firewood capability/);
      }
      assert.equal((await q(db, 'select count(*)::integer n from public.invoices'))[0].n, before);
    });
    await t.test('all six catalog principals are exact; every test contact and policy downgrade stays rejected', async () => {
      let index = 40;
      for (const quantity of ['half', 'full', 'two']) for (const stacking of [false, true]) {
        const value = request(priceLiveOrder({ quantity, stacking })); value.order.contact.phone = `54055501${index++}`;
        const result = await prepare(db, rehash(value)); assert.equal(result.principal_cents, priceLiveOrder({ quantity, stacking }).principal_cents);
      }
      for (const email of ['someone@synthetic.invalid', 'someone@synthetic.test', 'someone@example.com', 'someone@sub.example.org', '.broken@angeltreeservice.org', 'bad..dots@angeltreeservice.org', 'someone@-invalidlabel.org']) {
        const value = request(); value.order.contact.email = email; await assert.rejects(prepare(db, rehash(value)), /Valid live contact/);
      }
      for (const mutate of [v => { v.order.terms.version = 'firewood-handoff-test-2026-10-29'; }, v => { v.order.payment_policy.debit_surcharge_bps = 300; },
        v => { v.account_id = 'acct_1UU9U8RAZXGe6tX0'; }, v => { v.order.principal_cents += 1; }, v => { v.order.wood_cents -= 1; v.order.principal_cents -= 1; }]) {
        const value = request(); mutate(value); await assert.rejects(prepare(db, rehash(value)), /Invalid|Office approval/);
      }
      assert.equal((await q(db, "select count(*)::integer n from public.invoices where invoice_number like'TEST%'"))[0].n, 0);
    });
    await t.test('discount assertions need an actual effective owner/admin authority tied to every accepted field', async () => {
      const discounted = request({ wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 });
      discounted.order.contact.phone = '5405550124';
      await assert.rejects(prepare(db, rehash(discounted)), /Office approval required/);
      const fake = structuredClone(discounted); fake.order.office_approval = { approval_id: randomUUID(), approved_at_ms: Date.now() - 1000, residential: true, single_discount_confirmed: true };
      await assert.rejects(prepare(db, rehash(fake)), /Trusted CRM office approval/);
      const id = randomUUID(), args = [source, rehash(discounted), 'Reviewed residential price before purchase', id];
      await assert.rejects(role(db, 'authenticated', 'select public.approve_firewood_live_price($1,$2,$3,$4)', args, { user: owner }), /owner or admin required/);
      await assert.rejects(service(db, 'select public.approve_firewood_live_price($1,$2,$3,$4)', args), /permission denied/);
      const functions = await q(db, "select pg_get_functiondef(p.oid)definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('approve_firewood_live_price','revoke_firewood_live_price')");
      for (const f of functions) assert.ok(f.definition.indexOf("pg_advisory_xact_lock(hashtext('platform-role-management'))") < f.definition.indexOf('app_private.has_platform_admin_role()'), 'Effective access is checked after the existing offboarding/role lock.');
      const approval = (await admin(db, 'select public.approve_firewood_live_price($1,$2,$3,$4) value', args))[0].value;
      const replay = (await admin(db, 'select public.approve_firewood_live_price($1,$2,$3,$4) value', args))[0].value; assert.deepEqual(replay, approval);
      const { expires_at, ...assertion } = approval; discounted.order.office_approval = assertion; discounted.order.accepted_at_ms = Date.now();
      const changed = structuredClone(discounted); changed.order.contact.address = '3 Different Delivery Lane'; await assert.rejects(prepare(db, rehash(changed)), /Trusted CRM office approval/);
      const result = await prepare(db, rehash(discounted)); assert.equal(result.principal_cents, 57000);
      assert.equal((await prepare(db, rehash(discounted))).invoice_id, result.invoice_id);
      await assert.rejects(admin(db, 'select public.revoke_firewood_live_price($1,$2)', [approval.approval_id, 'No longer needed']), /Accepted price is frozen/);
      await assert.rejects(db.exec('delete from app_private.firewood_live_price_approvals'), /immutable/);
    });
    await t.test('revoked office authority cannot be used or reactivated by a service caller', async () => {
      const value = request({ wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 }); value.order.contact.phone = '5405550125';
      const approval = (await admin(db, 'select public.approve_firewood_live_price($1,$2,$3,$4) value', [source, rehash(value), 'Office-reviewed household price', randomUUID()]))[0].value;
      await admin(db, 'select public.revoke_firewood_live_price($1,$2)', [approval.approval_id, 'Owner rescinded before purchase']);
      const { expires_at, ...assertion } = approval; value.order.office_approval = assertion; value.order.accepted_at_ms = Date.now();
      await assert.rejects(prepare(db, rehash(value)), /Trusted CRM office approval/);
      await assert.rejects(db.exec('update app_private.firewood_live_price_approvals set revoked_at=null'), /immutable/);
    });
    await t.test('expired authority and approval identity substitution remain closed', async () => {
      const value = request({ wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 }); value.order.contact.phone = '5405550127';
      const approvalId = randomUUID(), approvedMs = Date.now() - 172_800_000;
      // A privileged in-memory expired-row fixture is only a negative test. No
      // fixture identity bypass exists in any candidate function.
      const { accepted_at_ms, office_approval, ...binding } = value.order;
      await q(db, "insert into app_private.firewood_live_price_approvals(id,request_id,source_id,order_id,order_binding,approved_by,approved_at_ms,expires_at,reason)values($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-interval'1 second','Expired local negative')", [approvalId, randomUUID(), source, value.order_id, binding, owner, approvedMs]);
      value.order.office_approval = { approval_id: approvalId, approved_at_ms: approvedMs, residential: true, single_discount_confirmed: true };
      await assert.rejects(prepare(db, rehash(value)), /Trusted CRM office approval/);
      await assert.rejects(db.exec('update app_private.firewood_live_price_approvals set expires_at=clock_timestamp()+interval\'1 day\''), /immutable/);
    });
    await t.test('renewal rotates one link on the same invoice and replays without further tokens', async () => {
      const args = [source, accepted.order_id, receipt.invoice_id, accepted.snapshot_hash, 1, capability()];
      const first = (await service(db, 'select public.renew_firewood_live_handoff($1,$2,$3,$4,$5,$6) value', args))[0].value;
      const again = (await service(db, 'select public.renew_firewood_live_handoff($1,$2,$3,$4,$5,$6) value', args))[0].value;
      assert.equal(first.invoice_id, receipt.invoice_id); assert.equal(first.capability_version, 2); assert.equal(again.capability_version, 2); assert.equal(again.replayed, true);
      assert.equal((await q(db, 'select count(*)::integer n from public.invoice_portal_tokens where invoice_id=$1', [receipt.invoice_id]))[0].n, 2);
    });
    await t.test('processing bank and pending refunds cannot become paid or bypass complete-ledger CAS', async () => {
      const payment = randomUUID(), args = [source, accepted.order_id, receipt.invoice_id, accepted.snapshot_hash];
      await q(db, "insert into public.payments(id,invoice_id,amount_cents,total_collected_cents,surcharge_cents,status)values($1,$2,60000,61800,1800,'pending')", [payment, receipt.invoice_id]);
      assert.equal((await q(db, 'select original_paid_evidence proof from app_private.firewood_live_handoffs where invoice_id=$1', [receipt.invoice_id]))[0].proof, null);
      await q(db, "update public.payments set status='succeeded',succeeded_at=clock_timestamp()where id=$1", [payment]);
      await q(db, "update public.invoices set status='paid',balance_due_cents=0 where id=$1", [receipt.invoice_id]);
      const read = async () => (await service(db, 'select public.read_firewood_live_handoff($1,$2,$3,$4) value', args))[0].value;
      const before = await read(), financial = { totals: { invoice_principal_cents: 60000, balance_due_cents: 0 } };
      await service(db, 'select public.record_firewood_live_handoff_observation($1,$2,$3,$4,$5,$6)', [...args, before.ledger_hash, financial]);
      await q(db, "insert into app_private.stripe_refund_observations values('re_local_pending',$1,61800,'usd','pending')", [payment]);
      await assert.rejects(service(db, 'select public.record_firewood_live_handoff_observation($1,$2,$3,$4,$5,$6)', [...args, before.ledger_hash, financial]), /Financial observation changed/);
      const after = await read(); assert.notEqual(after.ledger_hash, before.ledger_hash); assert.deepEqual(after.original_paid_evidence, before.original_paid_evidence); assert.equal(after.refunds[0].status, 'pending');
      await db.exec('update app_private.firewood_live_handoff_sources set collector_enabled=true,surcharge_reporting_enabled=true');
      const context = (await service(db, 'select public.get_firewood_live_collector_context($1) value', [receipt.invoice_id]))[0].value; assert.equal(context.review_required, true); assert.equal(context.allowed, false); assert.equal(context.already_paid, false);
      assert.equal(context.invoice_id, receipt.invoice_id); assert.equal(context.account_id, LIVE_ACCOUNT); assert.equal(context.environment_id, LIVE_HANDOFF_ENVIRONMENT); assert.equal(context.terms_hash, LIVE_ACCEPTED_TERMS.hash);
      await q(db, "update public.payments set status='refunded',refunded_principal_cents=60000,refunded_surcharge_cents=1800 where id=$1", [payment]);
      assert.deepEqual((await read()).original_paid_evidence, before.original_paid_evidence);
      for (const sql of ["update app_private.firewood_live_handoffs set original_paid_evidence='{}'where original_paid_evidence is not null", 'delete from app_private.firewood_live_handoff_payment_events', "update app_private.firewood_live_handoff_observations set snapshot='{}'"]) await assert.rejects(db.exec(sql), /immutable/);
    });
    await t.test('late audit failure rolls back the entire accepted invoice and its new contact/location/token', async () => {
      const value = request(); value.order.contact.phone = '5405550189'; const before = (await q(db, 'select count(*)::integer n from public.invoices'))[0].n;
      await db.exec("create function public.test_reject_audit()returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure';end$$;create trigger test_reject_audit before insert on public.activity_log for each row execute function public.test_reject_audit()");
      await assert.rejects(prepare(db, rehash(value)), /Synthetic audit failure/);
      assert.equal((await q(db, 'select count(*)::integer n from public.invoices'))[0].n, before);
      assert.equal((await q(db, 'select count(*)::integer n from public.customers where email=$1', [value.order.contact.email]))[0].n, 0);
      assert.equal((await q(db, 'select count(*)::integer n from app_private.firewood_live_handoffs where order_id=$1', [value.order_id]))[0].n, 0);
      await db.exec('drop trigger test_reject_audit on public.activity_log;drop function public.test_reject_audit()');
    });
  } finally { await db.close(); }
});
