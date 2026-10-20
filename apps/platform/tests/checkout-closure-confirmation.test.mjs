import assert from 'node:assert/strict';
import test from 'node:test';
import { closeCheckoutReservation } from '../src/lib/payments/checkout-closure.ts';
import { reviewInvoiceCheckout, voidInvoiceSafely } from '../src/lib/payments/invoice-void.ts';

const invoice = '00000000-0000-4000-8000-000000000001';
const reservationId = '00000000-0000-4000-8000-000000000002';
const token = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000004';
const row = (changes = {}) => ({ id: reservationId, invoice_id: invoice, status: 'open', payment_channel: 'ach',
  stripe_checkout_session_id: 'cs_fixture', stripe_payment_intent_id: null, submitted_at: null,
  total_charge_cents: 1000, currency: 'usd', ...changes });
function fixture(options = {}) {
  const calls = [], provider = [], writes = [];
  const original = options.row ?? row();
  const response = (name, data) => name in (options.receipts ?? {}) ? options.receipts[name] : { data, error: null };
  const staff = { async rpc(name) {
    calls.push(name);
    return response(name, name === 'begin_invoice_void' ? { already_void: false, token }
      : name === 'begin_invoice_checkout_review' ? { token }
        : name === 'release_invoice_void' ? null : true);
  } };
  const db = { from() {
    let patch;
    const q = { select() { return q; }, eq() { return q; }, is() { return q; }, order() { return q; },
      update(value) { patch = value; return q; }, maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); } };
    async function execute(single) {
      if (patch) { writes.push(patch); return response(patch.status ? 'close' : 'bind', { id: original.id }); }
      return response(single ? 'read' : 'list', single ? original : [original]);
    }
    return q;
  } };
  const session = { id: 'cs_fixture', status: 'open', payment_status: 'unpaid', mode: 'payment', livemode: false,
    metadata: { invoice_id: original.invoice_id, checkout_reservation_id: original.id },
    client_reference_id: original.invoice_id, amount_total: original.total_charge_cents, currency: original.currency,
    payment_intent: null };
  const stripe = { checkout: { sessions: {
    async retrieve() { provider.push('retrieve'); return session; },
    async expire() { provider.push('expire'); return { ...session, status: 'expired' }; },
  } } };
  let contexts = 0;
  const input = { invoiceId: invoice, reservationId, staffSupabase: staff, correlationId: 'synthetic',
    getPaymentContext() { contexts++; return { stripe, supabase: db, livemode: false }; } };
  return { calls, provider, writes, original, contexts: () => contexts, input,
    async close(extra = {}) { return closeCheckoutReservation({ reservation: original, stripe, supabase: db,
      livemode: false, operation: 'checkout_replacement', correlationId: 'synthetic', ...extra }); } };
}

for (const [name, receipt] of Object.entries({ empty: { data: {}, error: null }, wrong: { data: { id: other }, error: null },
  missingError: { data: { id: reservationId } }, array: { data: [{ id: reservationId }], error: null },
  absent: { data: null, error: null }, error: { data: { id: reservationId }, error: { message: 'private diagnostic' } } })) {
  test(`unconfirmed checkout close cannot authorize replacement or invoice success: ${name}`, async () => {
    const f = fixture({ receipts: { close: receipt } });
    const result = await f.close();
    assert.equal(result.ok, false); assert.deepEqual(f.provider, ['retrieve', 'expire']);
    assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
    const v = fixture({ receipts: { close: receipt } });
    assert.equal((await voidInvoiceSafely(v.input)).ok, false);
    assert.equal(v.calls.includes('finalize_invoice_void'), false);
    assert.equal(v.calls.at(-1), 'release_invoice_void');
    const r = fixture({ receipts: { close: receipt } });
    assert.equal((await reviewInvoiceCheckout(r.input)).ok, false);
  });
}
test('confirmed exact checkout row allows ordinary closure, review and void', async () => {
  assert.equal((await fixture().close()).ok, true);
  assert.equal((await reviewInvoiceCheckout(fixture().input)).ok, true);
  assert.equal((await voidInvoiceSafely(fixture().input)).ok, true);
});
for (const already_void of ['false', 'true', 1, {}, []]) {
  test(`nonboolean already-void response is never successful: ${JSON.stringify(already_void)}`, async () => {
    const f = fixture({ receipts: { begin_invoice_void: { data: { already_void }, error: null } } });
    assert.equal((await voidInvoiceSafely(f.input)).ok, false);
    assert.equal(f.contexts(), 0); assert.equal(f.provider.length, 0);
  });
}
for (const [name, receipt] of Object.entries({ missingError: { data: { already_void: true } },
  contradictory: { data: { already_void: true, token }, error: null },
  badToken: { data: { already_void: false, token: 'lease-unknown' }, error: null },
  missingFlag: { data: { token }, error: null }, empty: { data: {}, error: null } })) {
  test(`unconfirmed lease receipt prevents privileged work: ${name}`, async () => {
    const f = fixture({ receipts: { begin_invoice_void: receipt } });
    assert.equal((await voidInvoiceSafely(f.input)).ok, false);
    assert.equal(f.contexts(), 0); assert.equal(f.provider.length, 0);
  });
}
test('explicit already-void confirmation returns success without privileged context', async () => {
  const f = fixture({ receipts: { begin_invoice_void: { data: { already_void: true }, error: null } } });
  assert.equal((await voidInvoiceSafely(f.input)).ok, true); assert.equal(f.contexts(), 0);
});
for (const [name, receipt] of Object.entries({ object: { data: {}, error: null }, missingError: { data: true },
  string: { data: 'true', error: null }, false: { data: false, error: null } })) {
  test(`unconfirmed live lease stops provider requests: ${name}`, async () => {
    const f = fixture({ receipts: { check_invoice_checkout_lease: receipt } });
    assert.equal((await voidInvoiceSafely(f.input)).ok, false); assert.equal(f.provider.length, 0);
    assert.equal(f.calls.includes('finalize_invoice_void'), false);
  });
  test(`unconfirmed finalizer stays uncertain: ${name}`, async () => {
    const f = fixture({ receipts: { finalize_invoice_void: receipt } });
    const result = await voidInvoiceSafely(f.input);
    assert.equal(result.ok, false); assert.match(result.message, /not confirmed/);
    assert.equal(f.calls.filter(n => n === 'finalize_invoice_void').length, 1);
  });
}
for (const [name, changes] of Object.entries({ missingStatus: { status: undefined }, unknownStatus: { status: 'unknown' },
  missingSubmission: { submitted_at: undefined }, missingIntent: { stripe_payment_intent_id: undefined },
  missingSession: { stripe_checkout_session_id: undefined }, negative: { total_charge_cents: -1 },
  coerced: { total_charge_cents: '1000' }, fraction: { total_charge_cents: 1.5 }, missingCurrency: { currency: null },
  unknownChannel: { payment_channel: 'unknown' }, missingId: { id: '' }, missingInvoice: { invoice_id: null } })) {
  test(`incomplete reservation cannot trigger provider work: ${name}`, async () => {
    const f = fixture({ row: row(changes) });
    assert.equal((await f.close()).ok, false); assert.equal(f.provider.length, 0); assert.equal(f.writes.length, 0);
  });
}
for (const [name, data] of Object.entries({ foreign: [row({ invoice_id: other })],
  duplicate: [row(), row()], malformedLaterRow: [row(), {}], nonarray: {}, absent: null })) {
  test(`invoice checks the entire checkout list before provider work: ${name}`, async () => {
    const f = fixture({ receipts: { list: { data, error: null } } });
    assert.equal((await voidInvoiceSafely(f.input)).ok, false); assert.equal(f.provider.length, 0);
    assert.equal(f.calls.includes('finalize_invoice_void'), false);
  });
}
for (const changes of [{ invoice_id: other }, { id: other }]) {
  test(`review refuses a row outside the selected invoice/attempt: ${JSON.stringify(changes)}`, async () => {
    const f = fixture({ row: row(changes) });
    assert.equal((await reviewInvoiceCheckout(f.input)).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const [name, receipt] of Object.entries({ empty: { data: {}, error: null },
  wrong: { data: { id: other }, error: null }, missingError: { data: { id: reservationId } } })) {
  test(`unconfirmed reference binding prevents provider expiry: ${name}`, async () => {
    const f = fixture({ row: row({ status: 'creating', stripe_checkout_session_id: null }), receipts: { bind: receipt } });
    assert.equal((await reviewInvoiceCheckout({ ...f.input, providerReference: 'cs_fixture' })).ok, false);
    assert.deepEqual(f.provider, ['retrieve']); assert.equal(f.writes.length, 1);
  });
}
test('confirmed binding retains interrupted-checkout recovery', async () => {
  const f = fixture({ row: row({ status: 'creating', stripe_checkout_session_id: null }) });
  assert.equal((await reviewInvoiceCheckout({ ...f.input, providerReference: 'cs_fixture' })).ok, true);
  assert.deepEqual(f.provider, ['retrieve', 'retrieve', 'expire']); assert.equal(f.writes.length, 2);
});
test('release uncertainty does not undo confirmed invoice success', async () => {
  const f = fixture({ receipts: { release_invoice_void: {} } });
  assert.equal((await voidInvoiceSafely(f.input)).ok, true);
});
test('an empty confirmed checkout list still allows a no-checkout invoice void', async () => {
  const f = fixture({ receipts: { list: { data: [], error: null } } });
  assert.equal((await voidInvoiceSafely(f.input)).ok, true); assert.equal(f.provider.length, 0);
});
for (const [name, receipt] of Object.entries({ missingError: { data: [row()] },
  failed: { data: [row()], error: { message: 'private diagnostic' } } })) {
  test(`unconfirmed list cannot authorize remote closure: ${name}`, async () => {
    const f = fixture({ receipts: { list: receipt } });
    assert.equal((await voidInvoiceSafely(f.input)).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const [name, receipt] of Object.entries({ missingError: { data: row() },
  incomplete: { data: { id: reservationId, invoice_id: invoice }, error: null },
  array: { data: [row()], error: null } })) {
  test(`unconfirmed selected attempt cannot authorize review: ${name}`, async () => {
    const f = fixture({ receipts: { read: receipt } });
    assert.equal((await reviewInvoiceCheckout(f.input)).ok, false); assert.equal(f.provider.length, 0);
  });
}
for (const [name, receipt] of Object.entries({ missingError: { data: { token } },
  contradictory: { data: { token, already_void: true }, error: null },
  badToken: { data: { token: 'unconfirmed' }, error: null } })) {
  test(`review requires its own canonical lease receipt: ${name}`, async () => {
    const f = fixture({ receipts: { begin_invoice_checkout_review: receipt } });
    assert.equal((await reviewInvoiceCheckout(f.input)).ok, false); assert.equal(f.contexts(), 0);
  });
}
