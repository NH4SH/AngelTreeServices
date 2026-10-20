import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import * as manualPaymentReceipts from '../src/lib/payments/manual-payment-receipts.ts';

const invoiceId = '00000000-0000-4000-8000-000000000001';
const paymentId = '00000000-0000-4000-8000-000000000002';
const valid = { balance_due_cents: 600, paid_cents: 400, status: 'partially_paid' };
const initial = { status: 'idle', message: '' };

function fixture({ data = valid, error = null, throws = false, configured = true, queueThrows = false } = {}) {
  const calls = [];
  const service = {};
  const db = { async rpc(name, args) {
    calls.push({ name, args });
    if (throws) throw Error('private-transport-canary');
    return { data, error };
  } };
  const module = load('../src/lib/payments/reconciliation.ts', {
    'server-only': {},
    '@/lib/supabase/admin': { getServiceRoleClient() { calls.push({ service: true }); return configured ? service : null; } },
    '@/lib/payments/payment-accounting': {},
    '@/lib/communications/queue': {
      async cancelPendingCommunications(client, target, reason) {
        assert.equal(client, service); assert.deepEqual(target, { invoiceId });
        assert.equal(reason, 'Invoice was paid in full.'); calls.push({ cancel: true });
        if (queueThrows) throw Error('Local queue unavailable');
      },
      async syncAutomatedCommunications(client) {
        assert.equal(client, service); calls.push({ sync: true });
        if (queueThrows) throw Error('Local queue unavailable');
        return { error: null };
      },
    },
  });
  return { db, calls, module, run: () => module.reconcileInvoiceBalance(db, invoiceId) };
}

test('valid SQL-shaped receipts preserve all existing invoice statuses and prepayment cases', async t => {
  const receipts = [
    { ...valid, balance_due_cents: 1000, paid_cents: 0, status: 'draft' },
    { ...valid, status: 'draft' }, // Unsent partial prepayment remains draft.
    { ...valid, balance_due_cents: 1000, paid_cents: 0, status: 'sent' },
    valid,
    { balance_due_cents: 0, paid_cents: 1000, status: 'paid' },
    { balance_due_cents: 0, paid_cents: 0, status: 'paid' },
    { balance_due_cents: 0, paid_cents: 1500, status: 'paid' }, // Net overpayment is not truncated.
    { balance_due_cents: 1000, paid_cents: 0, status: 'void' },
    { balance_due_cents: 1000, paid_cents: 0, status: 'overdue' },
    { balance_due_cents: 2147483647, paid_cents: 0, status: 'sent' },
  ];
  for (const data of receipts) await t.test(`${data.status}: ${data.balance_due_cents}/${data.paid_cents}`, async () => {
    const f = fixture({ data });
    assert.deepEqual(await f.run(), { ok: true, balanceDueCents: data.balance_due_cents, paidCents: data.paid_cents, status: data.status });
    assert.deepEqual(f.calls[0], { name: 'reconcile_invoice_balance', args: { p_invoice_id: invoiceId } });
    assert.equal(f.calls.filter(call => call.name).length, 1);
    assert.equal(f.calls.filter(call => call.cancel).length, data.balance_due_cents === 0 ? 1 : 0);
    assert.equal(f.calls.filter(call => call.sync).length, 1);
  });
});

test('missing, coerced, unsafe and malformed receipts never confirm success or plan communications', async t => {
  const cases = [
    ['null', null], ['empty', {}], ['array', []], ['boolean', true], ['number', 1], ['text', 'paid'],
    ['missing balance', { paid_cents: 0, status: 'paid' }],
    ['missing paid principal', { balance_due_cents: 0, status: 'paid' }],
    ['missing status', { balance_due_cents: 0, paid_cents: 1000 }],
    ...['balance_due_cents', 'paid_cents'].flatMap(key => [null, true, '', '0', '600', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map(value => [`${key}: ${String(value)}`, { ...valid, [key]: value }])),
    ['balance above SQL integer', { ...valid, balance_due_cents: 2147483648 }],
    ...[null, 0, '', 'refunded', '__proto__'].map(status => [`invalid status: ${String(status)}`, { ...valid, status }]),
  ];
  for (const [name, data] of cases) await t.test(name, async () => {
    const f = fixture({ data });
    const result = await f.run();
    assert.equal(result.ok, false); assert.match(result.message, /could not be confirmed/);
    assert.match(result.message, /review its payment history/);
    assert.deepEqual(Object.keys(result).sort(), ['message', 'ok']);
    assert.equal(f.calls.length, 1); // No service client, queue change or speculative retry.
  });
});

test('database errors and lost acknowledgements stay unconfirmed without exposing diagnostics', async () => {
  for (const options of [
    { throws: true },
    { data: valid, error: { code: '42501', message: 'private-sql-canary: update public.payments' } },
    { data: null, error: { code: 'FETCH_ERROR', message: 'private-transport-canary' } },
  ]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /private-|update public|rollback|not recorded/i);
    assert.equal(f.calls.length, 1);
  }
});

test('confirmed reconciliation remains successful if follow-up services are absent or fail', async () => {
  assert.equal((await fixture({ configured: false }).run()).ok, true);
  const original = console.error, logs = [];
  try {
    console.error = (...args) => logs.push(args);
    assert.equal((await fixture({ queueThrows: true }).run()).ok, true);
  } finally { console.error = original; }
  assert.equal(logs.length, 1);
});

test('a lost response followed by a confirmed refresh reuses only the reconciliation command', async () => {
  const f = fixture(); let count = 0;
  f.db.rpc = async (name, args) => {
    f.calls.push({ name, args });
    if (count++ === 0) throw Error('Lost acknowledgement after commit');
    return { data: valid, error: null };
  };
  assert.equal((await f.run()).ok, false);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.run()).ok, true);
  assert.deepEqual(f.calls.filter(call => call.name).map(call => call.name), ['reconcile_invoice_balance', 'reconcile_invoice_balance']);
});

for (const action of ['cancelManualPayment', 'restoreCancelledManualPayment']) test(`${action} retains its committed-change warning when acknowledgement is incomplete`, async () => {
  const f = fixture({ data: {} }), paths = [];
  f.db.auth = { getUser: async () => ({ data: { user: { id: invoiceId } } }) };
  f.db.from = table => {
    assert.equal(table, 'payments');
    const query = { select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: { id: paymentId, invoice_id: invoiceId, customer_id: null, organization_id: null,
        provider: 'manual', status: action === 'cancelManualPayment' ? 'succeeded' : 'cancelled' }, error: null }; } };
    return query;
  };
  const reconcile = f.db.rpc.bind(f.db);
  f.db.rpc = async (name, args) => {
    if (name === 'reconcile_invoice_balance') return reconcile(name, args);
    f.calls.push({ name, args }); return { data: null, error: null }; // Existing void-returning write already acknowledged.
  };
  const actions = load('../src/lib/actions/payments.ts', {
    '@/lib/payments/manual-payment-receipts': manualPaymentReceipts,
    'next/cache': { revalidatePath: path => paths.push(path) },
    '@/lib/auth/roles': { getUserRoles: async () => ['owner'], hasAllowedRole: () => true, platformRoleGroups: { accessApproval: ['owner'] } },
    '@/lib/payments/reconciliation': f.module,
    '@/lib/supabase/server': { createClient: async () => f.db },
    '@/lib/security/errors': { safeStaffMessage: (_message, fallback) => fallback },
  });
  const form = new FormData(); form.set('invoice_id', invoiceId); form.set('payment_id', paymentId);
  const result = await actions[action](initial, form);
  assert.equal(result.status, 'error');
  assert.match(result.message, action === 'cancelManualPayment' ? /payment was corrected/ : /payment was restored/);
  assert.match(result.message, /balance could not be confirmed/);
  assert.equal(f.calls.filter(call => call.name).length, 2);
  assert.equal(f.calls.filter(call => call.service || call.cancel || call.sync).length, 0);
  assert.equal(paths.length, 0);
});
