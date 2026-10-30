// Focused native repair acceptance. The separate baseline runner and its
// reproduced failures remain unchanged. No target/credential discovery exists.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_ENVIRONMENT, LIVE_ACCOUNT,
  LIVE_ACCEPTED_TERMS, LIVE_PAYMENT_POLICY, priceLiveOrder, liveHandoffDigest } from '../../src/lib/firewood/handoff/live-contract.mjs';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export async function runNativeBillingRepair({ pool, identity, outputPath }) {
  assert.ok(pool && typeof pool.connect === 'function');
  assert.match(identity?.database ?? '', /^fw_[a-z0-9_]*native[a-z0-9_]+$/);
  assert.match(String(identity?.systemIdentifier ?? ''), /^\d{10,24}$/);
  assert.ok(typeof identity?.marker === 'string' && /firewood.*(?:rehearsal|synthetic)/i.test(identity.marker));
  assert.equal(typeof outputPath, 'string');
  const cases = [], created = [];
  let operations = 0, targetChecks = 0;
  async function operation(role, actor, sql, args = []) {
    assert.ok(['operator', 'authenticated', 'service_role', 'anon'].includes(role));
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("set local statement_timeout='12s';set local lock_timeout='5s';set local row_security=on");
      const row = (await client.query(`select current_database() database,(pg_control_system()).system_identifier::text system_id,
        shobj_description(oid,'pg_database') marker,inet_server_addr() is null socket_only,
        current_setting('server_version_num')::integer version from pg_database where datname=current_database()`)).rows[0];
      assert.equal(row.database, identity.database); assert.equal(row.system_id, String(identity.systemIdentifier));
      assert.equal(row.marker, identity.marker); assert.equal(row.socket_only, true);
      assert.ok(row.version >= 170011 && row.version < 180000); targetChecks++;
      if (role !== 'operator') {
        await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claims',$3,true)",
          [actor ?? '', role, JSON.stringify({ role, ...(actor ? { sub: actor } : {}) })]);
        await client.query('set local role ' + role);
      }
      const result = await client.query(sql, args);
      await client.query('commit'); operations++; return result.rows;
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  const admin = (sql, args = []) => operation('operator', null, sql, args);
  const server = (sql, args = []) => operation('service_role', null, sql, args);
  let owner;
  const staff = (sql, args = [], actor = owner) => operation('authenticated', actor, sql, args);
  const one = async promise => { const rows = await promise; assert.equal(rows.length, 1); return rows[0].value; };
  const denied = async (promise, pattern = /permission|review|refund|payment|credit|cancel|stale|changed|conflict|already|invoice|unavailable|allowed|role/i) =>
    assert.rejects(promise, error => ['42501', '23514', '40001', '55P03', 'P0002', '23505'].includes(error.code)
      || pattern.test(error.message ?? ''));
  async function runCase(name, work) {
    try { cases.push({ name, passed: true, ...await work() }); }
    catch (error) { error.message = name + ': ' + error.message; throw error; }
  }
  async function actor(label) {
    const id = randomUUID(), email = 'native-repair-' + id + '@example.invalid';
    await admin("insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)", [id, email, { full_name: label }]);
    await admin("insert into public.profiles(id,full_name,email,user_type,status)values($1,$2,$3,'owner','active')on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,user_type='owner',status='active'", [id, label, email]);
    await admin("insert into public.roles(name)values('owner')on conflict(name)do nothing");
    await admin("insert into public.user_roles(user_id,role_id)select $1,id from public.roles where name='owner'", [id]);
    return id;
  }
  owner = await actor('Synthetic native accounting owner');
  const secondOwner = await actor('Synthetic native second accounting owner');
  assert.deepEqual((await staff('select public.has_effective_platform_access() effective,app_private.has_platform_admin_role() admin'))[0], { effective: true, admin: true });
  const initialFlags = await admin('select id,enabled,collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources order by id');
  assert.equal(initialFlags.length, 1); assert.equal(initialFlags[0].id, LIVE_HANDOFF_SOURCE);
  assert.equal(initialFlags[0].enabled, true);
  for (const key of ['collector_enabled', 'surcharge_reporting_enabled', 'sender_enabled']) assert.equal(initialFlags[0][key], false);
  let phone = Number((await admin("select coalesce(max(right(phone,4)::int),6999)n from public.customers where phone~'^2025557[0-9]{3}$'"))[0].n) + 1;
  async function prepare() {
    assert.ok(phone >= 7000 && phone <= 7999);
    const orderId = randomUUID(), order = { ...priceLiveOrder({ quantity: 'full', stacking: true }),
      tax_basis: 'va_domestic_use_locality_exempt', terms: structuredClone(LIVE_ACCEPTED_TERMS), accepted_at_ms: Date.now(), office_approval: null,
      contact: { name: 'Synthetic native repair ' + orderId.slice(0, 8), email: 'native-repair-' + orderId + '@angeltreeservice.org',
        phone: '202555' + phone++, address: '1 Synthetic Accounting Rehearsal Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407',
        notes: 'Owned isolated fixture only. No customer, provider or financial transport.' }, payment_policy: structuredClone(LIVE_PAYMENT_POLICY) };
    const request = { contract: LIVE_HANDOFF_CONTRACT, source_id: LIVE_HANDOFF_SOURCE, environment_id: LIVE_HANDOFF_ENVIRONMENT,
      account_id: LIVE_ACCOUNT, mode: 'live', order_id: orderId, reference: 'FW-' + orderId.slice(0, 8).toUpperCase(), snapshot_hash: liveHandoffDigest(order), order };
    const cap = { token_hash: randomBytes(32).toString('hex'), token_hint: 'NATREP', token_encrypted: 'v1.YQ.Yg.Yw', expires_at: new Date(Date.now() + 1200000).toISOString() };
    const receipt = await one(server('select public.prepare_firewood_live_handoff($1,$2::jsonb,$3::jsonb)value', [LIVE_HANDOFF_SOURCE, request, cap]));
    assert.ok(uuid(receipt.invoice_id)); created.push({ orderId, invoiceId: receipt.invoice_id }); return { request, receipt };
  }
  const inspect = value => one(staff('select public.inspect_firewood_live_office($1)value', [value.request.order_id]));
  const reconcile = value => one(staff('select public.reconcile_invoice_balance($1)value', [value.receipt.invoice_id]));
  const ledger = value => one(server('select public.read_firewood_live_handoff($1,$2,$3,$4)value',
    [LIVE_HANDOFF_SOURCE, value.request.order_id, value.receipt.invoice_id, value.request.snapshot_hash]));
  const cancel = (value, revision = 0, reason = 'customer_request') => one(staff('select public.request_firewood_live_cancellation($1,$2,$3,$4,$5)value',
    [value.receipt.invoice_id, revision, reason, 'Synthetic native cancellation request.', randomUUID()]));
  const credit = (value, state, key = randomUUID(), reason = 'Synthetic full-eligible cancellation accounting credit.', actorId = owner) =>
    one(staff('select public.credit_firewood_live_cancellation($1,$2,$3,$4,$5)value',
      [value.receipt.invoice_id, state.lifecycle.revision, state.financial.ledger_hash, key, reason], actorId));
  const confirm = (value, state) => one(staff('select public.confirm_firewood_live_cancellation($1,$2,$3,$4,$5)value',
    [value.receipt.invoice_id, state.lifecycle.revision, state.financial.ledger_hash, randomUUID(), 'Synthetic final review.']));
  const snapshot = value => one(admin(`select jsonb_build_object('invoice',to_jsonb(i),
    'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'),
    'attempts',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.invoice_checkout_sessions a where a.invoice_id=i.id),'[]'),
    'handoff',(select to_jsonb(h)from app_private.firewood_live_handoffs h where h.invoice_id=i.id),
    'credits',coalesce((select jsonb_agg(to_jsonb(c)order by c.id)from app_private.firewood_live_cancellation_credits c where c.invoice_id=i.id),'[]'),
    'email_events',coalesce((select jsonb_agg(to_jsonb(e)order by e.id)from public.email_events e where e.related_invoice_id=i.id),'[]'),
    'delivery_events',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.activity_log a where a.subject_id=i.id and a.event_type in('invoice_sent','invoice_delivery_recorded','invoice_marked_sent_manually')),'[]'))value
    from public.invoices i where i.id=$1`, [value.receipt.invoice_id]));
  const ar = value => staff('select id,status,stats from app_private.report_ar where id=$1', [value.receipt.invoice_id]);
  const reportRows = value => staff('select id,at,status,stats,cells,customer_id,source_id,service_ids from app_private.report_invoices where customer_id=(select customer_id from public.invoices where id=$1) order by at,id', [value.receipt.invoice_id]);
  const dashboard = async () => {
    const result = await one(staff("select public.get_business_report('dashboard',current_date-2,current_date+2)value"));
    assert.equal(result.scope, 'company'); assert.equal(result.allTotalsComplete, true); return result.summary;
  };
  async function manual(value, amount = 60000) {
    const result = await one(staff('select public.record_manual_invoice_payment_request($1,$2,$3,clock_timestamp(),$4,$5,$6)value',
      [randomUUID(), value.receipt.invoice_id, amount, 'cash', 'NATIVE SYNTHETIC REPAIR', 'Fictional cash ledger only, not actual money.']));
    assert.ok(uuid(result.payment_id)); return { paymentId: result.payment_id, result };
  }
  async function refund(value, paymentId, amount = 60000) {
    await admin("update public.payments set refunded_principal_cents=$2,refunded_at=clock_timestamp(),status=case when $2=amount_cents then 'refunded'else'succeeded'end,notes=coalesce(notes,'')||' Explicit synthetic refund fixture; no provider.'where id=$1 and invoice_id=$3", [paymentId, amount, value.receipt.invoice_id]);
    return reconcile(value);
  }
  async function assertFinancial(value, { status, balance, paid, credited = 0, delivered = false }) {
    const result = await reconcile(value), row = await snapshot(value), state = await inspect(value), raw = await ledger(value), accounting = state.financial.accounting;
    assert.equal(result.status, status, 'The actual reconciliation RPC must agree with the row');
    assert.equal(result.balance_due_cents, balance); assert.equal(result.paid_cents, paid);
    assert.equal(row.invoice.status, status); assert.equal(row.invoice.balance_due_cents, balance);
    assert.equal(row.invoice.total_cents, 60000); assert.equal(row.invoice.subtotal_cents, 60000); assert.equal(row.invoice.tax_cents, 0);
    if (!delivered) { assert.equal(row.invoice.sent_at, null); assert.deepEqual(row.email_events, []); assert.deepEqual(row.delivery_events, []); }
    assert.ok(accounting && Number.isFinite(Date.parse(accounting.issued_at)));
    assert.deepEqual(Object.keys(accounting).sort(), ['issued_at', 'original_principal_cents', 'raw_balance_due_cents', 'credited_principal_cents', 'collectible_balance_cents', 'credit_id'].sort());
    assert.equal(accounting.original_principal_cents, 60000); assert.equal(accounting.raw_balance_due_cents, 60000 - paid);
    assert.equal(accounting.credited_principal_cents, credited); assert.equal(accounting.collectible_balance_cents, balance);
    assert.deepEqual(raw.accounting, accounting);
    assert.equal(new Date(row.handoff.issued_at).toISOString(), new Date(accounting.issued_at).toISOString());
    assert.equal(state.financial.verified, true); assert.equal(state.financial.balance_due_cents, balance);
    if (credited) { assert.ok(uuid(accounting.credit_id)); assert.equal(row.invoice.paid_at, null); }
    else assert.equal(accounting.credit_id, null);
    const principal = await one(server('select public.get_invoice_payment_principal($1)value', [value.receipt.invoice_id]));
    assert.equal(principal.paid_principal_cents, paid, 'Accounting credits are never paid principal');
    const rows = await ar(value); assert.equal(rows.length, balance > 0 && status !== 'void' ? 1 : 0);
    if (rows.length) assert.equal(Number(rows[0].stats.balanceCents), balance);
    return { result, row, state, accounting };
  }
  const reversalCases = [];

  await runCase('accepted issuance is separate from document delivery and ordinary draft semantics', async () => {
    const value = await prepare(); const initial = await assertFinancial(value, { status: 'sent', balance: 60000, paid: 0 });
    assert.equal(initial.row.handoff.original_paid_evidence, null);
    await denied(admin("update app_private.firewood_live_handoffs set issued_at=issued_at-interval'1 hour'where invoice_id=$1", [value.receipt.invoice_id]));
    const matrix = (await admin(`select app_private.invoice_payment_status('paid',30000,30000,null,null)undelivered_paid,
      app_private.invoice_payment_status('paid',30000,30000,clock_timestamp(),null)recorded_delivery,
      app_private.invoice_payment_status('draft',30000,30000,null,null)unsent_draft_prepayment`))[0];
    assert.deepEqual(matrix, { undelivered_paid: 'draft', recorded_delivery: 'partially_paid', unsent_draft_prepayment: 'draft' });
    const ordinaryId = randomUUID();
    await admin("insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,tax_cents,total_cents,balance_due_cents)select $1,$2,customer_id,'draft',60000,0,60000,60000 from public.invoices where id=$3", [ordinaryId, 'NATIVE-ORDINARY-' + ordinaryId, value.receipt.invoice_id]);
    const ordinary = { receipt: { invoice_id: ordinaryId } }; await manual(ordinary, 30000);
    const ordinaryRpc = await reconcile(ordinary), ordinaryRow = (await admin('select status,sent_at,balance_due_cents from public.invoices where id=$1', [ordinaryId]))[0];
    assert.equal(ordinaryRpc.status, 'draft'); assert.equal(ordinaryRow.status, 'draft'); assert.equal(ordinaryRow.sent_at, null);
    assert.equal(ordinaryRow.balance_due_cents, 30000); assert.equal((await ar(ordinary)).length, 0);
    await denied(credit(value, initial.state));
    return { invoiceId: value.receipt.invoice_id, issuedWithoutFakeDelivery: true, actualRpcAndArAgree: true, ordinaryUnsentDraftPreserved: true, originalResolverMatrix: matrix };
  });

  for (const kind of ['full_refund', 'partial_refund', 'returned_payment', 'partial_lost_dispute']) {
    await runCase('issued reconciliation remains truthful after ' + kind, async () => {
      const value = await prepare(); let paymentId;
      if (kind === 'partial_lost_dispute') {
        const charge = 'ch_SYNTHETIC_REPAIR_' + randomUUID().replaceAll('-', '');
        paymentId = (await admin(`insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,currency,payment_method,provider,provider_charge_id,status,paid_at,succeeded_at,notes)
          select id,customer_id,organization_id,60000,60000,'usd','card','stripe',$2,'succeeded',clock_timestamp(),clock_timestamp(),'SYNTHETIC native repair dispute fixture; not real Stripe evidence.'from public.invoices where id=$1 returning id`, [value.receipt.invoice_id, charge]))[0].id;
        await reconcile(value); const paidProof = (await snapshot(value)).handoff.original_paid_evidence;
        await admin("select * from app_private.apply_stripe_dispute_snapshot($1,$2,'lost',30000,'charge.dispute.closed',clock_timestamp())", [charge, 'dp_SYNTHETIC_REPAIR_' + randomUUID().replaceAll('-', '')]);
        assert.deepEqual((await snapshot(value)).handoff.original_paid_evidence, paidProof);
      } else paymentId = (await manual(value)).paymentId;
      const proof = (await snapshot(value)).handoff.original_paid_evidence;
      if (kind.endsWith('refund')) await refund(value, paymentId, kind === 'full_refund' ? 60000 : 30000);
      if (kind === 'returned_payment') await admin("update public.payments set status='failed',failed_at=clock_timestamp(),notes=coalesce(notes,'')||' Explicit synthetic returned payment.'where id=$1", [paymentId]);
      const partial = kind === 'partial_refund' || kind === 'partial_lost_dispute';
      const expected = { status: partial ? 'partially_paid' : 'sent', balance: partial ? 30000 : 60000, paid: partial ? 30000 : 0 };
      const first = await assertFinancial(value, expected), second = await assertFinancial(value, expected);
      assert.deepEqual(second.result, first.result); assert.deepEqual(second.row.handoff.original_paid_evidence, proof);
      await cancel(value); const held = await inspect(value);
      assert.equal(held.can_confirm, false); assert.equal(held.lifecycle.state, 'cancellation_requested');
      const expectedHold = kind === 'full_refund' ? 'billing_closure_required' : kind === 'partial_refund' ? 'refund_review' : 'payment_review';
      assert.equal(held.financial_disposition, expectedHold);
      if (kind !== 'full_refund') await denied(credit(value, held));
      reversalCases.push({ kind, value, expected });
      return { invoiceId: value.receipt.invoice_id, kind, ...expected, ordinaryArRows: 1, repeatedRpcAndStoredStateAgree: true, originalPaidProofUnchanged: true, officeHold: expectedHold, fakeDelivery: false };
    });
  }

  let creditedValue;
  await runCase('historical cancellation credit closes debt without rewriting sale or money and then permits cancellation', async () => {
    const value = reversalCases.find(row => row.kind === 'full_refund').value;
    const held = await inspect(value), before = await snapshot(value), beforeReports = await reportRows(value), beforeDashboard = await dashboard();
    await denied(confirm(value, held));
    const key = randomUUID(), reason = 'Synthetic full refund already complete; credit accepted cancelled sale.';
    const ack = await credit(value, held, key, reason), exactRetry = await credit(value, held, key, reason);
    assert.deepEqual(exactRetry, ack); assert.ok(uuid(ack.accounting.credit_id));
    await denied(credit(value, held, key, reason + ' changed'));
    await denied(credit(value, held, key, reason, secondOwner));
    const after = await assertFinancial(value, { status: 'credited', balance: 0, paid: 0, credited: 60000 });
    assert.equal(after.row.credits.length, 1); assert.equal(after.row.credits[0].amount_cents, 60000);
    assert.equal(after.row.credits[0].actor_id, owner); assert.equal(after.row.credits[0].request_id, key);
    assert.equal(after.row.credits[0].reason, reason); assert.equal(after.row.credits[0].ledger_hash, held.financial.ledger_hash);
    assert.deepEqual(after.row.payments, before.payments); assert.deepEqual(after.row.attempts, before.attempts);
    assert.deepEqual(after.row.handoff.original_paid_evidence, before.handoff.original_paid_evidence);
    assert.deepEqual(after.row.email_events, before.email_events); assert.deepEqual(after.row.delivery_events, before.delivery_events);
    for (const field of ['total_cents', 'subtotal_cents', 'tax_cents', 'created_at', 'customer_id', 'invoice_number']) assert.equal(after.row.invoice[field], before.invoice[field]);
    const rows = await reportRows(value), positive = rows.filter(row => Number(row.stats.invoicedCents) === 60000), negative = rows.filter(row => Number(row.stats.invoicedCents) === -60000);
    assert.equal(beforeReports.length, 1); assert.equal(rows.length, 2); assert.equal(positive.length, 1); assert.equal(negative.length, 1);
    assert.equal(Number(negative[0].stats.creditCents), 60000); assert.equal(Number(negative[0].stats.issued), 0); assert.equal(Number(negative[0].stats.paid), 0);
    assert.equal(new Date(positive[0].at).toISOString(), new Date(before.invoice.created_at).toISOString());
    assert.equal(new Date(negative[0].at).toISOString(), new Date(after.row.credits[0].created_at).toISOString());
    assert.equal(positive[0].customer_id, negative[0].customer_id); assert.equal(positive[0].source_id, negative[0].source_id);
    assert.deepEqual(positive[0].service_ids, negative[0].service_ids);
    const afterDashboard = await dashboard();
    assert.equal(Number(beforeDashboard.invoicedCents) - Number(afterDashboard.invoicedCents), 60000);
    assert.equal(Number(beforeDashboard.outstandingCents) - Number(afterDashboard.outstandingCents), 60000);
    assert.equal(afterDashboard.collectedCents, beforeDashboard.collectedCents);
    await denied(credit(value, after.state));
    assert.equal(after.state.can_confirm, true); assert.equal((await confirm(value, after.state)).state, 'cancelled');
    const final = await assertFinancial(value, { status: 'credited', balance: 0, paid: 0, credited: 60000 });
    assert.equal(final.row.credits.length, 1); assert.deepEqual(final.row.payments, before.payments);
    await denied(manual(value, 1)); await denied(staff('update public.invoices set balance_due_cents=0 where id=$1', [value.receipt.invoice_id]));
    await denied(operation('service_role', null, 'select public.credit_firewood_live_cancellation($1,$2,$3,$4,$5)', [value.receipt.invoice_id, held.lifecycle.revision, held.financial.ledger_hash, randomUUID(), reason]));
    await denied(operation('anon', null, 'select public.credit_firewood_live_cancellation($1,$2,$3,$4,$5)', [value.receipt.invoice_id, held.lifecycle.revision, held.financial.ledger_hash, randomUUID(), reason]));
    await denied(staff('update app_private.firewood_live_cancellation_credits set amount_cents=1 where invoice_id=$1', [value.receipt.invoice_id]));
    await denied(admin('delete from app_private.firewood_live_cancellation_credits where invoice_id=$1', [value.receipt.invoice_id]));
    creditedValue = value;
    return { invoiceId: value.receipt.invoice_id, creditId: ack.accounting.credit_id, accountingCreditCents: 60000, realPaidPrincipalCents: 0,
      originalInvoiceAndMoneyHistoryPreserved: true, oneCreditAndExactRetry: true, actualDashboardNetBillingAdjustedOnce: true,
      negativeCreditRowAtPostingDate: true, paidAtStillNull: true, finalCancellationSeparate: true, freshManualCollectionDenied: true };
  });

  await runCase('actual outbound repair records an expressly synthetic accepted delivery without reopening credited debt', async () => {
    const value = creditedValue, before = await snapshot(value), deliveryId = randomUUID();
    const context = { kind: 'invoice', email_type: 'invoice', invoice_id: value.receipt.invoice_id,
      customer_id: before.invoice.customer_id, actor_id: owner };
    const payload = { to: [value.request.order.contact.email], subject: 'SYNTHETIC native accepted-delivery repair control',
      html: '<p>Isolated fixture only. No email was sent.</p>' };
    // Explicit test-only acceptance fixture, not evidence that a real provider
    // accepted or delivered a message. The real original repair command runs.
    await admin(`insert into app_private.outbound_deliveries(id,business_key,provider_key,payload,payload_hash,context,source_snapshot,
      actor_id,state,delivery_status,provider_message_id,first_dispatched_at,last_dispatched_at,attempt_count,accepted_at,last_event_at)
      values($1,$2,$3,$4::jsonb,encode(sha256(convert_to(($4::jsonb)::text,'UTF8')),'hex'),$5::jsonb,
      app_private.email_source_snapshot($5::jsonb),$6,'accepted','accepted',$7,clock_timestamp(),clock_timestamp(),1,clock_timestamp(),clock_timestamp())`,
      [deliveryId, 'native-repair/' + deliveryId, 'native-repair-provider/' + deliveryId, payload, context, owner, 'SYNTHETIC_NATIVE_REPAIR_' + deliveryId]);
    const ack = await one(staff("select public.review_outbound_delivery($1,'reconcile',$2,$3)value", [deliveryId,
      'Synthetic accepted-delivery repair only; no provider or transport occurred.', randomUUID()]));
    assert.equal(ack.repaired, true);
    const after = await assertFinancial(value, { status: 'credited', balance: 0, paid: 0, credited: 60000, delivered: true });
    assert.ok(after.row.invoice.sent_at); assert.equal(after.row.invoice.paid_at, null);
    assert.deepEqual(after.row.payments, before.payments); assert.deepEqual(after.row.credits, before.credits);
    assert.deepEqual(after.row.handoff.original_paid_evidence, before.handoff.original_paid_evidence);
    assert.equal(after.row.email_events.length, before.email_events.length + 1);
    assert.equal(after.row.email_events.at(-1).outbound_delivery_id, deliveryId);
    const again = await one(staff("select public.review_outbound_delivery($1,'reconcile',$2,$3)value", [deliveryId,
      'Synthetic accepted-delivery repair repeated only; no send.', randomUUID()]));
    assert.equal(again.repaired, true); const repeated = await snapshot(value);
    assert.equal(repeated.email_events.length, after.row.email_events.length); assert.deepEqual(repeated.payments, before.payments);
    return { invoiceId: value.receipt.invoice_id, deliveryId, syntheticAcceptanceControlOnly: true, originalOutboundDispatchExecuted: true,
      actualNoSendReviewCommandUsed: true, sameDeliveryHistoryRepairedOnce: true, creditedStatusAndZeroCollectibleDebtPreserved: true,
      paidAtStillNull: true, providerCalls: 0, emailsActuallySent: 0 };
  });

  await runCase('partial payment refunded in full can receive full sale credit while retained money and late non-refundable cases cannot', async () => {
    const value = await prepare(), payment = await manual(value, 30000); await refund(value, payment.paymentId, 30000); await cancel(value);
    const held = await inspect(value); assert.equal(held.financial_disposition, 'billing_closure_required');
    const before = await snapshot(value); await credit(value, held);
    const after = await assertFinancial(value, { status: 'credited', balance: 0, paid: 0, credited: 60000 });
    assert.deepEqual(after.row.payments, before.payments); assert.equal(after.row.credits.length, 1);
    assert.equal(after.row.handoff.original_paid_evidence, null, 'A partially paid order must not invent fully-paid proof');
    const late = await prepare();
    await one(staff('select public.record_firewood_live_delivery($1,0,$2,$3,$4,$5)value', [late.receipt.invoice_id,
      new Date(Date.now() + 3600000).toISOString(), new Date(Date.now() + 7200000).toISOString(), 'Synthetic late-cancellation window control.', randomUUID()]));
    await cancel(late, 1); const lateState = await inspect(late);
    assert.equal(lateState.lifecycle.refund_eligibility, 'non_refundable'); await denied(credit(late, lateState));
    assert.equal((await snapshot(late)).credits.length, 0); await assertFinancial(late, { status: 'sent', balance: 60000, paid: 0 });
    return { invoiceId: value.receipt.invoice_id, fullSaleCreditCents: 60000, receivedAndRefundedPrincipalCents: 30000,
      noFakePaidProof: true, lateNonRefundableCreditDenied: true };
  });

  await runCase('finishing a partial refund requires a fresh ledger review before credit', async () => {
    const value = await prepare(), payment = await manual(value); await refund(value, payment.paymentId, 30000); await cancel(value);
    const oldReview = await inspect(value); assert.equal(oldReview.financial_disposition, 'refund_review');
    await refund(value, payment.paymentId, 60000); const fresh = await inspect(value);
    assert.notEqual(fresh.financial.ledger_hash, oldReview.financial.ledger_hash);
    assert.equal(fresh.lifecycle.revision, oldReview.lifecycle.revision);
    assert.equal(fresh.financial_disposition, 'billing_closure_required');
    await denied(credit(value, oldReview)); assert.equal((await snapshot(value)).credits.length, 0);
    await credit(value, fresh); const after = await assertFinancial(value, { status: 'credited', balance: 0, paid: 0, credited: 60000 });
    assert.equal(after.row.credits.length, 1); assert.equal(after.row.credits[0].ledger_hash, fresh.financial.ledger_hash);
    return { invoiceId: value.receipt.invoice_id, staleRefundReviewDenied: true, unchangedWorkflowRevisionDoesNotBypassFinancialHash: true, freshReviewCanCreditOnce: true };
  });

  for (const kind of ['pending_payment', 'pending_refund']) {
    await runCase(kind + ' cannot authorize accounting credit or final cancellation', async () => {
      const value = await prepare(), settled = kind === 'pending_refund';
      const paymentId = (await admin(`insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,currency,payment_method,provider,status,submitted_at,paid_at,succeeded_at,notes)
        select id,customer_id,organization_id,60000,60000,'usd','ach','stripe',$2,clock_timestamp(),
        case when $3::boolean then clock_timestamp()else null end,case when $3::boolean then clock_timestamp()else null end,
        'SYNTHETIC native pending-state fixture, not an actual provider observation.'from public.invoices where id=$1 returning id`,
        [value.receipt.invoice_id, settled ? 'succeeded' : 'pending', settled]))[0].id;
      await reconcile(value);
      if (settled) {
        const eventId = 'evt_SYNTHETIC_REPAIR_' + randomUUID().replaceAll('-', '');
        await admin("insert into public.stripe_webhook_events(event_id,event_type,livemode,invoice_id)values($1,'native.synthetic.refund',false,$2)", [eventId, value.receipt.invoice_id]);
        await admin("insert into app_private.stripe_refund_observations(refund_id,payment_id,amount_cents,currency,status,provider_created_at,event_id)values($1,$2,60000,'usd','pending',clock_timestamp(),$3)",
          ['re_SYNTHETIC_REPAIR_' + randomUUID().replaceAll('-', ''), paymentId, eventId]);
      }
      await cancel(value); const held = await inspect(value), before = await snapshot(value);
      assert.equal(held.financial_disposition, settled ? 'awaiting_refund' : 'awaiting_settlement'); assert.equal(held.can_confirm, false);
      await denied(credit(value, held)); await denied(confirm(value, held)); assert.deepEqual(await snapshot(value), before);
      assert.equal(before.credits.length, 0);
      return { invoiceId: value.receipt.invoice_id, kind, noCredit: true, noFinalCancellation: true, pendingStateNeverCountedAsCompleted: true };
    });
  }

  await runCase('local expired checkout without verified closure cannot receive accounting credit', async () => {
    const value = await prepare();
    await admin("insert into public.invoice_checkout_sessions(invoice_id,customer_id,organization_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,currency,payment_channel,status)select id,customer_id,organization_id,60000,60000,0,60000,'usd','ach','expired'from public.invoices where id=$1", [value.receipt.invoice_id]);
    await cancel(value); const held = await inspect(value), before = await snapshot(value);
    await denied(credit(value, held)); assert.deepEqual(await snapshot(value), before); assert.equal(before.attempts[0].void_reconciled_token, null);
    return { invoiceId: value.receipt.invoice_id, unverifiedRemoteClosureNotInvented: true, noCredit: true };
  });

  await runCase('disabling preparation and transport does not erase issuance or credited financial history', async () => {
    await admin('update app_private.firewood_live_handoff_sources set enabled=false,collector_enabled=false,surcharge_reporting_enabled=false,sender_enabled=false');
    const before = await snapshot(creditedValue), result = await reconcile(creditedValue), after = await snapshot(creditedValue), state = await inspect(creditedValue);
    assert.equal(result.status, 'credited'); assert.equal(result.balance_due_cents, 0); assert.equal(result.paid_cents, 0);
    assert.equal(state.financial.accounting.credited_principal_cents, 60000);
    const stable = value => ({ ...value, invoice: { ...value.invoice, updated_at: null } });
    assert.deepEqual(stable(after), stable(before));
    const issued = reversalCases.find(row => row.kind === 'partial_refund');
    const issuedRpc = await reconcile(issued.value), issuedRow = await snapshot(issued.value);
    assert.equal(issuedRpc.status, 'partially_paid'); assert.equal(issuedRpc.balance_due_cents, 30000); assert.equal(issuedRow.invoice.sent_at, null);
    await denied(ledger(creditedValue));
    const flags = await admin('select enabled,collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources');
    assert.ok(flags.every(row => Object.values(row).every(value => value === false)));
    return { sourceFlagsAllFalse: true, issuanceAndCreditRemainAuthoritative: true, integrationReadStillSourceGated: true, syntheticHistoryRetained: true };
  });

  const proof = { kind: 'firewood-native-billing-repair', at: new Date().toISOString(), database: identity.database,
    systemIdentifier: String(identity.systemIdentifier), marker: identity.marker, operations, targetChecks, cases, createdSyntheticRecords: created,
    baselinePreserved: true, allSourceFlagsOff: true, dataDeleted: false, schemaChangedByRunner: false, noAuthorityAssigned: true,
    providerCalls: 0, refundsIssued: 0, customerEmailsSent: 0, fakeDeliveryTimestamps: 0, fakeCheckoutReconciliationStamps: 0,
    productionChanged: false, activationReady: false,
    fixtureClassification: 'Explicit synthetic local manual/Stripe ledger states. Actual native RPCs, constraints, triggers, RLS and report views; no real provider observations.' };
  writeFileSync(outputPath, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return proof;
}
