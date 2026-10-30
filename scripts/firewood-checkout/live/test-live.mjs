import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from './live-profile.mjs';
import { LIVE_ACCEPTED_TERMS, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, PREPARE_PATH,
  canonicalHandoff, handoffDigest, parsePrepareRequest } from './contract.mjs';
import { createClosedLiveClient, createIsolatedLiveClient, prepareOrderBinding } from './client.mjs';
import { installOrderStore, handoffOrders } from './orders.mjs';
import { installHandoffStore } from './store.mjs';
import { orderInput } from './policy.mjs';
import { liveFixture, fixtureInput } from './test-fixture.mjs';
import { getLiveProductionDependencies, handleLiveProductionRequest } from './runtime.mjs';
import { handoffClient } from '../launch/client.mjs';
import { parsePrepareRequest as parseSandbox, makePrepareFixture } from '../launch/contract.mjs';
import { liveAssets } from './assets.mjs';
import { isolatedLivePreview } from './isolated-preview.mjs';
import { createIsolatedLiveDatabase } from './isolated-database.mjs';

async function fixture(t) {
  const db = await createIsolatedLiveDatabase();
  t.after(() => db.stop()); const crm = liveFixture();
  await installOrderStore(db, crm.client);
  await db.query('UPDATE fwlive_control SET paused=false');
  const orders = handoffOrders({ db, client: crm.client, now: crm.now }), session = await orders.session(null, true);
  return { db, crm, orders, session, input: { ...fixtureInput(), csrf: session.csrf } };
}
const count = async (db, table) => (await db.query('SELECT count(*)::int n FROM ' + table)).rows[0].n;

test('production profile is separate and cannot load credentials, enable a route or borrow a legacy release', async () => {
  const p = FIREWOOD_LIVE_REVIEW_PROFILE; assert.equal(p.runtimeLoadable, false);
  assert.ok(Object.values(p.activation).every(v => v === false)); assert.ok(Object.values(p.bindings).every(v => v === null));
  for (const env of [{}, { FIREWOOD_CANDIDATE_MODE: 'live' }, { FIREWOOD_HANDOFF_LIVE_ENABLED: '1', STRIPE_SECRET_KEY: 'do-not-load' }]) {
    assert.equal(getLiveProductionDependencies(env), null);
    const response = await handleLiveProductionRequest(new Request('https://checkout.angeltreeservices.org/firewood/checkout/'), env);
    assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null); assert.equal((await response.json()).payment_retry_required, false);
  }
  assert.throws(() => handoffClient(p));
  assert.throws(() => createIsolatedLiveClient({ handle() {}, keyId: 'live-production', secret: 'a'.repeat(64) }));
  const closed = createClosedLiveClient();
  await assert.rejects(installHandoffStore({ transaction: () => assert.fail('No database call allowed') }, closed), /live_runtime_unbound/);
});

test('six live price snapshots bind the new full terms and reject stale acceptance or browser price overrides', () => {
  const { client } = liveFixture();
  for (const [quantity, wood] of [['half', 30000], ['full', 45000], ['two', 84000]]) for (const stacking of [false, true]) {
    const input = { ...fixtureInput(), quantity, stacking }, chosen = orderInput(input, client);
    assert.equal(chosen.quote.totalCents, wood + (stacking ? 15000 : 0)); assert.equal(chosen.quote.deliveryCents, 0);
    assert.deepEqual(chosen.terms, LIVE_ACCEPTED_TERMS); assert.equal(chosen.terms.clauses.length, 8);
    const id = randomUUID(), request = prepareOrderBinding({ id, number: 'FW-' + id.slice(0, 8).toUpperCase(), ...chosen, created_at: Date.now() }, client);
    // The saved server reference is derived from its UUID, not browser input.
    assert.equal(request.mode, 'live');
  }
  for (const change of [{ termsHash: 'a'.repeat(64) }, { paymentPolicyHash: 'b'.repeat(64) }, { termsAccepted: false },
    { householdUseConfirmed: false }, { woodCents: 1 }, { invoice_id: randomUUID() }, { officeApproval: { approval_id: randomUUID() } }])
    assert.throws(() => orderInput({ ...fixtureInput(), ...change }, client));
});

test('live/sandbox binding, environment, terms and signature domains cannot be interchanged', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input); const m = f.crm.latest();
  assert.throws(() => parseSandbox(m.request)); assert.throws(() => parsePrepareRequest(makePrepareFixture(), { allowSyntheticContacts: true }));
  for (const change of [{ environment_id: 'another' }, { account_id: 'acct_1UU9U8RAZXGe6tX0' }, { mode: 'sandbox' }, { source_id: 'website_firewood_invoice_v2' }])
    assert.throws(() => f.crm.client.parseRequest({ ...m.request, ...change }));
  const testTerms = makePrepareFixture().order.terms, changed = { ...m.request, order: { ...m.request.order, terms: testTerms } };
  changed.snapshot_hash = handoffDigest(changed.order); assert.throws(() => f.crm.client.parseRequest(changed));
  const forbidden = { ...m.request, order: { ...m.request.order, contact: { ...m.request.order.contact, email: 'customer@example.com' } } };
  forbidden.snapshot_hash = handoffDigest(forbidden.order); assert.throws(() => f.crm.client.parseRequest(forbidden), /isolated_synthetic/);
});

test('fresh live namespace refuses v1/test tables, forged clients, changed identity and identity SQL rewrites', async t => {
  const f = await fixture(t);
  await assert.rejects(installOrderStore(f.db, { ...f.crm.client }), /live_runtime_unbound/);
  await assert.rejects(installOrderStore({ transaction: () => assert.fail('No arbitrary database access') }, f.crm.client), /isolated_live_database_required/);
  await assert.rejects(installOrderStore(f.db, liveFixture({ keyId: 'isolated-live-other' }).client), /handoff_identity_conflict/);
  await assert.rejects(f.db.query("UPDATE fwlive_identity SET identity_hash='wrong'"), /immutable_live_identity/);
  await f.db.query('CREATE TABLE fwv2_orders(id uuid)');
  await assert.rejects(installOrderStore(f.db, f.crm.client), /fresh_handoff_namespace_required/);
});

test('lost preparation response and restarted order worker retain one immutable order and invoice', async t => {
  const f = await fixture(t); f.crm.loseNextReply(); const originalInput = structuredClone(f.input);
  await f.orders.start(f.session, f.input); assert.equal(f.crm.mappings.size, 1);
  assert.equal((await f.orders.state(f.session)).preparation, 'pending'); f.crm.advance(6000);
  const restarted = handoffOrders({ db: f.db, client: f.crm.client, now: f.crm.now }); await restarted.work();
  const one = await restarted.state(f.session); assert.equal(one.preparation, 'prepared');
  await restarted.start(f.session, originalInput); assert.equal(f.crm.mappings.size, 1); assert.equal(await count(f.db, 'fwlive_orders'), 1);
  await assert.rejects(restarted.start(f.session, { ...f.input, notes: 'Different accepted request' }), /accepted order is saved/);
  await assert.rejects(f.db.query('DELETE FROM fwlive_prepare'), /immutable_handoff_preparation/);
});

test('stale form, forged office price and missing CSRF save no order and preserve the customer form snapshot', async t => {
  const f = await fixture(t), saved = structuredClone(f.input);
  for (const change of [{ csrf: 'wrong' }, { termsHash: 'old' }, { paymentPolicyHash: 'old' }, { officeApproval: { approval_id: randomUUID() } }, { totalCents: 1 }])
    await assert.rejects(f.orders.start(f.session, { ...f.input, ...change }));
  assert.deepEqual(f.input, saved); assert.equal(await count(f.db, 'fwlive_orders'), 0); assert.equal(f.crm.mappings.size, 0);
});

test('bank processing and offline preference cannot capture a confirmation or plan an email', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input);
  f.crm.observe('processing'); await f.orders.work(); assert.equal((await f.orders.state(f.session)).payment.fulfillment_ready, false);
  assert.equal(await count(f.db, 'fwlive_confirmations'), 0); assert.equal(await count(f.db, 'fwlive_outbox'), 0);
  assert.equal((await f.orders.resume(f.session, { csrf: f.session.csrf })).next, '/firewood/checkout/result/');
});

test('paid then pending/full refund retains proof and exactly one held customer and owner confirmation', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input);
  f.crm.observe('paid', { fee: 1350, channel: 'card' }); await f.orders.work();
  const confirmation = await f.orders.confirmation(f.session), proof = canonicalHandoff(f.crm.latest().status.original_paid_evidence);
  await f.orders.work(); assert.equal(await count(f.db, 'fwlive_confirmations'), 1); assert.equal(await count(f.db, 'fwlive_outbox'), 2);
  f.crm.observe('refund_pending'); await f.orders.work(); const pending = await f.orders.state(f.session);
  assert.equal(pending.payment.fulfillment_ready, false); assert.equal(pending.payment.totals.gross_refunded_cents, 0);
  f.crm.observe('refunded'); await f.orders.work(); await f.orders.work();
  assert.equal(canonicalHandoff(f.crm.latest().status.original_paid_evidence), proof); assert.deepEqual(await f.orders.confirmation(f.session), confirmation);
  const outbox = (await f.db.query('SELECT kind,status,recipient FROM fwlive_outbox ORDER BY kind')).rows;
  assert.deepEqual(outbox, [{ kind: 'customer_order', status: 'held', recipient: f.input.email }, { kind: 'owner_order', status: 'held', recipient: 'info@angeltreeservice.org' }]);
  assert.equal((await f.orders.work()).emailsSent, 0);
  await assert.rejects(f.db.query('DELETE FROM fwlive_confirmations'), /immutable_accepted_order/);
  await assert.rejects(f.db.query('DELETE FROM fwlive_outbox'), /immutable_accepted_order/);
  await assert.rejects(f.db.query('DELETE FROM fwlive_observation'), /immutable_handoff_observation/);
});

test('an unpaid held collector reopens only through explicit renewal of the same invoice', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input); const invoice = f.crm.latest().receipt.invoice_id;
  await assert.rejects(f.orders.resume(f.session, { csrf: f.session.csrf }), /Payment options are not available/);
  f.crm.ready(true); const next = await f.orders.resume(f.session, { csrf: f.session.csrf });
  assert.match(next.next, /^https:\/\/admin\.angeltreeservices\.org\/portal\/invoice\//);
  assert.equal(f.crm.latest().receipt.invoice_id, invoice); assert.equal(f.crm.mappings.size, 1);
});

test('a different customer session cannot read or resume another order', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input); const other = await f.orders.session(null, true);
  assert.equal((await f.orders.state(other)).order, null);
  await assert.rejects(f.orders.confirmation(other), /No saved order/);
  await assert.rejects(f.orders.resume(other, { csrf: other.csrf }), /Save your order/);
  assert.equal(await count(f.db, 'fwlive_orders'), 1);
});

test('multiline customer instructions survive acceptance while control characters in identity fields are rejected', async t => {
  const f = await fixture(t); f.input.notes = 'Gate beside the garage.\nStack near the shed.';
  await f.orders.start(f.session, f.input); const saved = await f.orders.state(f.session);
  assert.equal(saved.order.contact.notes, f.input.notes); assert.equal(f.crm.latest().request.order.contact.notes, f.input.notes);
  assert.throws(() => orderInput({ ...f.input, name: 'Name\nSpoofed' }, f.crm.client));
  assert.throws(() => orderInput({ ...f.input, notes: 'Hidden\u0000text' }, f.crm.client));
});

test('wrong invoice, principal or environment replies cannot replace a bound preparation or authorize money', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input); const original = f.crm.latest();
  for (const change of [{ invoice_number: 'INV-GENERIC-OTHER' }, { principal_cents: 1 }, { environment_id: 'other' }]) {
    const bad = createIsolatedLiveClient({ keyId: f.crm.keyId, secret: f.crm.secret, now: f.crm.now,
      handle: async req => { const value = await (await f.crm.handle(req)).json(); return Response.json({ ...value, ...change }); } });
    await assert.rejects(bad.prepare(original.request));
  }
  const old = structuredClone(original.status); original.status.totals.invoice_principal_cents = 1; original.status.totals.balance_due_cents = 1;
  await assert.rejects(f.crm.client.status(original.request, original.receipt)); original.status = old;
  assert.equal(f.crm.mappings.size, 1); assert.equal(await count(f.db, 'fwlive_outbox'), 0);
});

test('oversized or unfinished local replies are bounded and cannot produce paid evidence', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input); const request = f.crm.latest().request;
  for (const handle of [async () => new Response('x'.repeat(65537)), () => new Promise(() => {}),
    async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }))]) {
    const bad = createIsolatedLiveClient({ handle, keyId: f.crm.keyId, secret: f.crm.secret, timeoutMs: 10 });
    await assert.rejects(bad.prepare(request), error => error.retryable === true);
  }
  assert.equal(await count(f.db, 'fwlive_confirmations'), 0);
});

test('failed outbox planning rolls confirmation back and a later restart captures both messages once', async t => {
  const f = await fixture(t); await f.orders.start(f.session, f.input);
  await f.db.query("CREATE FUNCTION fwlive_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_failure'; END $$");
  await f.db.query('CREATE TRIGGER fwlive_test_failure BEFORE INSERT ON fwlive_outbox FOR EACH ROW EXECUTE FUNCTION fwlive_test_failure()');
  f.crm.observe('paid'); await f.orders.work(); assert.equal(await count(f.db, 'fwlive_confirmations'), 0); assert.equal(await count(f.db, 'fwlive_outbox'), 0);
  await f.db.query('DROP TRIGGER fwlive_test_failure ON fwlive_outbox');
  const restarted = handoffOrders({ db: f.db, client: f.crm.client, now: f.crm.now }); await restarted.work(); await restarted.work();
  assert.equal(await count(f.db, 'fwlive_confirmations'), 1); assert.equal(await count(f.db, 'fwlive_outbox'), 2);
});

test('production rendering contains every exact accepted clause and no test tools or payment simulator', async () => {
  const files = await liveAssets(), html = files.get('/firewood/checkout/').body, script = files.get('/firewood/checkout/checkout.js').body;
  for (const clause of LIVE_ACCEPTED_TERMS.clauses) assert.ok(html.includes(clause.text.replaceAll('&', '&amp;').replaceAll("'", '&#39;')));
  assert.ok(html.includes('data-terms-hash="' + LIVE_TERMS_HASH + '"')); assert.ok(html.includes('data-payment-policy-hash="' + LIVE_PAYMENT_POLICY_HASH + '"'));
  assert.ok(!/sandbox|Use example details|Test checkout|simulate\(/iu.test(html + script));
  assert.ok(html.includes('noindex')); assert.ok(script.includes('dataset.termsHash')); assert.ok(!files.has('/firewood/checkout/payment/'));
});

test('loopback preview rejects foreign host/origin and stale terms before recording a customer order', async t => {
  const f = await fixture(t), server = await isolatedLivePreview({ orders: f.orders, origin: 'http://127.0.0.1:0' });
  const origin = await server.listen(); t.after(() => server.close());
  const stateResponse = await fetch(origin + '/firewood/checkout/api/state'), state = await stateResponse.json();
  const cookie = stateResponse.headers.get('set-cookie').split(';')[0]; assert.equal(state.sandbox, false);
  const foreignStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(origin + '/firewood/checkout/api/state', { headers: { Host: 'foreign.invalid' } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    }); req.on('error', reject); req.end();
  }); assert.equal(foreignStatus, 403);
  const send = (body, givenOrigin = origin) => fetch(origin + '/firewood/checkout/api/start', { method: 'POST', headers: { Origin: givenOrigin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send({ ...fixtureInput(), csrf: state.csrf }, 'https://foreign.invalid')).status, 403);
  assert.equal((await send({ ...fixtureInput(), csrf: state.csrf, termsHash: 'old' })).status, 409);
  assert.equal(await count(f.db, 'fwlive_orders'), 0);
  const accepted = await send({ ...fixtureInput(), csrf: state.csrf }); assert.equal(accepted.status, 200);
  assert.equal(await count(f.db, 'fwlive_orders'), 1);
});
