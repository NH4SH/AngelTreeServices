import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_ACCEPTED_TERMS, LIVE_TERMS_HASH, LIVE_TERMS_POLICY, LIVE_PAYMENT_POLICY, LIVE_PAYMENT_POLICY_HASH,
  LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH, LIVE_PORTAL_ORIGIN,
  canonicalLiveHandoff, liveHandoffDigest, priceLiveOrder, parseLivePrepareRequest, parseLiveStatusRequest,
  parseLiveRenewRequest, normalizeLiveContact, signLiveHandoff, verifyLiveHandoffSignature,
  validateLivePrepareReceipt, validateLiveStatusReceipt } from '../src/lib/firewood/handoff/live-contract.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE, isFirewoodLiveCodeIdentity, isLiveRestrictedStripeKey } from '../src/lib/firewood/handoff/live-profile.mjs';
import { LIVE_TEST_NOW, LIVE_TEST_INVOICE, livePrepareFixture, liveBindingFixture,
  livePrepareReceiptFixture, liveStatusFixture } from './fixtures/firewood-live-fixture.mjs';

const options = { nowMs: LIVE_TEST_NOW, allowSyntheticContacts: true };
const request = () => livePrepareFixture();
const parsed = () => parseLivePrepareRequest(request(), options);
const statusRequest = input => ({ ...liveBindingFixture(input), invoice_id: LIVE_TEST_INVOICE, known_revision: null });

test('exact six customer totals preserve free delivery and one stacking charge', () => {
  for (const [quantity, expected] of [['half', [30_000, 45_000]], ['full', [45_000, 60_000]], ['two', [84_000, 99_000]]]) {
    for (const stacking of [false, true]) {
      const order = parseLivePrepareRequest(livePrepareFixture({ quantity, stacking }), options).order;
      assert.equal(order.principal_cents, expected[Number(stacking)]);
      assert.equal(order.delivery_cents, 0);
      assert.equal(order.stacking_cents, stacking ? 15_000 : 0);
      assert.equal(order.tax_cents, 0);
    }
  }
  for (const input of [{ quantity: 'quarter', stacking: false }, { quantity: 'full', stacking: 'yes' }, { quantity: 'full', stacking: false, veteran: true }]) {
    assert.throws(() => priceLiveOrder(input));
  }
});

test('live terms and explicit no-fee policy are separately hashed and deeply frozen', () => {
  assert.equal(LIVE_TERMS_HASH, 'b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482');
  assert.equal(liveHandoffDigest(LIVE_TERMS_POLICY), LIVE_TERMS_HASH);
  assert.equal(LIVE_PAYMENT_POLICY_HASH, '201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3');
  assert.equal(LIVE_PAYMENT_POLICY.credit_surcharge_bps, 300);
  for (const method of ['debit', 'prepaid', 'ach', 'offline']) assert.equal(LIVE_PAYMENT_POLICY[method + '_surcharge_bps'], 0);
  assert.equal(LIVE_PAYMENT_POLICY.credit_eligibility, 'processor_confirmed_US_credit');
  assert.equal(LIVE_PAYMENT_POLICY.surcharge_reporting, 'stripe_dedicated');
  assert.throws(() => { LIVE_PAYMENT_POLICY.channels.push('automatic_charge'); }, TypeError);
  assert.throws(() => { LIVE_ACCEPTED_TERMS.cancellationHours = 24; }, TypeError);
  assert.equal(LIVE_ACCEPTED_TERMS.clauses.length, 8);
  assert.throws(() => { LIVE_ACCEPTED_TERMS.clauses[1].text = 'Unreviewed delivery promise'; }, TypeError);
});

test('synthetic contacts need an explicit local parsing option and never pass the ordinary live parser', () => {
  assert.throws(() => parseLivePrepareRequest(request(), { nowMs: LIVE_TEST_NOW }));
  assert.equal(parsed().order.contact.email, 'firewood-live@example.invalid');
  const base = request().order.contact;
  assert.equal(normalizeLiveContact({ ...base, phone: '+1 (202) 555-0182', state: 'va' }, options).phone, '2025550182');
  assert.equal(normalizeLiveContact({ ...base, notes: 'Gate on left.\nStack by shed.' }, options).notes, 'Gate on left.\nStack by shed.');
  for (const patch of [{ email: 'bad..email@example.invalid' }, { email: 'a@@example.invalid' },
    { email: 'a@-example.invalid' }, { email: 'a@example.test' }, { email: 'a@example.com' },
    { phone: '0000000000' }, { phone: '2025550182\rBcc: no' }, { state: 'MD' }, { postal: '2240' },
    { name: 'Synthetic\u0000name' }, { notes: '\u001b[2J' }, { extra: 'untrusted' }]) {
    assert.throws(() => normalizeLiveContact({ ...base, ...patch }, options));
  }
});

test('accepted snapshots detach input and reject normalization/hash mismatch and future acceptance', () => {
  const input = request(), normalized = parseLivePrepareRequest(input, options);
  input.order.contact.name = 'Changed';
  input.order.payment_policy.channels.push('Changed');
  assert.equal(normalized.order.contact.name, 'Synthetic Live Contract');
  assert.equal(normalized.order.payment_policy.channels.includes('Changed'), false);
  assert.throws(() => { normalized.order.contact.name = 'Changed'; }, TypeError);
  assert.equal(canonicalLiveHandoff({ z: 1, a: 2 }), canonicalLiveHandoff({ a: 2, z: 1 }));
  const bad = request(); bad.order.contact.email = 'FIREWOOD-LIVE@example.invalid'; bad.snapshot_hash = liveHandoffDigest(bad.order);
  assert.throws(() => parseLivePrepareRequest(bad, options));
  bad.order.contact.email = bad.order.contact.email.toLowerCase(); bad.snapshot_hash = liveHandoffDigest(bad.order);
  assert.doesNotThrow(() => parseLivePrepareRequest(bad, options));
  bad.order.accepted_at_ms = LIVE_TEST_NOW + 300_001; bad.snapshot_hash = liveHandoffDigest(bad.order);
  assert.throws(() => parseLivePrepareRequest(bad, options));
  for (const value of [undefined, NaN, Infinity, { unknown: undefined }]) assert.throws(() => canonicalLiveHandoff(value));
});

test('ordinary price changes need an office approval shape and subsequent trusted CRM authorization', () => {
  const input = request(); input.order.wood_cents -= 1000; input.order.principal_cents -= 1000;
  input.snapshot_hash = liveHandoffDigest(input.order);
  assert.throws(() => parseLivePrepareRequest(input, options));
  input.order.office_approval = { approval_id: '22222222-2222-4222-8222-222222222222',
    approved_at_ms: LIVE_TEST_NOW - 2000, residential: true, single_discount_confirmed: true };
  input.snapshot_hash = liveHandoffDigest(input.order);
  // Parsing proves only canonical syntax. The SQL integration must independently
  // match a real office-issued approval before preparing this discounted order.
  assert.equal(parseLivePrepareRequest(input, options).order.principal_cents, 59_000);
  input.order.office_approval.single_discount_confirmed = false; input.snapshot_hash = liveHandoffDigest(input.order);
  assert.throws(() => parseLivePrepareRequest(input, options));
});

test('read-only status and link renewal retain the exact live order and invoice binding', () => {
  const input = parsed(), status = statusRequest(input);
  assert.deepEqual(parseLiveStatusRequest(status), status);
  const { known_revision, ...binding } = status;
  const renewal = { ...binding, expected_capability_version: 1 };
  assert.deepEqual(parseLiveRenewRequest(renewal), renewal);
  for (const expected_capability_version of [0, -1, '1']) assert.throws(() => parseLiveRenewRequest({ ...renewal, expected_capability_version }));
  assert.throws(() => parseLiveStatusRequest({ ...status, invoice_id: 'not-an-invoice' }));
  assert.throws(() => parseLiveStatusRequest({ ...status, known_revision: -1 }));
});

test('live signature uses a separate domain and exact path, body and five-minute clock bound', () => {
  const raw = JSON.stringify(parsed()), timestamp = String(LIVE_TEST_NOW / 1000), secret = 'S'.repeat(64);
  for (const path of [LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH]) {
    const signature = signLiveHandoff(raw, timestamp, secret, path);
    assert.equal(verifyLiveHandoffSignature({ raw, timestamp, secret, path, signature, nowMs: LIVE_TEST_NOW }), true);
    assert.equal(verifyLiveHandoffSignature({ raw, timestamp, secret, path, signature, nowMs: LIVE_TEST_NOW + 300_001 }), false);
    assert.equal(verifyLiveHandoffSignature({ raw: raw + ' ', timestamp, secret, path, signature, nowMs: LIVE_TEST_NOW }), false);
  }
  assert.throws(() => signLiveHandoff(raw, timestamp, secret, '/api/integrations/firewood/v2/prepare'));
  assert.throws(() => signLiveHandoff('🙂'.repeat(5000), timestamp, secret, LIVE_PREPARE_PATH));
});

test('prepared receipt stays held, order-numbered and pinned to the secure CRM origin', () => {
  const input = parsed(), receipt = livePrepareReceiptFixture(input);
  assert.equal(validateLivePrepareReceipt(receipt, input).portal_url.startsWith(LIVE_PORTAL_ORIGIN), true);
  for (const patch of [{ invoice_number: 'TEST-FW2-123' }, { invoice_number: 'FWL-123' },
    { portal_url: 'https://attacker.invalid/portal/invoice/' + 'A'.repeat(43) },
    { principal_cents: 1 }, { payment_execution_ready: true }, { token_encrypted: 'forbidden' }]) {
    assert.throws(() => validateLivePrepareReceipt({ ...receipt, ...patch }, input));
  }
});

test('read-only ledger statuses preserve original paid proof across pending and completed refunds', () => {
  const input = parsed(), status = statusRequest(input), unpaid = liveStatusFixture(input);
  const first = validateLiveStatusReceipt(unpaid, status);
  const paid = { ...unpaid, payment_state: 'paid', fulfillment_ready: true, observation_revision: 2,
    totals: { ...unpaid.totals, paid_principal_cents: 60_000, surcharge_collected_cents: 1800,
      gross_collected_cents: 61_800, balance_due_cents: 0 },
    original_paid_evidence: { paid: true, observed_at: new Date(LIVE_TEST_NOW).toISOString(), principal_cents: 60_000,
      surcharge_collected_cents: 1800, gross_collected_cents: 61_800,
      payment_ids: ['33333333-3333-4333-8333-333333333333'] } };
  const second = validateLiveStatusReceipt(paid, status, first);
  const pending = { ...paid, payment_state: 'processing', payment_pending: true, review_required: true,
    fulfillment_ready: false, observation_revision: 3 };
  const third = validateLiveStatusReceipt(pending, status, second);
  const refunded = { ...pending, payment_state: 'refunded', payment_pending: false, observation_revision: 4,
    totals: { ...pending.totals, paid_principal_cents: 0, balance_due_cents: 60_000,
      refunded_principal_cents: 60_000, refunded_surcharge_cents: 1800, gross_refunded_cents: 61_800 } };
  assert.deepEqual(validateLiveStatusReceipt(refunded, status, third).original_paid_evidence, second.original_paid_evidence);
  assert.throws(() => validateLiveStatusReceipt({ ...refunded, fulfillment_ready: true }, status, third));
  assert.throws(() => validateLiveStatusReceipt({ ...refunded, original_paid_evidence: null }, status, third));
  assert.throws(() => validateLiveStatusReceipt({ ...refunded, observation_revision: 1 }, status, third));
  assert.throws(() => validateLiveStatusReceipt({ ...refunded, review_required: false }, status, third));
});

test('review profile is non-loadable, fully off and has no assigned authority or credential', () => {
  assert.equal(isFirewoodLiveCodeIdentity(FIREWOOD_LIVE_REVIEW_PROFILE), true);
  assert.equal(FIREWOOD_LIVE_REVIEW_PROFILE.runtimeLoadable, false);
  assert.equal(FIREWOOD_LIVE_REVIEW_PROFILE.reviewOnly, true);
  assert.ok(Object.values(FIREWOOD_LIVE_REVIEW_PROFILE.activation).every(value => value === false));
  assert.ok(Object.values(FIREWOOD_LIVE_REVIEW_PROFILE.bindings).every(value => value === null));
  assert.throws(() => { FIREWOOD_LIVE_REVIEW_PROFILE.activation.collection = true; }, TypeError);
  assert.equal(isLiveRestrictedStripeKey('rk_live_SYNTHETIC'), true);
  for (const key of ['rk_test_SYNTHETIC', 'sk_live_SYNTHETIC', 'rkcs_live_SYNTHETIC', '', null]) assert.equal(isLiveRestrictedStripeKey(key), false);
});
