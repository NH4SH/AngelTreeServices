import {localPaymentTarget} from './local-payment-target.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { load } from './pr10-test-helpers.mjs';
import * as manualPaymentReceipts from '../src/lib/payments/manual-payment-receipts.ts';
import * as mobileInvoiceContract from '../src/lib/api/mobile-invoices.ts';

const exec = promisify(execFile);
const enabled = process.env.MANUAL_PAYMENT_RECOVERY_DISPOSABLE === '1';
test('manual payment actions accept installed SQL receipts without releasing recorded money', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const docker = process.env.MANUAL_PAYMENT_RECOVERY_DOCKER_BIN;
  assert.ok(docker);
  const target=localPaymentTarget();
  const base = ['exec', '-i', target.container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const literal = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
  const sql = async query => (await exec(docker, [...base, '-c', query], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 })).stdout.trim();
  const proof = [];
  const scenarios = [
    { name: 'new owner payment', action: 'recordManualPayment' },
    { name: 'new admin payment', action: 'recordManualPayment', role: 'admin' },
    { name: 'replayed payment', action: 'recordManualPayment', seed: 'record' },
    { name: 'corrected payment replay', action: 'recordManualPayment', seed: 'cancel' },
    { name: 'recover recorded payment', action: 'resolveManualPaymentAttempt', seed: 'record' },
    { name: 'recover corrected payment', action: 'resolveManualPaymentAttempt', seed: 'cancel' },
    { name: 'first abandoned receipt', action: 'resolveManualPaymentAttempt' },
    { name: 'replayed abandoned receipt', action: 'resolveManualPaymentAttempt', seed: 'abandon' },
    { name: 'crew denied despite stale application authority', action: 'recordManualPayment', role: 'crew', denied: true },
    { name: 'disabled owner recovery denied', action: 'resolveManualPaymentAttempt', profile: 'disabled', denied: true },
    { name: 'separated owner payment denied', action: 'recordManualPayment', separated: true, denied: true },
  ];
  for (const c of scenarios) await t.test(c.name, async () => {
    const actor = randomUUID(), customer = randomUUID(), invoice = randomUUID(), request = randomUUID();
    const storedRole = c.role ?? 'owner';
    assert.ok(['owner', 'admin', 'crew'].includes(storedRole));
    const marker = 'MANUAL_ACK_' + actor;
    const email = marker.toLowerCase() + '@example.invalid';
    const paths = [], calls = []; let followups = 0, receipt, state, sqlDenied = false;
    const record = `public.record_manual_invoice_payment_request('${request}','${invoice}',400,'2026-10-20T12:00:00Z','cash',null,null)`;
    const abandon = `public.resolve_manual_invoice_payment_request('${request}','${invoice}')`;
    let seed = '';
    if (c.seed === 'record') seed = `do $$ begin perform ${record}; end $$;`;
    if (c.seed === 'cancel') seed = `do $$ declare r jsonb; begin r:=${record};perform public.cancel_manual_invoice_payment('${invoice}',(r->>'payment_id')::uuid,'Synthetic local correction');end $$;`;
    if (c.seed === 'abandon') seed = `do $$ begin perform ${abandon}; end $$;`;
    const db = {
      auth: { getUser: async () => ({ data: { user: { id: actor } } }) },
      async rpc(name, args) {
        assert.ok(['record_manual_invoice_payment_request', 'resolve_manual_invoice_payment_request'].includes(name));
        assert.equal(args.p_request_id, request); assert.equal(args.p_invoice_id, invoice); calls.push({ name, args });
        const named = Object.entries(args).map(([key, value]) => { assert.match(key, /^p_[a-z_]+$/); return key + '=>' + literal(value); }).join(',');
        const query = `begin;set local lock_timeout='3s';set local statement_timeout='10s';
          insert into auth.users(id,email,raw_user_meta_data) values('${actor}',${literal(email)},'{}');
          insert into public.profiles(id,email,full_name,status) values('${actor}',${literal(email)},'Synthetic payment reviewer','${c.profile ?? 'active'}')
            on conflict(id) do update set status=excluded.status;
          insert into public.user_roles(user_id,role_id) select '${actor}',id from public.roles where name='${storedRole}';
          ${c.separated ? `insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status) values('${actor}','Synthetic separated reviewer',true,'active');
            update public.employee_records set is_active=false,employment_status='separated' where auth_user_id='${actor}';` : ''}
          insert into public.customers(id,display_name) values('${customer}','${marker}');
          insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
            values('${invoice}','ACK-${invoice}','${customer}','sent',1000,1000,1000,clock_timestamp());
          set local role authenticated;set local request.jwt.claims='{"role":"authenticated","sub":"${actor}"}';
          ${seed}
          select 'RECEIPT:'||public.${name}(${named})::text;
          reset role;
          select 'STATE:'||jsonb_build_object('balance_due_cents',i.balance_due_cents,
            'payment_count',(select count(*) from public.payments where invoice_id=i.id),
            'payment_id',(select id from public.payments where invoice_id=i.id limit 1),
            'payment_status',(select status from public.payments where invoice_id=i.id limit 1),
            'request_state',(select state from app_private.manual_payment_requests where request_id='${request}'))::text
            from public.invoices i where i.id='${invoice}';rollback;`;
        try {
          const lines = (await sql(query)).split('\n');
          receipt = JSON.parse(lines.find(line => line.startsWith('RECEIPT:')).slice(8));
          state = JSON.parse(lines.find(line => line.startsWith('STATE:')).slice(6));
          return { data: receipt, error: null };
        } catch (error) {
          if (!c.denied) throw error;
          sqlDenied = /Only an active owner or admin may (record manual payments|recover a payment attempt)/.test(String(error.stderr));
          return { data: null, error: { code: '42501', message: 'Synthetic access denied' } };
        }
      },
    };
    const actions = load('../src/lib/actions/payments.ts', {
      '@/lib/payments/manual-payment-receipts': manualPaymentReceipts,
      'next/cache': { revalidatePath: path => paths.push(path) },
      // The SQL denial cases deliberately model stale application authority;
      // the installed function must still enforce actual live account/role state.
      '@/lib/auth/roles': { getUserRoles: async () => ['owner'], hasAllowedRole: () => true, platformRoleGroups: { accessApproval: ['owner', 'admin'] } },
      '@/lib/supabase/server': { createClient: async () => db },
      '@/lib/security/errors': { safeStaffMessage: (_message, fallback) => fallback },
      '@/lib/payments/reconciliation': {
        syncReconciledPaymentCommunications: async () => { followups++; return false; },
        reconcileInvoiceBalance: async () => { throw Error('Do not repeat financial work after a confirmed manual payment'); },
      },
    });
    const form = new FormData();
    for (const [key, value] of Object.entries({ request_id: request, invoice_id: invoice, amount: '4.00', payment_date: '2026-10-20', payment_method: 'cash' })) form.set(key, value);
    const result = await actions[c.action]({ status: 'idle', message: '' }, form);
    assert.equal(calls.length, 1);
    if (c.denied) {
      assert.equal(sqlDenied, true); assert.equal(result.status, 'error'); assert.equal(result.released, undefined);
      assert.equal(result.paymentId, undefined); assert.equal(followups, 0); assert.equal(paths.length, 0);
    } else if (c.action === 'resolveManualPaymentAttempt' && !['record', 'cancel'].includes(c.seed)) {
      assert.equal(result.status, 'idle'); assert.equal(result.released, true); assert.equal(result.paymentId, undefined);
      assert.equal(receipt.payment_id, null); assert.equal(state.payment_count, 0); assert.equal(state.request_state, 'abandoned'); assert.equal(followups, 0);
    } else {
      assert.equal(result.status, 'success'); assert.equal(result.released, undefined); assert.equal(result.paymentId, state.payment_id);
      assert.equal(state.payment_count, 1); assert.equal(state.request_state, 'recorded');
      assert.equal(state.payment_status, c.seed === 'cancel' ? 'cancelled' : 'succeeded');
      assert.equal(state.balance_due_cents, c.seed === 'cancel' ? 1000 : 600);
      if (c.action === 'recordManualPayment') { assert.equal(receipt.replayed, Boolean(c.seed)); assert.equal(followups, 1); }
      else assert.equal(followups, 0);
      if (c.seed === 'cancel') assert.match(result.message, /later corrected/);
    }
    // Exercise the mobile caller against its own independently rolled-back
    // transaction using the same installed commands and stored account state.
    sqlDenied = false;
    const mobile = load('../src/app/api/mobile/invoices/[invoiceId]/manual-payment/route.ts', {
      '@/lib/api/responses': {
        apiSuccess: data => Response.json({ data }),
        apiError: (code, message, status) => Response.json({ error: { code, message } }, { status }),
      },
      '@/lib/api/mobile-invoices': mobileInvoiceContract,
      '@/lib/payments/manual-payment-receipts': manualPaymentReceipts,
      '@/lib/auth/apiContext': { getCrewApiContext: async () => ({ context: { supabase: db, roles: ['owner'] } }) },
      '@/lib/data/mobile-invoices': { getMobileInvoice: async () => ({ id: invoice }) },
      '@/lib/payments/reconciliation': { syncReconciledPaymentCommunications: async () => false },
    });
    const body = c.action === 'resolveManualPaymentAttempt' ? { intent: 'resolve', requestId: request }
      : { requestId: request, amountCents: 400, receivedAt: '2026-10-20T12:00:00Z', method: 'cash' };
    const response = await mobile.POST(new Request('http://127.0.0.1:3102/local-manual-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ invoiceId: invoice }) });
    const mobileResult = await response.json();
    assert.equal(calls.length, 2);
    if (c.denied) {
      assert.equal(sqlDenied, true); assert.equal(response.status, 503);
      assert.equal(mobileResult.error.code, 'manual_payment_unknown'); assert.equal(mobileResult.data, undefined);
    } else {
      assert.equal(response.status, 200);
      assert.equal(mobileResult.data.manualPayment.requestId, request);
      assert.equal(mobileResult.data.manualPayment.state, state.request_state);
      assert.equal(mobileResult.data.manualPayment.paymentId, state.payment_id);
      if (state.request_state === 'recorded') assert.equal(state.payment_count, 1);
      else assert.equal(state.payment_count, 0);
    }
    // Even failed request connections close an uncommitted transaction. Nothing
    // created here survives, including Auth/profile/role or financial records.
    assert.equal(await sql(`select (select count(*) from auth.users where id='${actor}')+(select count(*) from public.customers where id='${customer}')+(select count(*) from public.invoices where id='${invoice}')+(select count(*) from app_private.manual_payment_requests where request_id='${request}')`), '0');
    proof.push({ name: c.name, surfaces: ['web', 'mobile'], pass: true, fixturesRolledBack: true });
  });
  if (process.env.MANUAL_PAYMENT_RECOVERY_RESULTS_FILE) writeFileSync(process.env.MANUAL_PAYMENT_RECOVERY_RESULTS_FILE, JSON.stringify({ proof, providerRequests: 0, fixturesRolledBack: true }, null, 2) + '\n');
});
