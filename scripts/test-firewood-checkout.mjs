import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openOrderStore } from './firewood-checkout/store.mjs';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { createCheckoutServer } from './firewood-checkout/server.mjs';
import { priceOrder, validateOrder, testKey, stripeParams, stripeAdapter } from './firewood-checkout/model.mjs';
const Stripe = createRequire(new URL('./firewood-checkout/package.json', import.meta.url))('stripe');

const sample = { quantity: 'full', stacking: false, name: 'Test Customer', email: 'test@example.com', phone: '2025550142', address: '123 Example Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22401', notes: 'Synthetic test, no delivery.' };
for (const [quantity, stacking, expected] of [['full', false, 45000], ['full', true, 60000], ['half', false, 30000], ['half', true, 45000], ['two', false, 84000], ['two', true, 99000]]) {
  test(`${quantity} cord ${stacking ? 'with stacking' : 'delivered'} costs ${expected / 100}, ignoring client totals`, () => {
    const order = validateOrder({ ...sample, quantity, stacking, totalCents: 1, woodCents: 1, deliveryCents: 999999 });
    assert.equal(order.quote.totalCents, expected);
    assert.equal(order.quote.deliveryCents, 0);
    assert.equal(order.quote.stackingCents, stacking ? 15000 : 0);
  });
}
test('unknown quantities, extra counts and nonboolean stacking cannot change prices', () => {
  for (const quantity of ['three', '1.5', '__proto__', 'Full cord', 2, null]) assert.throws(() => priceOrder({ quantity, stacking: false }));
  for (const stacking of ['false', 1, null]) assert.throws(() => priceOrder({ quantity: 'full', stacking }));
  assert.equal(validateOrder({ ...sample, count: 999 }).quote.totalCents, 45000);
});
test('the removed discount option cannot still lower the server price through stale or injected requests', () => {
  for (const veteran of [true, 'true', 'false', 1, {}, null]) assert.throws(() => validateOrder({ ...sample, veteran }));
  const quote = validateOrder({ ...sample, quantity: 'two', stacking: true, veteran: false, discountCents: 999999 }).quote;
  assert.equal(quote.woodCents, 84000);
  assert.equal(quote.deliveryCents, 0);
  assert.equal(quote.stackingCents, 15000);
  assert.ok(!('discountCents' in quote));
  assert.equal(quote.totalCents, 99000);
});
test('two-cord delivered pricing saves exactly 30 percent against four delivered half cords', () => {
  const baseline = priceOrder({ quantity: 'half', stacking: false }).totalCents * 4;
  const two = priceOrder({ quantity: 'two', stacking: false });
  assert.equal(baseline, 120000);
  assert.equal(two.totalCents, 84000);
  assert.equal(baseline - two.totalCents, 36000);
  assert.equal((baseline - two.totalCents) / baseline * 100, 30);
});
test('delivery address is collected without geographic eligibility, area or distance checks', () => {
  const order = validateOrder({ ...sample, city: 'Another community', state: 'MD', postal: '20814' });
  assert.equal(order.contact.city, 'Another community');
  assert.equal(order.quote.totalCents, 45000);
});
test('required contact/address formats and length limits are enforced', () => {
  for (const field of ['name', 'email', 'phone', 'address', 'city', 'state', 'postal']) assert.throws(() => validateOrder({ ...sample, [field]: '' }));
  for (const bad of [{ email: 'x' }, { phone: 'phone 123' }, { postal: 'ABC' }, { name: 'a\u0000b' }, { notes: 'a'.repeat(501) }]) assert.throws(() => validateOrder({ ...sample, ...bad }));
  assert.equal(validateOrder({ ...sample, state: 'va' }).contact.state, 'VA');
});
test('validation identifies the affected field for inline accessible recovery', () => {
  for (const [field, value] of [['phone', '123'], ['email', 'invalid'], ['postal', 'invalid'], ['name', ''], ['state', '1']]) {
    assert.throws(() => validateOrder({ ...sample, [field]: value }), error => error.field === field);
  }
});
test('live credentials and generic CRM key fallback are absent', async () => {
  for (const key of ['sk_live_fake', 'rk_live_fake', 'pk_test_fake', 'anything']) assert.throws(() => testKey(key));
  assert.equal(testKey(''), null);
  assert.equal(testKey('sk_test_fake'), 'sk_test_fake');
  assert.equal(testKey('rkcs_test_fake'), 'rkcs_test_fake');
  assert.throws(() => testKey('rkcs_live_fake'));
  assert.throws(() => createCheckoutServer({ key: 'sk_live_fake' }));
  const source = await readFile(new URL('./firewood-checkout/server.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('process.env.STRIPE_SECRET_KEY'));
});
test('Stripe request uses server prices, included delivery and stacking charged once', () => {
  const params = stripeParams(validateOrder({ ...sample, quantity: 'half', stacking: true }), 'http://127.0.0.1:5555', 'testref');
  assert.equal(params.line_items[0].price_data.unit_amount, 30000);
  assert.equal(params.line_items[1].price_data.unit_amount, 15000);
  assert.equal(params.line_items[1].quantity, 1);
  assert.ok(!params.shipping_options);
  assert.equal(params.payment_intent_data.shipping.address.line1, sample.address);
  assert.equal(params.success_url, 'http://127.0.0.1:5555/firewood/checkout/result/');
  assert.ok(!Object.keys(params).some(key => /receipt_email|automatic_tax|invoice_creation|customer_creation|payment_method_types/u.test(key)));
  assert.match(params.integration_identifier, /^firewood-local-[a-z]{8}$/u);
  assert.ok(!JSON.stringify(params.metadata).includes(sample.email));
});
test('two-cord Stripe line items include delivery and charge only optional stacking', () => {
  for (const stacking of [false, true]) {
    const params = stripeParams(validateOrder({ ...sample, quantity: 'two', stacking }), 'http://127.0.0.1:5555', 'testref');
    assert.deepEqual(params.line_items.map(item => item.price_data.unit_amount), stacking ? [84000, 15000] : [84000]);
    assert.ok(params.line_items.every(item => item.quantity === 1));
    assert.match(params.line_items[0].price_data.product_data.name, /delivery included/u);
    assert.ok(!params.line_items.some(item => item.price_data.product_data.name.startsWith('Delivery')));
    if (stacking) assert.match(params.line_items[1].price_data.product_data.name, /Stacking/u);
    assert.equal(params.line_items.reduce((total, item) => total + item.price_data.unit_amount * item.quantity, 0), stacking ? 99000 : 84000);
  }
});
const stripeSession = { id: 'cs_test_fake', livemode: false, url: 'https://checkout.stripe.com/c/pay/cs_test_fake', status: 'complete', payment_status: 'paid', amount_total: 45000, currency: 'usd', client_reference_id: 'ref', metadata: { purpose: 'firewood_test_only' } };
test('Stripe adapter requires test session and exact official hosted destination', async () => {
  for (const overrides of [{ livemode: true }, { id: 'cs_live_fake' }, { url: 'https://evil.example/cs_test_fake' }, { url: 'https://checkout.stripe.com.evil.example/cs_test_fake' }]) {
    const adapter = stripeAdapter('sk_test_fake', async () => Response.json({ ...stripeSession, ...overrides }));
    await assert.rejects(() => adapter.create(validateOrder(sample), 'http://127.0.0.1:5555', 'ref', 'attempt'));
  }
  const adapter = stripeAdapter('sk_test_fake', async (url, options) => {
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(new Headers(options.headers).get('Idempotency-Key'), 'attempt');
    return Response.json(stripeSession);
  });
  assert.equal((await adapter.create(validateOrder(sample), 'http://127.0.0.1:5555', 'ref', 'attempt')).id, 'cs_test_fake');
});
test('Stripe success verification rejects unpaid, mismatched and unbound sessions', async () => {
  for (const overrides of [{ status: 'open' }, { payment_status: 'unpaid' }, { amount_total: 1 }, { currency: 'eur' }, { client_reference_id: 'someone-else' }, { metadata: {} }]) {
    const adapter = stripeAdapter('sk_test_fake', async () => Response.json({ ...stripeSession, ...overrides }));
    if (['amount_total', 'currency', 'client_reference_id', 'metadata'].some(key => key in overrides)) await assert.rejects(() => adapter.paid('cs_test_fake', 45000, 'ref'));
    else assert.equal(await adapter.paid('cs_test_fake', 45000, 'ref'), false);
  }
  const adapter = stripeAdapter('sk_test_fake', async () => Response.json(stripeSession));
  assert.equal(await adapter.paid('cs_test_fake', 45000, 'ref'), true);
});
test('expired Stripe payment links renew once with a fresh idempotency attempt and preserved details', async t => {
  let creates = 0, expired = false;
  const attempts = [];
  const h = await harness(t, { adapter: {
    async create(order, origin, id, attempt) { creates++; attempts.push(attempt); return { id: `cs_test_${creates}`, url: `https://checkout.stripe.com/c/pay/cs_test_${creates}` }; },
    async state(id) { return { expired: expired && id === 'cs_test_1', paid: false, closed: false }; },
  } });
  const first = await h.request('start', sample);
  assert.equal((await h.request('start', sample)).value.next, first.value.next);
  assert.equal(creates, 1);
  expired = true;
  const results = await Promise.all([h.request('start', sample), h.request('start', sample)]);
  assert.equal(creates, 2);
  assert.notEqual(attempts[0], attempts[1]);
  assert.equal(results[0].value.next, results[1].value.next);
  assert.notEqual(results[0].value.next, first.value.next);
  assert.equal((await h.request('state')).value.order.contact.notes, sample.notes);
});
test('retrying completed Stripe payments goes to verification without another charge', async t => {
  for (const paid of [false, true]) {
    let creates = 0;
    const h = await harness(t, { adapter: {
      async create() { creates++; return { id: 'cs_test_closed', url: 'https://checkout.stripe.com/c/pay/cs_test_closed' }; },
      async state() { return { paid, closed: true, expired: false }; },
    } });
    await h.request('start', sample);
    const retry = await h.request('start', sample);
    if (paid) assert.equal(retry.value.next, '/firewood/checkout/result/');
    else { assert.equal(retry.response.status, 409); assert.match(retry.value.error, /still processing/u); }
    assert.equal(creates, 1);
    const state = (await h.request('state')).value;
    assert.equal(state.status, paid ? 'paid' : 'pending');
    if (paid) assert.equal(state.order, null);
  }
});
test('provider outages produce recoverable messages without exposing raw provider errors', async () => {
  const adapter = stripeAdapter('sk_test_fake', async () => { throw new Error('secret provider diagnostic'); });
  await assert.rejects(() => adapter.create(validateOrder(sample), 'http://127.0.0.1:5555', 'ref', 'attempt'), error => !error.message.includes('secret') && error.status === 502);
});

async function harness(t, options = {}) {
  const app = createCheckoutServer(options);
  const origin = await app.listen();
  t.after(() => app.close());
  let cookie = '';
  let csrf;
  async function request(path, data, custom = {}) {
    const response = await fetch(origin + '/firewood/checkout/api/' + path, {
      method: data ? 'POST' : 'GET',
      headers: { cookie, ...(data ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...custom },
      body: data ? JSON.stringify({ csrf, ...data }) : undefined,
    });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const value = await response.json();
    if (value.csrf) csrf = value.csrf;
    return { response, value };
  }
  await request('state');
  return { origin, request, app, get cookie() { return cookie; } };
}
test('local simulator completes end-to-end and clears private fields after success', async t => {
  const h = await harness(t);
  const start = await h.request('start', sample);
  assert.equal(start.value.next, '/firewood/checkout/payment/');
  assert.equal((await h.request('state')).value.order.contact.address, sample.address);
  const complete = await h.request('simulate', { outcome: 'success' });
  assert.equal(complete.response.status, 200);
  const state = (await h.request('state')).value;
  assert.equal(state.status, 'paid');
  assert.equal(state.order, null);
  assert.equal(state.receipt.totalCents, 45000);
  assert.ok(!JSON.stringify(state).includes(sample.email));
  assert.equal((await h.request('simulate', { outcome: 'success' })).response.status, 409);
  await h.request('reset', {});
  assert.equal((await h.request('state')).value.status, 'draft');
});
test('decline, cancel and retry retain original instructions and selections', async t => {
  const h = await harness(t);
  await h.request('start', { ...sample, stacking: true });
  assert.equal((await h.request('simulate', { outcome: 'decline' })).value.declined, true);
  let state = (await h.request('state')).value;
  assert.equal(state.order.contact.notes, sample.notes);
  assert.equal(state.order.quote.stacking, true);
  await h.request('start', { ...sample, quantity: 'half', stacking: true });
  state = (await h.request('state')).value;
  assert.equal(state.order.quote.totalCents, 45000);
  assert.equal(state.order.contact.notes, sample.notes);
});
test('two-cord quantity and stacking survive retry, and paid summary clears contact fields', async t => {
  const h = await harness(t);
  await h.request('start', { ...sample, quantity: 'two', stacking: true });
  await h.request('simulate', { outcome: 'decline' });
  const pending = (await h.request('state')).value;
  assert.equal(pending.order.quote.totalCents, 99000);
  assert.equal(pending.order.quote.stacking, true);
  assert.equal(pending.order.contact.notes, sample.notes);
  await h.request('start', { ...sample, quantity: 'two', stacking: true });
  await h.request('simulate', { outcome: 'success' });
  const paid = (await h.request('state')).value;
  assert.equal(paid.receipt.totalCents, 99000);
  assert.equal(paid.receipt.stacking, true);
  assert.equal(paid.order, null);
  assert.ok(!JSON.stringify(paid).includes(sample.email));
});
test('a result URL or query parameter never marks an unpaid order successful', async t => {
  const h = await harness(t);
  await h.request('start', sample);
  const result = await h.request('state?verify=1&paid=true&session_id=cs_test_fake');
  assert.equal(result.value.status, 'pending');
  assert.equal(result.value.receipt, null);
});
test('same-origin and CSRF checks reject cross-site and unbound submissions', async t => {
  const h = await harness(t);
  assert.equal((await h.request('start', sample, { Origin: 'https://angeltreeservices.org' })).response.status, 403);
  assert.equal((await h.request('start', { ...sample, csrf: 'x' })).response.status, 403);
  assert.equal((await h.request('start', sample, { 'Content-Type': 'text/plain' })).response.status, 415);
  const status = await new Promise((yes, no) => {
    const req = httpRequest(h.origin + '/firewood/checkout/', { headers: { host: 'evil.example' } }, response => {
      response.resume(); yes(response.statusCode);
    });
    req.on('error', no); req.end();
  });
  assert.equal(status, 403);
});
test('server validation returns a field identifier without losing the submitted order', async t => {
  const h = await harness(t);
  const response = await h.request('start', { ...sample, phone: '123' });
  assert.equal(response.response.status, 400);
  assert.equal(response.value.field, 'phone');
  assert.match(response.value.error, /10-digit/u);
  assert.equal((await h.request('start', sample)).response.status, 200);
});
test('expired local sessions cannot recover previous contact details or complete payment', async t => {
  let currentTime = 0;
  const h = await harness(t, { now: () => currentTime });
  await h.request('start', sample);
  currentTime = 31 * 60 * 1000;
  const state = (await h.request('state')).value;
  assert.equal(state.status, 'draft');
  assert.equal(state.order, null);
  assert.equal((await h.request('simulate', { outcome: 'success' })).response.status, 409);
});
test('identical concurrent retries share a provider session; changed pending orders are refused', async t => {
  let release;
  let calls = 0;
  const wait = new Promise(yes => { release = yes; });
  const h = await harness(t, { adapter: { async create() { calls++; await wait; return { id: 'cs_test_fake', url: 'https://checkout.stripe.com/c/pay/cs_test_fake' }; } } });
  const first = h.request('start', sample);
  // Wait for the provider call using the event loop rather than a network timing assumption.
  while (!calls) await new Promise(yes => setImmediate(yes));
  const same = h.request('start', sample);
  const changed = await h.request('start', { ...sample, quantity: 'half' });
  assert.equal(changed.response.status, 409);
  release();
  assert.equal((await first).response.status, 200);
  assert.equal((await same).response.status, 200);
  assert.equal(calls, 1);
});
test('Stripe mode verifies server-stored payment and prohibits simulated success', async t => {
  let reference;
  const h = await harness(t, { adapter: {
    async create(order, origin, id) { reference = id; return { id: 'cs_test_bound', url: 'https://checkout.stripe.com/c/pay/cs_test_bound' }; },
    async paid(id, total, ref) { return id === 'cs_test_bound' && total === 45000 && ref === reference; },
  } });
  await h.request('start', sample);
  assert.equal((await h.request('simulate', { outcome: 'success' })).response.status, 403);
  assert.equal((await h.request('state?verify=1')).value.status, 'paid');
});
test('a delayed payment result cannot confirm a subsequently changed order', async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let count = 0;
  const h = await harness(t, { adapter: {
    async create() { return { id: `cs_test_${++count}`, url: `https://checkout.stripe.com/c/pay/cs_test_${count}` }; },
    async paid(id, total) { assert.equal(id, 'cs_test_1'); assert.equal(total, 45000); enter(); await blocked; return true; },
  } });
  await h.request('start', sample);
  const oldVerification = h.request('state?verify=1');
  await entered;
  await h.request('start', { ...sample, quantity: 'half' });
  release();
  const result = (await oldVerification).value;
  assert.equal(result.status, 'pending');
  assert.equal(result.order.quote.quantity, 'half');
  assert.equal(result.receipt, null);
});
test('returning during replacement payment creation does not verify a missing session', async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let count = 0, verifications = 0;
  const h = await harness(t, { adapter: {
    async create() {
      const id = `cs_test_${++count}`;
      if (count === 2) { enter(); await blocked; }
      return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
    },
    async paid() { verifications++; return false; },
  } });
  await h.request('start', sample);
  const replacement = h.request('start', { ...sample, quantity: 'half' });
  await entered;
  const result = await h.request('state?verify=1');
  release(); await replacement;
  assert.equal(result.response.status, 200);
  assert.equal(result.value.status, 'draft');
  assert.equal(result.value.order.quote.quantity, 'half');
  assert.equal(verifications, 0);
});
async function webhookHarness(t, paid = true) {
  const signingSecret = 'whsec_localtest';
  const verifier = stripeAdapter('sk_test_fake');
  let reference, attempt;
  const h = await harness(t, { webhookSecret: signingSecret, adapter: {
    async create(order, origin, id, token) { reference = id; attempt = token; return { id: 'cs_test_webhook', url: 'https://checkout.stripe.com/c/pay/cs_test_webhook' }; },
    async paid() { return paid; },
    verifyEvent: verifier.verifyEvent,
  } });
  await h.request('start', sample);
  function event(overrides = {}) {
    return { id: 'evt_localtest', type: 'checkout.session.completed', livemode: false,
      data: { object: { id: 'cs_test_webhook', livemode: false, payment_status: 'paid', client_reference_id: reference,
        metadata: { purpose: 'firewood_test_only', attempt }, ...overrides } } };
  }
  async function post(value, validSignature = true) {
    const payload = JSON.stringify(value);
    const signature = new Stripe('sk_test_fake').webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    return fetch(h.origin + '/firewood/checkout/webhook', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Stripe-Signature': validSignature ? signature : 'invalid',
    }, body: payload });
  }
  return { ...h, event, post };
}
test('signed paid webhook confirms the bound order without a return-page visit and tolerates duplicates', async t => {
  const h = await webhookHarness(t);
  assert.equal((await h.post(h.event())).status, 200);
  const state = (await h.request('state')).value;
  assert.equal(state.status, 'paid');
  assert.equal(state.receipt.confirmedBy, 'webhook');
  assert.equal(state.order, null);
  assert.equal((await h.post(h.event())).status, 200);
  assert.deepEqual((await h.request('state')).value.receipt, state.receipt);
});
test('webhook signatures, test mode and order binding prevent false completion', async t => {
  const h = await webhookHarness(t);
  assert.equal((await h.post(h.event(), false)).status, 400);
  assert.equal((await h.post({ ...h.event(), livemode: true })).status, 400);
  for (const changed of [{ payment_status: 'unpaid' }, { livemode: true }, { id: 'cs_test_other' },
    { client_reference_id: 'another-order' }, { metadata: { purpose: 'firewood_test_only', attempt: 'wrong' } }]) {
    assert.equal((await h.post(h.event(changed))).status, 200);
    assert.equal((await h.request('state')).value.status, 'pending');
  }
});
test('a signed webhook still requires authoritative paid status and a configured signing secret', async t => {
  const h = await webhookHarness(t, false);
  assert.equal((await h.post(h.event())).status, 200);
  assert.equal((await h.request('state')).value.status, 'pending');
  const simulator = await harness(t);
  const response = await fetch(simulator.origin + '/firewood/checkout/webhook', { method: 'POST', body: '{}' });
  assert.equal(response.status, 503);
});
test('local checkout is noindex, isolated from analytics and customer estimate scripts', async t => {
  const h = await harness(t);
  const response = await fetch(h.origin + '/firewood/checkout/');
  const html = await response.text();
  assert.doesNotMatch(html, /name="veteran"|veteran-field|summary-discount/u);
  assert.match(response.headers.get('x-robots-tag'), /noindex/u);
  assert.match(response.headers.get('cache-control'), /no-store/u);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/u);
  assert.doesNotMatch(html, /ats-website|ats-consent|ats-estimate|google-analytics|googletagmanager|lead-intake/iu);
  const js = await readFile(new URL('./firewood-checkout/checkout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /localStorage|sessionStorage|dataLayer|gtag\(/u);
  const builder = await readFile(new URL('./build-public-site.py', import.meta.url), 'utf8');
  assert.doesNotMatch(builder, /firewood-checkout/u);
});

const testDirectories = [];
after(async () => { for (const directory of testDirectories) await rm(directory, { recursive: true, force: true }); });
async function diskDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'angel-firewood-test-'));
  testDirectories.push(directory);
  return directory;
}
async function storedAttempt(store, id = 'attempt1', reference = 'browser1', stacking = false) {
  await store.createAttempt(id, reference, validateOrder({ ...sample, quantity: 'two', stacking }));
  await store.bindPayment(id, { id: `cs_test_${id}`, url: `https://checkout.stripe.com/c/pay/cs_test_${id}` });
  return store.attempt(id);
}
function signedPost(origin, event) {
  const payload = JSON.stringify(event);
  const signature = new Stripe('sk_test_fake').webhooks.generateTestHeaderString({ payload, secret: 'whsec_localtest' });
  return fetch(origin + '/firewood/checkout/webhook', { method: 'POST', headers: { 'Stripe-Signature': signature }, body: payload });
}
test('paid orders, exact prices and both test confirmations survive database close and reopen', async t => {
  const directory = await diskDirectory(t);
  let store = await openOrderStore({ directory });
  const record = await storedAttempt(store, 'permanent', 'browser1', true);
  const receipt = await store.confirm(record.id, record.payment_id, 'webhook', 'evt_permanent');
  await store.drain();
  await store.close();
  store = await openOrderStore({ directory });
  t.after(() => store.close());
  const saved = await store.findOrder(receipt.orderNumber);
  assert.equal(saved.status, 'paid');
  assert.equal(saved.quote.totalCents, 99000);
  assert.equal(saved.quote.deliveryCents, 0);
  assert.equal(saved.contact.notes, sample.notes);
  const messages = await store.confirmations(saved.id);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(message => message.status === 'captured'));
  assert.equal(messages.find(message => message.audience === 'owner').message.to, 'info@angeltreeservice.org');
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
});
test('replayed and simultaneous paid events create one order and one confirmation per recipient', async t => {
  const store = await openOrderStore(); t.after(() => store.close());
  const record = await storedAttempt(store);
  const receipts = await Promise.all(Array.from({ length: 5 }, () => store.confirm(record.id, record.payment_id, 'webhook', 'evt_once')));
  await Promise.all([store.drain(), store.drain()]);
  assert.equal(new Set(receipts.map(receipt => receipt.orderNumber)).size, 1);
  assert.equal((await store.orders()).length, 1);
  const messages = await store.confirmations(record.id);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(message => message.status === 'captured' && message.tries === 1));
});
test('confirmation failure remains retryable through restart without losing or duplicating the paid order', async t => {
  const directory = await diskDirectory(t); let time = 100;
  let store = await openOrderStore({ directory, now: () => time, beforeCapture: async () => { throw new Error('private mail error'); } });
  const record = await storedAttempt(store);
  await store.confirm(record.id, record.payment_id, 'webhook', 'evt_retry');
  await store.drain();
  assert.ok((await store.confirmations(record.id)).every(message => message.status === 'pending' && message.tries === 1));
  assert.equal((await store.attempt(record.id)).status, 'paid');
  await store.close();
  store = await openOrderStore({ directory, now: () => time }); t.after(() => store.close());
  await store.drain();
  assert.ok((await store.confirmations(record.id)).every(message => message.status === 'pending'));
  time += 30001;
  await store.drain(); await store.drain();
  assert.ok((await store.confirmations(record.id)).every(message => message.status === 'captured' && message.tries === 2));
});
test('confirmation copies contain free delivery, stacking, scheduling and cancellation terms without claiming an email was sent', async t => {
  for (const stacking of [false, true]) {
    const store = await openOrderStore();
    try {
      const record = await storedAttempt(store, `terms${stacking}`, 'browser', stacking);
      await store.confirm(record.id, record.payment_id, 'local-simulator'); await store.drain();
      const messages = await store.confirmations(record.id);
      for (const { message } of messages) {
        assert.match(message.subject, /^\[TEST\]/u);
        assert.match(message.text, /Delivery: included \(free\)/u);
        assert.match(message.text, stacking ? /Stacking: \$150.00/u : /Stacking: not selected/u);
        assert.match(message.text, stacking ? /Test total: \$990.00/u : /Test total: \$840.00/u);
        assert.match(message.text, /with a delivery date within one week/u);
        assert.match(message.text, /less than 48 hours’ notice are non-refundable/u);
        assert.doesNotMatch(message.text, /delivery fee|ready to burn|guaranteed delivery|veterans/iu);
      }
      assert.match(messages.find(message => message.audience === 'customer').message.text, /No email was sent/u);
    } finally { await store.close(); }
  }
});
test('mismatched payments and an event reused for another order roll back fulfillment', async t => {
  const store = await openOrderStore(); t.after(() => store.close());
  const a = await storedAttempt(store, 'first'); const b = await storedAttempt(store, 'second');
  await assert.rejects(store.confirm(a.id, 'cs_test_other', 'webhook', 'evt_bad'));
  assert.equal((await store.attempt(a.id)).status, 'pending');
  assert.equal((await store.confirmations(a.id)).length, 0);
  await store.confirm(a.id, a.payment_id, 'webhook', 'evt_shared');
  await assert.rejects(store.confirm(b.id, b.payment_id, 'webhook', 'evt_shared'));
  assert.equal((await store.attempt(b.id)).status, 'pending');
  assert.equal((await store.confirmations(b.id)).length, 0);
});
test('database outage prevents payment creation rather than accepting an unrecorded order', async t => {
  let creates = 0;
  const store = await openOrderStore();
  const wrapper = { ...store, async createAttempt() { throw new Error('private database diagnostic'); } };
  const h = await harness(t, { store: wrapper, adapter: { async create() { creates++; } } });
  const response = await h.request('start', sample);
  assert.equal(response.response.status, 500); assert.equal(creates, 0);
  assert.doesNotMatch(response.value.error, /private database diagnostic/u);
});
test('restart preserves browser authorization and reuses the exact original pending payment', async t => {
  const directory = await diskDirectory(t);
  let creates = 0;
  const adapter = {
    async create() { creates++; return { id: 'cs_test_restart', url: 'https://checkout.stripe.com/c/pay/cs_test_restart' }; },
    async state() { return { paid: false, closed: false, expired: false }; },
  };
  let app = createCheckoutServer({ dataDirectory: directory, adapter });
  let origin = await app.listen();
  let response = await fetch(origin + '/firewood/checkout/api/state');
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const { csrf } = await response.json();
  const start = () => fetch(origin + '/firewood/checkout/api/start', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sample, quantity: 'two', stacking: true, csrf }) });
  const first = await (await start()).json();
  await app.close();
  app = createCheckoutServer({ dataDirectory: directory, adapter }); origin = await app.listen(); t.after(() => app.close());
  const restored = await (await fetch(origin + '/firewood/checkout/api/state', { headers: { Cookie: cookie } })).json();
  assert.equal(restored.csrf, csrf); assert.equal(restored.order.contact.notes, sample.notes);
  assert.equal((await (await start()).json()).next, first.next); assert.equal(creates, 1);
});
test('signed webhook fulfills a saved order after server restart and browser expiry without a return visit', async t => {
  const directory = await diskDirectory(t); let time = 0, reference, attempt;
  const adapter = {
    async create(order, origin, id, token) { reference = id; attempt = token; return { id: 'cs_test_late', url: 'https://checkout.stripe.com/c/pay/cs_test_late' }; },
    async paid() { return true; }, verifyEvent: stripeAdapter('sk_test_fake').verifyEvent,
  };
  let app = createCheckoutServer({ dataDirectory: directory, adapter, now: () => time, webhookSecret: 'whsec_localtest' });
  let origin = await app.listen();
  const init = await fetch(origin + '/firewood/checkout/api/state'); const cookie = init.headers.get('set-cookie').split(';')[0];
  const { csrf } = await init.json();
  await fetch(origin + '/firewood/checkout/api/start', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sample, csrf }) });
  await app.close(); time += 31 * 60 * 1000;
  app = createCheckoutServer({ dataDirectory: directory, adapter, now: () => time, webhookSecret: 'whsec_localtest' });
  origin = await app.listen(); t.after(() => app.close());
  const event = { id: 'evt_late', type: 'checkout.session.async_payment_succeeded', livemode: false, data: { object: { id: 'cs_test_late', livemode: false, payment_status: 'paid', client_reference_id: reference, metadata: { purpose: 'firewood_test_only', attempt } } } };
  assert.equal((await signedPost(origin, event)).status, 200);
  assert.equal((await signedPost(origin, event)).status, 200);
  const record = await app.store.attempt(attempt);
  assert.equal(record.status, 'paid'); assert.equal(record.quote.deliveryCents, 0);
  assert.ok((await app.store.confirmations(attempt)).every(message => message.status === 'captured' && message.tries === 1));
  const browser = await (await fetch(origin + '/firewood/checkout/api/state', { headers: { Cookie: cookie } })).json();
  assert.equal(browser.status, 'draft'); assert.equal(browser.order, null);
});
test('a webhook arriving before session creation returns is stored and fulfilled exactly once', async t => {
  let origin, postStatus;
  const h = await harness(t, { webhookSecret: 'whsec_localtest', adapter: {
    verifyEvent: stripeAdapter('sk_test_fake').verifyEvent, async paid() { return true; },
    async create(order, ignored, reference, attempt) {
      postStatus = (await signedPost(origin, { id: 'evt_early', type: 'checkout.session.completed', livemode: false,
        data: { object: { id: 'cs_test_early', livemode: false, payment_status: 'paid', client_reference_id: reference, metadata: { purpose: 'firewood_test_only', attempt } } } })).status;
      return { id: 'cs_test_early', url: 'https://checkout.stripe.com/c/pay/cs_test_early' };
    },
  } }); origin = h.origin;
  const result = await h.request('start', sample);
  assert.equal(postStatus, 200); assert.equal(result.response.status, 200);
  assert.equal(result.value.next, '/firewood/checkout/result/');
  assert.equal((await h.request('state')).value.status, 'paid');
  assert.equal((await h.app.store.orders()).length, 1);
});
test('only the completed browser session can read its customer confirmation; owner messages have no public endpoint', async t => {
  const h = await harness(t);
  assert.equal((await h.request('confirmation')).response.status, 403);
  await h.request('start', sample); await h.request('simulate', { outcome: 'success' });
  const confirmation = await h.request('confirmation');
  assert.equal(confirmation.value.status, 'captured');
  assert.equal(confirmation.value.confirmation.to, sample.email);
  const number = (await h.request('state')).value.receipt.orderNumber;
  const other = await fetch(h.origin + `/firewood/checkout/api/confirmation?order=${number}`);
  assert.equal(other.status, 403);
  for (const path of ['/firewood/checkout/api/orders', '/.firewood-test-data/postgres/PG_VERSION', '/firewood/checkout/orders.mjs']) {
    const response = await fetch(h.origin + path); assert.ok([404, 405].includes(response.status));
  }
  await h.request('reset', {});
  assert.equal((await h.request('confirmation')).response.status, 403);
  assert.equal((await h.app.store.orders())[0].status, 'paid');
});
test('a second process cannot open the same persistent test database', async t => {
  const directory = await diskDirectory(t);
  const store = await openOrderStore({ directory }); t.after(() => store.close());
  await assert.rejects(openOrderStore({ directory }), /already in use/u);
});

test('authoritative Stripe verification also binds the saved payment attempt', async () => {
  const adapter = stripeAdapter('sk_test_fake', async () => Response.json({ ...stripeSession, metadata: { ...stripeSession.metadata, attempt: 'original-attempt' } }));
  assert.equal(await adapter.paid('cs_test_fake', 45000, 'ref', 'original-attempt'), true);
  await assert.rejects(adapter.paid('cs_test_fake', 45000, 'ref', 'different-attempt'));
});
test('a paid test order survives abrupt process termination and recovers its unsent confirmations', async t => {
  const directory = await diskDirectory(t);
  const script = `
    import { openOrderStore } from ${JSON.stringify(new URL('./firewood-checkout/store.mjs', import.meta.url).href)};
    const store = await openOrderStore({ directory: ${JSON.stringify(directory)} });
    await store.createAttempt('crash-test', 'browser-crash', ${JSON.stringify(validateOrder(sample))});
    await store.bindPayment('crash-test', {id:'cs_test_crash',url:'https://checkout.stripe.com/c/pay/cs_test_crash'});
    await store.confirm('crash-test', 'cs_test_crash', 'webhook', 'evt_crash');
    console.log('saved');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  await new Promise((yes, no) => {
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('saved')) yes(); });
    child.once('error', no); child.once('exit', code => { if (code !== null) no(new Error('Test child stopped before saving.')); });
  });
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  const store = await openOrderStore({ directory }); t.after(() => store.close());
  assert.equal((await store.attempt('crash-test')).status, 'paid');
  assert.equal((await store.confirmations('crash-test')).length, 2);
  await store.drain();
  assert.ok((await store.confirmations('crash-test')).every(message => message.status === 'captured' && message.tries === 1));
});

test('payment setup remains locked until its final saved state and response are ready', async t => {
  let enter, release, blocked = false;
  const entered = new Promise(yes => { enter = yes; });
  const held = new Promise(yes => { release = yes; });
  const store = await openOrderStore();
  const h = await harness(t, { store: { ...store, async saveSession(id, data) {
    if (data.status === 'pending' && !blocked) { blocked = true; enter(); await held; }
    return store.saveSession(id, data);
  } } });
  const opening = h.request('start', sample); await entered;
  let changed;
  try { changed = await h.request('start', { ...sample, quantity: 'half' }); }
  finally { release(); }
  const first = await opening;
  assert.equal(changed.response.status, 409);
  assert.equal(first.response.status, 200);
  const state = (await h.request('state')).value;
  assert.equal(state.order.quote.quantity, 'full');
});
test('delayed simulator completion records the original order without marking a replacement paid', async t => {
  let enter, release;
  const entered = new Promise(yes => { enter = yes; });
  const held = new Promise(yes => { release = yes; });
  const store = await openOrderStore();
  const h = await harness(t, { store: { ...store, async confirm(...args) { enter(); await held; return store.confirm(...args); } } });
  await h.request('start', sample);
  const finishing = h.request('simulate', { outcome: 'success' }); await entered;
  await h.request('start', { ...sample, quantity: 'half' });
  release(); await finishing;
  const state = (await h.request('state')).value;
  assert.equal(state.status, 'pending');
  assert.equal(state.order.quote.quantity, 'half');
  assert.equal(state.receipt, null);
  const orders = await store.orders();
  assert.equal(orders.filter(order => order.status === 'paid').length, 1);
  assert.equal(orders.find(order => order.status === 'paid').quote.quantity, 'full');
});
test('a delayed completion cannot restore authorization after the browser session is reset', async t => {
  let enter, release;
  const entered = new Promise(yes => { enter = yes; });
  const held = new Promise(yes => { release = yes; });
  const store = await openOrderStore();
  const h = await harness(t, { store: { ...store, async confirm(...args) { enter(); await held; return store.confirm(...args); } } });
  await h.request('start', sample); const oldCookie = h.cookie;
  const finishing = h.request('simulate', { outcome: 'success' }); await entered;
  await h.request('reset', {});
  release(); await finishing;
  const oldBrowser = await (await fetch(h.origin + '/firewood/checkout/api/state', { headers: { Cookie: oldCookie } })).json();
  assert.equal(oldBrowser.status, 'draft'); assert.equal(oldBrowser.receipt, null);
  const oldConfirmation = await fetch(h.origin + '/firewood/checkout/api/confirmation', { headers: { Cookie: oldCookie } });
  assert.equal(oldConfirmation.status, 403);
  assert.equal((await store.orders())[0].status, 'paid');
});

test('a paid webhook during the final session save returns the saved receipt without a broken redirect', async t => {
  let enter, release, blocked = false, reference, attempt;
  const entered = new Promise(yes => { enter = yes; });
  const held = new Promise(yes => { release = yes; });
  const store = await openOrderStore();
  const h = await harness(t, { webhookSecret: 'whsec_localtest', store: { ...store, async saveSession(id, data) {
    if (data.status === 'pending' && !blocked) { blocked = true; enter(); await held; }
    return store.saveSession(id, data);
  } }, adapter: {
    verifyEvent: stripeAdapter('sk_test_fake').verifyEvent, async paid() { return true; },
    async create(order, origin, id, token) { reference = id; attempt = token; return { id: 'cs_test_finalsave', url: 'https://checkout.stripe.com/c/pay/cs_test_finalsave' }; },
  } });
  const opening = h.request('start', sample); await entered;
  try {
    const event = { id: 'evt_finalsave', type: 'checkout.session.completed', livemode: false, data: { object: {
      id: 'cs_test_finalsave', livemode: false, payment_status: 'paid', client_reference_id: reference,
      metadata: { purpose: 'firewood_test_only', attempt },
    } } };
    assert.equal((await signedPost(h.origin, event)).status, 200);
  } finally { release(); }
  const result = await opening;
  assert.equal(result.response.status, 200); assert.equal(result.value.next, '/firewood/checkout/result/');
  const state = (await h.request('state')).value;
  assert.equal(state.status, 'paid'); assert.equal(state.order, null);
  assert.ok((await store.confirmations(attempt)).every(message => message.status === 'captured' && message.tries === 1));
});
test('a session save already in flight cannot recreate authorization revoked by reset', async t => {
  let enter, release, blocked = false;
  const entered = new Promise(yes => { enter = yes; });
  const held = new Promise(yes => { release = yes; });
  const store = await openOrderStore();
  const h = await harness(t, { store: { ...store, async saveSession(id, data) {
    if (data.status === 'paid' && !blocked) { blocked = true; enter(); await held; }
    return store.saveSession(id, data);
  } } });
  await h.request('start', sample); const oldCookie = h.cookie;
  const finishing = h.request('simulate', { outcome: 'success' }); await entered;
  await h.request('reset', {});
  release(); await finishing;
  const oldBrowser = await (await fetch(h.origin + '/firewood/checkout/api/state', { headers: { Cookie: oldCookie } })).json();
  assert.equal(oldBrowser.status, 'draft'); assert.equal(oldBrowser.receipt, null);
  assert.equal((await store.orders())[0].status, 'paid');
});

// Force a multibyte character to cross HTTP chunk boundaries. TCP chunking must
// not change customer-entered text or the exact bytes covered by a signature.
function chunkedPost(url, bytes, split, headers) {
  return new Promise((yes, no) => {
    const req = httpRequest(url, { method: 'POST', headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => yes({ status: response.statusCode, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', no); req.setNoDelay(true);
    req.write(bytes.subarray(0, split));
    setTimeout(() => req.end(bytes.subarray(split)), 10);
  });
}
test('split UTF-8 request chunks preserve names and delivery instructions exactly', async t => {
  const h = await harness(t);
  const { csrf } = (await h.request('state')).value;
  const input = { ...sample, csrf, name: 'José Test', notes: 'Café garden 🌳 — synthetic only.' };
  const bytes = Buffer.from(JSON.stringify(input));
  const result = await chunkedPost(h.origin + '/firewood/checkout/api/start', bytes, bytes.indexOf(Buffer.from('é')) + 1,
    { Cookie: h.cookie, Origin: h.origin, 'Content-Type': 'application/json' });
  assert.equal(result.status, 200);
  const saved = (await h.request('state')).value.order.contact;
  assert.equal(saved.name, input.name); assert.equal(saved.notes, input.notes);
});
test('invalid UTF-8 request bytes are rejected rather than saved as replacement characters', async t => {
  const h = await harness(t);
  const { csrf } = (await h.request('state')).value;
  const bytes = Buffer.from(JSON.stringify({ ...sample, csrf, name: 'José Test' }));
  const index = bytes.indexOf(Buffer.from('é')); bytes[index + 1] = 0xff;
  const result = await chunkedPost(h.origin + '/firewood/checkout/api/start', bytes, index + 1,
    { Cookie: h.cookie, Origin: h.origin, 'Content-Type': 'application/json' });
  assert.equal(result.status, 400); assert.equal((await h.request('state')).value.status, 'draft');
});
test('signed webhooks retain exact UTF-8 bytes across incoming HTTP chunks', async t => {
  const h = await webhookHarness(t);
  const value = h.event(); value.data.object.customer_details = { name: 'José Synthetic' };
  const payload = JSON.stringify(value), bytes = Buffer.from(payload);
  const signature = new Stripe('sk_test_fake').webhooks.generateTestHeaderString({ payload, secret: 'whsec_localtest' });
  const result = await chunkedPost(h.origin + '/firewood/checkout/webhook', bytes, bytes.indexOf(Buffer.from('é')) + 1,
    { 'Content-Type': 'application/json', 'Stripe-Signature': signature });
  assert.equal(result.status, 200); assert.equal((await h.request('state')).value.status, 'paid');
});
