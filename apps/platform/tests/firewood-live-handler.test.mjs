import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handleLiveHandoff, isLiveHandoffConfiguration } from '../src/lib/firewood/handoff/live-handler.mjs';
import { nativeLiveDatabase, supabaseLiveDatabase } from '../src/lib/firewood/handoff/live-database.mjs';
import { validateLiveCollectorContext, liveSurchargeFields, isLiveFirewoodInvoice } from '../src/lib/firewood/handoff/live-collector.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from '../src/lib/firewood/handoff/live-profile.mjs';
import { LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH, LIVE_PORTAL_ORIGIN,
  LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE,
  LIVE_HANDOFF_ENVIRONMENT, LIVE_ACCOUNT, parseLivePrepareRequest, signLiveHandoff } from '../src/lib/firewood/handoff/live-contract.mjs';
import { livePrepareFixture, livePrepareReceiptFixture, liveBindingFixture, LIVE_TEST_NOW, LIVE_TEST_INVOICE } from './fixtures/firewood-live-fixture.mjs';

export function liveReviewConfig() {
  return { ...FIREWOOD_LIVE_REVIEW_PROFILE, profile: 'live', enabled: true, keyId: 'isolated-live-unit-key',
    signingSecret: randomBytes(32).toString('base64url'), encryptionKey: randomBytes(32), collectorReady: false };
}
export function liveContext() {
  return { contract: LIVE_HANDOFF_CONTRACT, source_id: LIVE_HANDOFF_SOURCE, environment_id: LIVE_HANDOFF_ENVIRONMENT,
    account_id: LIVE_ACCOUNT, mode: 'live', livemode: true, terms_hash: LIVE_TERMS_HASH,
    payment_policy_hash: LIVE_PAYMENT_POLICY_HASH, enabled: true, collector_enabled: false };
}
export function signedLiveRequest(config, input, path = LIVE_PREPARE_PATH) {
  const raw = JSON.stringify(input), timestamp = String(LIVE_TEST_NOW / 1000);
  return new Request(LIVE_PORTAL_ORIGIN + path, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-ats-key-id': config.keyId, 'x-ats-timestamp': timestamp,
    'x-ats-signature': signLiveHandoff(raw, timestamp, config.signingSecret, path) }, body: raw });
}
const parseSynthetic = (value, options) => parseLivePrepareRequest(value, { ...options, allowSyntheticContacts: true });

test('isolated candidate prepares once, replays same invoice, renews same invoice, and observes only the ledger', async () => {
  const config = liveReviewConfig(), input = livePrepareFixture(); let stored = null, version = 1, prepares = 0;
  const operations = [];
  const db = { async call(name, args) {
    operations.push(name);
    if (name === 'get_firewood_live_handoff_context') return liveContext();
    if (name === 'prepare_firewood_live_handoff') {
      const replayed = stored !== null;
      if (!stored) { stored = structuredClone(args.p_capability); prepares++; }
      const { portal_url, ...receipt } = livePrepareReceiptFixture(input);
      return { ...receipt, replayed, token_encrypted: stored.token_encrypted, capability_version: version };
    }
    if (name === 'renew_firewood_live_handoff') {
      assert.equal(args.p_invoice, LIVE_TEST_INVOICE); assert.equal(args.p_version, version);
      stored = structuredClone(args.p_capability); version++;
      const { portal_url, ...receipt } = livePrepareReceiptFixture(input);
      return { ...receipt, replayed: true, token_encrypted: stored.token_encrypted, capability_version: version };
    }
    if (name === 'read_firewood_live_handoff') return { invoice: { total_cents: 60000, balance_due_cents: 60000, status: 'sent', payment_preference: 'ach' },
      payments: [], attempts: [], refunds: [], original_paid_evidence: null, ledger_hash: 'a'.repeat(64) };
    if (name === 'record_firewood_live_handoff_observation') return { financial: args.p_financial, observation_revision: 1 };
    throw Error('Unexpected operation');
  } };
  const deps = { config, db, now: () => LIVE_TEST_NOW, parsePrepare: parseSynthetic };
  const first = await handleLiveHandoff(signedLiveRequest(config, input), deps);
  assert.equal(first.status, 201); const receipt = await first.json();
  assert.equal(receipt.invoice_number, 'INV-FW-' + input.order_id.toUpperCase());
  assert.equal(receipt.payment_execution_ready, false);
  const replay = await handleLiveHandoff(signedLiveRequest(config, input), deps);
  assert.equal(replay.status, 200); assert.equal((await replay.json()).portal_url, receipt.portal_url);
  assert.equal(prepares, 1); assert.equal(JSON.stringify(stored).includes(receipt.portal_url.split('/').at(-1)), false);
  const binding = liveBindingFixture(input);
  const renew = await handleLiveHandoff(signedLiveRequest(config, { ...binding, invoice_id: LIVE_TEST_INVOICE, expected_capability_version: 1 }, LIVE_RENEW_PATH), deps);
  assert.equal(renew.status, 200); const rotated = await renew.json();
  assert.equal(rotated.invoice_id, receipt.invoice_id); assert.equal(rotated.capability_version, 2); assert.notEqual(rotated.portal_url, receipt.portal_url);
  const status = await handleLiveHandoff(signedLiveRequest(config, { ...binding, invoice_id: LIVE_TEST_INVOICE, known_revision: null }, LIVE_STATUS_PATH), deps);
  assert.equal(status.status, 200); const observation = await status.json();
  assert.equal(observation.payment_state, 'unpaid'); assert.equal(observation.payment_preference, 'ach');
  assert.equal(observation.fulfillment_ready, false); assert.equal(observation.payment_retry_required, false);
  for (const forbidden of ['contact', 'order', 'token_encrypted', 'portal_url', 'known_revision', 'signingSecret']) assert.equal(forbidden in observation, false);
  assert.equal(operations.every(name => name.includes('firewood_live')), true);
});

test('ordinary live parser does not accept the isolated fixture option through a signed request', async () => {
  const config = liveReviewConfig(); let touched = false;
  const result = await handleLiveHandoff(signedLiveRequest(config, livePrepareFixture()), {
    config, db: { call() { touched = true; } }, now: () => LIVE_TEST_NOW });
  assert.equal(result.status, 422); assert.equal(touched, false);
  assert.equal(isLiveHandoffConfiguration({ ...config, mode: 'sandbox', accountId: 'acct_1UU9U8RAZXGe6tX0' }), false);
  for (const mode of [undefined, 'sandbox', 'test', 'production']) assert.equal(isLiveHandoffConfiguration({ ...config, mode }), false);
});

test('live collector identity and fee allocation remain distinct from sandbox and other invoices', () => {
  const context = { ...liveContext(), managed: true, allowed: true, invoice_id: LIVE_TEST_INVOICE,
    order_id: livePrepareFixture().order_id, receipt_authority: 'crm', surcharge_reporting: true, already_paid: false, review_required: false };
  const policy = validateLiveCollectorContext(context, LIVE_TEST_INVOICE);
  for (const principalCents of [30000, 45000, 60000, 84000, 99000]) {
    const surchargeCents = Math.round(principalCents * .03);
    assert.deepEqual(liveSurchargeFields(policy, { principalCents, surchargeCents, funding: 'credit', country: 'US' }), { amount: surchargeCents, enforce_validation: 'enabled' });
    for (const funding of ['debit', 'prepaid', 'unknown', 'ach', 'cash']) {
      assert.equal(liveSurchargeFields(policy, { principalCents, surchargeCents: 0, funding, country: 'US' }), null);
      assert.throws(() => liveSurchargeFields(policy, { principalCents, surchargeCents, funding, country: 'US' }));
    }
  }
  for (const patch of [{ allowed: false }, { account_id: 'acct_other' }, { source_id: 'website_firewood_invoice_v2' },
    { livemode: false }, { review_required: true }, { already_paid: true }, { terms_hash: '0'.repeat(64) }, { invoice_id: '22222222-2222-4222-8222-222222222222' }])
    assert.throws(() => validateLiveCollectorContext({ ...context, ...patch }, LIVE_TEST_INVOICE));
  assert.equal(isLiveFirewoodInvoice({ invoice_number: 'INV-FW-' + context.order_id.toUpperCase() }), true);
  assert.equal(isLiveFirewoodInvoice({ document_terms_version: 'firewood-household-live-future' }), true);
  assert.equal(isLiveFirewoodInvoice({ invoice_number: 'INV-20261030-001' }), false);
});

test('database adapters allow only fixed live operations and sanitize internal errors', async () => {
  let calls = 0;
  const native = nativeLiveDatabase({ async query(query) { calls++; assert.match(query.text, /^select public\.read_firewood_live_handoff\(/); throw { message: 'customer-secret@example.invalid', details: 'sensitive internal details' }; } });
  await assert.rejects(native.call('read_firewood_live_handoff', {}), error => error.code === 'database_unconfirmed' && !error.message.includes('@'));
  for (const name of ['__proto__', 'toString', 'read_firewood_handoff', 'approve_firewood_live_price', 'read_firewood_live_handoff;select']) await assert.rejects(native.call(name, {}));
  assert.equal(calls, 1);
  const remote = supabaseLiveDatabase({ rpc(name) { assert.equal(name, 'get_firewood_live_handoff_context'); return { abortSignal() { return Promise.resolve({ data: liveContext(), error: null }); } }; } });
  assert.deepEqual(await remote.call('get_firewood_live_handoff_context', {}), liveContext());
});
