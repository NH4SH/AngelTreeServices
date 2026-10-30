import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import * as live from '../src/lib/firewood/handoff/live-contract.mjs';
import * as sandbox from '../src/lib/firewood/handoff/contract.mjs';
import * as profile from '../src/lib/firewood/handoff/live-profile.mjs';
import { handleLiveHandoff, liveHandoffUnavailable } from '../src/lib/firewood/handoff/live-handler.mjs';
import { validateLiveCollectorContext, liveSurchargeFields, isLiveFirewoodInvoice } from '../src/lib/firewood/handoff/live-collector.mjs';
import { nativeLiveDatabase, supabaseLiveDatabase } from '../src/lib/firewood/handoff/live-database.mjs';
import { load } from './pr10-test-helpers.mjs';

// All contacts, keys, capabilities and provider identities below are fictional.
// These tests never instantiate a provider client or access another service.
const nowMs = Date.UTC(2026, 9, 29, 18);
const timestamp = String(nowMs / 1000);
const secret = 'SYNTHETIC_ONLY_REVIEW_SECRET_1234567890';
const orderId = 'd438a811-30ae-4b3a-9ca7-2bc7419d0001';
const invoiceId = 'd438a811-30ae-4b3a-9ca7-2bc7419d0002';
const options = { nowMs, allowSyntheticContacts: true };
function request() {
  const order = {
    quantity: 'full', stacking: true, wood_cents: 45000, delivery_cents: 0,
    stacking_cents: 15000, principal_cents: 60000, currency: 'usd', tax_cents: 0,
    tax_basis: 'va_domestic_use_locality_exempt', terms: structuredClone(live.LIVE_ACCEPTED_TERMS),
    accepted_at_ms: nowMs - 1000, office_approval: null,
    payment_policy: structuredClone(live.LIVE_PAYMENT_POLICY),
    contact: { name: 'Security Review Synthetic', email: 'review@example.invalid',
      phone: '2025550182', address: '123 Synthetic Lane', address2: '',
      city: 'Fredericksburg', state: 'VA', postal: '22407', notes: '' },
  };
  return { contract: live.LIVE_HANDOFF_CONTRACT, source_id: live.LIVE_HANDOFF_SOURCE,
    environment_id: live.LIVE_HANDOFF_ENVIRONMENT, account_id: live.LIVE_ACCOUNT, mode: 'live',
    order_id: orderId, reference: 'FW-' + orderId.slice(0, 8).toUpperCase(),
    snapshot_hash: live.liveHandoffDigest(order), order };
}
const rehash = value => (value.snapshot_hash = live.liveHandoffDigest(value.order), value);
const rejects = value => assert.throws(() => live.parseLivePrepareRequest(value, options));

test('live and frozen sandbox contracts reject each other in both directions', () => {
  const incoming = request();
  assert.equal(live.parseLivePrepareRequest(incoming, options).mode, 'live');
  assert.throws(() => sandbox.parsePrepareRequest(incoming));
  assert.throws(() => live.parseLivePrepareRequest(sandbox.makePrepareFixture(), options));
  for (const [key, value] of [
    ['contract', sandbox.HANDOFF_CONTRACT], ['source_id', sandbox.HANDOFF_SOURCE],
    ['account_id', sandbox.SANDBOX_ACCOUNT], ['mode', 'sandbox'],
    ['environment_id', 'ats_fwhandoff_staging_gbyhdsuiqeslgjdnbqng'],
  ]) rejects({ ...incoming, [key]: value });
});

test('new arbitrary fields cannot smuggle actor, sending or financial authority', () => {
  for (const extra of [{ actor_id: invoiceId }, { send_email: true }, { paid: true },
    { stripe_payment_intent_id: 'pi_SYNTHETICONLY' }, { collector_enabled: true }]) {
    rejects({ ...request(), ...extra });
    const nested = request(); Object.assign(nested.order, extra); rejects(rehash(nested));
  }
});

test('accepted policy changes remain rejected even with a fresh attacker-computed hash', () => {
  for (const patch of [{ notificationDays: 1 }, { cancellationHours: 0 },
    { lateCustomerCancellation: 'full' }, { veterans: 'automatic' },
    { version: sandbox.policy.version }, { hash: sandbox.policyHash },
    { householdUseConfirmed: false }, { accepted: false }]) {
    const value = request(); Object.assign(value.order.terms, patch); rejects(rehash(value));
  }
  const wording = request(); wording.order.terms.clauses[0].text += ' Changed after acceptance.'; rejects(rehash(wording));
  for (const patch of [{ receipt_authority: 'website' }, { credit_surcharge_bps: 0 },
    { debit_surcharge_bps: 300 }, { exact_fee_review_before_confirmation: false },
    { surcharge_reporting: 'line_item' }, { channels: ['card'] }, { accepted: false }]) {
    const value = request(); Object.assign(value.order.payment_policy, patch); rejects(rehash(value));
  }
});

test('price reductions, duplicate discounts and changed totals are never a customer option', () => {
  for (const patch of [{ wood_cents: 1, principal_cents: 15001 },
    { stacking_cents: 0, principal_cents: 45000 }, { delivery_cents: -1 },
    { principal_cents: 59999 }, { tax_cents: 1 }, { veteran: true }]) {
    const value = request(); Object.assign(value.order, patch); rejects(rehash(value));
  }
  assert.throws(() => live.priceLiveOrder({ quantity: 'full', stacking: true, veteran: true }));
});

test('synthetic contacts require an explicit test option and contact injection is rejected', () => {
  assert.throws(() => live.parseLivePrepareRequest(request(), { nowMs }));
  for (const contact of [{ email: 'review@example.com' }, { email: 'review@localhost' },
    { name: 'Synthetic\r\nBcc: leak@example.invalid' }, { phone: '2025550182;echo bad' },
    { state: 'MD' }, { notes: 'instructions\u0000hidden' }, { actor: 'owner' }]) {
    const value = request(); Object.assign(value.order.contact, contact); rejects(rehash(value));
  }
});

test('caller mutation cannot change parsed acceptance or shared policy identities', () => {
  const incoming = request(), parsed = live.parseLivePrepareRequest(incoming, options);
  incoming.order.contact.email = 'other@example.invalid'; incoming.order.terms.notificationDays = 1;
  assert.equal(parsed.order.contact.email, 'review@example.invalid');
  assert.equal(parsed.order.terms.notificationDays, 7);
  assert.throws(() => { parsed.order.payment_policy.channels.push('wire'); }, TypeError);
  assert.throws(() => { live.LIVE_CATALOG.quantities[0].wood_cents = 1; }, TypeError);
  assert.throws(() => { live.LIVE_ACCEPTED_TERMS.hash = '0'.repeat(64); }, TypeError);
});

test('HMAC live domain rejects legacy, wrong path, wrong key, modified bytes and stale replay', () => {
  const raw = JSON.stringify(request()), path = live.LIVE_PREPARE_PATH;
  const signature = live.signLiveHandoff(raw, timestamp, secret, path);
  const input = { raw, timestamp, secret, path, signature, nowMs };
  assert.equal(live.verifyLiveHandoffSignature(input), true);
  const legacy = 'v1=' + createHmac('sha256', secret).update(timestamp + '\nPOST\n' + path + '\n' + raw).digest('hex');
  for (const patch of [{ signature: legacy }, { secret: secret + 'x' },
    { path: live.LIVE_STATUS_PATH }, { path: path + '?send=1' }, { raw: raw + ' ' },
    { signature: signature.toUpperCase() }, { nowMs: nowMs + 301000 },
    { nowMs: nowMs - 301000 }, { timestamp: String(Number(timestamp) + 301) }]) {
    assert.equal(live.verifyLiveHandoffSignature({ ...input, ...patch }), false);
  }
  assert.throws(() => sandbox.signHandoff(raw, timestamp, secret, path));
  assert.throws(() => live.signLiveHandoff(raw, timestamp, secret, sandbox.PREPARE_PATH));
});

test('signature request bound uses bytes rather than character count', () => {
  assert.throws(() => live.signLiveHandoff('x'.repeat(16385), timestamp, secret, live.LIVE_PREPARE_PATH));
  assert.throws(() => live.signLiveHandoff('🌳'.repeat(5000), timestamp, secret, live.LIVE_PREPARE_PATH));
  assert.equal(live.verifyLiveHandoffSignature({ raw: '🌳'.repeat(5000), timestamp, secret,
    path: live.LIVE_PREPARE_PATH, signature: 'v1=' + 'a'.repeat(64), nowMs }), false);
});

test('read and renewal reject alternate invoice, source authority and malformed revisions', () => {
  const { order, ...base } = request();
  const status = { ...base, invoice_id: invoiceId, known_revision: 1 };
  const renew = { ...base, invoice_id: invoiceId, expected_capability_version: 1 };
  assert.equal(live.parseLiveStatusRequest(status).known_revision, 1);
  assert.equal(live.parseLiveRenewRequest(renew).expected_capability_version, 1);
  for (const patch of [{ paid: true }, { source_id: sandbox.HANDOFF_SOURCE },
    { invoice_id: '../admin' }, { environment_id: 'staging' }]) {
    assert.throws(() => live.parseLiveStatusRequest({ ...status, ...patch }));
    assert.throws(() => live.parseLiveRenewRequest({ ...renew, ...patch }));
  }
  assert.throws(() => live.parseLiveStatusRequest({ ...status, known_revision: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => live.parseLiveRenewRequest({ ...renew, expected_capability_version: 0 }));
});

test('code identity and live key syntax never produce runnable activation authority', () => {
  const reviewed = profile.FIREWOOD_LIVE_REVIEW_PROFILE;
  assert.equal(profile.isFirewoodLiveCodeIdentity(reviewed), true);
  assert.equal(reviewed.reviewOnly, true); assert.equal(reviewed.runtimeLoadable, false);
  assert.ok(Object.values(reviewed.activation).every(value => value === false));
  assert.ok(Object.values(reviewed.bindings).every(value => value === null));
  assert.equal(profile.isLiveRestrictedStripeKey('rk_live_SYNTHETICONLY'), true);
  for (const candidate of ['sk_live_SYNTHETIC', 'rk_test_SYNTHETIC', '', null]) {
    assert.equal(profile.isLiveRestrictedStripeKey(candidate), false);
  }
  assert.throws(() => { reviewed.activation.collection = true; }, TypeError);
  assert.equal('getLiveDependencies' in profile, false);
});

function preparation() {
  const { order, ...binding } = request();
  return { ...binding, invoice_id: invoiceId, invoice_number: 'INV-FW-' + orderId.toUpperCase(),
    preparation_status: 'prepared', principal_cents: order.principal_cents,
    portal_url: live.LIVE_PORTAL_ORIGIN + '/portal/invoice/' + 'SYNTHETIC_TOKEN_ONLY_'.repeat(3),
    expires_at: new Date(nowMs + 1800000).toISOString(), capability_version: 1, replayed: false,
    receipt_authority: 'crm', order_confirmation_authority: 'website',
    payment_retry_required: false, delivery_completed: false, payment_execution_ready: false,
    execution_blockers: ['collector_source_not_enabled'] };
}
function status(paid = false) {
  const { order, ...binding } = request();
  return { ...binding, invoice_id: invoiceId, payment_state: paid ? 'paid' : 'unpaid',
    totals: { invoice_principal_cents: order.principal_cents, paid_principal_cents: paid ? 60000 : 0,
      surcharge_collected_cents: paid ? 1800 : 0, gross_collected_cents: paid ? 61800 : 0,
      refunded_principal_cents: 0, refunded_surcharge_cents: 0, gross_refunded_cents: 0,
      balance_due_cents: paid ? 0 : 60000 }, payment_preference: null, payment_pending: false,
    review_required: false, original_paid_evidence: paid ? { paid: true,
      observed_at: new Date(nowMs).toISOString(), principal_cents: 60000,
      surcharge_collected_cents: 1800, gross_collected_cents: 61800,
      payment_ids: ['d438a811-30ae-4b3a-9ca7-2bc7419d0003'] } : null,
    payment_retry_required: false, receipt_authority: 'crm', order_confirmation_authority: 'website',
    delivery_completed: false, fulfillment_ready: paid, observation_revision: paid ? 2 : 1,
    verification_source: 'crm_ledger' };
}
function statusRequest(revision = null) {
  const { order, ...binding } = request();
  return { ...binding, invoice_id: invoiceId, known_revision: revision };
}

test('preparation DTO rejects raw capability material, customer details and wrong-origin links', () => {
  assert.equal(live.validateLivePrepareReceipt(preparation(), request()).invoice_id, invoiceId);
  for (const extra of [{ token_encrypted: 'private' }, { customer: request().order.contact },
    { stripe_client_secret: 'pi_SYNTHETIC_secret_ONLY' }, { provider: { account: 'private' } }]) {
    assert.throws(() => live.validateLivePrepareReceipt({ ...preparation(), ...extra }, request()));
  }
  for (const patch of [{ account_id: sandbox.SANDBOX_ACCOUNT },
    { portal_url: preparation().portal_url.replace('admin.angeltreeservices.org', 'evil.invalid') },
    { portal_url: preparation().portal_url + '?customer=private' },
    { invoice_number: 'TEST-FW2-' + orderId }, { invoice_number: 'INV-FW-' + invoiceId.toUpperCase() }, { principal_cents: 1 },
    { payment_execution_ready: true }, { execution_blockers: [] },
    { order_confirmation_authority: 'crm' }, { receipt_authority: 'website' }]) {
    assert.throws(() => live.validateLivePrepareReceipt({ ...preparation(), ...patch }, request()));
  }
});

test('status DTO whitelist rejects customer, provider and capability leaks at every exposed level', () => {
  assert.equal(live.validateLiveStatusReceipt(status(true), statusRequest()).fulfillment_ready, true);
  for (const extra of [{ customer: request().order.contact }, { stripe_event_id: 'evt_SYNTHETIC' },
    { portal_url: preparation().portal_url }, { token_encrypted: 'private' }]) {
    assert.throws(() => live.validateLiveStatusReceipt({ ...status(true), ...extra }, statusRequest()));
  }
  for (const field of ['totals', 'original_paid_evidence']) {
    for (const extra of [{ stripe_payment_intent_id: 'pi_SYNTHETIC' }, { email: 'private@example.invalid' }]) {
      const value = status(true); Object.assign(value[field], extra);
      assert.throws(() => live.validateLiveStatusReceipt(value, statusRequest()));
    }
  }
});

test('preference and a success return cannot authorize money or fulfillment', () => {
  for (const preference of live.LIVE_PAYMENT_POLICY.channels) {
    const value = { ...status(), payment_preference: preference };
    assert.equal(live.validateLiveStatusReceipt(value, statusRequest()).fulfillment_ready, false);
    assert.throws(() => live.validateLiveStatusReceipt({ ...value, fulfillment_ready: true }, statusRequest()));
  }
  for (const extra of [{ payment: 'success' }, { session_id: 'cs_SYNTHETIC' }, { paid: true }]) {
    assert.throws(() => live.validateLiveStatusReceipt({ ...status(), ...extra }, statusRequest()));
  }
  assert.throws(() => live.validateLiveStatusReceipt({ ...status(true), original_paid_evidence: null }, statusRequest()));
});

test('pending refunds, disputes and returned money cannot retain fulfillment or request another payment', () => {
  for (const patch of [{ payment_state: 'processing', payment_pending: true, review_required: true },
    { payment_state: 'disputed', review_required: true },
    { payment_state: 'refunded', review_required: true }]) {
    const value = { ...status(true), ...patch, observation_revision: 3, fulfillment_ready: false };
    if (patch.payment_state === 'refunded') Object.assign(value.totals, {
      paid_principal_cents: 0, balance_due_cents: 60000,
      refunded_principal_cents: 60000, refunded_surcharge_cents: 1800, gross_refunded_cents: 61800,
    });
    assert.equal(live.validateLiveStatusReceipt(value, statusRequest(), status(true)).fulfillment_ready, false);
    assert.throws(() => live.validateLiveStatusReceipt({ ...value, fulfillment_ready: true }, statusRequest()));
    assert.throws(() => live.validateLiveStatusReceipt({ ...value, payment_retry_required: true }, statusRequest()));
    if (patch.payment_state !== 'processing') {
      assert.throws(() => live.validateLiveStatusReceipt({ ...value, review_required: false }, statusRequest()));
    }
  }
});

test('paid evidence cannot be erased, replaced or overwritten by a replay', () => {
  const previous = status(true);
  for (const patch of [{ original_paid_evidence: null },
    { original_paid_evidence: { ...previous.original_paid_evidence, observed_at: new Date(nowMs + 1).toISOString() } },
    { original_paid_evidence: { ...previous.original_paid_evidence, payment_ids: [invoiceId] } },
    { observation_revision: 1 }, { account_id: sandbox.SANDBOX_ACCOUNT },
    { snapshot_hash: '0'.repeat(64) }, { invoice_id: orderId }]) {
    assert.throws(() => live.validateLiveStatusReceipt({ ...status(true), observation_revision: 3, ...patch }, statusRequest(), previous));
  }
  assert.throws(() => live.validateLiveStatusReceipt({ ...status(true), payment_preference: 'card' }, statusRequest(), previous));
  assert.throws(() => live.validateLiveStatusReceipt(status(), statusRequest(2)));
  assert.deepEqual(live.validateLiveStatusReceipt(status(true), statusRequest(), previous), previous);
});

const handlerConfig = () => ({ enabled: true, profile: 'live', mode: 'live', contract: live.LIVE_HANDOFF_CONTRACT,
  sourceId: live.LIVE_HANDOFF_SOURCE, environmentId: live.LIVE_HANDOFF_ENVIRONMENT,
  accountId: live.LIVE_ACCOUNT, portalOrigin: live.LIVE_PORTAL_ORIGIN, websiteOrigin: live.LIVE_WEBSITE_ORIGIN,
  termsHash: live.LIVE_TERMS_HASH, paymentPolicyHash: live.LIVE_PAYMENT_POLICY_HASH,
  keyId: 'SYNTHETIC-REVIEW-KEY', signingSecret: secret,
  encryptionKey: Buffer.alloc(32, 8), collectorReady: false });
const scope = () => ({ contract: live.LIVE_HANDOFF_CONTRACT, source_id: live.LIVE_HANDOFF_SOURCE,
  environment_id: live.LIVE_HANDOFF_ENVIRONMENT, account_id: live.LIVE_ACCOUNT, mode: 'live', livemode: true,
  terms_hash: live.LIVE_TERMS_HASH, payment_policy_hash: live.LIVE_PAYMENT_POLICY_HASH });
function signedRequest({ url = live.LIVE_PORTAL_ORIGIN + live.LIVE_PREPARE_PATH,
  method = 'POST', raw = JSON.stringify(request()), headers = {}, signature } = {}) {
  return new Request(url, { method, headers: { 'content-type': 'application/json',
    'x-ats-key-id': handlerConfig().keyId, 'x-ats-timestamp': timestamp,
    'x-ats-signature': signature ?? live.signLiveHandoff(raw, timestamp, secret, live.LIVE_PREPARE_PATH),
    ...headers }, ...(method === 'GET' ? {} : { body: raw }) });
}
const invoke = (incoming, db, extra = {}) => handleLiveHandoff(incoming, { config: handlerConfig(), db,
  now: () => nowMs, parsePrepare: (value, settings) => live.parseLivePrepareRequest(value, { ...settings, allowSyntheticContacts: true }), ...extra });

test('handler rejects untrusted hosts, forwarded-host tricks, wrong method and unsigned traffic before DB use', async () => {
  let called = 0; const db = { async call() { called++; throw Error('must not reach DB'); } };
  for (const input of [
    { url: 'https://evil.invalid' + live.LIVE_PREPARE_PATH, headers: { 'x-forwarded-host': 'admin.angeltreeservices.org' } },
    { url: live.LIVE_PORTAL_ORIGIN + live.LIVE_PREPARE_PATH, headers: { host: 'evil.invalid' } },
    { url: 'http://127.0.0.1:3138' + live.LIVE_PREPARE_PATH, headers: { host: '127.0.0.1:3138', 'x-forwarded-host': 'admin.angeltreeservices.org' } },
    { url: live.LIVE_PORTAL_ORIGIN + live.LIVE_PREPARE_PATH + '?source=other' },
    { method: 'GET' }, { headers: { 'x-ats-key-id': 'WRONG-KEY' } },
    { signature: 'v1=' + '0'.repeat(64) }, { headers: { 'x-ats-timestamp': String(Number(timestamp) - 301) } },
  ]) {
    const result = await invoke(signedRequest(input), db);
    assert.ok(result.status === 400 || result.status === 401); assert.equal(called, 0);
  }
});

test('body byte cap and invalid encoding stop before source lookup', async () => {
  let called = 0; const db = { async call() { called++; throw Error('must not reach DB'); } };
  for (const input of [
    { raw: 'x'.repeat(16385), signature: 'v1=' + 'a'.repeat(64) },
    { headers: { 'content-length': '20000' } },
    { headers: { 'content-type': 'text/plain' } },
  ]) assert.ok([413, 422].includes((await invoke(signedRequest(input), db)).status));
  const malformed = new Request(live.LIVE_PORTAL_ORIGIN + live.LIVE_PREPARE_PATH, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ats-key-id': handlerConfig().keyId }, body: new Uint8Array([0xff]) });
  assert.equal((await invoke(malformed, db)).status, 422); assert.equal(called, 0);
});

test('source-mode/account/policy swap cannot reach prepare or disclose internal DB failures', async () => {
  for (const patch of [{ livemode: false }, { account_id: sandbox.SANDBOX_ACCOUNT },
    { source_id: sandbox.HANDOFF_SOURCE }, { environment_id: 'staging' },
    { terms_hash: sandbox.policyHash }, { payment_policy_hash: '0'.repeat(64) }]) {
    const calls = []; const db = { async call(name) { calls.push(name); return { ...scope(), ...patch }; } };
    assert.equal((await invoke(signedRequest(), db)).status, 503);
    assert.deepEqual(calls, ['get_firewood_live_handoff_context']);
  }
  const result = await invoke(signedRequest(), { async call() { throw Error('PRIVATE_customer@example.invalid_PRIVATE_KEY'); } });
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /PRIVATE|customer@/u);
});

test('even a signed prepare cannot return private receipt fields or bypass the closed collector', async () => {
  async function perform(extra) {
    return invoke(signedRequest(), { async call(name, args) {
      if (name === 'get_firewood_live_handoff_context') return scope();
      assert.equal(name, 'prepare_firewood_live_handoff');
      const { portal_url, ...receipt } = preparation();
      return { ...receipt, token_encrypted: args.p_capability.token_encrypted, ...extra };
    } });
  }
  const closed = await perform({ payment_execution_ready: true, execution_blockers: [] });
  assert.equal(closed.status, 201); const value = await closed.json();
  assert.equal(value.payment_execution_ready, false); assert.equal('token_encrypted' in value, false);
  assert.deepEqual(value.execution_blockers, ['collector_runtime_not_enabled']);
  for (const extra of [{ customer_email: 'private@example.invalid' }, { stripe_client_secret: 'private' }]) {
    const rejected = await perform(extra); assert.equal(rejected.status, 503);
    assert.doesNotMatch(await rejected.text(), /private|customer_email|stripe_client_secret/u);
  }
});

function collectorContext() {
  return { ...scope(), managed: true, invoice_id: invoiceId, order_id: orderId, allowed: true,
    already_paid: false, review_required: false, receipt_authority: 'crm', surcharge_reporting: true };
}

test('collector candidate rejects cross-invoice authority and every uncertain financial state', () => {
  const valid = collectorContext();
  assert.equal(validateLiveCollectorContext(valid, invoiceId).invoiceId, invoiceId);
  for (const patch of [{ managed: false }, { invoice_id: orderId }, { order_id: 'bad' },
    { mode: 'sandbox' }, { livemode: false }, { account_id: sandbox.SANDBOX_ACCOUNT },
    { source_id: sandbox.HANDOFF_SOURCE }, { receipt_authority: 'website' },
    { allowed: false }, { already_paid: true }, { already_paid: undefined },
    { review_required: true }, { review_required: undefined }, { surcharge_reporting: false }]) {
    assert.throws(() => validateLiveCollectorContext({ ...valid, ...patch }, invoiceId));
  }
});

test('live surcharge rejects ineligible classifications and incorrect fee amounts', () => {
  const policy = validateLiveCollectorContext(collectorContext(), invoiceId);
  assert.deepEqual(liveSurchargeFields(policy, { principalCents: 60000, surchargeCents: 1800, funding: 'credit', country: 'US' }),
    { amount: 1800, enforce_validation: 'enabled' });
  for (const [funding, country] of [['debit', 'US'], ['prepaid', 'US'], ['unknown', 'US'], ['credit', 'CA'], ['credit', null]]) {
    assert.equal(liveSurchargeFields(policy, { principalCents: 60000, surchargeCents: 0, funding, country }), null);
    assert.throws(() => liveSurchargeFields(policy, { principalCents: 60000, surchargeCents: 1800, funding, country }));
  }
  for (const surchargeCents of [0, 1799, 1801, -1, NaN]) {
    assert.throws(() => liveSurchargeFields(policy, { principalCents: 60000, surchargeCents, funding: 'credit', country: 'US' }));
  }
  assert.throws(() => liveSurchargeFields({ ...policy, surchargeReporting: false }, { principalCents: 60000,
    surchargeCents: 1800, funding: 'credit', country: 'US' }));
});

test('database adapters reject invented operations and keep raw provider/customer errors private', async () => {
  let calls = 0;
  for (const adapter of [nativeLiveDatabase({ async query() { calls++; throw Error('PRIVATE_secret_customer'); } }),
    supabaseLiveDatabase({ rpc() { calls++; return { async abortSignal() { throw Error('PRIVATE_secret_customer'); } }; } })]) {
    await assert.rejects(adapter.call('approve_firewood_live_price', {}), /unsupported_operation/);
    await assert.rejects(adapter.call('get_firewood_live_handoff_context;drop table public.invoices', {}), /unsupported_operation/);
    assert.equal(calls, 0);
    await assert.rejects(adapter.call('get_firewood_live_handoff_context', { p_source: live.LIVE_HANDOFF_SOURCE }), error => {
      assert.equal(error.code, 'database_unconfirmed'); assert.doesNotMatch(error.message, /PRIVATE|customer/u); return true;
    });
    calls = 0;
  }
});

test('live invoice markers cannot fall through to the existing unmanaged collector', async () => {
  const current = load('../src/lib/firewood/handoff/collector-policy.ts', { 'server-only': {},
    './live-collector.mjs': { isLiveFirewoodInvoice } });
  let queried = 0; const db = { rpc() { queried++; throw Error('must remain closed'); } };
  for (const invoice of [{ id: invoiceId, document_terms_version: live.LIVE_TERMS_POLICY.version },
    { id: invoiceId, document_terms_version: 'firewood-household-live-future-version' },
    { id: invoiceId, invoice_number: 'INV-FW-' + orderId.toUpperCase() }]) {
    for (const livemode of [true, false]) {
      const result = await current.getFirewoodCollectorPolicy(db, invoice, livemode);
      assert.equal(result.ok, false); assert.equal(result.status, 503); assert.equal(result.reason, 'setup');
    }
  }
  assert.equal(queried, 0);
  assert.deepEqual(await current.getFirewoodCollectorPolicy(db,
    { id: invoiceId, document_terms_version: 'legacy-2026-10-22' }, true), { ok: true, policy: null });
});

test('the shipped live routes have no runtime factory regardless of signed synthetic traffic', async () => {
  const runtime = load('../src/lib/firewood/handoff/live-runtime.ts', { 'server-only': {} });
  assert.equal(runtime.getLiveHandoffDependencies(), null);
  let executed = 0;
  const dependencies = {
    '@/lib/firewood/handoff/live-runtime': runtime,
    '@/lib/firewood/handoff/live-handler.mjs': { liveHandoffUnavailable,
      handleLiveHandoff() { executed++; throw Error('runtime admission not installed'); } },
  };
  const prepared = load('../src/app/api/integrations/firewood/live/v1/prepare/route.ts', dependencies);
  for (const operation of ['prepare', 'status', 'renew']) {
    const route = operation === 'prepare' ? prepared : load('../src/app/api/integrations/firewood/live/v1/' + operation + '/route.ts',
      { ...dependencies, '../prepare/route': prepared });
    const result = await route.POST(signedRequest()); assert.equal(result.status, 503);
    assert.equal((await result.json()).payment_retry_required, false);
  }
  assert.equal(executed, 0);
});
