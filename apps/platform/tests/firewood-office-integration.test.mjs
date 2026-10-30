import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { accountingReadyDb as readyDb, admin, service, q, request, rehash, prepare, source, owner } from './fixtures/firewood-accounting-db.mjs';
import { officeBinding, signOfficeRequest, OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH } from '../src/lib/firewood/handoff/office-contract.mjs';
import { liveHandoffDigest as liveDigest, LIVE_PREPARE_PATH, LIVE_STATUS_PATH } from '../src/lib/firewood/handoff/live-contract.mjs';
import { handleOfficeHandoff } from '../src/lib/firewood/handoff/office-handler.mjs';
import { nativeOfficeDatabase } from '../src/lib/firewood/handoff/office-database.mjs';
import { handleLiveHandoff } from '../src/lib/firewood/handoff/live-handler.mjs';
import { nativeLiveDatabase } from '../src/lib/firewood/handoff/live-database.mjs';
import { signLiveHandoff } from '../src/lib/firewood/handoff/live-contract.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from '../src/lib/firewood/handoff/live-profile.mjs';
import { load } from './pr10-test-helpers.mjs';
import * as accountingContract from '../src/lib/firewood/handoff/office-accounting.mjs';

const command = load('../src/lib/firewood/office-command.ts', { 'server-only': {}, './handoff/office-accounting.mjs': accountingContract, '../business-time.ts': load('../src/lib/business-time.ts') });
const workspace = load('../src/lib/firewood/office-workspace.ts', { 'server-only': {}, '../business-time.ts': load('../src/lib/business-time.ts'),
  './handoff/office-accounting.mjs': accountingContract,
  './handoff/live-contract.mjs': await import('../src/lib/firewood/handoff/live-contract.mjs') });
const rpcClient = db => ({ rpc(name, args) { return { async abortSignal() {
  try { const keys = Object.keys(args); assert.match(name, /^[a-z_]+$/); keys.forEach(key => assert.match(key, /^p_[a-z_]+$/));
    return { data: (await admin(db, 'select public.' + name + '(' + keys.map((key, i) => key + '=>$' + (i + 1)).join(',') + ') as result', Object.values(args)))[0].result, error: null };
  } catch (error) { return { data: null, error }; }
} }; } });
const form = values => { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, String(value)); return result; };

test('real signed bridge, authenticated form and SQL preserve one genuine approved order through cancellation status', async () => {
  const db = await readyDb();
  try {
    const config = { ...FIREWOOD_LIVE_REVIEW_PROFILE, profile: 'live', enabled: true, officeEnabled: true,
      keyId: 'isolated-live-office-integration', signingSecret: randomBytes(32).toString('hex'), encryptionKey: randomBytes(32), collectorReady: false };
    const pool = { async query(query) { return { rows: await service(db, query.text, query.values) }; } };
    const officeDb = nativeOfficeDatabase(pool), liveDb = nativeLiveDatabase(pool), value = request();
    const draft = { quantity: value.order.quantity, stacking: value.order.stacking, contact: value.order.contact };
    const priceInput = { ...officeBinding(value.order_id), draft, draft_hash: liveDigest(draft) };
    const send = async (path, input, old = false) => {
      const raw = JSON.stringify(input), timestamp = String(Math.floor(Date.now() / 1000));
      const signature = old ? signLiveHandoff(raw, timestamp, config.signingSecret, path) : signOfficeRequest(raw, timestamp, config.signingSecret, path);
      const request = new Request(config.portalOrigin + path, { method: 'POST', body: raw,
        headers: { 'content-type': 'application/json', 'x-ats-key-id': config.keyId, 'x-ats-timestamp': timestamp, 'x-ats-signature': signature } });
      return old ? handleLiveHandoff(request, { config, db: liveDb }) : handleOfficeHandoff(request, { config, db: officeDb });
    };
    const pending = await send(OFFICE_PRICE_REQUEST_PATH, priceInput); assert.equal(pending.status, 200);
    const pendingBody = await pending.json(); assert.equal(pendingBody.status, 'pending'); assert.equal(pendingBody.approval, null);
    const client = rpcClient(db), dependencies = { client, userId: owner, roles: ['owner'], admitted: true };
    const initialModel = await workspace.readFirewoodOfficeWorkspace(client, { office_order: value.order_id }, dependencies);
    assert.equal(initialModel.status, 'ready'); assert.equal(initialModel.selected.kind, 'price_review');
    assert.equal(initialModel.selected.contact.name, value.order.contact.name);
    const approvalForm = form({ intent: 'approve_price', order_id: value.order_id, request_id: randomUUID(), expected_revision: 1,
      draft_hash: priceInput.draft_hash, wood_price: '427.50', stacking_price: '142.50', reason: 'Reviewed residential veterans price; one discount.', office_price_confirmed: 'confirmed' });
    assert.equal((await command.runFirewoodOfficeCommand(approvalForm, dependencies)).status, 'success');
    assert.equal((await command.runFirewoodOfficeCommand(approvalForm, dependencies)).status, 'success');
    const { draft: omitted, ...priceRead } = priceInput;
    const approvedResponse = await send(OFFICE_PRICE_STATUS_PATH, priceRead); assert.equal(approvedResponse.status, 200);
    const approved = await approvedResponse.json(); assert.equal(approved.status, 'approved'); assert.equal(approved.prices.principal_cents, 57000);
    assert.equal('contact' in approved, false); assert.equal('actor_id' in approved, false);
    const { expires_at, ...assertion } = approved.approval;
    Object.assign(value.order, approved.prices, { office_approval: assertion, accepted_at_ms: Date.now() });
    const accepted = rehash(value), prepared = await send(LIVE_PREPARE_PATH, accepted, true);
    assert.equal(prepared.status, 201); const receipt = await prepared.json();
    const again = await send(LIVE_PREPARE_PATH, accepted, true); assert.equal((await again.json()).invoice_id, receipt.invoice_id);
    const orderInput = { ...officeBinding(value.order_id), snapshot_hash: accepted.snapshot_hash, invoice_id: receipt.invoice_id, known_revision: null, known_workflow_revision: null };
    const initialStatus = await send(OFFICE_ORDER_STATUS_PATH, orderInput); assert.equal(initialStatus.status, 200, JSON.stringify(await initialStatus.clone().json()));
    const active = await initialStatus.json(); assert.equal(active.order_state, 'active'); assert.equal(active.workflow_revision, 0);
    const oldInput = { ...accepted, invoice_id: receipt.invoice_id, known_revision: null }; delete oldInput.order;
    const oldStatus = await send(LIVE_STATUS_PATH, oldInput, true); assert.equal(oldStatus.status, 503); assert.equal((await oldStatus.json()).code, 'office_workflow_status_required');
    const selected = await workspace.readFirewoodOfficeWorkspace(client, { office_order: value.order_id, office_invoice: receipt.invoice_id }, dependencies);
    assert.equal(selected.status, 'ready'); assert.equal(selected.selected.kind, 'accepted_order');
    assert.equal(selected.selected.woodCents, 42750); assert.equal(selected.selected.stackingCents, 14250);
    const cancelForm = form({ intent: 'request_cancellation', order_id: value.order_id, invoice_id: receipt.invoice_id,
      request_id: randomUUID(), expected_revision: 0, ledger_hash: selected.selected.ledgerHash, cancellation_reason: 'customer_request',
      reason: 'Customer asked to cancel before delivery was scheduled.', confirm_hold: 'confirmed' });
    assert.equal((await command.runFirewoodOfficeCommand(cancelForm, dependencies)).status, 'success');
    const heldResponse = await send(OFFICE_ORDER_STATUS_PATH, { ...orderInput, known_revision: active.observation_revision, known_workflow_revision: 0 });
    assert.equal(heldResponse.status, 200); const held = await heldResponse.json();
    assert.equal(held.order_state, 'cancellation_requested'); assert.equal(held.fulfillment_ready, false);
    assert.ok(held.observation_revision > active.observation_revision); assert.equal(held.workflow_revision, 1);
    const replayAfterHold = await send(LIVE_PREPARE_PATH, accepted, true); const heldPrepare = await replayAfterHold.json();
    assert.equal(heldPrepare.invoice_id, receipt.invoice_id); assert.equal(heldPrepare.payment_execution_ready, false);
    assert.deepEqual(heldPrepare.execution_blockers, ['order_cancellation_hold']);
    const heldModel = await workspace.readFirewoodOfficeWorkspace(client, { office_order: value.order_id }, dependencies);
    assert.equal(heldModel.entries[0].statusLabel, 'Cancellation requested');
    assert.equal((await q(db, 'select count(*)::integer n from public.invoices'))[0].n, 1);
    assert.equal((await q(db, 'select count(*)::integer n from public.payments'))[0].n, 0);
  } finally { await db.close(); }
});

test('actual office status keeps paid money truthful while cancellation and pending refunds independently hold fulfillment', async () => {
  const db = await readyDb();
  try {
    const value = request(), receipt = await prepare(db, value);
    const payment = (await q(db, "insert into public.payments(invoice_id,status,currency,provider,amount_cents,surcharge_cents,total_collected_cents,succeeded_at)values($1,'succeeded','usd','stripe',60000,1800,61800,clock_timestamp())returning id", [receipt.invoice_id]))[0].id;
    await q(db, "update public.invoices set status='paid',balance_due_cents=0 where id=$1", [receipt.invoice_id]);
    const config = { ...FIREWOOD_LIVE_REVIEW_PROFILE, profile: 'live', enabled: true, officeEnabled: true,
      keyId: 'isolated-live-office-paid-fixture', signingSecret: randomBytes(32).toString('hex'), encryptionKey: randomBytes(32), collectorReady: false };
    const dbAdapter = nativeOfficeDatabase({ async query(query) { return { rows: await service(db, query.text, query.values) }; } });
    const input = { ...officeBinding(value.order_id), snapshot_hash: value.snapshot_hash, invoice_id: receipt.invoice_id,
      known_revision: null, known_workflow_revision: null };
    const read = async () => {
      const raw = JSON.stringify(input), timestamp = String(Math.floor(Date.now() / 1000));
      const response = await handleOfficeHandoff(new Request(config.portalOrigin + OFFICE_ORDER_STATUS_PATH, { method: 'POST', body: raw,
        headers: { 'content-type': 'application/json', 'x-ats-key-id': config.keyId, 'x-ats-timestamp': timestamp,
          'x-ats-signature': signOfficeRequest(raw, timestamp, config.signingSecret, OFFICE_ORDER_STATUS_PATH) } }), { config, db: dbAdapter });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); return response.json();
    };
    const paid = await read(); assert.equal(paid.payment_state, 'paid'); assert.equal(paid.fulfillment_ready, true);
    assert.equal(paid.totals.gross_collected_cents, 61800);
    await admin(db, 'select public.request_firewood_live_cancellation($1,$2,$3,$4,$5)', [receipt.invoice_id, 0, 'customer_request', 'Synthetic cancellation before scheduling.', randomUUID()]);
    const held = await read(); assert.equal(held.payment_state, 'paid'); assert.equal(held.order_state, 'cancellation_requested'); assert.equal(held.fulfillment_ready, false);
    assert.deepEqual(held.original_paid_evidence, paid.original_paid_evidence); assert.ok(held.observation_revision > paid.observation_revision);
    await q(db, "insert into app_private.stripe_refund_observations(refund_id,payment_id,amount_cents,currency,status)values('re_office_fixture_pending',$1,61800,'usd','pending')", [payment]);
    const pending = await read(); assert.equal(pending.payment_state, 'processing'); assert.equal(pending.review_required, true);
    assert.equal(pending.fulfillment_ready, false); assert.equal(pending.totals.gross_refunded_cents, 0);
    assert.equal(pending.totals.gross_collected_cents, 61800); assert.deepEqual(pending.original_paid_evidence, paid.original_paid_evidence);
    assert.ok(pending.observation_revision > held.observation_revision);
  } finally { await db.close(); }
});

test('office workspace never loads customer records for a non-admin or an unadmitted profile', async () => {
  let calls = 0; const client = { rpc() { calls++; throw Error('Unexpected office read'); } };
  for (const options of [{ admitted: true, roles: ['estimator'] }, { admitted: true, roles: ['payroll_admin'] }, { admitted: false, roles: ['owner'] }])
    assert.equal((await workspace.readFirewoodOfficeWorkspace(client, {}, options)).status, 'unavailable');
  assert.equal(calls, 0);
});

test('real credit form and canonical SQL release debt without inventing payment, refund or delivery', async () => {
  const db = await readyDb();
  try {
    const value = request(), receipt = await prepare(db, value), invoice = receipt.invoice_id;
    // Fictional manual cash history, not provider proof or a refund instruction.
    const payment = (await q(db, "insert into public.payments(invoice_id,status,currency,provider,amount_cents,surcharge_cents,total_collected_cents,succeeded_at)values($1,'succeeded','usd','manual',60000,0,60000,clock_timestamp())returning id", [invoice]))[0].id;
    await service(db, 'select public.reconcile_invoice_balance($1)', [invoice]);
    await q(db, "update public.payments set status='refunded',refunded_principal_cents=60000 where id=$1", [payment]);
    await service(db, 'select public.reconcile_invoice_balance($1)', [invoice]);
    await admin(db, 'select public.request_firewood_live_cancellation($1,0,$2,$3,$4)', [invoice, 'customer_request', 'Synthetic cancellation after recorded returned cash.', randomUUID()]);
    const client = rpcClient(db), deps = { client, userId: owner, roles: ['owner'], admitted: true };
    const before = await workspace.readFirewoodOfficeWorkspace(client, { office_order: value.order_id }, deps);
    assert.equal(before.status, 'ready'); assert.equal(before.selected.cancellation.canCredit, true);
    assert.equal(before.selected.accounting.collectibleBalanceCents, 60000);
    const creditForm = form({ intent: 'credit_cancellation', order_id: value.order_id, invoice_id: invoice,
      request_id: randomUUID(), expected_revision: before.selected.revision, ledger_hash: before.selected.ledgerHash,
      reason: 'Full-refund cancellation reviewed; all returned cash recorded.', confirm_credit: 'confirmed' });
    assert.equal((await command.runFirewoodOfficeCommand(creditForm, deps)).status, 'success');
    assert.equal((await command.runFirewoodOfficeCommand(creditForm, deps)).status, 'success');
    const after = await workspace.readFirewoodOfficeWorkspace(client, { office_order: value.order_id }, deps);
    assert.equal(after.status, 'ready'); assert.equal(after.selected.accounting.creditedPrincipalCents, 60000);
    assert.equal(after.selected.accounting.rawBalanceDueCents, 60000); assert.equal(after.selected.accounting.collectibleBalanceCents, 0);
    assert.match(after.selected.paymentLabel, /balance released/); assert.doesNotMatch(after.selected.paymentLabel, /Paid/);
    assert.equal(after.selected.cancellation.canConfirm, true);
    const finalForm = form({ intent: 'confirm_cancellation', order_id: value.order_id, invoice_id: invoice,
      request_id: randomUUID(), expected_revision: after.selected.revision, expected_cancellation_revision: after.selected.revision,
      ledger_hash: after.selected.ledgerHash, reason: 'Synthetic final accounting review completed.', confirm_cancellation: 'confirmed' });
    assert.equal((await command.runFirewoodOfficeCommand(finalForm, deps)).status, 'success');
    const row = (await q(db, 'select status,total_cents,balance_due_cents,sent_at,paid_at from public.invoices where id=$1', [invoice]))[0];
    assert.deepEqual(row, { status: 'credited', total_cents: 60000, balance_due_cents: 0, sent_at: null, paid_at: null });
    assert.equal((await q(db, 'select count(*)::integer n from app_private.firewood_live_cancellation_credits where invoice_id=$1', [invoice]))[0].n, 1);
    const savedPayment = (await q(db, 'select status,amount_cents,refunded_principal_cents from public.payments where id=$1', [payment]))[0];
    assert.deepEqual(savedPayment, { status: 'refunded', amount_cents: 60000, refunded_principal_cents: 60000 });
  } finally { await db.close(); }
});
