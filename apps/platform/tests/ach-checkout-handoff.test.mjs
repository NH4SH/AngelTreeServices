import * as preference from '../src/lib/payments/payment-preference.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import { achCheckoutPaymentMethodTypes } from '../src/lib/payments/ach-checkout.ts';

const checkout = load('../src/lib/stripe/invoice-checkout.ts', {
  'server-only': {}, '@/lib/payments/checkout-closure': closure,
  '@/lib/payments/ach-checkout': { achCheckoutPaymentMethodTypes },
});
const invoice = '00000000-0000-4000-8000-000000000001', customer = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003', other = '00000000-0000-4000-8000-000000000004';
const row = (changes = {}) => ({ id, invoice_id: invoice, customer_id: customer, organization_id: null,
  status: 'creating', payment_channel: 'ach', invoice_principal_cents: 1000, amount_cents: 1000, total_charge_cents: 1000,
  currency: 'usd', stripe_checkout_session_id: null, stripe_payment_intent_id: null, submitted_at: null,
  checkout_url: null, expires_at: null, created_at: '2026-10-20T00:00:00Z', ...changes });
const session = (changes = {}) => ({ id: 'cs_fixture', mode: 'payment', status: 'open', payment_status: 'unpaid', livemode: false,
  metadata: { invoice_id: invoice, checkout_reservation_id: id, payment_channel: 'ach' }, client_reference_id: invoice,
  amount_total: 1000, currency: 'usd', payment_intent: null, expires_at: 1792600000,
  url: 'https://checkout.example.invalid/session', ...changes });
function fixture(options = {}) {
  const rows = options.active ? [structuredClone(options.active)] : [], calls = [], provider = [];
  let remote = options.session ?? session(), faulted = false;
  const db = { from() {
    let operation = 'lookup', values; const filters = [];
    const q = { select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
      is(k, v) { filters.push(r => r[k] === v); return q; },
      in(k, v) { filters.push(r => v.includes(r[k])); return q; }, order() { return q; }, limit() { return q; },
      insert(v) { operation = 'insert'; values = v; return q; }, update(v) { operation = 'publish'; values = v; return q; },
      single() { return run(); }, maybeSingle() { return run(); }, then(resolve, reject) { return run().then(resolve, reject); } };
    async function run() {
      calls.push({ operation, values });
      if (options.throwAt === operation) throw Error('private diagnostic');
      let data = rows.find(r => filters.every(f => f(r))) ?? null;
      if (operation === 'insert') { data = row({ ...values, ...options.insertChanges }); rows.push(data); }
      if (operation === 'publish' && data) { Object.assign(data, values); data = { id: data.id }; }
      const normal = { data, error: null };
      if (operation === options.faultAt && (!options.faultOnce || !faulted)) {
        faulted = true; return typeof options.receipt === 'function' ? options.receipt(normal) : options.receipt;
      }
      return normal;
    }
    return q;
  } };
  const stripe = { checkout: { sessions: {
    async create(params, request) {
      provider.push({ operation: 'create', params, request });
      if (options.providerThrows) throw Error('private provider diagnostic');
      if (options.createdSession) remote = options.createdSession;
      return remote;
    },
    async retrieve() { provider.push({ operation: 'retrieve' }); return remote; },
    async expire() { provider.push({ operation: 'expire' }); remote = { ...remote, status: 'expired' }; return remote; },
  } } };
  const input = { invoiceId: invoice, customerId: customer, organizationId: null, amountCents: 1000,
    invoiceNumber: 'SYNTHETIC', portalUrl: 'https://crm.example.invalid/portal/invoice/synthetic', livemode: false, supabase: db, stripe };
  return { input, rows, calls, provider, run: () => checkout.createOrReuseInvoiceCheckout(input) };
}

test('confirmed creation binds one reservation and uses its original provider idempotency key', async () => {
  const f = fixture(); const result = await f.run();
  assert.deepEqual(result, { ok: true, reused: false, url: session().url }); assert.equal(f.rows[0].status, 'open');
  assert.equal(f.provider[0].request.idempotencyKey, 'angel-tree-invoice-checkout-' + id);
  assert.deepEqual(f.provider[0].params.payment_method_types, ['us_bank_account']);
  assert.equal(f.provider[0].params.line_items[0].price_data.unit_amount, 1000);
});
for (const [name, receipt] of Object.entries({ empty: { data: {}, error: null }, wrong: { data: { id: other }, error: null },
  absent: { data: null, error: null }, missingError: { data: { id } }, array: { data: [{ id }], error: null } })) {
  test(`unconfirmed save never releases a payment URL: ${name}`, async () => {
    const f = fixture({ faultAt: 'publish', receipt }); const result = await f.run();
    assert.equal(result.ok, false); assert.equal(result.url, undefined); assert.equal(f.provider.length, 1);
  });
}
for (const [name, receipt] of Object.entries({ empty: {}, missingError: { data: null },
  incomplete: { data: { id }, error: null }, array: { data: [], error: null },
  foreign: { data: row({ invoice_id: other, status: 'open', stripe_checkout_session_id: 'cs_fixture' }), error: null } })) {
  test(`unconfirmed active lookup cannot authorize insert or provider work: ${name}`, async () => {
    const f = fixture({ faultAt: 'lookup', receipt }); assert.equal((await f.run()).ok, false);
    assert.equal(f.provider.length, 0); assert.equal(f.calls.some(c => c.operation === 'insert'), false);
  });
}
for (const [name, changes] of Object.entries({ wrongInvoice: { invoice_id: other }, wrongCustomer: { customer_id: other },
  wrongOrganization: { organization_id: other }, wrongAmount: { invoice_principal_cents: 900 },
  wrongGross: { total_charge_cents: 1100 }, wrongCurrency: { currency: 'eur' }, wrongChannel: { payment_channel: 'card' },
  wrongState: { status: 'open' }, alreadyBound: { stripe_checkout_session_id: 'cs_prior' },
  submitted: { submitted_at: '2026-10-20T00:00:00Z' }, missingSubmission: { submitted_at: undefined } })) {
  test(`insert must confirm the requested new reservation before Stripe: ${name}`, async () => {
    const f = fixture({ insertChanges: changes }); assert.equal((await f.run()).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const [name, changes] of Object.entries({ wrongInvoice: { metadata: { invoice_id: other, checkout_reservation_id: id, payment_channel: 'ach' } },
  wrongReservation: { metadata: { invoice_id: invoice, checkout_reservation_id: other, payment_channel: 'ach' } },
  missingChannel: { metadata: { invoice_id: invoice, checkout_reservation_id: id } },
  wrongReference: { client_reference_id: other }, wrongAmount: { amount_total: 999 }, wrongCurrency: { currency: 'eur' },
  wrongMode: { mode: 'setup' }, wrongLiveMode: { livemode: true }, paid: { payment_status: 'paid' },
  complete: { status: 'complete' }, badIntent: { payment_intent: {} }, missingIntent: { payment_intent: undefined } })) {
  test(`mismatched new provider response retains the creating guard: ${name}`, async () => {
    const f = fixture({ session: session(changes) }); const result = await f.run();
    assert.equal(result.ok, false); assert.equal(result.url, undefined); assert.equal(f.rows[0].status, 'creating');
    assert.equal(f.calls.some(c => c.operation === 'publish'), false);
    assert.equal((await f.run()).ok, false); assert.equal(f.provider.length, 1);
  });
}
test('lost insert response retains one creating reservation and makes no provider call on retry', async () => {
  const f = fixture({ faultAt: 'insert', faultOnce: true, receipt: {} });
  assert.equal((await f.run()).ok, false); assert.equal((await f.run()).ok, false);
  assert.equal(f.rows.length, 1); assert.equal(f.provider.length, 0);
});
test('lost publication response reuses the same bound checkout without a second create', async () => {
  const f = fixture({ faultAt: 'publish', faultOnce: true, receipt: {} });
  assert.equal((await f.run()).ok, false);
  assert.deepEqual(await f.run(), { ok: true, reused: true, url: session().url });
  assert.equal(f.rows.length, 1); assert.equal(f.provider.filter(p => p.operation === 'create').length, 1);
});
test('provider uncertainty retains the original guard and does not create a second session', async () => {
  const f = fixture({ providerThrows: true }); assert.equal((await f.run()).ok, false); assert.equal((await f.run()).ok, false);
  assert.equal(f.rows.length, 1); assert.equal(f.provider.length, 1);
});
test('known session without a URL is retained for staff recovery and never re-created', async () => {
  const f = fixture({ session: session({ url: null }) }); assert.equal((await f.run()).ok, false);
  assert.equal(f.rows[0].stripe_checkout_session_id, 'cs_fixture'); assert.equal(f.rows[0].status, 'creating');
  assert.equal((await f.run()).ok, false); assert.equal(f.provider.length, 1);
});
for (const intent of ['pi_fixture', { id: 'pi_fixture' }, null]) {
  test(`canonical nullable/expandable intent response is retained: ${JSON.stringify(intent)}`, async () => {
    const f = fixture({ session: session({ payment_intent: intent }) }); assert.equal((await f.run()).ok, true);
    assert.equal(f.rows[0].stripe_payment_intent_id, typeof intent === 'string' ? intent : intent?.id ?? null);
  });
}
for (const throwAt of ['lookup', 'insert', 'publish']) {
  test(`transport failure stays a safe unavailable result: ${throwAt}`, async () => {
    const f = fixture({ throwAt }); const result = await f.run(); assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes('private'), false);
  });
}
test('the actual portal route returns no URL for unconfirmed publication', async () => {
  const f = fixture({ faultAt: 'publish', receipt: { data: {}, error: null } });
  f.input.supabase.rpc = async () => ({ data: [{invoice_id:invoice,preference_changed:true}], error: null });
  const route = load('../src/app/api/portal/invoice/[token]/checkout/route.ts', {
    '@/lib/payments/payment-preference':preference,
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@/lib/payments/portal-card-context': { getPortalPaymentContext: async () => ({ ok: true, invoicePrincipalCents: 1000,
      invoice: { id: invoice, customer_id: customer, organization_id: null, invoice_number: 'SYNTHETIC' }, supabase: f.input.supabase }) },
    '@/lib/portal/tokens': { hashPortalToken: () => 'a'.repeat(64) },
    '@/lib/stripe/invoice-checkout': checkout,
    '@/lib/stripe/server': { getStripeServerConfig: () => ({ configured: true, stripe: f.input.stripe, livemode: false, appBaseUrl: 'https://crm.example.invalid' }) },
    '@/lib/security/rate-limit': { enforceSharedRateLimit: async () => ({ available: true, allowed: true }) },
  });
  const response = await route.POST(new Request('https://crm.example.invalid/api/local', {
    method: 'POST', headers: { origin: 'https://crm.example.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ method: 'ach' }),
  }), { params: Promise.resolve({ token: 'synthetic' }) });
  assert.equal(response.status, 503); assert.equal((await response.json()).url, undefined);
  assert.ok(f.calls.some(c=>c.operation==='publish'),'route must reach publication after a confirmed preference');
});
test('a current open checkout is verified and reused without creating another', async () => {
  const f = fixture({ active: row({ status: 'open', stripe_checkout_session_id: 'cs_fixture' }) });
  assert.deepEqual(await f.run(), { ok: true, reused: true, url: session().url });
  assert.deepEqual(f.provider.map(p => p.operation), ['retrieve']);
});
for (const [name, changes] of Object.entries({ amount: { amount_cents: 900, invoice_principal_cents: 900, total_charge_cents: 900 },
  customer: { customer_id: other }, organization: { customer_id: null, organization_id: other }, currency: { currency: 'eur' } })) {
  test(`a stale open checkout is closed before a replacement uses current ${name}`, async () => {
    const active = row({ ...changes, id: other, status: 'open', stripe_checkout_session_id: 'cs_old' });
    const remote = session({ id: 'cs_old', metadata: { invoice_id: invoice, checkout_reservation_id: other, payment_channel: 'ach' },
      amount_total: active.total_charge_cents, currency: active.currency });
    const f = fixture({ active, session: remote, createdSession: session() });
    if (name === 'organization') { f.input.customerId = null; f.input.organizationId = customer; }
    assert.equal((await f.run()).ok, true); assert.equal(f.rows[0].status, 'expired');
    assert.deepEqual(f.provider.map(p => p.operation), ['retrieve', 'expire', 'create']); assert.equal(f.rows.length, 2);
  });
}
for (const status of ['creating', 'processing']) {
  test(`an existing ${status} reservation blocks another provider create`, async () => {
    const f = fixture({ active: row({ status }) }); assert.equal((await f.run()).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const url of ['javascript:alert(1)', 'http://checkout.example.invalid/session', 'https://user:password@checkout.example.invalid', '/relative', 123]) {
  test(`an unusable checkout URL is never returned: ${url}`, async () => {
    const f = fixture({ session: session({ url }) }); const result = await f.run();
    assert.equal(result.ok, false); assert.equal(result.url, undefined); assert.equal(f.rows[0].status, 'creating');
  });
}
test('custom HTTPS checkout domains remain supported', async () => {
  const url = 'https://payments.example.invalid/custom-session';
  assert.equal((await fixture({ session: session({ url }) }).run()).url, url);
});
test('a unique reservation race rereads the existing guard and never creates twice', async () => {
  const f = fixture({ faultAt: 'insert', receipt: { data: null, error: { code: '23505' } } });
  assert.equal((await f.run()).ok, false); assert.equal(f.rows.length, 1); assert.equal(f.provider.length, 0);
  assert.equal(f.calls.filter(c => c.operation === 'lookup').length, 2);
});
test('organization-only invoices receive a confirmed bank link without a fabricated customer',async()=>{
  const f=fixture();f.input.customerId=null;f.input.organizationId=other;
  assert.equal((await f.run()).ok,true);assert.equal(f.rows[0].customer_id,null);assert.equal(f.rows[0].organization_id,other);
  assert.equal(f.provider[0].params.metadata.organization_id,other);assert.equal(f.provider[0].params.metadata.customer_id,undefined);
});
test('organization-only bank links can be verified and reused',async()=>{
  const f=fixture({active:row({customer_id:null,organization_id:other,status:'open',stripe_checkout_session_id:'cs_fixture'})});
  f.input.customerId=null;f.input.organizationId=other;assert.equal((await f.run()).reused,true);
  assert.deepEqual(f.provider.map(p=>p.operation),['retrieve']);
});
for(const [customerId,organizationId]of [[null,null],[customer,other]]){
  test(`bank preparation refuses an absent or ambiguous contracting party: ${customerId}/${organizationId}`,async()=>{
    const f=fixture();f.input.customerId=customerId;f.input.organizationId=organizationId;
    assert.equal((await f.run()).ok,false);assert.equal(f.provider.length,0);
  });
}

test('new Firewood source uses a stable dynamic ACH-only allowlist without changing generic requests',async()=>{
 const f=fixture();f.input.firewoodPolicy={sourceId:'website_firewood_invoice_v2',orderId:other,accountId:'acct_1UU9U8RAZXGe6tX0',receiptAuthority:'crm',surchargeReporting:true};const r=await f.run();assert.equal(r.ok,true);const call=f.provider.find(x=>typeof x==='object'&&x.operation==='create');assert.ok(call);assert.equal(call.params.payment_method_types,undefined);assert.deepEqual(call.params.allowed_payment_method_types,['us_bank_account']);assert.match(call.params.integration_identifier,/^ats_firewood_v2_ach_[a-z]{8}$/);assert.equal(call.request.apiVersion,'2026-09-30.endive');assert.equal((await f.run()).url,r.url);assert.equal(f.provider.filter(x=>typeof x==='object'&&x.operation==='create').length,1);
});
