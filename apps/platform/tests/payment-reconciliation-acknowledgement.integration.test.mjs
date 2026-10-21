import {localPaymentTarget} from './local-payment-target.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { load } from './pr10-test-helpers.mjs';

const enabled = process.env.RECONCILIATION_ACK_DISPOSABLE === '1';
const exec = promisify(execFile);

test('payment acknowledgements accept actual local PostgreSQL receipts and retain access denials', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const docker = process.env.RECONCILIATION_ACK_DOCKER_BIN;
  assert.ok(docker);
  // Guarded existing or explicitly isolated local container/database only. No API credentials, Auth
  // user creation, provider request or hosted connection is involved. Every
  // fixture and financial write rolls back before its receipt is returned to JS.
  const target=localPaymentTarget();
  const base = ['exec', '-i', target.container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  async function sql(query) {
    return (await exec(docker, [...base, '-c', query], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 })).stdout.trim();
  }
  const cases = [
    { name: 'unsent invoice', status: 'draft', sent: false, amount: 0, balance: 1000, paid: 0, result: 'draft' },
    { name: 'unsent prepayment', status: 'draft', sent: false, amount: 400, balance: 600, paid: 400, result: 'draft' },
    { name: 'sent partial payment', status: 'sent', sent: true, amount: 400, balance: 600, paid: 400, result: 'partially_paid' },
    { name: 'fully paid', status: 'sent', sent: true, amount: 1000, balance: 0, paid: 1000, result: 'paid' },
    { name: 'net refunded and disputed principal', status: 'sent', sent: true, amount: 1000, refunded: 400, disputed: 200, balance: 600, paid: 400, result: 'partially_paid' },
    { name: 'overdue invoice', status: 'sent', sent: true, amount: 0, overdue: true, balance: 1000, paid: 0, result: 'overdue' },
  ];
  const proof = [];
  async function run(c, role = 'service_role') {
    assert.ok(['service_role', 'anon', 'authenticated'].includes(role));
    const customer = randomUUID(), invoice = randomUUID();
    const queue = [];
    const reconciliation = load('../src/lib/payments/reconciliation.ts', {
      '../runtime/deadline.ts': {}, 'server-only': {}, '@/lib/payments/payment-accounting': {},
      '@/lib/supabase/admin': { getServiceRoleClient: () => null },
      '@/lib/communications/queue': {
        cancelPendingCommunications: async () => { queue.push('cancel'); },
        syncAutomatedCommunications: async () => { queue.push('sync'); },
      },
    });
    let sqlReceipt, persistedState, calls = 0, denied = false;
    const db = { async rpc(name, args) {
      assert.equal(name, 'reconcile_invoice_balance'); assert.deepEqual(args, { p_invoice_id: invoice }); calls++;
      const query = `begin;
        set local lock_timeout='3s';set local statement_timeout='10s';
        insert into public.customers(id,display_name) values('${customer}','PAYMENT_ACK_LOCAL');
        insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at,due_at)
          values('${invoice}','ACK-${invoice}','${customer}','${c.status}',1000,1000,1000,${c.sent ? 'clock_timestamp()' : 'null'},${c.overdue ? "clock_timestamp()-interval '1 day'" : 'null'});
        ${c.amount ? `insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,refunded_principal_cents,disputed_principal_cents,dispute_status)
          values('${invoice}','${customer}',${c.amount},${c.amount},0,'usd','cash','manual','succeeded',${c.refunded ?? 0},${c.disputed ?? 0},${c.disputed ? "'lost'" : 'null'});` : ''}
        set local role ${role};set local request.jwt.claims='{"role":"${role}"}';
        select 'RECEIPT:'||public.reconcile_invoice_balance('${invoice}')::text;
        reset role;
        select 'STATE:'||jsonb_build_object('balance_due_cents',balance_due_cents,'paid_cents',app_private.invoice_paid_principal(id),'status',status)::text from public.invoices where id='${invoice}';
        rollback;`;
      try {
        const lines = (await sql(query)).split('\n');
        sqlReceipt = JSON.parse(lines.find(line => line.startsWith('RECEIPT:')).slice(8));
        persistedState = JSON.parse(lines.find(line => line.startsWith('STATE:')).slice(6));
        return { data: sqlReceipt, error: null };
      } catch (error) {
        if (role === 'service_role') throw error;
        // Anonymous callers stop at EXECUTE privileges; signed-in requests
        // without staff authority stop at the function's live actor check.
        denied = (role === 'anon' ? /permission denied for function reconcile_invoice_balance/
          : /Invoice reconciliation is not available to this account/).test(String(error.stderr));
        return { data: null, error: { code: '42501', message: 'private-denial-canary' } };
      }
    } };
    const result = await reconciliation.reconcileInvoiceBalance(db, invoice);
    if (role === 'service_role') {
      assert.deepEqual(sqlReceipt, { balance_due_cents: c.balance, paid_cents: c.paid, status: c.result });
      assert.deepEqual(persistedState, sqlReceipt);
      assert.deepEqual(result, { ok: true, balanceDueCents: c.balance, paidCents: c.paid, status: c.result });
    } else {
      assert.equal(denied, true); assert.equal(result.ok, false);
      assert.doesNotMatch(result.message, /private-|42501/);
    }
    assert.equal(calls, 1); assert.equal(queue.length, 0);
    assert.equal(await sql(`select (select count(*) from public.invoices where id='${invoice}')+(select count(*) from public.customers where id='${customer}')`), '0');
    proof.push({ name: c.name, role, pass: true, rolledBack: true });
  }
  for (const c of cases) await t.test(c.name, () => run(c));
  for (const role of ['anon', 'authenticated']) await t.test(`${role} without staff authority is still denied`, () => run(cases[0], role));
  if (process.env.RECONCILIATION_ACK_RESULTS_FILE) writeFileSync(process.env.RECONCILIATION_ACK_RESULTS_FILE, JSON.stringify({ proof, fixturesRolledBack: true, providerRequests: 0 }, null, 2) + '\n');
});
