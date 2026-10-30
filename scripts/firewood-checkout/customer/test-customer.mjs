import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createIsolatedLiveDatabase } from '../live/isolated-database.mjs';
import { LIVE_TERMS_POLICY, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH } from '../live/contract.mjs';
import { fixtureInput } from '../live/test-fixture.mjs';
import { officeFixture } from '../office-v2/test-fixture.mjs';
import { installOfficeOrderStore } from '../office-v2/orders.mjs';
import { createIsolatedCustomerService } from './service.mjs';
import { isolatedCustomerPreview } from './server.mjs';
import { customerAssets } from './assets.mjs';
import { getCustomerRuntimeDependencies, handleCustomerRuntimeRequest } from './runtime.mjs';

async function setup(t) {
  const db = await createIsolatedLiveDatabase(), crm = officeFixture();
  await installOfficeOrderStore(db, crm.live, crm.office); await db.query('UPDATE fwofficev2_control SET paused=false');
  const service = createIsolatedCustomerService({ db, live: crm.live, office: crm.office, now: crm.now });
  const server = await isolatedCustomerPreview({ service, origin: 'http://127.0.0.1:0' }), origin = await server.listen();
  t.after(async () => { await server.close(); await db.stop(); });
  async function browser() {
    let cookie;
    async function call(action, input, options = {}) {
      const response = await fetch(origin + '/firewood/checkout/api/' + action, { method: input ? 'POST' : 'GET',
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(input ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...options.headers },
        body: input ? JSON.stringify(input) : undefined });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const value = await response.json(); return { status: response.status, value, headers: response.headers };
    }
    const first = await call('state'); return { call, first, csrf: first.value.csrf, cookie: () => cookie };
  }
  const a = await browser(); return { db, crm, origin, service, browser, a, input: { ...fixtureInput(), csrf: a.csrf } };
}
const draft = input => Object.fromEntries(Object.entries(input).filter(([key]) => !['termsAccepted', 'householdUseConfirmed', 'termsHash', 'paymentPolicyHash'].includes(key)));
const accept = (a, review) => ({ csrf: a.csrf, quoteReviewHash: review.quoteReviewHash,
  termsHash: LIVE_TERMS_HASH, paymentPolicyHash: LIVE_PAYMENT_POLICY_HASH, termsAccepted: true, householdUseConfirmed: true });

test('customer production route stays closed and QA transport requires a branded local service', async () => {
  assert.equal(getCustomerRuntimeDependencies({ FIREWOOD_CUSTOMER_ENABLED: '1' }), null);
  const response = await handleCustomerRuntimeRequest(); assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null);
  await assert.rejects(isolatedCustomerPreview({ service: {}, origin: 'http://127.0.0.1:0' }), /isolated_customer_service_required/);
});

test('customer assets retain the exact clauses, brand and payment disclosures without test or approval authority', async () => {
  const assets = await customerAssets(), html = assets.get('/firewood/checkout/').body;
  for (const clause of LIVE_TERMS_POLICY.clauses) assert.ok(html.includes(clause.label));
  for (const id of ['request-office', 'office-review', 'refresh-office', 'standard-price', 'edit-office', 'retry-load']) assert.equal(html.split('id="' + id + '"').length, 2);
  assert.ok(html.includes('3% merchant surcharge')); assert.ok(html.includes('Debit and prepaid cards are not surcharged'));
  assert.ok(!/name="veteran|approval_id|signingSecret|simulate-|test-tools|test confirmation/iu.test(html));
  assert.ok(!html.includes('confirmation-preview')); assert.ok(html.includes('data-terms-hash="' + LIVE_TERMS_HASH + '"'));
});

test('standard browser HTTP acceptance saves one server-priced invoice and exposes only customer-safe status', async t => {
  const f = await setup(t); f.input.quantity = 'two'; f.input.stacking = true; f.input.notes = 'Wheelbarrow beside garage.\nStack near shed.';
  const results = await Promise.all([f.a.call('start', f.input), f.a.call('start', f.input)]);
  assert.ok(results.every(x => x.status === 200)); assert.equal(f.crm.source.mappings.size, 1);
  const state = (await f.a.call('state')).value; assert.equal(state.order.quote.totalCents, 99000);
  assert.equal(state.order.contact.notes, f.input.notes); assert.equal(state.order.quote.deliveryCents, 0); assert.equal(state.payment.state, 'unpaid');
  assert.ok(!/approval_id|invoice_id|signing|payment_ids|snapshot_hash|source_id|portal_url/u.test(JSON.stringify(state)));
  assert.ok(f.a.first.headers.get('set-cookie').includes('HttpOnly')); assert.ok(f.a.first.headers.get('set-cookie').includes('SameSite=Strict'));
  assert.equal(f.a.first.headers.get('cache-control'), 'no-store'); assert.equal(f.a.first.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('browser office request, authenticated fixture approval and exact price acceptance share one invoice', async t => {
  const f = await setup(t), input = draft(f.input); input.stacking = true;
  const first = await f.a.call('office-request', input); assert.equal(first.status, 200); assert.equal(first.value.status, 'pending');
  assert.equal(f.crm.source.mappings.size, 0); f.crm.approve();
  const current = (await f.a.call('state')).value; assert.equal(current.officeDraft.status, 'approved');
  assert.deepEqual(current.officeDraft.prices, { wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 });
  const body = accept(f.a, current.officeDraft); assert.equal((await f.a.call('office-accept', body)).status, 200);
  assert.equal((await f.a.call('office-accept', body)).status, 200); assert.equal(f.crm.source.mappings.size, 1);
  const state = (await f.a.call('state')).value; assert.equal(state.order.quote.totalCents, 57000); assert.equal(state.order.officeApproved, true);
  assert.ok(!JSON.stringify(state).includes('approval_id'));
});

test('stale displayed office approval, revoked approval and changed customer draft cannot accept an old price', async t => {
  const f = await setup(t); await f.a.call('office-request', draft(f.input)); f.crm.approve();
  const old = (await f.a.call('state')).value.officeDraft; f.crm.approve();
  assert.equal((await f.a.call('office-accept', accept(f.a, old))).status, 409);
  const current = (await f.a.call('state')).value.officeDraft; f.crm.revoke();
  assert.equal((await f.a.call('office-accept', accept(f.a, current))).status, 409);
  await f.a.call('office-request', { ...draft(f.input), address: '456 Another Synthetic Lane' });
  assert.equal((await f.a.call('office-accept', accept(f.a, old))).status, 409); assert.equal(f.crm.source.mappings.size, 0);
});

test('an uncertain office reply keeps the saved customer request and does not place an order', async t => {
  const f = await setup(t); f.crm.loseNextPrice(); const input = draft(f.input);
  assert.equal((await f.a.call('office-request', input)).status, 503); // saved request has no confirmed receipt yet
  const pending = (await f.a.call('state')).value;
  assert.equal(pending.status, 'draft'); assert.equal(pending.officeDraft.status, 'unconfirmed');
  assert.equal(pending.officeDraft.draft.contact.address, input.address); assert.equal(f.crm.source.mappings.size, 0);
});

test('stale terms, invented prices/approval, wrong CSRF and oversized requests record no order', async t => {
  const f = await setup(t), input = structuredClone(f.input);
  for (const change of [{ termsHash: 'old' }, { paymentPolicyHash: 'old' }, { principal_cents: 1 }, { officeApproval: randomUUID() }, { csrf: 'wrong' }])
    assert.notEqual((await f.a.call('start', { ...input, ...change })).status, 200);
  assert.equal((await f.a.call('start', { ...input, notes: 'x'.repeat(17000) })).status, 413);
  assert.equal(f.crm.source.mappings.size, 0); assert.deepEqual(f.input, input);
});

test('foreign host/origin, unsupported paths/methods and missing session cannot mutate or reveal orders', async t => {
  const f = await setup(t); await f.a.call('start', f.input);
  const other = await f.browser(); assert.equal((await other.call('state')).value.order, null);
  assert.equal((await other.call('resume', { csrf: other.csrf })).status, 409);
  assert.equal((await f.a.call('start', f.input, { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await fetch(f.origin + '/firewood/checkout/api/state?order_id=' + randomUUID())).status, 404);
  assert.equal((await fetch(f.origin + '/firewood/checkout/api/start')).status, 405);
  assert.equal((await fetch(f.origin + '/firewood/checkout/api/fixture', { method: 'POST', headers: { Origin: f.origin } })).status, 404);
  const foreign = await new Promise(resolve => { const req = httpRequest(f.origin + '/health', { headers: { Host: 'foreign.invalid' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.end(); });
  assert.equal(foreign, 403);
});

test('paid, pending refund, cancelled and unavailable states never offer duplicate payment', async t => {
  const f = await setup(t); await f.a.call('start', f.input); f.crm.source.observe('paid', { fee: 1350, channel: 'card' });
  let state = (await f.a.call('state')).value; assert.equal(state.payment.previouslyPaid, true); assert.equal(state.canCheckPayment, false);
  f.crm.hold('cancellation_requested'); state = (await f.a.call('state')).value;
  assert.equal(state.payment.orderState, 'cancellation_requested'); assert.equal(state.canCheckPayment, false);
  assert.deepEqual((await f.a.call('resume', { csrf: f.a.csrf })).value, { held: true, next: null });
  f.crm.source.observe('refund_pending'); assert.equal((await f.a.call('state')).value.payment.pending, true);
  f.crm.hold('cancelled'); assert.equal((await f.a.call('state')).value.canCheckPayment, false);
  f.crm.unavailable(true); state = (await f.a.call('state')).value;
  assert.equal(state.verificationPending, true); assert.equal(state.payment, null); assert.equal(state.canCheckPayment, false);
});

test('v2 customer status presents full cancellation credit separately from cash and omits private accounting identifiers', async t => {
  const f = await setup(t); await f.a.call('start', f.input); f.crm.source.observe('paid', { fee: 1350, channel: 'card' });
  await f.a.call('state'); f.crm.hold('cancellation_requested'); f.crm.source.observe('refunded', { fee: 1350, channel: 'card' });
  await f.a.call('state'); f.crm.credit(); f.crm.hold('cancelled');
  const state = (await f.a.call('state')).value;
  assert.equal(state.connectionVersion, 'firewood-office-live-v2'); assert.equal(state.payment.state, 'refunded');
  assert.deepEqual(state.payment.accounting, { creditCents: 45000, balanceDueCents: 0, creditRecorded: true });
  assert.equal(state.payment.totals.gross_collected_cents, 46350); assert.equal(state.payment.totals.gross_refunded_cents, 46350);
  assert.equal(state.payment.totals.balance_due_cents, 45000); assert.equal(state.payment.previouslyPaid, true);
  assert.equal(state.canCheckPayment, false); assert.equal(state.order.quote.totalCents, 45000);
  assert.ok(!/credit_id|issued_at|invoice_id|ledger_hash/u.test(JSON.stringify(state)));
  assert.deepEqual((await f.a.call('resume', { csrf: f.a.csrf })).value, { held: true, next: null });
});

test('explicit payment handoff returns only the same vetted CRM capability and no invoice identifier', async t => {
  const f = await setup(t); await f.a.call('start', f.input); f.crm.source.ready(true);
  const next = (await f.a.call('resume', { csrf: f.a.csrf })).value;
  assert.equal(next.held, false); assert.match(next.next, /^https:\/\/admin\.angeltreeservices\.org\/portal\/invoice\/[A-Za-z0-9_-]{40,200}$/);
  assert.equal(next.invoiceId, undefined); assert.equal(f.crm.source.mappings.size, 1);
  f.crm.advance(1800000); f.crm.cancelOnRenew();
  assert.deepEqual((await f.a.call('resume', { csrf: f.a.csrf })).value, { held: true, next: null });
});
test('an uncertain database failure neither claims persistence nor exposes internal error details', async t => {
  const f = await setup(t); await f.db.query('DROP TABLE fwofficev2_control');
  const failed = await f.a.call('start', f.input);
  assert.equal(failed.status, 503); assert.match(failed.value.error, /Keep this page open/);
  assert.doesNotMatch(failed.value.error, /details are saved|fwoffice|relation|postgres/i);
  assert.equal(f.crm.source.mappings.size, 0);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fwofficev2_orders')).rows[0].n, 0);
});
