// Explicit, isolated native PostgreSQL rehearsal only. No env/credential lookup,
// provider transport, hosted target discovery, financial API or message sender.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_ACCOUNT, LIVE_ACCEPTED_TERMS, LIVE_PAYMENT_POLICY, priceLiveOrder, liveHandoffDigest,
} from '../../src/lib/firewood/handoff/live-contract.mjs';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runNativeBilling({ pool, identity, outputPath }) {
  assert.ok(pool && typeof pool.connect === 'function', 'An explicit native pool is required');
  assert.ok(identity && /^fw_[a-z0-9_]*native[a-z0-9_]+$/.test(identity.database ?? ''), 'An explicitly named native rehearsal database is required');
  assert.match(String(identity.systemIdentifier ?? ''), /^\d{10,24}$/, 'Pin the actual owned cluster system identifier');
  assert.ok(typeof identity.marker === 'string' && identity.marker.length >= 24 && /firewood/i.test(identity.marker)
    && /synthetic|rehearsal/i.test(identity.marker), 'Pin the exact synthetic Firewood database comment');
  assert.equal(typeof outputPath, 'string');

  let checks = 0, operations = 0;
  const cases = [], created = [], findings = [];
  async function assertTarget(client) {
    const { rows } = await client.query(`select current_database() database,
      (select system_identifier::text from pg_control_system()) system_identifier,
      (select shobj_description(oid,'pg_database') from pg_database where datname=current_database()) marker,
      current_setting('transaction_read_only') read_only`);
    assert.equal(rows[0]?.database, identity.database);
    assert.equal(rows[0]?.system_identifier, String(identity.systemIdentifier));
    assert.equal(rows[0]?.marker, identity.marker);
    assert.equal(rows[0]?.read_only, 'off');
    checks++;
  }
  async function operation(role, actor, sql, args = []) {
    assert.ok(['postgres', 'authenticated', 'service_role'].includes(role));
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("set local statement_timeout='12s'; set local lock_timeout='5s'; set local row_security=on");
      await assertTarget(client);
      if (role !== 'postgres') {
        const claims = actor ? { sub: actor, role: 'authenticated' } : { role: 'service_role' };
        await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",
          [actor ?? '', role, JSON.stringify(claims)]);
        await client.query('set local role ' + role);
      }
      const result = await client.query(sql, args);
      await client.query('commit'); operations++;
      return result.rows;
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  const admin = (sql, args = []) => operation('postgres', null, sql, args);
  let owner;
  const staff = (sql, args = []) => operation('authenticated', owner, sql, args);
  const server = (sql, args = []) => operation('service_role', null, sql, args);
  const one = async promise => { const rows = await promise; assert.equal(rows.length, 1); return rows[0].value; };
  const denied = async (promise, pattern = /permission denied|locked|frozen|review|cannot|unavailable|reconcil|void|payment/i) => {
    await assert.rejects(promise, error => pattern.test(error.message ?? '')); checks++;
  };
  async function cannotFinalizeOriginalVoid(value) {
    const lease = await one(staff('select public.begin_invoice_void($1) value', [value.receipt.invoice_id]));
    assert.ok(uuid(lease.token));
    try { await denied(one(staff('select public.finalize_invoice_void($1,$2) value', [value.receipt.invoice_id, lease.token]))); }
    finally { await staff('select public.release_invoice_void($1,$2)', [value.receipt.invoice_id, lease.token]); }
  }
  async function runCase(name, work) {
    try { const result = await work(); cases.push({ name, passed: true, ...result }); }
    catch (error) { error.message = name + ': ' + error.message; throw error; }
  }

  // Actual Auth/profile/role rows, without a password, login or API session. No
  // test.admin replacement, bypass predicate or end-user identity shortcut.
  owner = randomUUID();
  await admin("insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)",
    [owner, `native-billing-${owner}@example.invalid`, { full_name: 'Synthetic native billing reviewer' }]);
  await admin("update public.profiles set status='active',user_type='owner',full_name='Synthetic native billing reviewer' where id=$1", [owner]);
  await admin("insert into public.roles(name)values('owner')on conflict(name)do nothing");
  await admin("insert into public.user_roles(user_id,role_id)select $1,id from public.roles where name='owner'", [owner]);
  const access = (await staff('select public.has_effective_platform_access() effective,app_private.has_platform_admin_role() admin'))[0];
  assert.deepEqual(access, { effective: true, admin: true }); checks++;
  const role = (await admin("select rolbypassrls,rolsuper from pg_roles where rolname='authenticated'"))[0];
  assert.deepEqual(role, { rolbypassrls: false, rolsuper: false }); checks++;

  const flagsBefore = await admin('select id,enabled,collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources order by id');
  assert.equal(flagsBefore.length, 1); assert.equal(flagsBefore[0].id, LIVE_HANDOFF_SOURCE);
  assert.equal(flagsBefore[0].enabled, true, 'Only the isolated source preparation fixture may be enabled');
  assert.equal(flagsBefore[0].collector_enabled, false); assert.equal(flagsBefore[0].surcharge_reporting_enabled, false); assert.equal(flagsBefore[0].sender_enabled, false);
  let phone = Number((await admin("select coalesce(max(right(phone,4)::int),6999) n from public.customers where phone~'^2025557[0-9]{3}$'"))[0].n) + 1;

  async function prepareOrder() {
    assert.ok(phone >= 7000 && phone <= 7999, 'Billing synthetic phone range exhausted');
    const orderId = randomUUID(), order = { ...priceLiveOrder({ quantity: 'full', stacking: true }),
      tax_basis: 'va_domestic_use_locality_exempt', terms: structuredClone(LIVE_ACCEPTED_TERMS),
      accepted_at_ms: Date.now(), office_approval: null,
      contact: { name: 'Synthetic native billing ' + orderId.slice(0, 8), email: `native-billing-${orderId}@angeltreeservice.org`,
        phone: '202555' + phone++, address: '1 Synthetic Billing Rehearsal Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407',
        notes: 'Native isolated SQL ledger fixture only; no email, payment or refund transport.' }, payment_policy: structuredClone(LIVE_PAYMENT_POLICY) };
    const request = { contract: LIVE_HANDOFF_CONTRACT, source_id: LIVE_HANDOFF_SOURCE, environment_id: LIVE_HANDOFF_ENVIRONMENT,
      account_id: LIVE_ACCOUNT, mode: 'live', order_id: orderId, reference: 'FW-' + orderId.slice(0, 8).toUpperCase(), snapshot_hash: liveHandoffDigest(order), order };
    const cap = { token_hash: randomBytes(32).toString('hex'), token_hint: 'NATBIL', token_encrypted: 'v1.YQ.Yg.Yw', expires_at: new Date(Date.now() + 1200000).toISOString() };
    const receipt = await one(server('select public.prepare_firewood_live_handoff($1,$2::jsonb,$3::jsonb) value', [LIVE_HANDOFF_SOURCE, request, cap]));
    assert.ok(uuid(receipt.invoice_id)); created.push({ orderId, invoiceId: receipt.invoice_id });
    return { request, receipt };
  }
  const inspect = value => one(staff('select public.inspect_firewood_live_office($1) value', [value.request.order_id]));
  const cancel = (value, revision = 0, reason = 'customer_request') => one(staff('select public.request_firewood_live_cancellation($1,$2,$3,$4,$5) value',
    [value.receipt.invoice_id, revision, reason, 'Native synthetic office cancellation review.', randomUUID()]));
  const confirm = (value, state, key = randomUUID()) => one(staff('select public.confirm_firewood_live_cancellation($1,$2,$3,$4,$5) value',
    [value.receipt.invoice_id, state.lifecycle.revision, state.financial.ledger_hash, key, 'Native synthetic final billing review.']));
  const snapshot = value => one(admin(`select jsonb_build_object('invoice',to_jsonb(i),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.invoice_checkout_sessions a where a.invoice_id=i.id),'[]'),
    'original_paid_evidence',(select h.original_paid_evidence from app_private.firewood_live_handoffs h where h.invoice_id=i.id))value from public.invoices i where id=$1`, [value.receipt.invoice_id]));
  const reportRow = async value => (await staff('select id,stats from app_private.report_ar where id=$1', [value.receipt.invoice_id]));
  async function dashboard() {
    const result = await one(staff("select public.get_business_report('dashboard',current_date-1,current_date+1) value"));
    assert.equal(result.allTotalsComplete, true); assert.equal(result.scope, 'company'); return result.summary;
  }
  async function manual(value, amount = 60000) {
    const result = await one(staff('select public.record_manual_invoice_payment_request($1,$2,$3,clock_timestamp(),$4,$5,$6) value',
      [randomUUID(), value.receipt.invoice_id, amount, 'cash', 'NATIVE SYNTHETIC BILLING', 'Owned rehearsal ledger fixture, not real received money.']));
    assert.ok(uuid(result.payment_id)); return result.payment_id;
  }
  async function seedReturnedOrRefunded(value, payment, status) {
    assert.ok(['failed', 'refunded'].includes(status));
    // Explicit synthetic local ledger state, not a provider observation or a
    // claim that a real refund/bank return occurred. Original guards still run.
    await admin("update public.payments set status=$2,refunded_principal_cents=case when $2='refunded' then amount_cents else 0 end,notes=coalesce(notes,'')||' Synthetic native returned/refunded state; no provider action.' where id=$1 and invoice_id=$3",
      [payment, status, value.receipt.invoice_id]);
    await one(staff('select public.reconcile_invoice_balance($1) value', [value.receipt.invoice_id]));
  }
  async function seedPartialRefund(value, payment) {
    // The actual partial-refund ledger retains status=succeeded. Changing it to
    // refunded here would erase the retained principal and be an invalid test.
    await admin("update public.payments set refunded_principal_cents=30000,refunded_at=clock_timestamp(),notes=coalesce(notes,'')||' Synthetic native partial refund; no provider action.' where id=$1 and invoice_id=$2 and status='succeeded'", [payment, value.receipt.invoice_id]);
    const first = await one(staff('select public.reconcile_invoice_balance($1) value', [value.receipt.invoice_id]));
    const repeated = await one(staff('select public.reconcile_invoice_balance($1) value', [value.receipt.invoice_id]));
    assert.deepEqual(repeated, first); return first;
  }

  await runCase('clean full-eligible cancellation uses original void and leaves no collectible AR', async () => {
    const value = await prepareOrder(), before = await snapshot(value), initial = await dashboard();
    assert.equal((await reportRow(value)).length, 1);
    await cancel(value); const state = await inspect(value), key = randomUUID();
    const ack = await confirm(value, state, key), replay = await confirm(value, state, key);
    assert.deepEqual(replay, ack); assert.equal(ack.state, 'cancelled');
    const after = await snapshot(value), final = await dashboard();
    assert.equal(after.invoice.status, 'void'); assert.equal(after.invoice.total_cents, before.invoice.total_cents);
    assert.equal(after.invoice.balance_due_cents, before.invoice.balance_due_cents);
    assert.deepEqual(after.payments, before.payments); assert.deepEqual(after.attempts, before.attempts);
    assert.equal((await reportRow(value)).length, 0);
    assert.equal((await staff('select id from app_private.report_invoices where id=$1', [value.receipt.invoice_id])).length, 0);
    assert.equal(Number(initial.outstandingCents) - Number(final.outstandingCents), 60000);
    await denied(staff('update public.invoices set balance_due_cents=0 where id=$1', [value.receipt.invoice_id]), /permission denied/);
    return { invoiceId: value.receipt.invoice_id, amountAndOriginalBalanceRetained: true, excludedFromActualArAndDashboard: true, repeatAckSame: true };
  });

  await runCase('fully refunded historical money keeps positive balance and requires billing closure', async () => {
    const value = await prepareOrder(), payment = await manual(value);
    await seedReturnedOrRefunded(value, payment, 'refunded'); await cancel(value);
    const state = await inspect(value), before = await snapshot(value);
    assert.equal(state.financial.verified, true); assert.equal(state.financial_disposition, 'billing_closure_required'); assert.equal(state.can_confirm, false);
    await denied(confirm(value, state)); await denied(one(staff('select public.begin_invoice_void($1) value', [value.receipt.invoice_id])));
    const after = await snapshot(value); assert.deepEqual(after, before); assert.notEqual(after.invoice.status, 'void');
    assert.equal(after.invoice.balance_due_cents, 60000);
    assert.equal(after.original_paid_evidence.paid, true); assert.equal(after.original_paid_evidence.principal_cents, 60000);
    const ar = await reportRow(value);
    assert.equal(ar.length, ['draft', 'paid', 'void'].includes(after.invoice.status) ? 0 : 1);
    if (ar.length !== 1) findings.push({ code: 'issued_refund_returns_to_draft', invoiceId: value.receipt.invoice_id,
      priority: 'release-blocking', invoiceStatus: after.invoice.status, sentAt: after.invoice.sent_at,
      balanceCents: after.invoice.balance_due_cents, actualArRows: ar.length,
      meaning: 'The office hold retains debt, but actual102 reconciliation changed the issued unpaid invoice to draft so ordinary AR hides the amount.' });
    assert.equal((await inspect(value)).lifecycle.state, 'cancellation_requested');
    return { invoiceId: value.receipt.invoice_id, outcome: 'billing_closure_required', originalReceiptRetained: true,
      ordinaryArRows: ar.length, invoiceStatus: after.invoice.status, sentAt: after.invoice.sent_at,
      billingFinalizationCorrectlyHeld: true, reportingReleaseBlocker: ar.length !== 1 };
  });

  await runCase('partial retained payment needs refund review, then historical accounting closure', async () => {
    const value = await prepareOrder(), payment = await manual(value, 30000); await cancel(value);
    let state = await inspect(value); assert.equal(state.financial_disposition, 'refund_review'); assert.equal(state.can_confirm, false);
    await denied(confirm(value, state));
    await seedReturnedOrRefunded(value, payment, 'refunded'); state = await inspect(value);
    assert.equal(state.financial_disposition, 'billing_closure_required'); await denied(confirm(value, state));
    assert.equal((await snapshot(value)).invoice.balance_due_cents, 60000);
    assert.equal((await reportRow(value)).length, 1);
    return { invoiceId: value.receipt.invoice_id, retainedPaymentNotWrittenOff: true, ordinaryArRows: 1, outcome: 'billing_closure_required' };
  });

  await runCase('previously fully paid order with partial refund retains principal but becomes hidden draft', async () => {
    const value = await prepareOrder(), payment = await manual(value), paidProof = (await snapshot(value)).original_paid_evidence;
    const reconciled = await seedPartialRefund(value, payment); await cancel(value);
    const state = await inspect(value), after = await snapshot(value), ar = await reportRow(value);
    assert.deepEqual(after.original_paid_evidence, paidProof); assert.equal(paidProof.principal_cents, 60000);
    assert.equal(after.payments[0].status, 'succeeded'); assert.equal(after.payments[0].refunded_principal_cents, 30000);
    assert.equal(reconciled.paid_cents, 30000); assert.equal(after.invoice.balance_due_cents, 30000);
    assert.equal(after.invoice.status, 'draft'); assert.equal(after.invoice.sent_at, null); assert.equal(ar.length, 0);
    assert.equal(state.financial.verified, true); assert.equal(state.financial.retained_gross_cents, 30000);
    assert.equal(state.financial_disposition, 'refund_review'); assert.equal(state.can_confirm, false); await denied(confirm(value, state));
    findings.push({ code: 'issued_partial_refund_hides_retained_principal', invoiceId: value.receipt.invoice_id, priority: 'release-blocking',
      invoiceStatus: after.invoice.status, balanceCents: 30000, retainedPaidPrincipalCents: 30000, actualArRows: 0,
      meaning: 'A partial refund after full payment also moves the issued invoice to draft; both retained principal and renewed positive debt remain real but ordinary AR omits the balance.' });
    return { invoiceId: value.receipt.invoice_id, invoiceStatus: 'draft', balanceCents: 30000, retainedPaidPrincipalCents: 30000,
      ordinaryArRows: 0, outcome: 'refund_review', repeatedReconciliationStable: true, originalPaidProofUnchanged: true, reportingReleaseBlocker: true };
  });

  await runCase('previously fully paid order with partial lost dispute retains principal but becomes hidden draft', async () => {
    const value = await prepareOrder(), charge = 'ch_SYNTHETIC_NATIVE_' + randomUUID().replaceAll('-', ''), dispute = 'dp_SYNTHETIC_NATIVE_' + randomUUID().replaceAll('-', '');
    // Fictional, separately labeled Stripe ledger fixture. No webhook receipt,
    // provider observation, provider credentials or transport is fabricated.
    const payment = (await admin(`insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,currency,payment_method,provider,provider_charge_id,status,paid_at,succeeded_at,notes)
      select id,customer_id,organization_id,60000,60000,'usd','card','stripe',$2,'succeeded',clock_timestamp(),clock_timestamp(),'SYNTHETIC native partial-dispute ledger fixture, not real Stripe evidence.' from public.invoices where id=$1 returning id`, [value.receipt.invoice_id, charge]))[0].id;
    await one(staff('select public.reconcile_invoice_balance($1) value', [value.receipt.invoice_id]));
    const paidProof = (await snapshot(value)).original_paid_evidence;
    await admin("select * from app_private.apply_stripe_dispute_snapshot($1,$2,'lost',30000,'charge.dispute.closed',clock_timestamp())", [charge, dispute]);
    const first = await one(staff('select public.reconcile_invoice_balance($1) value', [value.receipt.invoice_id]));
    assert.deepEqual(await one(staff('select public.reconcile_invoice_balance($1) value', [value.receipt.invoice_id])), first);
    await cancel(value); const state = await inspect(value), after = await snapshot(value), ar = await reportRow(value);
    assert.deepEqual(after.original_paid_evidence, paidProof); assert.equal(paidProof.principal_cents, 60000);
    assert.equal(after.payments[0].id, payment); assert.equal(after.payments[0].status, 'succeeded');
    assert.equal(after.payments[0].disputed_principal_cents, 30000); assert.equal(after.payments[0].dispute_status, 'lost');
    assert.equal(first.paid_cents, 30000); assert.equal(after.invoice.balance_due_cents, 30000); assert.equal(after.invoice.status, 'draft');
    assert.equal(after.invoice.sent_at, null); assert.equal(ar.length, 0); assert.equal(state.financial.verified, true);
    assert.equal(state.financial_disposition, 'payment_review'); assert.equal(state.can_confirm, false); await denied(confirm(value, state));
    findings.push({ code: 'issued_partial_lost_dispute_hides_retained_principal', invoiceId: value.receipt.invoice_id, priority: 'release-blocking',
      invoiceStatus: 'draft', balanceCents: 30000, retainedPaidPrincipalCents: 30000, actualArRows: 0,
      meaning: 'A real102 valid partial lost-dispute allocation restores part of the debt, but the undelivered paid invoice becomes draft and that balance is omitted from ordinary AR.' });
    return { invoiceId: value.receipt.invoice_id, invoiceStatus: 'draft', balanceCents: 30000, retainedPaidPrincipalCents: 30000,
      ordinaryArRows: 0, outcome: 'payment_review', repeatedReconciliationStable: true, originalPaidProofUnchanged: true,
      originalDisputeAllocatorExecuted: true, providerCalls: 0, reportingReleaseBlocker: true };
  });

  await runCase('recorded delivery positive control preserves partial balance while ordinary unsent drafts remain drafts', async () => {
    const matrix = (await admin(`select app_private.invoice_payment_status('paid',30000,30000,null,null)undelivered_paid,
      app_private.invoice_payment_status('paid',30000,30000,clock_timestamp(),null)recorded_delivery,
      app_private.invoice_payment_status('draft',30000,30000,null,null)unsent_draft_prepayment`))[0];
    assert.deepEqual(matrix, { undelivered_paid: 'draft', recorded_delivery: 'partially_paid', unsent_draft_prepayment: 'draft' });
    const value = await prepareOrder();
    // Explicit synthetic positive control only: actual owner command models
    // recorded delivery. This is never applied to the failing cases as a fix.
    await one(staff('select public.record_invoice_delivery($1,true) value', [value.receipt.invoice_id]));
    const payment = await manual(value), paidProof = (await snapshot(value)).original_paid_evidence;
    await seedPartialRefund(value, payment); const after = await snapshot(value);
    assert.equal(after.invoice.status, 'partially_paid'); assert.equal(after.invoice.balance_due_cents, 30000);
    assert.ok(after.invoice.sent_at); assert.equal((await reportRow(value)).length, 1); assert.deepEqual(after.original_paid_evidence, paidProof);
    return { invoiceId: value.receipt.invoice_id, syntheticRecordedDeliveryPositiveControlOnly: true, neverUsedAsRepair: true,
      resolverMatrix: matrix, invoiceStatus: 'partially_paid', balanceCents: 30000, ordinaryArRows: 1, originalPaidProofUnchanged: true };
  });

  await runCase('returned collected money is payment review, not a second refund', async () => {
    const value = await prepareOrder(), payment = await manual(value);
    await seedReturnedOrRefunded(value, payment, 'failed'); await cancel(value);
    const state = await inspect(value); assert.equal(state.financial_disposition, 'payment_review'); assert.equal(state.can_confirm, false);
    await denied(confirm(value, state)); await cannotFinalizeOriginalVoid(value);
    const evidence = (await admin('select original_paid_evidence from app_private.firewood_live_handoffs where invoice_id=$1', [value.receipt.invoice_id]))[0].original_paid_evidence;
    assert.equal(evidence.paid, true); assert.equal(evidence.principal_cents, 60000);
    const returned = await snapshot(value);
    return { invoiceId: value.receipt.invoice_id, outcome: 'payment_review', originalPaidProofRetained: true, noRefundRequested: true,
      invoiceStatus: returned.invoice.status, ordinaryArRows: (await reportRow(value)).length };
  });

  await runCase('terminal checkout history cannot be treated as never-collected or fake-reconciled', async () => {
    const value = await prepareOrder();
    await admin(`insert into public.invoice_checkout_sessions(invoice_id,customer_id,organization_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,currency,payment_channel,status)
      select id,customer_id,organization_id,60000,60000,0,60000,'usd','ach','expired' from public.invoices where id=$1`, [value.receipt.invoice_id]);
    await cancel(value); const state = await inspect(value); assert.equal(state.financial_disposition, 'billing_closure_required'); assert.equal(state.can_confirm, false);
    const before = await snapshot(value); await denied(confirm(value, state));
    assert.deepEqual(await snapshot(value), before); assert.equal(before.attempts[0].void_reconciled_token, null);
    return { invoiceId: value.receipt.invoice_id, outcome: 'billing_closure_required', noReconciliationStampFabricated: true };
  });

  await runCase('paid late non-refundable cancellation retains paid invoice and money', async () => {
    const value = await prepareOrder(); await manual(value);
    const start = new Date(Date.now() + 3600000).toISOString(), end = new Date(Date.now() + 7200000).toISOString();
    await one(staff('select public.record_firewood_live_delivery($1,$2,$3,$4,$5,$6) value',
      [value.receipt.invoice_id, 0, start, end, 'Synthetic native agreed late window.', randomUUID()]));
    await cancel(value, 1); const state = await inspect(value), before = await snapshot(value);
    assert.equal(state.lifecycle.refund_eligibility, 'non_refundable'); assert.equal(state.financial_disposition, 'no_refund_due');
    assert.equal((await confirm(value, state)).state, 'cancelled'); const after = await snapshot(value);
    assert.equal(after.invoice.status, 'paid'); assert.equal(after.invoice.balance_due_cents, 0); assert.deepEqual(after.payments, before.payments);
    assert.equal((await reportRow(value)).length, 0);
    return { invoiceId: value.receipt.invoice_id, paidInvoiceAndMoneyRetained: true, refundIssued: false };
  });

  await runCase('unpaid late non-refundable cancellation does not erase the amount owed', async () => {
    const value = await prepareOrder(), start = new Date(Date.now() + 3600000).toISOString(), end = new Date(Date.now() + 7200000).toISOString();
    await one(staff('select public.record_firewood_live_delivery($1,$2,$3,$4,$5,$6) value', [value.receipt.invoice_id, 0, start, end, 'Synthetic native unpaid late window.', randomUUID()]));
    await cancel(value, 1); const state = await inspect(value);
    assert.equal(state.lifecycle.refund_eligibility, 'non_refundable'); assert.equal(state.financial_disposition, 'billing_closure_required');
    await denied(confirm(value, state)); assert.equal((await snapshot(value)).invoice.balance_due_cents, 60000);
    assert.equal((await reportRow(value)).length, 1);
    return { invoiceId: value.receipt.invoice_id, outcome: 'billing_closure_required', ordinaryArRows: 1, noInventedDebtRelease: true };
  });

  await runCase('unchanged original financial guards reject ordinary invoice rewrites and deletion', async () => {
    const source = await prepareOrder(), invoiceId = randomUUID();
    await admin(`insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,tax_cents,total_cents,balance_due_cents)
      select $1,$2,customer_id,'draft',5000,0,5000,5000 from public.invoices where id=$3`,
      [invoiceId, 'NATIVE-BILL-' + invoiceId, source.receipt.invoice_id]);
    await admin("insert into public.invoice_line_items(invoice_id,name,quantity,unit_price_cents,total_cents,sort_order)values($1,'Synthetic original guard check',1,5000,5000,0)", [invoiceId]);
    const value = { receipt: { invoice_id: invoiceId } };
    created.push({ ordinaryGuardInvoiceId: invoiceId, syntheticCustomerSourceOrderId: source.request.order_id });
    await denied(admin("update public.invoices set status='void' where id=$1", [invoiceId]), /authenticated invoice void workflow/);
    await denied(admin(`insert into public.invoices(invoice_number,customer_id,status,subtotal_cents,tax_cents,total_cents,balance_due_cents)
      select $1,customer_id,'void',5000,0,5000,5000 from public.invoices where id=$2`, ['NATIVE-VOID-' + randomUUID(), invoiceId]), /Create an invoice before/);
    await manual(value, 5000); const before = await snapshot(value);
    await denied(admin('update public.invoices set subtotal_cents=5100,total_cents=5100 where id=$1', [invoiceId]), /locked for financial changes/);
    await denied(admin('update public.invoice_line_items set total_cents=5100 where invoice_id=$1', [invoiceId]), /locked for financial changes/);
    await denied(one(staff('select public.begin_invoice_void($1) value', [invoiceId])), /status does not permit voiding/);
    await denied(admin('delete from public.invoices where id=$1', [invoiceId]), /history must be retained/);
    await denied(staff('update public.invoices set balance_due_cents=0 where id=$1', [invoiceId]), /permission denied/);
    assert.deepEqual(await snapshot(value), before);
    return { invoiceId, originalInitialVoidGate: true, originalVoidStatusGate: true, originalPaidHeaderAndLineGuards: true,
      originalDeleteGuard: true, authenticatedColumnBoundary: true, originalFinancialHistoryUnchanged: true };
  });

  const flagsAfter = await admin('select id,enabled,collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources order by id');
  assert.deepEqual(flagsAfter, flagsBefore);
  const report = { kind: 'firewood-native-billing-rehearsal', database: identity.database, systemIdentifier: String(identity.systemIdentifier),
    marker: identity.marker, at: new Date().toISOString(), checks, operations, cases, findings, hasReleaseBlockers: findings.length > 0,
    createdSyntheticRecords: created,
    fixtureClassification: 'Actual native commands, guards, RLS and reports; expressly fictional manual/Stripe ledger fixtures only, not real provider evidence',
    financialTransport: false, providerCalls: 0, refundsIssued: 0, customerEmailsSent: 0, fakeCheckoutReconciliationStamps: 0,
    noAuthorityAssigned: true, sourceFlagsPreserved: true, productionChanged: false, schemaChangedByRunner: false,
    activationReady: false,
    remainingAccountingGate: 'Positive-debt cancellation after payment or checkout history has no approved102 accounting closure command.',
    billingClosureDecision: 'Historical/refunded positive debt remains held; actual102 has no credit-note/debt-release command. Do not activate those cases or misrepresent refund as credit.',
    retainedFixtureDigest: digest(created) };
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return report;
}
