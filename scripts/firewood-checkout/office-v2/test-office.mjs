import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createIsolatedLiveDatabase } from '../live/isolated-database.mjs';
import { fixtureInput } from '../live/test-fixture.mjs';
import { createClosedLiveClient } from '../live/client.mjs';
import { liveHandoffDigest, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, canonicalLiveHandoff } from './live-contract.mjs';
import { officeBinding, parseOfficePriceRequest, OFFICE_PRICE_REQUEST_PATH, verifyOfficeSignature } from './office-contract.mjs';
import { createClosedOfficeClient, createIsolatedOfficeClient, makeOfficeDraft } from './client.mjs';
import { installOfficeOrderStore, officeOrders } from './orders.mjs';
import { getOfficeRuntimeDependencies, handleOfficeRuntimeRequest } from './runtime.mjs';
import { officeFixture } from './test-fixture.mjs';
import { validateOfficeAccounting, officeSettlementInvoice } from './office-accounting.mjs';
import { officeFixture as oldOfficeFixture } from '../office/test-fixture.mjs';
import { OFFICE_V2_REVIEW_PROFILE } from './profile.mjs';

const contactInput = () => {
  const value = fixtureInput();
  for (const key of ['termsAccepted', 'householdUseConfirmed', 'termsHash', 'paymentPolicyHash']) delete value[key];
  return value;
};
const acceptance = (session, review) => ({ csrf: session.csrf, quoteReviewHash: review.quoteReviewHash,
  termsHash: LIVE_TERMS_HASH, paymentPolicyHash: LIVE_PAYMENT_POLICY_HASH, termsAccepted: true, householdUseConfirmed: true });
const count = async (db, table) => (await db.query('SELECT count(*)::int n FROM ' + table)).rows[0].n;
async function setup(t) {
  const db = await createIsolatedLiveDatabase(); t.after(() => db.stop());
  const crm = officeFixture(); await installOfficeOrderStore(db, crm.live, crm.office);
  await db.query('UPDATE fwofficev2_control SET paused=false');
  const orders = officeOrders({ db, live: crm.live, office: crm.office, now: crm.now });
  const session = await orders.session(null, true);
  return { db, crm, orders, session, input: { ...contactInput(), csrf: session.csrf }, regular: { ...fixtureInput(), csrf: session.csrf } };
}
async function approved(f) {
  await f.orders.requestPrice(f.session.cookie, f.input); f.crm.approve();
  const review = await f.orders.reviewPrice(f.session.cookie); return { review, accept: acceptance(f.session, review) };
}
async function started(f) {
  await f.orders.start(f.session.cookie, f.regular); return (await f.db.query('SELECT * FROM fwofficev2_orders')).rows[0];
}

test('office extension is unavailable by default and cannot activate or borrow an arbitrary database/client', async t => {
  for (const key of ['enabled', 'liveOrdering', 'collectionEnabled', 'customerEmailEnabled', 'ownerEmailEnabled']) assert.equal(OFFICE_V2_REVIEW_PROFILE[key], false);
  for (const key of ['database', 'transport', 'keyId', 'signingSecret', 'provider', 'sender', 'migrationFromOfficeV1']) assert.equal(OFFICE_V2_REVIEW_PROFILE[key], null);
  assert.equal(getOfficeRuntimeDependencies({ FIREWOOD_OFFICE_ENABLED: '1' }), null);
  const response = await handleOfficeRuntimeRequest(); assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('cache-control'), 'no-store');
  const f = await setup(t);
  await assert.rejects(installOfficeOrderStore(f.db, createClosedLiveClient(), f.crm.office), /live_runtime_unbound/);
  await assert.rejects(installOfficeOrderStore(f.db, f.crm.live, createClosedOfficeClient()), /office_runtime_unbound/);
  await assert.rejects(installOfficeOrderStore({ transaction() { assert.fail('No arbitrary DB call'); } }, f.crm.live, f.crm.office), /isolated_live_database_required/);
  await assert.rejects(installOfficeOrderStore(f.db, f.crm.live, { ...f.crm.office }), /office_runtime_unbound/);
  await assert.rejects(installOfficeOrderStore(f.db, f.crm.live, oldOfficeFixture().office), /office_runtime_unbound/);
  await f.db.query('CREATE TABLE fwlive_foreign(id int)');
  await assert.rejects(installOfficeOrderStore(f.db, f.crm.live, f.crm.office), /fresh_office_namespace_required/);
});

test('accounting is exact and separates full-principal credit from payment, refund and original price', () => {
  const original = { issued_at: '2026-10-30T00:00:00Z', original_principal_cents: 45000,
    raw_balance_due_cents: 45000, credited_principal_cents: 0, collectible_balance_cents: 45000, credit_id: null };
  for (const change of [{ issued_at: null }, { extra: true }, { original_principal_cents: 0 }, { raw_balance_due_cents: 45001 },
    { credited_principal_cents: 1 }, { credit_id: randomUUID() }, { credited_principal_cents: 45000, collectible_balance_cents: 0 },
    { credited_principal_cents: 20000, collectible_balance_cents: 25000, credit_id: randomUUID() }, { collectible_balance_cents: -1 }])
    assert.throws(() => validateOfficeAccounting({ ...original, ...change }));
  const credited = { ...original, credited_principal_cents: 45000, collectible_balance_cents: 0, credit_id: randomUUID() };
  assert.equal(validateOfficeAccounting(credited).original_principal_cents, 45000);
  assert.deepEqual(officeSettlementInvoice({ total_cents: 45000, balance_due_cents: 0, status: 'credited', paid_at: null }, credited),
    { total_cents: 45000, balance_due_cents: 45000, status: 'sent', paid_at: null });
  assert.throws(() => validateOfficeAccounting(original, null, credited));
  assert.throws(() => validateOfficeAccounting({ ...credited, credit_id: randomUUID() }, null, credited));
  assert.throws(() => validateOfficeAccounting({ ...original, issued_at: '2026-10-29T00:00:00Z' }, null, original));
});

test('v1, missing or malformed accounting cannot replace the last confirmed v2 receipt', async t => {
  const f = await setup(t); await started(f); await f.orders.state(f.session.cookie);
  const before = (await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt;
  for (const transform of [v => ({ ...v, contract: 'firewood-office-live-v1' }), v => { delete v.accounting; return v; },
    v => ({ ...v, accounting: { ...v.accounting, issued_at: null } }),
    v => ({ ...v, accounting: { ...v.accounting, collectible_balance_cents: 0 } }),
    v => ({ ...v, accounting: { ...v.accounting, credited_principal_cents: 1 } }),
    v => ({ ...v, accounting: { ...v.accounting, extra: true } }),
    v => ({ ...v, observation_revision: v.observation_revision + 1, accounting: { ...v.accounting, issued_at: '2026-10-29T00:00:00Z' } })]) {
    f.crm.transformStatus(transform); const current = await f.orders.state(f.session.cookie);
    assert.equal(current.verificationPending, true); assert.equal(current.fulfillmentReady, false);
    await assert.rejects(f.orders.resume(f.session.cookie, { csrf: f.session.csrf }));
  }
  assert.deepEqual((await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt, before);
});

for (const returned of [false, true]) test((returned ? 'refunded' : 'failed-payment') + ' cancellation credit survives restart without inventing money or permitting repayment', async t => {
  const f = await setup(t); await started(f);
  let paidProof = null;
  if (returned) { f.crm.source.observe('paid', { fee: 1350, channel: 'card' }); paidProof = (await f.orders.state(f.session.cookie)).originalPaidEvidence; }
  else { const m = f.crm.source.latest(); m.status = { ...m.status, payment_state: 'failed', observation_revision: m.status.observation_revision + 1 }; }
  f.crm.hold('cancellation_requested');
  if (returned) f.crm.source.observe('refunded', { fee: 1350, channel: 'card' });
  await f.orders.state(f.session.cookie); const creditId = f.crm.credit(); assert.equal(f.crm.credit(), creditId);
  const state = await f.orders.state(f.session.cookie);
  assert.equal(state.paymentState, returned ? 'refunded' : 'failed'); assert.equal(state.fulfillmentReady, false);
  assert.deepEqual(state.originalPaidEvidence, paidProof);
  const before = (await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt;
  assert.equal(before.accounting.original_principal_cents, 45000); assert.equal(before.accounting.raw_balance_due_cents, 45000);
  assert.equal(before.accounting.collectible_balance_cents, 0); assert.equal(before.accounting.credit_id, creditId);
  assert.equal(before.totals.gross_collected_cents, returned ? 46350 : 0); assert.equal(before.totals.gross_refunded_cents, returned ? 46350 : 0);
  assert.deepEqual(await f.orders.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
  for (const field of ['issued_at', 'credit_id', 'credited_principal_cents']) {
    const replacement = field === 'credited_principal_cents' ? '0' : '"changed"';
    await assert.rejects(f.db.query(`UPDATE fwofficev2_observations SET receipt=jsonb_set(receipt,'{accounting,${field}}',$1::jsonb),revision=revision+1`, [replacement]), /immutable_office_observation/);
  }
  f.crm.hold('cancelled'); const restarted = officeOrders({ db: f.db, live: f.crm.live, office: f.crm.office, now: f.crm.now });
  await restarted.work(); assert.equal((await restarted.state(f.session.cookie)).orderState, 'cancelled');
  assert.deepEqual(await restarted.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
});

test('a newly credited receipt must advance the workflow under the store lock and SQL guard', async t => {
  const f = await setup(t); await started(f); f.crm.hold('cancellation_requested'); await f.orders.state(f.session.cookie);
  const before = (await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt;
  const changed = { ...before, observation_revision: before.observation_revision + 1, accounting: { ...before.accounting,
    credit_id: randomUUID(), credited_principal_cents: 45000, collectible_balance_cents: 0 } };
  f.crm.transformStatus(() => changed); assert.equal((await f.orders.state(f.session.cookie)).verificationPending, true);
  await assert.rejects(f.db.query('UPDATE fwofficev2_observations SET receipt=$1,revision=revision+1', [JSON.stringify(changed)]), /immutable_office_observation/);
  assert.deepEqual((await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt, before);
});

test('signed draft is exact, idempotent and preserves multiline instructions without accepting an order', async t => {
  const f = await setup(t); f.input.notes = 'Wheelbarrow beside garage.\nStack near shed.';
  const original = structuredClone(f.input), first = await f.orders.requestPrice(f.session.cookie, f.input);
  const second = await f.orders.requestPrice(f.session.cookie, f.input);
  assert.equal(first.status, 'pending'); assert.equal(first.orderAccepted, false); assert.equal(first.quoteReviewHash, null);
  assert.equal(second.reference, first.reference); assert.equal(first.draft.contact.notes, f.input.notes);
  assert.equal(f.crm.drafts.size, 1); assert.equal(f.crm.source.mappings.size, 0); assert.equal(await count(f.db, 'fwofficev2_orders'), 0);
  assert.deepEqual(f.input, original);
  const request = [...f.crm.drafts.values()][0].request;
  for (const change of [{ prices: { wood_cents: 1 } }, { approval: randomUUID() }, { draft_hash: '0'.repeat(64) }, { mode: 'sandbox' }])
    assert.throws(() => parseOfficePriceRequest({ ...request, ...change }, { allowSyntheticContacts: true }));
});

test('a lost office request reply recovers the same draft after a fresh wrapper starts', async t => {
  const f = await setup(t); f.crm.loseNextPrice();
  await assert.rejects(f.orders.requestPrice(f.session.cookie, f.input)); assert.equal(f.crm.drafts.size, 1);
  const id = [...f.crm.drafts.keys()][0]; f.crm.advance(6000);
  const restarted = officeOrders({ db: f.db, live: f.crm.live, office: f.crm.office, now: f.crm.now });
  await restarted.work(); const current = await restarted.reviewPrice(f.session.cookie);
  assert.equal(current.reference, officeBinding(id).reference); assert.equal(await count(f.db, 'fwofficev2_drafts'), 1);
  assert.equal(f.crm.source.mappings.size, 0);
});

test('fresh genuine office price is explicitly reviewed and freezes one accepted order and invoice', async t => {
  const f = await setup(t); f.input.stacking = true; f.input.notes = 'Line one\nLine two';
  const { review, accept } = await approved(f);
  assert.deepEqual(review.prices, { wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 });
  await f.orders.acceptPrice(f.session.cookie, accept); await f.orders.acceptPrice(f.session.cookie, accept);
  const row = (await f.db.query('SELECT * FROM fwofficev2_orders')).rows[0], mapping = f.crm.source.latest();
  assert.equal(row.chosen.quote.totalCents, 57000); assert.equal(row.chosen.quote.deliveryCents, 0);
  assert.equal(row.chosen.contact.notes, f.input.notes); assert.equal(row.request.order.office_approval.residential, true);
  assert.equal(row.request.order.office_approval.single_discount_confirmed, true); assert.equal(row.request.order.terms.hash, LIVE_TERMS_HASH);
  assert.equal(mapping.receipt.invoice_id, (await f.db.query('SELECT invoice_id FROM fwofficev2_prepare')).rows[0].invoice_id);
  assert.equal(f.crm.source.mappings.size, 1); assert.equal(await count(f.db, 'fwofficev2_orders'), 1);
  await assert.rejects(f.db.query('DELETE FROM fwofficev2_orders'), /immutable_office_history/);
});

test('pending, revoked, expired, stale, forged or changed-draft approvals cannot create an invoice', async t => {
  const f = await setup(t); await f.orders.requestPrice(f.session.cookie, f.input);
  await assert.rejects(f.orders.acceptPrice(f.session.cookie, acceptance(f.session, { quoteReviewHash: 'forged' })));
  f.crm.approve(); const review = await f.orders.reviewPrice(f.session.cookie), accept = acceptance(f.session, review);
  for (const change of [{ prices: review.prices }, { officeApproval: { approval_id: randomUUID() } }, { principal_cents: 1 },
    { termsHash: 'old' }, { paymentPolicyHash: 'old' }, { householdUseConfirmed: false }, { termsAccepted: false }, { csrf: 'wrong' }])
    await assert.rejects(f.orders.acceptPrice(f.session.cookie, { ...accept, ...change }));
  f.crm.revoke(); await assert.rejects(f.orders.acceptPrice(f.session.cookie, accept));
  await f.orders.requestPrice(f.session.cookie, { ...f.input, address: '456 Other Synthetic Lane' });
  await assert.rejects(f.orders.acceptPrice(f.session.cookie, accept));
  f.crm.approve(); const current = await f.orders.reviewPrice(f.session.cookie); f.crm.advance(3600001);
  await assert.rejects(f.orders.acceptPrice(f.session.cookie, acceptance(f.session, current)));
  assert.equal(await count(f.db, 'fwofficev2_orders'), 0); assert.equal(f.crm.source.mappings.size, 0);
});

test('approval changing after display needs a fresh displayed-price acknowledgement', async t => {
  const f = await setup(t), { accept } = await approved(f); f.crm.approve();
  await assert.rejects(f.orders.acceptPrice(f.session.cookie, accept), /current office price/);
  const current = await f.orders.reviewPrice(f.session.cookie);
  await f.orders.acceptPrice(f.session.cookie, acceptance(f.session, current)); assert.equal(f.crm.source.mappings.size, 1);
});

test('lost invoice preparation reply retries the same approved amount and UUID without replacement debt', async t => {
  const f = await setup(t), { accept } = await approved(f); f.crm.loseNextPrepare();
  await f.orders.acceptPrice(f.session.cookie, accept); assert.equal(f.crm.source.mappings.size, 1);
  const mapping = f.crm.source.latest(), id = mapping.receipt.invoice_id; f.crm.advance(6000);
  const restarted = officeOrders({ db: f.db, live: f.crm.live, office: f.crm.office, now: f.crm.now }); await restarted.work();
  assert.equal((await f.db.query('SELECT invoice_id FROM fwofficev2_prepare')).rows[0].invoice_id, id);
  assert.equal(f.crm.source.mappings.size, 1); assert.equal(mapping.request.order.principal_cents, 42750);
});

test('another customer session cannot read, accept, resume or replace a saved request/order', async t => {
  const f = await setup(t), { accept } = await approved(f), other = await f.orders.session(null, true);
  await assert.rejects(f.orders.acceptPrice(other.cookie, { ...accept, csrf: other.csrf }));
  await f.orders.acceptPrice(f.session.cookie, accept); assert.equal((await f.orders.state(other.cookie)).orderSaved, false);
  await assert.rejects(f.orders.resume(other.cookie, { csrf: other.csrf }));
  await assert.rejects(f.orders.requestPrice(f.session.cookie, { ...f.input, name: 'Different Customer' }));
  assert.equal(await count(f.db, 'fwofficev2_orders'), 1);
});

test('exact lost preparation replay recovers an existing invoice after approval expiry and cancellation hold', async t => {
  const f = await setup(t), { accept } = await approved(f); f.crm.loseNextPrepare();
  await f.orders.acceptPrice(f.session.cookie, accept); const invoice = f.crm.source.latest().receipt.invoice_id;
  f.crm.advance(3600001); f.crm.hold('cancellation_requested');
  const restarted = officeOrders({ db: f.db, live: f.crm.live, office: f.crm.office, now: f.crm.now }); await restarted.work();
  const state = await restarted.state(f.session.cookie);
  assert.equal(state.orderState, 'cancellation_requested'); assert.equal(state.fulfillmentReady, false);
  assert.equal((await f.db.query('SELECT invoice_id FROM fwofficev2_prepare')).rows[0].invoice_id, invoice);
  assert.equal(f.crm.source.mappings.size, 1); assert.deepEqual(await restarted.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
});

test('all six ordinary prices remain server-owned and use mandatory office lifecycle status', async t => {
  const f = await setup(t);
  for (const [quantity, wood] of [['half', 30000], ['full', 45000], ['two', 84000]]) for (const stacking of [false, true]) {
    const s = await f.orders.session(null, true);
    await f.orders.start(s.cookie, { ...fixtureInput(), csrf: s.csrf, quantity, stacking });
    const state = await f.orders.state(s.cookie); assert.equal(state.chosen.quote.totalCents, wood + (stacking ? 15000 : 0));
    assert.equal(state.orderState, 'active'); assert.equal(state.fulfillmentReady, false);
  }
  assert.equal(await count(f.db, 'fwofficev2_orders'), 6);
});

test('paid cancellation hold and full cancellation retain original proof but cannot fulfill, repay or plan messages', async t => {
  const f = await setup(t); await started(f); f.crm.source.observe('paid', { fee: 1350, channel: 'card' });
  const paid = await f.orders.state(f.session.cookie); assert.equal(paid.fulfillmentReady, true);
  const proof = paid.originalPaidEvidence; f.crm.hold('cancellation_requested');
  const held = await f.orders.state(f.session.cookie); assert.equal(held.paymentState, 'paid'); assert.equal(held.fulfillmentReady, false);
  assert.deepEqual(held.originalPaidEvidence, proof); assert.deepEqual(await f.orders.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
  f.crm.hold('cancelled'); const cancelled = await f.orders.state(f.session.cookie);
  assert.equal(cancelled.orderState, 'cancelled'); assert.equal(cancelled.fulfillmentReady, false); assert.deepEqual(cancelled.originalPaidEvidence, proof);
  const restarted = officeOrders({ db: f.db, live: f.crm.live, office: f.crm.office, now: f.crm.now }); await restarted.work();
  assert.equal((await restarted.state(f.session.cookie)).messagesPlanned, 0);
  const tables = (await f.db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'")).rows.map(x => x.table_name);
  assert.ok(tables.every(name => name.startsWith('fwofficev2_'))); assert.ok(tables.every(name => !/outbox|confirmation|refund|payment/.test(name)));
});

test('unavailable status cannot reuse cached paid fulfillment or return a cached payment link', async t => {
  const f = await setup(t); await started(f); f.crm.source.observe('paid');
  const paid = await f.orders.state(f.session.cookie); assert.equal(paid.fulfillmentReady, true); f.crm.unavailable(true);
  const state = await f.orders.state(f.session.cookie); assert.equal(state.verificationPending, true); assert.equal(state.fulfillmentReady, false);
  assert.equal(state.orderState, 'unconfirmed'); assert.equal(state.paymentExecutionReady, false); assert.deepEqual(state.originalPaidEvidence, paid.originalPaidEvidence);
  await assert.rejects(f.orders.resume(f.session.cookie, { csrf: f.session.csrf }));
});

test('explicit renewal remains on one invoice and a cancellation during renewal prevents returning the link', async t => {
  const f = await setup(t); const row = await started(f); f.crm.source.ready(true);
  const first = await f.orders.resume(f.session.cookie, { csrf: f.session.csrf }); assert.equal(first.held, false);
  assert.equal(first.invoiceId, f.crm.source.latest().receipt.invoice_id); assert.equal(f.crm.source.mappings.size, 1);
  f.crm.advance(1800000); f.crm.cancelOnRenew();
  assert.deepEqual(await f.orders.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
  assert.equal((await f.orders.state(f.session.cookie)).orderState, 'cancellation_requested');
  assert.equal((await f.db.query('SELECT invoice_id FROM fwofficev2_prepare WHERE id=$1', [row.id])).rows[0].invoice_id, first.invoiceId);
});

test('missing, stale or terminal-regressing lifecycle observations fail closed and preserve history', async t => {
  const f = await setup(t); await started(f); f.crm.hold('cancelled');
  assert.equal((await f.orders.state(f.session.cookie)).orderState, 'cancelled');
  const before = (await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt;
  for (const transform of [v => { delete v.order_state; return v; }, v => { delete v.workflow_revision; return v; },
    v => ({ ...v, order_state: 'active', workflow_revision: v.workflow_revision + 1, observation_revision: v.observation_revision + 1 }),
    v => ({ ...v, order_state: 'cancellation_requested', workflow_revision: v.workflow_revision + 1, observation_revision: v.observation_revision + 1 }),
    v => ({ ...v, workflow_revision: 0 }), v => ({ ...v, observation_revision: v.observation_revision - 1 })]) {
    f.crm.transformStatus(transform); const value = await f.orders.state(f.session.cookie);
    assert.equal(value.verificationPending, true); assert.equal(value.fulfillmentReady, false);
  }
  assert.deepEqual((await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt, before);
  await assert.rejects(f.db.query('DELETE FROM fwofficev2_history'), /immutable_office_history/);
  await assert.rejects(f.db.query("UPDATE fwofficev2_observations SET receipt=jsonb_set(receipt,'{order_state}','\"active\"'::jsonb),revision=revision+1"), /immutable_office_observation/);
  await assert.rejects(f.db.query("UPDATE fwofficev2_observations SET receipt=receipt-'workflow_revision',revision=revision+1"), /check constraint/);
});

test('processing, pending refund and full refund stay held without discarding original paid evidence', async t => {
  const f = await setup(t); await started(f); f.crm.source.observe('processing');
  assert.equal((await f.orders.state(f.session.cookie)).fulfillmentReady, false);
  assert.deepEqual(await f.orders.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
  f.crm.source.observe('paid'); const proof = (await f.orders.state(f.session.cookie)).originalPaidEvidence;
  for (const next of ['refund_pending', 'refunded']) {
    f.crm.source.observe(next); const current = await f.orders.state(f.session.cookie);
    assert.equal(current.fulfillmentReady, false); assert.deepEqual(current.originalPaidEvidence, proof);
    assert.deepEqual(await f.orders.resume(f.session.cookie, { csrf: f.session.csrf }), { held: true, next: null });
  }
});

test('wrong invoice/principal, equal-revision mutation and removed paid proof cannot replace a trusted observation', async t => {
  const f = await setup(t); await started(f); f.crm.source.observe('paid'); await f.orders.state(f.session.cookie);
  const before = (await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt;
  for (const transform of [v => ({ ...v, invoice_id: randomUUID() }), v => ({ ...v, reference: 'FW-00000000' }),
    v => ({ ...v, totals: { ...v.totals, invoice_principal_cents: 1 } }),
    v => ({ ...v, original_paid_evidence: null, fulfillment_ready: false, observation_revision: v.observation_revision + 1 }),
    v => ({ ...v, payment_preference: 'card' })]) {
    f.crm.transformStatus(transform); assert.equal((await f.orders.state(f.session.cookie)).verificationPending, true);
  }
  assert.deepEqual((await f.db.query('SELECT receipt FROM fwofficev2_observations')).rows[0].receipt, before);
});

test('office price response rejects stale revisions, future/expired authority and draft-specific overpricing', async t => {
  const f = await setup(t); await approved(f);
  for (const transform of [v => ({ ...v, revision: 1 }), v => ({ ...v, revision: v.revision + 1, approval: { ...v.approval, approved_at_ms: f.crm.now() + 1 } }),
    v => ({ ...v, revision: v.revision + 1, approval: { ...v.approval, expires_at: new Date(f.crm.now() - 1).toISOString() } }),
    v => ({ ...v, revision: v.revision + 1, prices: { wood_cents: 84000, stacking_cents: 0, principal_cents: 84000 } }),
    v => ({ ...v, approval: { ...v.approval, approval_id: randomUUID() } }), v => ({ ...v, draft_hash: '0'.repeat(64) })]) {
    f.crm.transformPrice(transform); await assert.rejects(f.orders.reviewPrice(f.session.cookie));
  }
  assert.equal(f.crm.source.mappings.size, 0);
});

test('office transport is signature-domain separated, synthetic-only and bounds incomplete/oversized responses', async () => {
  const f = officeFixture(), chosen = { quote: { quantity: 'full', stacking: false }, contact: Object.fromEntries(Object.entries(contactInput()).filter(([k]) => !['quantity', 'stacking'].includes(k))) };
  const request = makeOfficeDraft(randomUUID(), chosen, f.office);
  assert.throws(() => f.office.parseDraft({ ...request, draft: { ...request.draft, contact: { ...request.draft.contact, email: 'customer@example.com' } } }));
  assert.equal(verifyOfficeSignature({ raw: canonicalLiveHandoff(request), timestamp: String(Math.floor(f.now() / 1000)),
    secret: f.secret, path: OFFICE_PRICE_REQUEST_PATH, signature: 'v1=' + '0'.repeat(64), nowMs: f.now() }), false);
  const timestamp = String(Math.floor(f.now() / 1000)), raw = canonicalLiveHandoff(request);
  const oldDomainSignature = 'v1=' + createHmac('sha256', f.secret).update('ATS-FIREWOOD-OFFICE-LIVE-V1\n' + timestamp + '\nPOST\n' + OFFICE_PRICE_REQUEST_PATH + '\n' + raw).digest('hex');
  assert.equal((await f.handle(new Request('https://admin.angeltreeservices.org' + OFFICE_PRICE_REQUEST_PATH, {
    method: 'POST', body: raw, headers: { 'X-ATS-Key-Id': f.keyId, 'X-ATS-Timestamp': timestamp, 'X-ATS-Signature': oldDomainSignature },
  }))).status, 401);
  const oldFetch = globalThis.fetch; globalThis.fetch = () => assert.fail('Office client must not open a socket');
  try {
    for (const handle of [() => new Promise(() => {}), () => new Response(new ReadableStream({ start() {} })),
      () => new Response('x'.repeat(65537)), () => new Response('{broken')]) {
      const client = createIsolatedOfficeClient({ handle, keyId: f.keyId, secret: f.secret, now: f.now, timeoutMs: 15 });
      await assert.rejects(client.requestPrice(request));
    }
    await f.office.requestPrice(request);
  } finally { globalThis.fetch = oldFetch; }
  const changed = { ...request, draft: { ...request.draft, quantity: 'half' } }; changed.draft_hash = liveHandoffDigest(changed.draft);
  await assert.rejects(f.office.requestPrice(changed));
});
