import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readyDb, q, role, admin, service, owner, source, request, rehash, prepare, priceRequest, inspect, fixtureSQL, boundarySQL, officeSQL } from './fixtures/firewood-office-db.mjs';
import { PGlite } from '@electric-sql/pglite';
import { officeBinding, parseOfficePriceRequest, parseOfficeOrderStatusRequest, validateOfficePriceReceipt,
  validateOfficeOrderStatus, signOfficeRequest, verifyOfficeSignature,
  OFFICE_PRICE_REQUEST_PATH, OFFICE_ORDER_STATUS_PATH } from '../src/lib/firewood/handoff/office-contract.mjs';
import { liveHandoffDigest } from '../src/lib/firewood/handoff/live-contract.mjs';
import { livePrepareFixture, liveStatusFixture, LIVE_TEST_INVOICE, LIVE_TEST_NOW } from './fixtures/firewood-live-fixture.mjs';
import { load } from './pr10-test-helpers.mjs';
import * as accountingContract from '../src/lib/firewood/handoff/office-accounting.mjs';

const officeCommand = load('../src/lib/firewood/office-command.ts', { 'server-only': {},
  './handoff/office-accounting.mjs': accountingContract,
  '../business-time.ts': load('../src/lib/business-time.ts') });

let serial = 7000;
const syntheticRequest = () => { const value = request(); value.order.contact.phone = '202555' + serial++; return rehash(value); };
const call = async (db, name, args) => (await admin(db, `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args))[0].value;
async function accepted(db) { const value = syntheticRequest(); return { value, receipt: await prepare(db, value) }; }
const cancel = (db, invoice, revision = 0, reason = 'customer_request', id = randomUUID()) => call(db, 'request_firewood_live_cancellation', [invoice, revision, reason, 'Synthetic office request; no customer transport.', id]);
const confirm = (db, invoice, revision, hash, id = randomUUID()) => call(db, 'confirm_firewood_live_cancellation', [invoice, revision, hash, id]);
async function payment(db, invoice, { status = 'succeeded', succeeded = true, amount = 60000, fee = 1800 } = {}) {
  return (await q(db, 'insert into public.payments(invoice_id,status,currency,provider,amount_cents,surcharge_cents,total_collected_cents,succeeded_at)values($1,$2,\'usd\',\'stripe\',$3,$4,$5,$6)returning id',
    [invoice, status, amount, fee, amount + fee, succeeded ? new Date().toISOString() : null]))[0].id;
}

test('office draft shape cannot authorize a browser price, actor, send or mutable customer substitution', () => {
  const prepared = livePrepareFixture(), draft = { quantity: prepared.order.quantity, stacking: prepared.order.stacking, contact: prepared.order.contact };
  const value = { ...officeBinding(prepared.order_id), draft, draft_hash: liveHandoffDigest(draft) };
  assert.equal(parseOfficePriceRequest(value, { allowSyntheticContacts: true }).draft.quantity, 'full');
  assert.throws(() => parseOfficePriceRequest(value), /office_request_invalid|live_request_binding_invalid/);
  for (const key of ['wood_cents', 'office_approval', 'actor_id', 'paid', 'send_email']) {
    const changed = structuredClone(value); changed.draft[key] = 1; changed.draft_hash = liveHandoffDigest(changed.draft);
    assert.throws(() => parseOfficePriceRequest(changed, { allowSyntheticContacts: true }));
  }
  const parsed = parseOfficePriceRequest(value, { allowSyntheticContacts: true }); value.draft.contact.name = 'Changed after parse';
  assert.notEqual(parsed.draft.contact.name, value.draft.contact.name); assert.ok(Object.isFrozen(parsed.draft.contact));
});

test('office signing is domain/path/clock/byte specific and does not accept an old handoff signature', () => {
  const raw = '{}', timestamp = String(LIVE_TEST_NOW / 1000), secret = 'a'.repeat(64);
  const signature = signOfficeRequest(raw, timestamp, secret, OFFICE_PRICE_REQUEST_PATH);
  const input = { raw, timestamp, secret, path: OFFICE_PRICE_REQUEST_PATH, signature, nowMs: LIVE_TEST_NOW };
  assert.equal(verifyOfficeSignature(input), true);
  for (const change of [{ raw: '{} ' }, { path: OFFICE_ORDER_STATUS_PATH }, { secret: 'b'.repeat(64) }, { nowMs: LIVE_TEST_NOW + 301000 }]) assert.equal(verifyOfficeSignature({ ...input, ...change }), false);
  const legacy = 'v1=' + createHmac('sha256', secret).update('ATS-FIREWOOD-LIVE-V1\n' + timestamp + '\nPOST\n' + OFFICE_PRICE_REQUEST_PATH + '\n' + raw).digest('hex');
  assert.equal(verifyOfficeSignature({ ...input, signature: legacy }), false);
  assert.throws(() => signOfficeRequest('é'.repeat(9000), timestamp, secret, OFFICE_PRICE_REQUEST_PATH));
});

function officeStatus(state = 'active', revision = 0) {
  const prepared = livePrepareFixture(), original = liveStatusFixture(prepared);
  const input = { ...officeBinding(prepared.order_id), snapshot_hash: prepared.snapshot_hash, invoice_id: LIVE_TEST_INVOICE,
    known_revision: null, known_workflow_revision: null };
  return { input, value: { ...original, ...officeBinding(prepared.order_id), order_state: state, workflow_revision: revision,
    accounting: { issued_at: new Date(LIVE_TEST_NOW).toISOString(), original_principal_cents: original.totals.invoice_principal_cents,
      raw_balance_due_cents: original.totals.balance_due_cents, credited_principal_cents: 0,
      collectible_balance_cents: original.totals.balance_due_cents, credit_id: null } } };
}
test('lifecycle DTO prevents stale financial state, rollback, identity/PII leakage and false fulfillment', () => {
  const { input, value } = officeStatus();
  parseOfficeOrderStatusRequest(input); assert.equal(validateOfficeOrderStatus(value, input).order_state, 'active');
  for (const change of [{ actor_id: owner }, { cancellation_reason: 'private' }, { contact: {} }, { workflow_revision: -1 }, { order_state: 'unknown' }, { fulfillment_ready: true }])
    assert.throws(() => validateOfficeOrderStatus({ ...value, ...change }, input));
  const held = { ...value, order_state: 'cancellation_requested', workflow_revision: 1, observation_revision: 2 };
  assert.equal(validateOfficeOrderStatus(held, input, value).fulfillment_ready, false);
  assert.throws(() => validateOfficeOrderStatus(value, input, held));
  assert.throws(() => validateOfficeOrderStatus({ ...held, workflow_revision: 0 }, { ...input, known_workflow_revision: 1 }));
  assert.throws(() => validateOfficeOrderStatus({ ...held, order_state: 'cancelled' }, input, held));
  const closed = { ...held, order_state: 'cancelled', workflow_revision: 2, observation_revision: 3 };
  assert.throws(() => validateOfficeOrderStatus({ ...held, workflow_revision: 3, observation_revision: 4 }, input, closed));
  assert.throws(() => validateOfficeOrderStatus({ ...held, workflow_revision: 0 }, input));
});

test('approved price receipt cannot claim an expiry at or before its trusted approval time', () => {
  const prepared = livePrepareFixture(), draft = { quantity: 'full', stacking: true, contact: prepared.order.contact };
  const input = { ...officeBinding(prepared.order_id), draft_hash: liveHandoffDigest(draft), draft };
  const { draft: omitted, ...binding } = input;
  const receipt = { ...binding, revision: 2, status: 'approved', approval: { approval_id: randomUUID(), approved_at_ms: LIVE_TEST_NOW,
    residential: true, single_discount_confirmed: true, expires_at: new Date(LIVE_TEST_NOW + 86400000).toISOString() },
    prices: { wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 } };
  assert.equal(validateOfficePriceReceipt(receipt, input).status, 'approved');
  for (const expires of [LIVE_TEST_NOW, LIVE_TEST_NOW - 1])
    assert.throws(() => validateOfficePriceReceipt({ ...receipt, approval: { ...receipt.approval, expires_at: new Date(expires).toISOString() } }, input));
});

test('office SQL rejects unauthorized reads/writes, actual disabled access and forged actor replay', async t => {
  const db = await readyDb(); try {
    const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
    await t.test('no anon/service/session-bypassed office commands or direct private table rights', async () => {
      for (const roleName of ['anon', 'service_role']) for (const sql of ['select public.list_firewood_live_office(1,20)', 'select public.inspect_firewood_live_office($1)'])
        await assert.rejects(role(db, roleName, sql, sql.includes('$1') ? [value.order_id] : []), /permission denied|owner or admin/);
      await assert.rejects(role(db, 'authenticated', 'select public.inspect_firewood_live_office($1)', [value.order_id], { user: owner, admin: false }), /owner or admin/);
      for (const table of ['firewood_live_office_requests', 'firewood_live_order_workflows', 'firewood_live_office_events', 'firewood_live_office_receipts']) {
        const rights = (await q(db, "select has_table_privilege('anon',$1,'SELECT,INSERT,UPDATE,DELETE') a,has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') u,has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') s", ['app_private.' + table]))[0];
        assert.deepEqual(rights, { a: false, u: false, s: false });
      }
    });
    await t.test('server time, immutable reason and request identity survive repeated cancellation', async () => {
      const id = randomUUID(), before = Date.now(), result = await cancel(db, invoice, 0, 'customer_request', id), after = Date.now();
      assert.equal(result.state, 'cancellation_requested'); assert.equal(result.refund_eligibility, 'full');
      assert.ok(Date.parse(result.requested_at) >= before - 5 && Date.parse(result.requested_at) <= after + 5);
      assert.deepEqual(await cancel(db, invoice, 0, 'customer_request', id), result);
      await assert.rejects(cancel(db, invoice, 0, 'angel_cancelled', id), /identity changed/);
      await assert.rejects(call(db, 'record_firewood_live_delivery', [invoice, 1, new Date(Date.now() + 9000000), new Date(Date.now() + 10000000), 'Changed after hold', randomUUID()]), /workflow changed/);
      const other = randomUUID(); await q(db, 'insert into auth.users values($1)', [other]);
      await assert.rejects(role(db, 'authenticated', 'select public.request_firewood_live_cancellation($1,$2,$3,$4,$5)', [invoice, 0, 'customer_request', 'Synthetic office request; no customer transport.', id], { user: other, admin: true }), /identity changed/);
      assert.equal((await inspect(db, value)).lifecycle.revision, 1);
    });
    await t.test('clean full-eligible confirmation uses original guarded void without rewriting amounts or deleting history', async () => {
      const snapshot = await inspect(db, value), id = randomUUID();
      const result = await confirm(db, invoice, 1, snapshot.financial.ledger_hash, id);
      assert.equal(result.state, 'cancelled'); assert.deepEqual(await confirm(db, invoice, 1, snapshot.financial.ledger_hash, id), result);
      assert.deepEqual((await q(db, 'select status,total_cents,balance_due_cents from public.invoices where id=$1', [invoice]))[0], { status: 'void', total_cents: 60000, balance_due_cents: 60000 });
      assert.equal((await q(db, 'select count(*)::integer n from app_private.invoice_void_leases where invoice_id=$1', [invoice]))[0].n, 0);
      assert.equal((await q(db, "select count(*)::integer n from public.activity_log where subject_id=$1 and event_type='invoice_voided'", [invoice]))[0].n, 1);
      for (const sql of ['delete from app_private.firewood_live_office_events', 'delete from app_private.firewood_live_office_receipts', "update app_private.firewood_live_order_workflows set state='active',revision=revision+1"]) await assert.rejects(db.exec(sql), /immutable/);
      assert.equal((await q(db, 'select count(*)::integer n from public.payments'))[0].n, 0);
    });
  } finally { await db.close(); }
});

test('genuine office approval uses the stored customer draft and cannot be forged, swapped or replayed as a new price', async () => {
  const db = await readyDb(); try {
    const value = syntheticRequest(); await priceRequest(db, value);
    const args = [value.order_id, 1, 42750, 14250, 'Synthetic reviewed residential price.', randomUUID()];
    await assert.rejects(service(db, 'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)', args), /permission denied|owner or admin/);
    await assert.rejects(role(db, 'authenticated', 'select public.approve_firewood_live_office_request($1,$2,$3,$4,$5,$6)', args, { user: owner, admin: false }), /owner or admin/);
    const approved = await call(db, 'approve_firewood_live_office_request', args);
    assert.equal(approved.status, 'approved'); assert.equal(approved.prices.principal_cents, 57000);
    assert.deepEqual(await call(db, 'approve_firewood_live_office_request', args), approved);
    await assert.rejects(call(db, 'approve_firewood_live_office_request', [...args.slice(0, 2), 42000, ...args.slice(3)]), /identity changed/);
    const swapped = structuredClone(value); swapped.order.contact.address = '2 Changed After Office Review';
    await assert.rejects(priceRequest(db, rehash(swapped)), /identity changed/);
    const { expires_at, ...assertion } = approved.approval;
    value.order.office_approval = assertion; value.order.accepted_at_ms = Date.now();
    value.order.wood_cents = 42750; value.order.stacking_cents = 14250; value.order.principal_cents = 57000;
    const forged = structuredClone(value); forged.order.office_approval.approval_id = randomUUID();
    await assert.rejects(prepare(db, rehash(forged)), /Trusted CRM office approval/);
    const substituted = structuredClone(value); substituted.order.contact.email = 'substituted@angeltreeservice.org';
    await assert.rejects(prepare(db, rehash(substituted)), /Trusted CRM office approval/);
    const accepted = await prepare(db, rehash(value)); assert.equal(accepted.principal_cents, 57000);
    await assert.rejects(call(db, 'revoke_firewood_live_office_request', [value.order_id, 2, 'Must preserve accepted price.', randomUUID()]), /Accepted price is frozen/);
    const detail = await inspect(db, value); assert.equal(detail.order.wood_cents, 42750); assert.equal(detail.order.stacking_cents, 14250);
    assert.equal((await q(db, "select count(*)::integer n from app_private.firewood_live_office_events where order_id=$1 and operation='price_approved'", [value.order_id]))[0].n, 1);
  } finally { await db.close(); }
});

test('cancellation safety retains processing money, provider references and late payment evidence', async t => {
  const db = await readyDb(); try {
    await t.test('hold blocks new/reopened checkout but permits existing provider references and settlement', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
      const checkout = (await q(db, "insert into public.invoice_checkout_sessions(invoice_id,customer_id,organization_id,invoice_principal_cents,total_charge_cents,status)select id,customer_id,organization_id,total_cents,total_cents,'creating'from public.invoices where id=$1 returning id", [invoice]))[0].id;
      await cancel(db, invoice);
      await q(db, "update public.invoice_checkout_sessions set status='open',stripe_checkout_session_id='cs_synthetic_known'where id=$1", [checkout]);
      let snapshot = await inspect(db, value); assert.equal(snapshot.financial_disposition, 'awaiting_settlement');
      await assert.rejects(confirm(db, invoice, 1, snapshot.financial.ledger_hash), /needs review/);
      await assert.rejects(q(db, "insert into public.invoice_checkout_sessions(invoice_id,status)values($1,'creating')", [invoice]), /cannot start/);
      await q(db, "update public.invoice_checkout_sessions set status='expired'where id=$1", [checkout]);
      await assert.rejects(q(db, "update public.invoice_checkout_sessions set status='open'where id=$1", [checkout]), /cannot be reopened/);
      snapshot = await inspect(db, value); assert.equal(snapshot.financial_disposition, 'billing_closure_required');
      await assert.rejects(confirm(db, invoice, 1, snapshot.financial.ledger_hash), /needs review/);
      assert.equal(snapshot.lifecycle.state, 'cancellation_requested');
      assert.equal((await service(db, 'select public.get_firewood_live_collector_context($1)value', [invoice]))[0].value.allowed, false);
    });
    await t.test('late provider money is retained after a clean confirmed void and returns to review', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
      await cancel(db, invoice); const held = await inspect(db, value);
      await confirm(db, invoice, 1, held.financial.ledger_hash);
      await payment(db, invoice); await q(db, 'update public.invoices set balance_due_cents=0 where id=$1', [invoice]);
      const snapshot = await inspect(db, value);
      assert.equal(snapshot.lifecycle.state, 'cancelled'); assert.equal(snapshot.financial_disposition, 'refund_review');
      assert.equal((await q(db, 'select original_paid_evidence is not null known from app_private.firewood_live_handoffs where invoice_id=$1', [invoice]))[0].known, true);
      assert.equal((await q(db, "select count(*)::integer n from public.activity_log where subject_id=$1 and event_type='invoice_void_payment_conflict'", [invoice]))[0].n, 1);
    });
    await t.test('returned bank money is review, never another automatic refund', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
      await payment(db, invoice, { status: 'failed', succeeded: true, fee: 0 }); await cancel(db, invoice);
      const snapshot = await inspect(db, value); assert.equal(snapshot.financial_disposition, 'payment_review');
      await assert.rejects(confirm(db, invoice, 1, snapshot.financial.ledger_hash), /needs review/);
    });
    await t.test('new pending refund invalidates a previously verified confirmation snapshot', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id, paid = await payment(db, invoice);
      await q(db, "update public.invoices set status='paid',balance_due_cents=0 where id=$1", [invoice]); await cancel(db, invoice);
      const old = await inspect(db, value);
      await q(db, "insert into app_private.stripe_refund_observations values('re_security_pending',$1,61800,'usd','pending')", [paid]);
      const changed = await inspect(db, value); assert.equal(changed.financial_disposition, 'awaiting_refund');
      assert.notEqual(changed.financial.ledger_hash, old.financial.ledger_hash);
      await assert.rejects(confirm(db, invoice, 1, old.financial.ledger_hash), /Financial observation changed/);
      await assert.rejects(confirm(db, invoice, 1, changed.financial.ledger_hash), /needs review/);
    });
    await t.test('inconsistent balance and aggregate over-refund remain unverified', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id, paid = await payment(db, invoice);
      await cancel(db, invoice);
      let snapshot = await inspect(db, value); assert.equal(snapshot.financial.verified, false); assert.equal(snapshot.financial_disposition, 'payment_review');
      await q(db, "update public.invoices set status='paid',balance_due_cents=0 where id=$1", [invoice]);
      await q(db, "insert into app_private.stripe_refund_observations values('re_security_1',$1,61800,'usd','succeeded'),('re_security_2',$1,61800,'usd','succeeded')", [paid]);
      snapshot = await inspect(db, value); assert.equal(snapshot.financial.verified, false); assert.equal(snapshot.financial_disposition, 'payment_review');
      await assert.rejects(confirm(db, invoice, 1, snapshot.financial.ledger_hash), /needs review/);
    });
  } finally { await db.close(); }
});

test('48-hour policy uses finite agreed instants and server receipt time, then freezes the decision', async () => {
  const db = await readyDb(); try {
    for (const offset of [49, 47]) {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
      const start = new Date(Date.now() + offset * 3600000).toISOString(), end = new Date(Date.parse(start) + 7200000).toISOString();
      await call(db, 'record_firewood_live_delivery', [invoice, 0, start, end, 'Synthetic recorded customer agreement.', randomUUID()]);
      const cancelled = await cancel(db, invoice, 1);
      assert.equal(cancelled.refund_eligibility, offset === 49 ? 'full' : 'non_refundable');
      assert.equal((await inspect(db, value)).lifecycle.delivery_window_start, cancelled.delivery_window_start);
    }
    const { receipt } = await accepted(db);
    for (const [start, end] of [['-infinity', 'infinity'], [new Date().toISOString(), 'infinity']])
      await assert.rejects(call(db, 'record_firewood_live_delivery', [receipt.invoice_id, 0, start, end, 'Invalid window must not be retained.', randomUUID()]), /window/);
    for (const reason of ['angel_cancelled', 'cannot_fulfill', 'declined_angel_reschedule']) {
      const { receipt } = await accepted(db), invoice = receipt.invoice_id;
      const start = new Date(Date.now() + 3600000).toISOString();
      await call(db, 'record_firewood_live_delivery', [invoice, 0, start, new Date(Date.parse(start) + 3600000).toISOString(), 'Synthetic agreed window.', randomUUID()]);
      assert.equal((await cancel(db, invoice, 1, reason)).refund_eligibility, 'full');
    }
  } finally { await db.close(); }
});

test('candidate remains default-off and SQL office commands have no provider/send execution', () => {
  const root = new URL('../', import.meta.url);
  assert.match(readFileSync(new URL('src/lib/firewood/office-runtime.ts', root), 'utf8'), /return null/);
  const sql = readFileSync(new URL('../../../supabase/review/firewood-live/office-workflows.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /net\.http|http_post|stripe\.refund|resend|insert into public\.payments|update public\.invoices set status\s*=\s*'void'/i);
  assert.doesNotMatch(sql, /insert into app_private\.firewood_live_handoff_sources/i);
});

test('actual office command preserves session authority, rejects polluted forms and uses real named SQL arguments', async () => {
  const db = await readyDb(); try {
    const { value, receipt } = await accepted(db); let calls = 0;
    const client = { rpc(name, args) { calls++;
      assert.match(name, /^[a-z_]+$/); const keys = Object.keys(args); keys.forEach(key => assert.match(key, /^p_[a-z_]+$/));
      return { async abortSignal() {
        try { return { data: (await admin(db, `select public.${name}(${keys.map((key, i) => key + ' => $' + (i + 1)).join(',')}) value`, Object.values(args)))[0].value, error: null }; }
        catch (error) { return { data: null, error }; }
      } };
    } };
    const deps = { client, userId: owner, roles: ['owner'], admitted: true };
    const form = new FormData(), snapshot = await inspect(db, value);
    for (const [key, val] of Object.entries({ intent: 'request_cancellation', request_id: randomUUID(), order_id: value.order_id,
      expected_revision: '0', invoice_id: receipt.invoice_id, ledger_hash: snapshot.financial.ledger_hash,
      reason: 'Synthetic authenticated office workflow.', cancellation_reason: 'customer_request', confirm_hold: 'confirmed' })) form.set(key, val);
    for (const changed of [{ admitted: false }, { roles: ['estimator'] }, { userId: null }])
      assert.equal((await officeCommand.runFirewoodOfficeCommand(form, { ...deps, ...changed })).status, 'error');
    assert.equal(calls, 0);
    form.set('actor_id', owner); assert.equal((await officeCommand.runFirewoodOfficeCommand(form, deps)).status, 'error'); assert.equal(calls, 0); form.delete('actor_id');
    form.append('invoice_id', receipt.invoice_id); assert.equal((await officeCommand.runFirewoodOfficeCommand(form, deps)).status, 'error'); assert.equal(calls, 0); form.set('invoice_id', receipt.invoice_id);
    assert.equal((await officeCommand.runFirewoodOfficeCommand(form, deps)).status, 'success');
    const held = await inspect(db, value), confirmation = new FormData();
    for (const [key, val] of Object.entries({ intent: 'confirm_cancellation', request_id: randomUUID(), order_id: value.order_id,
      expected_revision: '1', expected_cancellation_revision: '1', invoice_id: receipt.invoice_id, ledger_hash: held.financial.ledger_hash,
      reason: 'Synthetic fresh payment review.', confirm_cancellation: 'confirmed' })) confirmation.set(key, val);
    assert.equal((await officeCommand.runFirewoodOfficeCommand(confirmation, deps)).status, 'success');
    assert.equal((await officeCommand.runFirewoodOfficeCommand(confirmation, deps)).status, 'success');
    assert.equal((await inspect(db, value)).lifecycle.state, 'cancelled');
    assert.equal((await q(db, "select count(*)::integer n from app_private.firewood_live_office_events where order_id=$1 and operation='cancellation_confirmed'", [value.order_id]))[0].n, 1);
  } finally { await db.close(); }
});

test('office delivery parser uses Eastern instants and rejects missing or repeated DST wall time', () => {
  assert.equal(officeCommand.parseFirewoodOfficeTime('2026-10-30T10:00'), '2026-10-30T14:00:00.000Z');
  for (const value of ['2026-03-08T02:30', '2026-11-01T01:30', '2026-02-30T10:00', 'infinity', '2026-10-30T10:00Z']) assert.equal(officeCommand.parseFirewoodOfficeTime(value), null);
});

test('guarded cancellation closes clean debt atomically but never voids refund history or an unpaid late cancellation', async t => {
  const db = await readyDb(); try {
    await t.test('actual retained 102 void function definitions are loaded unchanged', async () => {
      for (const [name, expected] of Object.entries({ 'public.begin_invoice_void(uuid)': '8dfe8cbfd1efa3a316473b36d6012e685cc84b2a3f1c9b89536f228e389743c5',
        'public.finalize_invoice_void(uuid,uuid)': 'a37614a72898b675638dcb2745c58151d6fcaca4996bd68cacd06a31e96db9c3' })) {
        const definition = (await q(db, 'select pg_get_functiondef($1::regprocedure) value', [name]))[0].value;
        assert.equal(createHash('sha256').update(definition).digest('hex'), expected);
      }
    });
    await t.test('owned generic void lease alone cannot void an active live order', async () => {
      const { receipt } = await accepted(db), invoice = receipt.invoice_id;
      const lease = await call(db, 'begin_invoice_void', [invoice]);
      await assert.rejects(call(db, 'finalize_invoice_void', [invoice, lease.token]), /coordinated cancellation/);
      assert.equal((await q(db, 'select status from public.invoices where id=$1', [invoice]))[0].status, 'sent');
      await call(db, 'release_invoice_void', [invoice, lease.token]);
    });
    await t.test('a failure after actual void rolls back status, reminder cancellation, lease, audits and acknowledgement', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
      await q(db, "insert into public.customer_communications(invoice_id,status)values($1,'pending')", [invoice]);
      await cancel(db, invoice); const before = await inspect(db, value), id = randomUUID();
      await db.exec("create function public.fail_office_ack_security()returns trigger language plpgsql as $$begin raise exception 'Synthetic final office acknowledgement failure';end$$;create trigger fail_office_ack_security before insert on app_private.firewood_live_office_receipts for each row when(new.operation='cancellation_confirmed')execute function public.fail_office_ack_security()");
      await assert.rejects(confirm(db, invoice, 1, before.financial.ledger_hash, id), /Synthetic final office/);
      assert.deepEqual((await q(db, 'select status,total_cents,balance_due_cents from public.invoices where id=$1', [invoice]))[0], { status: 'sent', total_cents: 60000, balance_due_cents: 60000 });
      assert.equal((await inspect(db, value)).lifecycle.state, 'cancellation_requested');
      assert.equal((await q(db, 'select status from public.customer_communications where invoice_id=$1', [invoice]))[0].status, 'pending');
      assert.equal((await q(db, 'select count(*)::integer n from app_private.invoice_void_leases where invoice_id=$1', [invoice]))[0].n, 0);
      assert.equal((await q(db, "select count(*)::integer n from public.activity_log where subject_id=$1 and event_type='invoice_voided'", [invoice]))[0].n, 0);
      assert.equal((await q(db, 'select count(*)::integer n from app_private.firewood_live_office_receipts where request_id=$1', [id]))[0].n, 0);
      await db.exec('drop trigger fail_office_ack_security on app_private.firewood_live_office_receipts');
      await confirm(db, invoice, 1, before.financial.ledger_hash, id);
      assert.equal((await q(db, 'select status from public.invoices where id=$1', [invoice]))[0].status, 'void');
      assert.equal((await q(db, 'select status from public.customer_communications where invoice_id=$1', [invoice]))[0].status, 'cancelled');
    });
    await t.test('fully refunded history stays held for real billing closure and original void protections still reject it', async () => {
      const { value, receipt } = await accepted(db), invoice = receipt.invoice_id, paid = await payment(db, invoice);
      await q(db, "update public.payments set status='refunded',refunded_principal_cents=60000,refunded_surcharge_cents=1800 where id=$1", [paid]);
      await q(db, "insert into app_private.stripe_refund_observations values('re_security_billing_full',$1,61800,'usd','succeeded')", [paid]);
      await cancel(db, invoice); const snapshot = await inspect(db, value);
      assert.equal(snapshot.financial.verified, true); assert.equal(snapshot.financial_disposition, 'billing_closure_required');
      await assert.rejects(confirm(db, invoice, 1, snapshot.financial.ledger_hash), /needs review/);
      await assert.rejects(call(db, 'begin_invoice_void', [invoice]), /payment activity/);
      assert.equal((await inspect(db, value)).lifecycle.state, 'cancellation_requested');
      assert.equal((await q(db, 'select status from public.invoices where id=$1', [invoice]))[0].status, 'sent');
    });
    await t.test('fully paid late non-refundable cancellation retains the paid invoice; unpaid late cancellation remains billing review', async () => {
      for (const paid of [false, true]) {
        const { value, receipt } = await accepted(db), invoice = receipt.invoice_id;
        if (paid) { await payment(db, invoice); await q(db, "update public.invoices set status='paid',balance_due_cents=0 where id=$1", [invoice]); }
        const start = new Date(Date.now() + 3600000).toISOString();
        await call(db, 'record_firewood_live_delivery', [invoice, 0, start, new Date(Date.parse(start) + 3600000).toISOString(), 'Synthetic agreed delivery window.', randomUUID()]);
        await cancel(db, invoice, 1); const snapshot = await inspect(db, value);
        assert.equal(snapshot.lifecycle.refund_eligibility, 'non_refundable');
        if (paid) {
          await confirm(db, invoice, 2, snapshot.financial.ledger_hash);
          assert.equal((await inspect(db, value)).lifecycle.state, 'cancelled');
          assert.equal((await q(db, 'select status from public.invoices where id=$1', [invoice]))[0].status, 'paid');
        } else {
          assert.equal(snapshot.financial_disposition, 'billing_closure_required');
          await assert.rejects(confirm(db, invoice, 2, snapshot.financial.ledger_hash), /needs review/);
          assert.equal((await inspect(db, value)).lifecycle.state, 'cancellation_requested');
        }
      }
    });
  } finally { await db.close(); }
});

test('missing original guarded-void prerequisites fail the entire office installation closed', async () => {
  const db = new PGlite(); try {
    await db.exec(fixtureSQL); await db.exec("select set_config('ats.firewood_live_review','isolated-synthetic-only',false)");
    await db.exec(boundarySQL);
    await assert.rejects(db.exec(officeSQL), /guarded invoice void prerequisites/);
    assert.equal((await q(db, "select to_regclass('app_private.firewood_live_office_requests')is null absent"))[0].absent, true);
  } finally { await db.close(); }
});
