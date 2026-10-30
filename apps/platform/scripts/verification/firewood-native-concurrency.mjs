// Owned, socket-only native rehearsal. No connection/env/provider loader exists
// here: the bootstrapper supplies an already isolated PostgreSQL pool and pins.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_ACCOUNT, LIVE_ACCEPTED_TERMS, LIVE_PAYMENT_POLICY, liveHandoffDigest,
  priceLiveOrder } from '../../src/lib/firewood/handoff/live-contract.mjs';
import { reduceSettlement } from '../../src/lib/firewood/handoff/settlement.mjs';

const source = LIVE_HANDOFF_SOURCE;
const digest = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const one = async (client, text, values = []) => {
  const result = await client.query({ text, values, query_timeout: 15_000 });
  assert.equal(result.rows.length, 1, 'Exactly one native result required');
  return result.rows[0];
};
const json = async (client, name, values, types) => {
  assert.match(name, /^[a-z_]+$/);
  const result = await one(client, 'select public.' + name + '(' + types.map((type, i) => '$' + (i + 1) + '::' + type).join(',') + ') value', values.map((value, i) => types[i] === 'jsonb' ? JSON.stringify(value) : value));
  return result.value;
};
async function begin(client, role = null, actor = null) {
  await client.query('begin');
  if (role !== null) {
    assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
    if (actor !== null) assert.ok(uuid(actor));
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [actor ?? '', JSON.stringify({ role, ...(actor ? { sub: actor } : {}) })]);
    await client.query('set local role ' + role);
  }
}
const service = async (client, run) => { await begin(client, 'service_role'); try { const value = await run(); await client.query('commit'); return value; } catch (error) { await client.query('rollback'); throw error; } };
const staff = async (client, actor, run) => { await begin(client, 'authenticated', actor); try { const value = await run(); await client.query('commit'); return value; } catch (error) { await client.query('rollback'); throw error; } };
const settle = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
const requireSuccess = result => { if (!result.ok) throw result.error; return result.value; };
const requireFailure = (result, codes) => { assert.equal(result.ok, false, 'The blocked operation must fail closed'); assert.ok(codes.includes(result.error.code), 'Unexpected SQL rejection: ' + result.error.code); return result.error.code; };

export async function verifyNativeConcurrencyTarget(pool, identity) {
  assert.ok(identity && /^fw_[a-z0-9_]+$/.test(identity.database) && uuid(identity.marker));
  assert.match(String(identity.systemIdentifier), /^\d+$/);
  const row = await one(pool, `select current_database() database,current_setting('server_version_num')::integer version,
    (pg_control_system()).system_identifier::text system_id,shobj_description(oid,'pg_database') comment,
    inet_server_addr() is null socket_only from pg_database where datname=current_database()`);
  assert.equal(row.database, identity.database);
  assert.equal(row.system_id, String(identity.systemIdentifier));
  assert.equal(row.comment, 'ats-firewood-native-rehearsal:' + identity.marker + ':synthetic-only');
  assert.equal(row.socket_only, true, 'Only the owned Unix socket is permitted');
  assert.ok(row.version >= 170011 && row.version < 180000, 'Reviewed native PostgreSQL 17.11+ required');
  const predicates = await one(pool, `select pg_get_functiondef('app_private.has_platform_admin_role()'::regprocedure) admin,
    pg_get_functiondef('app_private.effective_platform_access(uuid)'::regprocedure) access,
    pg_get_functiondef('auth.uid()'::regprocedure) uid`);
  assert.match(predicates.admin, /effective_platform_access/);
  assert.match(predicates.access, /public\.profiles/); assert.match(predicates.access, /public\.employee_records/);
  assert.doesNotMatch(predicates.admin + predicates.access + predicates.uid, /test\.admin|test\.uid/);
  return { database: row.database, systemIdentifier: row.system_id, marker: identity.marker, version: row.version,
    socketOnly: true, actualAdminPredicateSha256: digest(predicates.admin), actualAccessPredicateSha256: digest(predicates.access), noStubAccessPredicates: true };
}

/** Real Auth/profile/role/employee rows; no JWT metadata grants or stub access. */
export async function seedNativeOfficeActor(pool, { role = 'owner', employee = true, label = 'Native concurrency' } = {}) {
  assert.ok(['owner', 'admin'].includes(role));
  const id = randomUUID(), email = 'native-' + id + '@example.invalid';
  let employeeId = employee ? randomUUID() : null;
  await pool.query(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values($1,'authenticated','authenticated',$2,clock_timestamp(),'{}'::jsonb,'{}'::jsonb)`, [id, email]);
  await pool.query(`insert into public.profiles(id,full_name,email,user_type,status)values($1,$2,$3,$4,'active')
    on conflict(id)do update set full_name=excluded.full_name,email=excluded.email,user_type=excluded.user_type,status='active'`, [id, label, email, role]);
  await pool.query("insert into public.roles(name)values($1)on conflict(name)do nothing", [role]);
  await pool.query('insert into public.user_roles(user_id,role_id)select $1,id from public.roles where name=$2 on conflict do nothing', [id, role]);
  if (employeeId) employeeId = (await one(pool, `insert into public.employee_records(id,auth_user_id,legal_name,contact_email,employment_status,is_active)
    values($1,$2,$3,$4,'active',true) on conflict(auth_user_id)do update set legal_name=excluded.legal_name,
    contact_email=excluded.contact_email,employment_status='active',is_active=true returning id`, [employeeId, id, label, email])).id;
  return { userId: id, employeeId, role };
}

function makeOrder(phone, suffix) {
  const orderId = randomUUID(), price = priceLiveOrder({ quantity: 'full', stacking: true });
  const order = { ...price, tax_basis: 'va_domestic_use_locality_exempt', terms: structuredClone(LIVE_ACCEPTED_TERMS),
    accepted_at_ms: Date.now(), office_approval: null, payment_policy: structuredClone(LIVE_PAYMENT_POLICY),
    contact: { name: 'Native concurrency ' + suffix, email: 'native-concurrency-' + orderId + '@angeltreeservice.org',
      phone, address: '1 Synthetic Native Fixture Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407',
      notes: 'Disposable native rehearsal fixture only. No provider or sender is connected.' } };
  return { contract: LIVE_HANDOFF_CONTRACT, source_id: source, environment_id: LIVE_HANDOFF_ENVIRONMENT,
    account_id: LIVE_ACCOUNT, mode: 'live', order_id: orderId, reference: 'FW-' + orderId.slice(0, 8).toUpperCase(), snapshot_hash: liveHandoffDigest(order), order };
}
const capability = () => ({ token_hash: randomBytes(32).toString('hex'), token_hint: 'NATIVE', token_encrypted: 'v1.YQ.Yg.Yw', expires_at: new Date(Date.now() + 1_200_000).toISOString() });
const prepare = (client, request) => json(client, 'prepare_firewood_live_handoff', [source, request, capability()], ['text', 'jsonb', 'jsonb']);
const registerDraft = (client, request) => {
  const draft = { quantity: request.order.quantity, stacking: request.order.stacking, contact: request.order.contact };
  return json(client, 'request_firewood_live_office_price', [source, request.order_id, request.reference, liveHandoffDigest(draft), draft], ['text', 'uuid', 'text', 'text', 'jsonb']);
};
const approve = (client, request, key = randomUUID()) => json(client, 'approve_firewood_live_office_request', [request.order_id, 1, 42750, 14250, 'Native office verified residential single-discount price.', key], ['uuid', 'integer', 'integer', 'integer', 'text', 'uuid']);
const revoke = (client, request, revision = 2) => json(client, 'revoke_firewood_live_office_request', [request.order_id, revision, 'Native concurrent revocation before acceptance.', randomUUID()], ['uuid', 'integer', 'text', 'uuid']);
const requestCancel = (client, invoice, revision = 0, key = randomUUID()) => json(client, 'request_firewood_live_cancellation', [invoice, revision, 'customer_request', 'Native synthetic cancellation before delivery.', key], ['uuid', 'integer', 'text', 'text', 'uuid']);
const inspect = (client, request) => json(client, 'inspect_firewood_live_office', [request.order_id], ['uuid']);
function acceptedPrice(request, offer) {
  const { expires_at, ...assertion } = offer.approval;
  const order = { ...request.order, ...offer.prices, office_approval: assertion, accepted_at_ms: Math.max(Date.now(), assertion.approved_at_ms) };
  return { ...request, order, snapshot_hash: liveHandoffDigest(order) };
}
async function waitBlocked(observer, waiter, blocker, label, barriers) {
  const started = Date.now();
  for (;;) {
    const row = await one(observer, 'select state,wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1', [waiter]);
    if (row.wait_event_type === 'Lock' && row.blockers.includes(blocker)) {
      barriers.push({ label, waiter, blocker, observedNativeLockWait: true }); return;
    }
    assert.ok(Date.now() - started < 1800, 'Expected native lock barrier not observed: ' + label);
    await delay(20);
  }
}

export async function runNativeConcurrency({ pool, identity, outputPath }) {
  const target = await verifyNativeConcurrencyTarget(pool, identity), runId = randomUUID(), cases = [], barriers = [];
  const sourceBefore = await one(pool, 'select to_jsonb(s) row from app_private.firewood_live_handoff_sources s where id=$1', [source]);
  assert.equal(sourceBefore.row.enabled, true, 'Root must explicitly enable only this isolated source fixture');
  assert.equal(sourceBefore.row.collector_enabled, false); assert.equal(sourceBefore.row.surcharge_reporting_enabled, false); assert.equal(sourceBefore.row.sender_enabled, false);
  const owner = await seedNativeOfficeActor(pool, { label: 'Native concurrency owner' });
  const adminActor = await seedNativeOfficeActor(pool, { role: 'admin', label: 'Native concurrency offboarding target' });
  const allocation = await one(pool, "select greatest(8000,coalesce(max(right(phone,4)::integer)+1,8000)) first from public.customers where phone~'^2025558[0-9]{3}$'");
  let phone = allocation.first;
  const fresh = suffix => { assert.ok(phone < 9000, 'Native concurrency fixture phone range exhausted'); return makeOrder('202555' + phone++, suffix); };
  const clients = [], backends = [];
  async function client(label) {
    const current = await pool.connect(); clients.push(current);
    const row = await one(current, "select pg_backend_pid() pid,set_config('application_name',$1,false),set_config('statement_timeout','12000',false),set_config('lock_timeout','2500',false)", ['fw-native-conc:' + runId.slice(0, 8) + ':' + label]);
    backends.push(row.pid); return { client: current, pid: row.pid };
  }
  const A = await client('a'), B = await client('b'), O = await client('observer');
  let currentCase = null;
  const add = async (name, run) => { currentCase = name; await verifyNativeConcurrencyTarget(pool, identity); const detail = await run(); cases.push({ name, passed: true, ...detail }); };
  let faultName = null;
  try {
    await add('genuine owner and employee predicates authorize actual database rows', async () => {
      const authorized = await staff(A.client, owner.userId, () => one(A.client, 'select public.has_effective_platform_access() access,app_private.has_platform_admin_role() admin'));
      assert.deepEqual(authorized, { access: true, admin: true });
      return { genuineAuthProfileRoleEmployeeRows: true, noStubRoleClaims: true };
    });

    await add('actual ACLs deny anonymous office, service approval and private-table access', async () => {
      const value = fresh('acl-denials'), rejections = [];
      const denied = async (role, actor, run) => {
        await begin(A.client, role, actor);
        const result = await settle(run());
        rejections.push(requireFailure(result, ['42501']));
        await A.client.query('rollback');
      };
      await denied('anon', null, () => inspect(A.client, value));
      await denied('service_role', null, () => approve(A.client, value));
      await denied('authenticated', owner.userId, () => A.client.query('select * from app_private.firewood_live_handoffs limit 1'));
      await denied('service_role', null, () => A.client.query('select * from app_private.firewood_live_office_requests limit 1'));
      await denied('service_role', owner.userId, () => prepare(A.client, value));
      await denied('authenticated', null, () => inspect(A.client, value));
      return { sqlStates: rejections, roleAclEnforced: true, userJwtCannotBecomeWebsiteService: true };
    });

    await add('same order concurrent prepare serializes to one invoice and one capability', async () => {
      const value = fresh('same-order');
      await begin(A.client, 'service_role'); const first = await prepare(A.client, value);
      await begin(B.client, 'service_role'); const pending = settle(prepare(B.client, value));
      await waitBlocked(O.client, B.pid, A.pid, 'duplicate prepare order lock', barriers);
      await A.client.query('commit'); const second = requireSuccess(await pending); await B.client.query('commit');
      assert.equal(second.invoice_id, first.invoice_id); assert.equal(second.replayed, true);
      const counts = await one(O.client, 'select (select count(*)::integer from app_private.firewood_live_handoffs where order_id=$1) handoffs,(select count(*)::integer from public.invoice_portal_tokens where invoice_id=$2) capabilities', [value.order_id, first.invoice_id]);
      assert.deepEqual(counts, { handoffs: 1, capabilities: 1 }); return { oneInvoice: true, oneCapability: true };
    });

    await add('offboarding commit defeats a waiting office approval with retained old roles', async () => {
      const value = fresh('offboarding'); await service(A.client, () => registerDraft(A.client, value));
      const before = await staff(B.client, adminActor.userId, () => one(B.client, 'select public.has_effective_platform_access() access,app_private.has_platform_admin_role() admin'));
      assert.deepEqual(before, { access: true, admin: true });
      await begin(A.client, 'authenticated', owner.userId);
      await json(A.client, 'set_employee_access_status', [adminActor.employeeId, 'separated', 'Synthetic concurrent native offboarding.'], ['uuid', 'text', 'text']);
      await begin(B.client, 'authenticated', adminActor.userId); const pending = settle(approve(B.client, value));
      await waitBlocked(O.client, B.pid, A.pid, 'approval waits for role-management offboarding', barriers);
      await A.client.query('commit'); const rejection = requireFailure(await pending, ['42501']); await B.client.query('rollback');
      const after = await staff(B.client, adminActor.userId, () => one(B.client, 'select public.has_effective_platform_access() access,app_private.has_platform_admin_role() admin'));
      assert.deepEqual(after, { access: false, admin: false });
      const row = await one(O.client, 'select (select count(*)::integer from public.user_roles where user_id=$1) retained_roles,(select count(*)::integer from app_private.firewood_live_price_approvals where order_id=$2) approvals', [adminActor.userId, value.order_id]);
      assert.ok(row.retained_roles > 0); assert.equal(row.approvals, 0); return { sqlState: rejection, staleRoleCannotApprove: true, rolesRetained: true };
    });

    for (const winner of ['revocation', 'acceptance']) await add(winner + ' wins its serialized approval race without new debt', async () => {
      const value = fresh('revoke-' + winner); await service(A.client, () => registerDraft(A.client, value));
      const offer = await staff(A.client, owner.userId, () => approve(A.client, value)), accepted = acceptedPrice(value, offer);
      if (winner === 'revocation') {
        await begin(A.client, 'authenticated', owner.userId); await revoke(A.client, value);
        await begin(B.client, 'service_role'); const pending = settle(prepare(B.client, accepted));
        await waitBlocked(O.client, B.pid, A.pid, 'accept waits for revoked approval order', barriers);
        await A.client.query('commit'); requireFailure(await pending, ['42501']); await B.client.query('rollback');
        const count = await one(O.client, 'select count(*)::integer n from app_private.firewood_live_handoffs where order_id=$1', [value.order_id]); assert.equal(count.n, 0);
      } else {
        await begin(A.client, 'service_role'); const invoice = await prepare(A.client, accepted);
        await begin(B.client, 'authenticated', owner.userId); const pending = settle(revoke(B.client, value));
        await waitBlocked(O.client, B.pid, A.pid, 'revoke waits for accepted order', barriers);
        await A.client.query('commit'); requireFailure(await pending, ['23514']); await B.client.query('rollback');
        const row = await one(O.client, 'select consumed_invoice_id from app_private.firewood_live_price_approvals where id=$1', [offer.approval.approval_id]); assert.equal(row.consumed_invoice_id, invoice.invoice_id);
      }
      return { winningOperation: winner, noReplacementDebt: true };
    });

    await add('agreed window update and stale cancellation serialize before policy decision', async () => {
      const value = fresh('window-race'), invoice = await service(A.client, () => prepare(A.client, value));
      await begin(A.client, 'authenticated', owner.userId);
      await json(A.client, 'record_firewood_live_delivery', [invoice.invoice_id, 0, new Date(Date.now() + 72 * 3600000).toISOString(), new Date(Date.now() + 74 * 3600000).toISOString(), 'Synthetic actual customer agreement in native rehearsal.', randomUUID()], ['uuid', 'integer', 'timestamptz', 'timestamptz', 'text', 'uuid']);
      await begin(B.client, 'authenticated', owner.userId); const pending = settle(requestCancel(B.client, invoice.invoice_id, 0));
      await waitBlocked(O.client, B.pid, A.pid, 'cancellation waits for delivery revision', barriers);
      await A.client.query('commit'); requireFailure(await pending, ['40001']); await B.client.query('rollback');
      const result = await staff(B.client, owner.userId, () => requestCancel(B.client, invoice.invoice_id, 1));
      assert.equal(result.refund_eligibility, 'full'); assert.equal(result.revision, 2); return { staleRevisionDenied: true, recordedWindowRetained: true };
    });

    const insertCheckout = async (current, invoice, status = 'creating') => {
      return one(current, `insert into public.invoice_checkout_sessions(invoice_id,customer_id,organization_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,currency,payment_channel,status)
        select id,customer_id,organization_id,total_cents,total_cents,0,total_cents,'usd','ach',$2 from public.invoices where id=$1 returning id`, [invoice, status]);
    };
    const insertSyntheticSettledPayment = (current, invoice) => one(current, `insert into public.payments(invoice_id,customer_id,amount_cents,surcharge_cents,total_collected_cents,currency,payment_method,provider,provider_payment_id,status,paid_at,succeeded_at)
      select id,customer_id,total_cents,0,total_cents,'usd','ach','stripe',$2,'succeeded',clock_timestamp(),clock_timestamp()from public.invoices where id=$1 returning id`, [invoice, 'pi_NATIVE' + randomBytes(8).toString('hex')]);
    await add('checkout creation racing cancellation remains visible and blocks finalization', async () => {
      const value = fresh('checkout-race'), invoice = await service(A.client, () => prepare(A.client, value));
      await begin(A.client, 'service_role'); const attempt = await insertCheckout(A.client, invoice.invoice_id);
      await begin(B.client, 'authenticated', owner.userId); const pending = settle(requestCancel(B.client, invoice.invoice_id));
      await waitBlocked(O.client, B.pid, A.pid, 'cancel waits for creating checkout parent', barriers);
      await A.client.query('commit'); requireSuccess(await pending); await B.client.query('commit');
      const view = await staff(A.client, owner.userId, () => inspect(A.client, value));
      assert.equal(view.can_confirm, false); assert.equal(view.financial.payment_pending, true);
      await begin(B.client, 'service_role'); const denied = await settle(insertCheckout(B.client, invoice.invoice_id)); requireFailure(denied, ['23514']); await B.client.query('rollback');
      const row = await one(O.client, 'select status from public.invoice_checkout_sessions where id=$1', [attempt.id]); assert.equal(row.status, 'creating');
      return { creatingAttemptRetained: true, newCheckoutDenied: true, cancellationHeldForReview: true };
    });

    await add('late provider acknowledgement retries after parent contention without losing its guard', async () => {
      const value = fresh('late-ack'), invoice = await service(A.client, () => prepare(A.client, value));
      const attempt = await service(A.client, () => insertCheckout(A.client, invoice.invoice_id));
      await begin(A.client, 'authenticated', owner.userId); await requestCancel(A.client, invoice.invoice_id);
      await begin(B.client, 'service_role');
      const provider = 'cs_test_NATIVE' + randomBytes(8).toString('hex');
      const first = await settle(B.client.query("update public.invoice_checkout_sessions set stripe_checkout_session_id=$2,status='open'where id=$1", [attempt.id, provider]));
      requireFailure(first, ['55P03']); await B.client.query('rollback'); await A.client.query('commit');
      await service(B.client, () => B.client.query("update public.invoice_checkout_sessions set stripe_checkout_session_id=$2,status='open'where id=$1", [attempt.id, provider]));
      const row = await one(O.client, 'select stripe_checkout_session_id,status from public.invoice_checkout_sessions where id=$1', [attempt.id]);
      assert.deepEqual(row, { stripe_checkout_session_id: provider, status: 'open' });
      const view = await staff(A.client, owner.userId, () => inspect(A.client, value)); assert.equal(view.can_confirm, false);
      return { firstUpdateRetryable: true, providerReferenceRetainedOnRetry: true, noNewProviderRequest: true };
    });

    for (const phase of ['hold', 'finalization']) await add('late synthetic settlement survives cancellation ' + phase + ' without reopening collection', async () => {
      const value = fresh('late-settlement-' + phase), invoice = await service(A.client, () => prepare(A.client, value));
      if (phase === 'finalization') await staff(A.client, owner.userId, () => requestCancel(A.client, invoice.invoice_id));
      const view = phase === 'finalization' ? await staff(A.client, owner.userId, () => inspect(A.client, value)) : null;
      await begin(A.client, 'authenticated', owner.userId);
      if (phase === 'hold') await requestCancel(A.client, invoice.invoice_id);
      else {
        assert.equal(view.can_confirm, true);
        await json(A.client, 'confirm_firewood_live_cancellation', [invoice.invoice_id, view.lifecycle.revision, view.financial.ledger_hash, randomUUID(), 'Synthetic native clean finalization before delayed settlement.'], ['uuid', 'integer', 'text', 'uuid', 'text']);
      }
      await begin(B.client, 'service_role');
      const pending = settle(insertSyntheticSettledPayment(B.client, invoice.invoice_id));
      await waitBlocked(O.client, B.pid, A.pid, 'late settlement waits for cancellation ' + phase, barriers);
      await A.client.query('commit'); const payment = requireSuccess(await pending); await B.client.query('commit');
      await service(A.client, () => json(A.client, 'reconcile_invoice_balance', [invoice.invoice_id], ['uuid']));
      const raw = await service(A.client, () => json(A.client, 'read_firewood_live_handoff', [source, value.order_id, invoice.invoice_id, value.snapshot_hash], ['text', 'uuid', 'uuid', 'text']));
      assert.equal(raw.original_paid_evidence?.paid, true); assert.equal(raw.payments.length, 1); assert.equal(raw.payments[0].id, payment.id);
      assert.equal(raw.payments[0].status, 'succeeded'); assert.equal(raw.invoice.total_cents, 60000); assert.equal(raw.invoice.balance_due_cents, 0);
      assert.equal(raw.invoice.status, phase === 'hold' ? 'paid' : 'void'); assert.equal(raw.workflow.collection_held, true); assert.equal(raw.workflow.fulfillment_held, true);
      const after = await staff(A.client, owner.userId, () => inspect(A.client, value));
      assert.equal(after.financial_disposition, 'refund_review'); assert.equal(after.can_confirm, false);
      const collector = await service(A.client, () => json(A.client, 'get_firewood_live_collector_context', [invoice.invoice_id], ['uuid']));
      assert.equal(collector.allowed, false); assert.equal(collector.review_required, true);
      await begin(B.client, 'service_role'); requireFailure(await settle(insertCheckout(B.client, invoice.invoice_id)), ['23514']); await B.client.query('rollback');
      const audit = await one(O.client, "select count(*)::integer n from public.activity_log where subject_id=$1 and event_type='invoice_void_payment_conflict'", [invoice.invoice_id]);
      assert.equal(audit.n, phase === 'finalization' ? 1 : 0);
      return { syntheticLedgerNotProviderCall: true, cancellationPhase: phase, moneyAndOriginalReceiptPreserved: true, noNewCollection: true, refundReviewRequired: true, originalVoidConflictAudit: phase === 'finalization' };
    });

    await add('pending refund committed during observation wait invalidates the old paid ledger', async () => {
      const value = fresh('refund-cas'), invoice = await service(A.client, () => prepare(A.client, value));
      const payment = await service(A.client, () => insertSyntheticSettledPayment(A.client, invoice.invoice_id));
      await service(A.client, () => json(A.client, 'reconcile_invoice_balance', [invoice.invoice_id], ['uuid']));
      const args = [source, value.order_id, invoice.invoice_id, value.snapshot_hash], types = ['text', 'uuid', 'uuid', 'text'];
      const before = await service(A.client, () => json(A.client, 'read_firewood_live_handoff', args, types));
      assert.equal(before.original_paid_evidence?.paid, true, 'Real payment capture trigger must preserve the original receipt proof');
      const financial = { ...reduceSettlement({ principal: before.invoice.total_cents, invoice: before.invoice, payments: before.payments, attempts: before.attempts, refunds: before.refunds, preference: before.invoice.payment_preference, originalPaidEvidence: before.original_paid_evidence }), order_state: before.workflow.state, workflow_revision: before.workflow.revision };
      assert.equal(financial.payment_state, 'paid');
      await begin(B.client); await B.client.query('select id from public.invoices where id=$1 for update', [invoice.invoice_id]);
      const refundId = 're_NATIVE' + randomBytes(8).toString('hex');
      const eventId = 'evt_NATIVE' + randomBytes(8).toString('hex');
      await B.client.query("insert into public.stripe_webhook_events(event_id,event_type,livemode,invoice_id)values($1,'native.synthetic.refund',false,$2)", [eventId, invoice.invoice_id]);
      await B.client.query(`insert into app_private.stripe_refund_observations(refund_id,payment_id,amount_cents,currency,status,provider_created_at,event_id)
        values($1,$2,60000,'usd','pending',clock_timestamp(),$3)`, [refundId, payment.id, eventId]);
      await begin(A.client, 'service_role'); const pending = settle(json(A.client, 'record_firewood_live_handoff_observation', [...args, before.ledger_hash, financial], [...types, 'text', 'jsonb']));
      await waitBlocked(O.client, A.pid, B.pid, 'old paid observation waits for pending refund', barriers);
      await B.client.query('commit'); requireFailure(await pending, ['40001']); await A.client.query('rollback');
      const after = await service(A.client, () => json(A.client, 'read_firewood_live_handoff', args, types));
      assert.notEqual(after.ledger_hash, before.ledger_hash); assert.deepEqual(after.original_paid_evidence, before.original_paid_evidence);
      const observed = await one(O.client, 'select observation_revision from app_private.firewood_live_handoffs where invoice_id=$1', [invoice.invoice_id]); assert.equal(Number(observed.observation_revision), 0);
      return { stalePaidObservationDenied: true, originalPaidProofRetained: true, pendingRefundNotReturnedMoney: true };
    });

    await add('late acknowledgement failure rolls real invoice void and workflow back atomically', async () => {
      const value = fresh('late-audit'), invoice = await service(A.client, () => prepare(A.client, value));
      await staff(A.client, owner.userId, () => requestCancel(A.client, invoice.invoice_id));
      const view = await staff(A.client, owner.userId, () => inspect(A.client, value)); assert.equal(view.can_confirm, true);
      const key = randomUUID(); faultName = 'native_concurrency_ack_' + runId.replaceAll('-', '').slice(0, 12);
      await O.client.query(`create function app_private.${faultName}()returns trigger language plpgsql set search_path='' as $$begin
        if new.request_id='${key}'::uuid then raise exception 'Native rehearsal forced late acknowledgement failure';end if;return new;end$$`);
      await O.client.query(`create trigger ${faultName} before insert on app_private.firewood_live_office_receipts for each row execute function app_private.${faultName}()`);
      const args = [invoice.invoice_id, view.lifecycle.revision, view.financial.ledger_hash, key, 'Synthetic native final review.'], types = ['uuid', 'integer', 'text', 'uuid', 'text'];
      const denied = await settle(staff(A.client, owner.userId, () => json(A.client, 'confirm_firewood_live_cancellation', args, types)));
      requireFailure(denied, ['P0001']);
      const rolledBack = await one(O.client, `select i.status,i.total_cents,i.balance_due_cents,w.state,
        (select count(*)::integer from app_private.invoice_void_leases where invoice_id=i.id) leases,
        (select count(*)::integer from app_private.firewood_live_office_receipts where request_id=$2) acknowledgements
        from public.invoices i join app_private.firewood_live_order_workflows w on w.invoice_id=i.id where i.id=$1`, [invoice.invoice_id, key]);
      assert.deepEqual(rolledBack, { status: 'sent', total_cents: 60000, balance_due_cents: 60000, state: 'cancellation_requested', leases: 0, acknowledgements: 0 });
      await O.client.query(`drop trigger ${faultName} on app_private.firewood_live_office_receipts`); await O.client.query(`drop function app_private.${faultName}()`); faultName = null;
      const success = await staff(A.client, owner.userId, () => json(A.client, 'confirm_firewood_live_cancellation', args, types)); assert.equal(success.state, 'cancelled');
      const retry = await staff(A.client, owner.userId, () => json(A.client, 'confirm_firewood_live_cancellation', args, types)); assert.deepEqual(retry, success);
      const final = await one(O.client, 'select status,total_cents,balance_due_cents from public.invoices where id=$1', [invoice.invoice_id]);
      assert.deepEqual(final, { status: 'void', total_cents: 60000, balance_due_cents: 60000 });
      return { actualGuardedVoid: true, completeTransactionRollback: true, exactRetryOneAcknowledgement: true };
    });
    const after = await one(pool, 'select to_jsonb(s) row from app_private.firewood_live_handoff_sources s where id=$1', [source]); assert.deepEqual(after, sourceBefore);
    const proof = { kind: 'firewood-native-concurrency-v1', passed: true, target, runId, cases, barriers,
      sourceFlagsPreserved: true, actualNativeSessions: true, testAdminPredicateUsed: false,
      syntheticFixtureDataOnly: true, providerCalls: 0, emailsSent: 0, productionChanged: false,
      temporaryFaultArtifactsRemoved: true, observedAt: new Date().toISOString() };
    if (outputPath) writeFileSync(outputPath, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
    return proof;
  } catch (error) {
    if (outputPath) writeFileSync(outputPath, JSON.stringify({ kind: 'firewood-native-concurrency-v1', target, runId,
      passed: false, failedCase: currentCase, cases, barriers, error: { name: error.name, code: error.code ?? null, message: error.message },
      providerCalls: 0, emailsSent: 0, productionChanged: false, observedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
    throw error;
  } finally {
    for (const pid of backends.slice(0, 2)) {
      try { await pool.query("select pg_cancel_backend(pid)from pg_stat_activity where pid=$1 and application_name like $2 and state='active'", [pid, 'fw-native-conc:' + runId.slice(0, 8) + ':%']); } catch {}
    }
    for (const current of clients) { try { await current.query('rollback'); } catch {} }
    if (faultName) {
      try { await pool.query(`drop trigger if exists ${faultName} on app_private.firewood_live_office_receipts`); await pool.query(`drop function if exists app_private.${faultName}()`); } catch {}
    }
    for (const current of clients) current.release();
  }
}
