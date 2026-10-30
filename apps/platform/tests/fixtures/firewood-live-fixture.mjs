// Synthetic local fixture only; never a runtime order or activation setting.
import { LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT, LIVE_ACCOUNT,
  LIVE_ACCEPTED_TERMS, LIVE_PAYMENT_POLICY, LIVE_PORTAL_ORIGIN,
  liveHandoffDigest, priceLiveOrder } from '../../src/lib/firewood/handoff/live-contract.mjs';

export const LIVE_TEST_NOW = Date.UTC(2026, 9, 29, 18, 0, 0);
export const LIVE_TEST_INVOICE = '11111111-1111-4111-8111-111111111111';
export function livePrepareFixture({ quantity = 'full', stacking = true, orderId = 'c5c08217-5112-4765-98c7-8b29a4d00003' } = {}) {
  const order = { ...priceLiveOrder({ quantity, stacking }), tax_basis: 'va_domestic_use_locality_exempt',
    terms: structuredClone(LIVE_ACCEPTED_TERMS), payment_policy: structuredClone(LIVE_PAYMENT_POLICY),
    accepted_at_ms: LIVE_TEST_NOW - 1000, office_approval: null,
    contact: { name: 'Synthetic Live Contract', email: 'firewood-live@example.invalid', phone: '2025550182',
      address: '123 Synthetic Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407',
      notes: 'Synthetic local contract validation only' } };
  return { contract: LIVE_HANDOFF_CONTRACT, source_id: LIVE_HANDOFF_SOURCE, environment_id: LIVE_HANDOFF_ENVIRONMENT,
    account_id: LIVE_ACCOUNT, mode: 'live', order_id: orderId,
    reference: 'FW-' + orderId.slice(0, 8).toUpperCase(), snapshot_hash: liveHandoffDigest(order), order };
}
export function liveBindingFixture(input = livePrepareFixture()) {
  const { order, ...binding } = input;
  return binding;
}
export function livePrepareReceiptFixture(input = livePrepareFixture()) {
  return { ...liveBindingFixture(input), invoice_id: LIVE_TEST_INVOICE, invoice_number: 'INV-FW-' + input.order_id.toUpperCase(),
    preparation_status: 'prepared', principal_cents: input.order.principal_cents,
    portal_url: LIVE_PORTAL_ORIGIN + '/portal/invoice/' + 'A'.repeat(43),
    expires_at: new Date(LIVE_TEST_NOW + 30 * 60_000).toISOString(), capability_version: 1,
    replayed: false, receipt_authority: 'crm', order_confirmation_authority: 'website',
    payment_retry_required: false, delivery_completed: false,
    payment_execution_ready: false, execution_blockers: ['live_source_not_enabled'] };
}
export function liveStatusFixture(input = livePrepareFixture()) {
  return { ...liveBindingFixture(input), invoice_id: LIVE_TEST_INVOICE, payment_state: 'unpaid',
    totals: { invoice_principal_cents: input.order.principal_cents, paid_principal_cents: 0,
      surcharge_collected_cents: 0, gross_collected_cents: 0, refunded_principal_cents: 0,
      refunded_surcharge_cents: 0, gross_refunded_cents: 0, balance_due_cents: input.order.principal_cents },
    payment_preference: null, payment_pending: false, review_required: false,
    original_paid_evidence: null, payment_retry_required: false, receipt_authority: 'crm',
    order_confirmation_authority: 'website', delivery_completed: false, fulfillment_ready: false,
    observation_revision: 1, verification_source: 'crm_ledger' };
}
