import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { validateOfficeAccounting, officeSettlementInvoice } from '../src/lib/firewood/handoff/office-accounting.mjs';
import { officeBinding, validateOfficeOrderStatus, OFFICE_CONTRACT, OFFICE_ORDER_STATUS_PATH, signOfficeRequest, verifyOfficeSignature } from '../src/lib/firewood/handoff/office-contract.mjs';
import { livePrepareFixture, liveStatusFixture, LIVE_TEST_INVOICE, LIVE_TEST_NOW } from './fixtures/firewood-live-fixture.mjs';
import { reduceSettlement } from '../src/lib/firewood/handoff/settlement.mjs';

const accounting = (changes = {}) => ({ issued_at: new Date(LIVE_TEST_NOW).toISOString(), original_principal_cents: 60000,
  raw_balance_due_cents: 60000, credited_principal_cents: 0, collectible_balance_cents: 60000, credit_id: null, ...changes });
test('accounting requires immutable issuance and separates full cancellation credit from actual cash', () => {
  const credited = accounting({ credited_principal_cents: 60000, collectible_balance_cents: 0, credit_id: randomUUID() });
  const invoice = { total_cents: 60000, balance_due_cents: 0, paid_at: null, status: 'credited' };
  assert.equal(validateOfficeAccounting(credited, invoice).collectible_balance_cents, 0);
  const cash = officeSettlementInvoice(invoice, credited);
  assert.deepEqual(cash, { ...invoice, status: 'sent', balance_due_cents: 60000 });
  const money = reduceSettlement({ principal: 60000, invoice: cash, payments: [], attempts: [], refunds: [], preference: null });
  assert.equal(money.payment_state, 'unpaid'); assert.equal(money.totals.paid_principal_cents, 0);
  assert.equal(money.totals.gross_refunded_cents, 0); assert.equal(money.totals.balance_due_cents, 60000);
  assert.equal(money.fulfillment_ready, false); assert.ok(Object.isFrozen(validateOfficeAccounting(credited)));
});
test('unknown, partial, invented and mismatched credit receipts fail closed', () => {
  for (const change of [{ issued_at: null }, { email_sent: true }, { issued_at: 'invalid' }, { original_principal_cents: 0 },
    { raw_balance_due_cents: 60001 }, { credited_principal_cents: 60000 }, { credit_id: randomUUID() },
    { credited_principal_cents: 30000, collectible_balance_cents: 30000, credit_id: randomUUID() },
    { credited_principal_cents: 60000, collectible_balance_cents: 1, credit_id: randomUUID() }])
    assert.throws(() => validateOfficeAccounting(accounting(change)));
  const released = accounting({ credited_principal_cents: 60000, collectible_balance_cents: 0, credit_id: randomUUID() });
  for (const invoice of [{ total_cents: 60000, balance_due_cents: 0, status: 'paid', paid_at: null },
    { total_cents: 60000, balance_due_cents: 60000, status: 'credited', paid_at: null },
    { total_cents: 60000, balance_due_cents: 0, status: 'credited', paid_at: new Date().toISOString() }])
    assert.throws(() => officeSettlementInvoice(invoice, released));
  assert.throws(() => validateOfficeAccounting(accounting(), null, released));
  assert.throws(() => validateOfficeAccounting({ ...released, credit_id: randomUUID() }, null, released));
});
test('late collected money does not erase an already recorded full credit', () => {
  const released = accounting({ credited_principal_cents: 60000, collectible_balance_cents: 0, credit_id: randomUUID() });
  const late = { ...released, raw_balance_due_cents: 0 };
  assert.equal(validateOfficeAccounting(late, null, released).credit_id, released.credit_id);
  assert.equal(officeSettlementInvoice({ total_cents: 60000, balance_due_cents: 0, paid_at: null, status: 'credited' }, late).status, 'paid');
});
function statusFixture() {
  const prepared = livePrepareFixture(), money = liveStatusFixture(prepared), binding = officeBinding(prepared.order_id);
  const input = { ...binding, snapshot_hash: prepared.snapshot_hash, invoice_id: LIVE_TEST_INVOICE, known_revision: null, known_workflow_revision: null };
  return { input, value: { ...money, ...binding, order_state: 'active', workflow_revision: 0, accounting: accounting() } };
}
test('new office version requires accounting, immutable issuance and monotonic credit/workflow observations', () => {
  const { input, value } = statusFixture();
  assert.equal(OFFICE_CONTRACT, 'firewood-office-live-v2'); assert.match(OFFICE_ORDER_STATUS_PATH, /\/live\/v2\/office\//);
  assert.equal(validateOfficeOrderStatus(value, input).accounting.credit_id, null);
  const old = { ...value }; delete old.accounting; assert.throws(() => validateOfficeOrderStatus(old, input));
  assert.throws(() => validateOfficeOrderStatus({ ...value, contract: 'firewood-office-live-v1' }, input));
  const held = { ...value, order_state: 'cancellation_requested', workflow_revision: 1, observation_revision: 2 };
  const credited = { ...held, workflow_revision: 2, observation_revision: 3,
    accounting: accounting({ credited_principal_cents: 60000, collectible_balance_cents: 0, credit_id: randomUUID() }) };
  assert.equal(validateOfficeOrderStatus(credited, input, held).payment_state, 'unpaid');
  assert.throws(() => validateOfficeOrderStatus({ ...credited, workflow_revision: 1 }, input, held));
  assert.throws(() => validateOfficeOrderStatus({ ...credited, order_state: 'active' }, input));
  assert.throws(() => validateOfficeOrderStatus({ ...credited, fulfillment_ready: true }, input));
  assert.throws(() => validateOfficeOrderStatus({ ...credited, accounting: { ...credited.accounting, issued_at: '2026-10-29T00:00:00.000Z' } }, input, credited));
});
test('old office signature cannot authorize the accounting version even with the same key', () => {
  const raw = '{}', timestamp = String(LIVE_TEST_NOW / 1000), secret = 'a'.repeat(64);
  const signature = signOfficeRequest(raw, timestamp, secret, OFFICE_ORDER_STATUS_PATH);
  const args = { raw, timestamp, secret, path: OFFICE_ORDER_STATUS_PATH, signature, nowMs: LIVE_TEST_NOW };
  assert.equal(verifyOfficeSignature(args), true);
  const old = 'v1=' + createHmac('sha256', secret).update('ATS-FIREWOOD-OFFICE-LIVE-V1\n' + timestamp + '\nPOST\n' + OFFICE_ORDER_STATUS_PATH + '\n' + raw).digest('hex');
  assert.equal(verifyOfficeSignature({ ...args, signature: old }), false);
});
