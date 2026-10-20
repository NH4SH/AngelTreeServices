import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import * as invoiceContract from '../src/lib/api/mobile-invoices.ts';
import * as receipts from '../src/lib/payments/manual-payment-receipts.ts';

const invoiceId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const paymentId = '00000000-0000-4000-8000-000000000003';
const valid = { payment_id: paymentId, payment_status: 'succeeded', replayed: false, balance_due_cents: 600 };
const record = { requestId, amountCents: 400, receivedAt: '2026-10-20T12:00:00Z', method: 'cash' };
const resolve = { intent: 'resolve', requestId };
function fixture({ data = valid, error = null, throws = false, planningThrows = false, roles = ['owner'], signedOut = false } = {}) {
  const calls = [], reads = [], plans = [];
  const db = { async rpc(name, args) { calls.push({ name, args }); if (throws) throw Error('Private transport canary'); return { data, error }; } };
  const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const route = load('../src/app/api/mobile/invoices/[invoiceId]/manual-payment/route.ts', {
    '@/lib/api/responses': { apiSuccess: data => response({ data }), apiError: (code, message, status) => response({ error: { code, message } }, status) },
    '@/lib/api/mobile-invoices': invoiceContract,
    '@/lib/payments/manual-payment-receipts': receipts,
    '@/lib/auth/apiContext': { getCrewApiContext: async () => signedOut
      ? { context: null, error: { code: 'unauthorized', message: 'Sign in', status: 401 } }
      : { context: { supabase: db, roles } } },
    '@/lib/data/mobile-invoices': { getMobileInvoice: async (client, id) => { assert.equal(client, db); reads.push(id); return { id }; } },
    '@/lib/payments/reconciliation': { syncReconciledPaymentCommunications: async id => { plans.push(id); if (planningThrows) throw Error('Private planning canary'); return false; } },
  });
  return { calls, reads, plans, async run(body = record) {
    return route.POST(new Request(`http://127.0.0.1:3102/api/mobile/invoices/${invoiceId}/manual-payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ invoiceId }) });
  } };
}

test('mobile owner/admin payments retain the existing request and response contract', async () => {
  for (const roles of [['owner'], ['admin']]) for (const replayed of [false, true]) {
    const f = fixture({ roles, data: { ...valid, replayed } }), response = await f.run();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.manualPayment, { requestId, paymentId, state: 'recorded', replayed });
    assert.deepEqual(f.calls[0], { name: 'record_manual_invoice_payment_request', args: {
      p_request_id: requestId, p_invoice_id: invoiceId, p_amount_cents: 400, p_paid_at: '2026-10-20T12:00:00.000Z',
      p_method: 'cash', p_reference: null, p_notes: null,
    } });
    assert.equal(f.calls.length, 1); assert.deepEqual(f.plans, [invoiceId]); assert.deepEqual(f.reads, [invoiceId]);
  }
});

test('mobile recovery preserves recorded/corrected payments and exact abandoned receipts', async () => {
  for (const data of [
    { state: 'recorded', payment_id: paymentId, payment_status: 'succeeded' },
    { state: 'recorded', payment_id: paymentId, payment_status: 'cancelled' },
    { state: 'abandoned', payment_id: null }, { state: 'abandoned', payment_id: null, payment_status: null },
  ]) {
    const f = fixture({ data }), response = await f.run(resolve);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.manualPayment, { requestId, paymentId: data.payment_id, state: data.state });
    assert.equal(f.calls[0].name, 'resolve_manual_invoice_payment_request'); assert.equal(f.calls[0].args.p_request_id, requestId);
    assert.equal(f.calls.length, 1); assert.equal(f.plans.length, 0); assert.equal(f.reads.length, 1);
  }
});

test('mobile contradictory or incomplete recovery cannot unlock an attempt', async t => {
  const cases = [null, {}, [], { state: 'abandoned' }, { state: 'abandoned', payment_id: paymentId },
    { state: 'abandoned', payment_id: null, payment_status: 'succeeded' },
    { state: 'recorded', payment_id: paymentId }, { state: 'recorded', payment_id: paymentId, payment_status: 'pending' }];
  for (const data of cases) await t.test(JSON.stringify(data), async () => {
    const f = fixture({ data }), response = await f.run(resolve), body = await response.json();
    assert.equal(response.status, 503); assert.equal(body.error.code, 'manual_payment_unknown'); assert.equal(body.data, undefined);
    assert.equal(f.calls.length, 1); assert.equal(f.plans.length, 0); assert.equal(f.reads.length, 0);
  });
});

test('mobile malformed record acknowledgements never confirm success or plan follow-ups', async t => {
  const cases = [null, {}, { payment_id: paymentId }, { ...valid, replayed: undefined }, { ...valid, balance_due_cents: null },
    { ...valid, balance_due_cents: '0' }, { ...valid, payment_status: 'pending' }, { ...valid, payment_status: 'cancelled' }];
  for (const data of cases) await t.test(JSON.stringify(data), async () => {
    const f = fixture({ data }), response = await f.run(), body = await response.json();
    assert.equal(response.status, 503); assert.equal(body.error.code, 'manual_payment_unknown'); assert.equal(body.data, undefined);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].args.p_request_id, requestId); assert.equal(f.plans.length, 0); assert.equal(f.reads.length, 0);
  });
});

test('mobile SQL and transport failures retain safe retryable ambiguity', async () => {
  const original = console.error, logs = [];
  try {
    console.error = (...args) => logs.push(args);
  for (const body of [record, resolve]) for (const options of [{ throws: true }, { error: { message: 'Private SQL canary' } }]) {
    const f = fixture(options), response = await f.run(body), result = await response.json();
    assert.equal(response.status, 503); assert.equal(result.error.code, 'manual_payment_unknown');
    assert.doesNotMatch(JSON.stringify(result), /Private|not recorded|rollback/);
    assert.equal(f.calls.length, 1); assert.equal(f.plans.length, 0); assert.equal(f.reads.length, 0);
  }
  } finally { console.error = original; }
  assert.equal(logs.length, 2); assert.doesNotMatch(JSON.stringify(logs), /Private|SQL canary|transport canary/);
});

test('mobile planning exceptions retain confirmed payment identity', async () => {
  const f = fixture({ planningThrows: true }), original = console.error, logs = [];
  try {
    console.error = (...args) => logs.push(args);
    const response = await f.run(); assert.equal(response.status, 200); assert.equal((await response.json()).data.manualPayment.paymentId, paymentId);
  } finally { console.error = original; }
  assert.equal(f.calls.length, 1); assert.equal(logs.length, 1); assert.doesNotMatch(JSON.stringify(logs), /Private planning/);
});

test('mobile denies signed-out and non-financial roles before RPC for record and recovery', async () => {
  for (const options of [{ signedOut: true }, { roles: [] }, { roles: ['crew'] }, { roles: ['estimator'] }, { roles: ['payroll_admin'] }]) {
    for (const body of [record, resolve]) {
      const f = fixture(options), response = await f.run(body);
      assert.equal(response.status, options.signedOut ? 401 : 403); assert.equal(f.calls.length, 0);
    }
  }
});

test('mobile rejects invalid saved request IDs before invoking any command', async () => {
  for (const body of [{ ...record, requestId: '' }, { ...resolve, requestId: '' }]) {
    const f = fixture(), response = await f.run(body); assert.equal(response.status, 400); assert.equal(f.calls.length, 0);
  }
});
