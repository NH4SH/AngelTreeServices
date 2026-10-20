import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import * as budget from '../src/lib/payments/checkout-budget.ts';
import * as policy from '../src/lib/payments/card-reservation-policy.ts';
import * as surcharge from '../src/lib/payments/card-surcharge.ts';

const payment = load('../src/lib/stripe/card-payment.ts', {
  'server-only': {}, '@/lib/payments/checkout-closure': closure, '@/lib/payments/checkout-budget': budget,
  '@/lib/payments/card-reservation-policy': policy, '@/lib/payments/card-surcharge': surcharge,
});
const invoice = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003', customer = '00000000-0000-4000-8000-000000000004';
const row = changes => ({ id, invoice_id: invoice, customer_id: customer, organization_id: null, status: 'open',
  payment_channel: 'card', currency: 'usd', stripe_confirmation_token_id: 'ctoken_fixture',
  stripe_checkout_session_id: null, stripe_payment_intent_id: null, submitted_at: null,
  invoice_principal_cents: 1000, surcharge_cents: 30, total_charge_cents: 1030, card_brand: 'visa', card_country: 'US',
  card_funding_type: 'credit', reviewed_at: new Date().toISOString(), ...changes });
const intent = changes => ({ id: 'pi_fixture', status: 'requires_action', livemode: false, amount: 1030, amount_received: 0, currency: 'usd',
  metadata: { invoice_id: invoice, checkout_reservation_id: id, payment_channel: 'card' },
  client_secret: 'pi_fixture_secret_SYNTHETIC_ONLY', ...changes });
function fixture(options = {}) {
  const stored = row(options.row), provider = [], calls = [];
  let faulted = false;
  const db = { from() {
    let patch; const filters = [];
    const q = { select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
      is(k, v) { filters.push(r => r[k] === v); return q; }, update(v) { patch = v; return q; },
      maybeSingle() { return run(); }, then(resolve, reject) { return run().then(resolve, reject); } };
    async function run() {
      const operation = !patch ? 'read' : patch.status === 'creating' ? 'claim' : patch.status === 'processing' ? 'save' : 'other';
      calls.push({ operation, patch });
      if (options.throwAt === operation) throw Error('private database diagnostic');
      if (operation === 'claim' && options.race) Object.assign(stored, options.race);
      let data = filters.every(f => f(stored)) ? stored : null;
      if (patch && data) { Object.assign(data, patch); data = { id: data.id }; }
      if (operation === options.faultAt && (!options.faultOnce || !faulted)) { faulted = true; return options.receipt; }
      return { data: structuredClone(data), error: null };
    }
    return q;
  } };
  const stripe = { confirmationTokens: { async retrieve() {
    provider.push('token'); if (options.tokenThrows) throw Error('private token diagnostic');
    return { id: 'ctoken_fixture', livemode: false, payment_method_preview: { type: 'card', card: { brand: 'visa', country: 'US', funding: 'credit' } }, ...options.token };
  } }, paymentIntents: { async create(params, request) {
    provider.push({ operation: 'create', params, request });
    if (options.providerThrows) throw Object.assign(Error('private provider diagnostic'), options.providerError ?? {});
    return intent(options.intent);
  } } };
  const input = { invoiceId: invoice, reviewId: id, invoicePrincipalCents: 1000, invoiceNumber: 'SYNTHETIC',
    billingEmail: null, portalUrl: 'https://crm.example.invalid/portal/invoice/synthetic', livemode: false,
    stripe, supabase: db, surchargeBps: 300, surchargeEnabled: true };
  return { input, stored, provider, calls, run: () => payment.confirmCardReview(input), creates: () => provider.filter(p => p.operation === 'create') };
}

test('confirmed review retains charge arithmetic, reservation identity and authentication handoff', async () => {
  const f = fixture(), result = await f.run(); assert.equal(result.ok, true); assert.equal(result.status, 'requires_action');
  assert.equal(result.clientSecret, intent().client_secret); assert.equal(f.stored.status, 'processing');
  assert.equal(f.creates()[0].request.idempotencyKey, 'angel-tree-card-confirm-' + id);
  assert.equal(f.creates()[0].params.amount, 1030); assert.equal(f.creates()[0].params.confirm, true);
  assert.deepEqual(f.creates()[0].params.amount_details.line_items.map(r => r.unit_cost), [1000, 30]);
  assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 1);
});
for (const [name, receipt] of Object.entries({ empty: { data: {}, error: null }, missingError: { data: { id } },
  wrong: { data: { id: other }, error: null }, array: { data: [{ id }], error: null }, absent: { data: null, error: null } })) {
  test(`unconfirmed claim prevents a charge request: ${name}`, async () => {
    const f = fixture({ faultAt: 'claim', receipt }); const result = await f.run();
    assert.equal(result.ok, false); assert.equal(result.clientSecret, undefined); assert.equal(f.creates().length, 0);
    assert.equal(f.stored.status, 'creating'); assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 0);
  });
  test(`unconfirmed save never releases client confirmation data: ${name}`, async () => {
    const f = fixture({ faultAt: 'save', receipt }); const result = await f.run();
    assert.equal(result.ok, false); assert.equal(result.clientSecret, undefined); assert.equal(f.creates().length, 1);
    assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 1);
  });
}
for (const [name, changes] of Object.entries({ wrongInvoice: { invoice_id: other }, wrongReview: { id: other },
  wrongChannel: { payment_channel: 'ach' }, missingSubmission: { submitted_at: undefined }, submitted: { submitted_at: new Date().toISOString() },
  alreadyBound: { stripe_payment_intent_id: 'pi_prior' }, invalidDate: { reviewed_at: 'not-a-date' },
  coercedPrincipal: { invoice_principal_cents: '1000' }, coercedFee: { surcharge_cents: '30' } })) {
  test(`incomplete or mismatched review cannot authorize a provider request: ${name}`, async () => {
    const f = fixture({ row: changes }); assert.equal((await f.run()).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const [name, receipt] of Object.entries({ missingError: { data: row() }, array: { data: [row()], error: null },
  error: { data: row(), error: { message: 'private diagnostic' } } })) {
  test(`unconfirmed review lookup blocks provider work: ${name}`, async () => {
    const f = fixture({ faultAt: 'read', receipt }); assert.equal((await f.run()).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const [name, changes] of Object.entries({ wrongId: { id: 'ctoken_other' }, wrongMode: { livemode: true }, missingMode: { livemode: undefined } })) {
  test(`confirmation token must match the reviewed token and configured mode: ${name}`, async () => {
    const f = fixture({ token: changes }); assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 0); assert.equal(f.stored.status, 'open');
  });
}
for (const [name, changes] of Object.entries({ wrongInvoice: { metadata: { invoice_id: other, checkout_reservation_id: id, payment_channel: 'card' } },
  wrongReview: { metadata: { invoice_id: invoice, checkout_reservation_id: other, payment_channel: 'card' } },
  wrongChannel: { metadata: { invoice_id: invoice, checkout_reservation_id: id, payment_channel: 'ach' } },
  wrongAmount: { amount: 999 }, wrongCurrency: { currency: 'eur' }, wrongMode: { livemode: true },
  unknownState: { status: 'unknown' }, missingSecret: { client_secret: undefined }, foreignSecret: { client_secret: 'pi_other_secret_SYNTHETIC_ONLY' } })) {
  test(`unconfirmed intent cannot be handed to the browser: ${name}`, async () => {
    const f = fixture({ intent: changes }); const result = await f.run();
    assert.equal(result.ok, false); assert.equal(result.clientSecret, undefined); assert.notEqual(f.stored.status, 'open');
    assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 1);
  });
}
for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'succeeded', 'canceled']) {
  test(`known Stripe status remains supported without recording a payment: ${status}`, async () => {
    const f = fixture({ intent: { status } }); const result = await f.run();
    assert.equal(result.ok, true); assert.equal(result.status, status); assert.equal(f.stored.status, 'processing');
  });
}
test('a canonical nullable client secret remains supported for processing', async () => {
  assert.equal((await fixture({ intent: { status: 'processing', client_secret: null } }).run()).ok, true);
});
for (const throwAt of ['read', 'claim', 'save']) {
  test(`transport uncertainty returns safely without another charge: ${throwAt}`, async () => {
    const f = fixture({ throwAt }); const result = await f.run(); assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(f.creates().length, throwAt === 'save' ? 1 : 0);
  });
}
test('provider uncertainty retains the claimed attempt and prevents another create', async () => {
  const f = fixture({ providerThrows: true }); assert.equal((await f.run()).ok, false); assert.equal((await f.run()).ok, false);
  assert.equal(f.stored.status, 'creating'); assert.equal(f.creates().length, 1);
});
test('a fee change before the claim prevents submission of the older reviewed amount', async () => {
  const f = fixture({ race: { total_charge_cents: 1040, surcharge_cents: 40 } });
  assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 0);
});
test('the actual portal confirmation route refuses unconfirmed ownership of an attempt', async () => {
  const f = fixture({ faultAt: 'claim', receipt: { data: {}, error: null } });
  const route = load('../src/app/api/portal/invoice/[token]/card/confirm/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@/lib/payments/payment-options': { getInvoicePaymentConfiguration: () => ({ cardEnabled: true, surchargeBps: 300, surchargeEnabled: true }) },
    '@/lib/payments/portal-card-context': { getPortalCardPaymentContext: async () => ({ ok: true, invoice: { id: invoice, invoice_number: 'SYNTHETIC' },
      invoicePrincipalCents: 1000, billingEmail: null, supabase: f.input.supabase }) },
    '@/lib/portal/tokens': { hashPortalToken: () => 'synthetic-hash' },
    '@/lib/security/rate-limit': { enforceSharedRateLimit: async () => ({ available: true, allowed: true }) },
    '@/lib/stripe/card-payment': payment,
    '@/lib/stripe/server': { getStripeServerConfig: () => ({ configured: true, stripe: f.input.stripe, livemode: false, appBaseUrl: 'https://crm.example.invalid' }) },
  });
  const response = await route.POST(new Request('https://crm.example.invalid/local', { method: 'POST',
    headers: { origin: 'https://crm.example.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ reviewId: id }) }),
    { params: Promise.resolve({ token: 'synthetic' }) });
  assert.equal(response.status, 409); assert.equal((await response.json()).clientSecret, undefined); assert.equal(f.creates().length, 0);
});
for (const [funding, country] of [['debit', 'US'], ['prepaid', 'US'], ['unknown', 'US'], ['credit', 'CA']]) {
  test(`existing no-surcharge policy is retained for ${funding}/${country}`, async () => {
    const f = fixture({ row: { card_funding_type: funding, card_country: country, surcharge_cents: 0, total_charge_cents: 1000 },
      token: { payment_method_preview: { type: 'card', card: { brand: 'visa', funding, country } } }, intent: { amount: 1000 } });
    assert.equal((await f.run()).ok, true); assert.equal(f.creates()[0].params.amount, 1000);
    assert.deepEqual(f.creates()[0].params.amount_details.line_items.map(r => r.unit_cost), [1000]);
  });
}
test('a consistently configured live-mode response remains supported using synthetic adapters', async () => {
  const f = fixture({ token: { livemode: true }, intent: { livemode: true } }); f.input.livemode = true;
  assert.equal((await f.run()).ok, true);
});
test('an expired review still expires before requesting token or money', async () => {
  const f = fixture({ row: { reviewed_at: new Date(Date.now() - policy.cardReviewLifetimeMs - 60000).toISOString() } });
  assert.equal((await f.run()).ok, false); assert.equal(f.stored.status, 'expired'); assert.equal(f.provider.length, 0);
});
test('provider error references remain review evidence without releasing the guard', async () => {
  const f = fixture({ providerThrows: true, providerError: { payment_intent: 'pi_fixture' } });
  assert.equal((await f.run()).ok, false); assert.equal(f.stored.status, 'creating'); assert.equal(f.stored.stripe_payment_intent_id, 'pi_fixture');
});
test('a client secret supplied in an error reference is never stored as an intent ID', async () => {
  const f = fixture({ providerThrows: true, providerError: { payment_intent: 'pi_fixture_secret_SYNTHETIC_ONLY' } });
  assert.equal((await f.run()).ok, false); assert.equal(f.stored.stripe_payment_intent_id, null);
});
test('missing received-amount confirmation retains only the bound reference for review', async () => {
  const f = fixture({ intent: { amount_received: undefined } });
  assert.equal((await f.run()).ok, false); assert.equal(f.stored.status, 'creating'); assert.equal(f.stored.stripe_payment_intent_id, 'pi_fixture');
});
test('a provider binding that changes before claim prevents another submission', async () => {
  const f = fixture({ race: { stripe_payment_intent_id: 'pi_existing' } });
  assert.equal((await f.run()).ok, false); assert.equal(f.creates().length, 0);
});
