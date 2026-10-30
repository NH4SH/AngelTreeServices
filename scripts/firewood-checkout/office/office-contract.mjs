// Separate, inactive extension. The reviewed live v1 and sandbox wire files stay
// unchanged; an old client is never silently granted office workflow authority.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_ACCOUNT, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, LIVE_STATUS_RECEIPT_KEYS,
  FirewoodLiveHandoffError, normalizeLiveContact, priceLiveOrder, liveHandoffDigest,
  validateLiveStatusReceipt, canonicalLiveHandoff } from './live-contract.mjs';

export const OFFICE_CONTRACT = 'firewood-office-live-v1';
export const OFFICE_PRICE_REQUEST_PATH = '/api/integrations/firewood/live/v1/office/price-request';
export const OFFICE_PRICE_STATUS_PATH = '/api/integrations/firewood/live/v1/office/price-status';
export const OFFICE_ORDER_STATUS_PATH = '/api/integrations/firewood/live/v1/office/order-status';
export const OFFICE_BASE_KEYS = Object.freeze(['contract', 'source_id', 'environment_id', 'account_id', 'mode',
  'order_id', 'reference', 'terms_hash', 'payment_policy_hash']);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = (code = 'office_request_invalid', retryable = false, status = 422) => { throw new FirewoodLiveHandoffError(code, retryable, status); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const binding = value => {
  if (value.contract !== OFFICE_CONTRACT || value.source_id !== LIVE_HANDOFF_SOURCE
    || value.environment_id !== LIVE_HANDOFF_ENVIRONMENT || value.account_id !== LIVE_ACCOUNT || value.mode !== 'live'
    || !uuid(value.order_id) || value.reference !== 'FW-' + value.order_id.slice(0, 8).toUpperCase()
    || value.terms_hash !== LIVE_TERMS_HASH || value.payment_policy_hash !== LIVE_PAYMENT_POLICY_HASH) fail();
};
export function officeBinding(orderId) {
  if (!uuid(orderId)) fail();
  return Object.freeze({ contract: OFFICE_CONTRACT, source_id: LIVE_HANDOFF_SOURCE,
    environment_id: LIVE_HANDOFF_ENVIRONMENT, account_id: LIVE_ACCOUNT, mode: 'live', order_id: orderId,
    reference: 'FW-' + orderId.slice(0, 8).toUpperCase(), terms_hash: LIVE_TERMS_HASH, payment_policy_hash: LIVE_PAYMENT_POLICY_HASH });
}
export function parseOfficePriceRequest(value, { allowSyntheticContacts = false } = {}) {
  if (!exact(value, [...OFFICE_BASE_KEYS, 'draft_hash', 'draft']) || !exact(value.draft, ['quantity', 'stacking', 'contact'])) fail();
  binding(value); priceLiveOrder(value.draft);
  const draft = { quantity: value.draft.quantity, stacking: value.draft.stacking,
    contact: normalizeLiveContact(value.draft.contact, { allowSyntheticContacts }) };
  if (value.draft_hash !== liveHandoffDigest(draft)) fail();
  return freeze({ ...value, draft });
}
export function parseOfficePriceStatusRequest(value) {
  if (!exact(value, [...OFFICE_BASE_KEYS, 'draft_hash'])) fail();
  binding(value); if (!hash(value.draft_hash)) fail(); return freeze(structuredClone(value));
}
export function parseOfficeOrderStatusRequest(value) {
  if (!exact(value, [...OFFICE_BASE_KEYS, 'snapshot_hash', 'invoice_id', 'known_revision', 'known_workflow_revision'])) fail();
  binding(value);
  if (!hash(value.snapshot_hash) || !uuid(value.invoice_id)
    || !(value.known_revision === null || integer(value.known_revision))
    || !(value.known_workflow_revision === null || integer(value.known_workflow_revision))) fail();
  return freeze(structuredClone(value));
}
export function validateOfficePriceReceipt(value, input) {
  const reject = () => fail('office_price_unconfirmed', true, 503);
  if (!exact(value, [...OFFICE_BASE_KEYS, 'draft_hash', 'revision', 'status', 'approval', 'prices'])) reject();
  try { binding(value); } catch { reject(); }
  for (const key of [...OFFICE_BASE_KEYS, 'draft_hash']) if (value[key] !== input[key]) reject();
  if (!integer(value.revision) || value.revision < 1 || !['pending', 'approved', 'revoked', 'expired'].includes(value.status)) reject();
  if (value.status === 'approved') {
    const approval = value.approval, prices = value.prices;
    if (!exact(approval, ['approval_id', 'approved_at_ms', 'residential', 'single_discount_confirmed', 'expires_at'])
      || !uuid(approval.approval_id) || !Number.isSafeInteger(approval.approved_at_ms) || approval.approved_at_ms < 1
      || approval.residential !== true || approval.single_discount_confirmed !== true
      || typeof approval.expires_at !== 'string' || !Number.isFinite(Date.parse(approval.expires_at))
      || Date.parse(approval.expires_at) <= approval.approved_at_ms
      || !exact(prices, ['wood_cents', 'stacking_cents', 'principal_cents']) || !integer(prices.wood_cents) || prices.wood_cents < 1
      || prices.wood_cents > 84000 || !integer(prices.stacking_cents) || prices.stacking_cents > 15000
      || prices.principal_cents !== prices.wood_cents + prices.stacking_cents) reject();
    if (input.draft) { const base = priceLiveOrder(input.draft); if (prices.wood_cents > base.wood_cents || prices.stacking_cents > base.stacking_cents) reject(); }
  } else if (value.approval !== null || value.prices !== null) reject();
  return freeze(structuredClone(value));
}

const financialKeys = LIVE_STATUS_RECEIPT_KEYS.filter(key => !['contract', 'source_id', 'environment_id', 'account_id', 'mode', 'order_id', 'reference'].includes(key));
export const OFFICE_ORDER_STATUS_KEYS = Object.freeze([...OFFICE_BASE_KEYS, ...financialKeys, 'order_state', 'workflow_revision']);
export function validateOfficeOrderStatus(value, input, previous = null) {
  const reject = () => fail('office_order_status_unconfirmed', true, 503);
  if (!exact(value, OFFICE_ORDER_STATUS_KEYS)) reject();
  try { binding(value); } catch { reject(); }
  for (const key of OFFICE_BASE_KEYS) if (value[key] !== input[key]) reject();
  if (!['active', 'cancellation_requested', 'cancelled'].includes(value.order_state) || !integer(value.workflow_revision)
    || value.order_state !== 'active' && value.workflow_revision < 1
    || input.known_workflow_revision !== null && value.workflow_revision < input.known_workflow_revision) reject();
  const financialFulfilled = value.payment_state === 'paid' && value.totals?.balance_due_cents === 0
    && !value.payment_pending && !value.review_required && value.original_paid_evidence !== null;
  const financial = Object.fromEntries(LIVE_STATUS_RECEIPT_KEYS.map(key => [key, value[key]]));
  financial.contract = LIVE_HANDOFF_CONTRACT; financial.fulfillment_ready = financialFulfilled;
  const financialInput = { ...input, contract: LIVE_HANDOFF_CONTRACT };
  const previousFinancial = previous ? Object.fromEntries(LIVE_STATUS_RECEIPT_KEYS.map(key => [key, previous[key]])) : null;
  if (previousFinancial) { previousFinancial.contract = LIVE_HANDOFF_CONTRACT;
    previousFinancial.fulfillment_ready = previous.payment_state === 'paid' && previous.totals.balance_due_cents === 0
      && !previous.payment_pending && !previous.review_required && previous.original_paid_evidence !== null; }
  validateLiveStatusReceipt(financial, financialInput, previousFinancial);
  if (value.fulfillment_ready !== (financialFulfilled && value.order_state === 'active')) reject();
  if (previous && (value.workflow_revision < previous.workflow_revision
    || previous.order_state !== 'active' && value.order_state === 'active'
    || previous.order_state === 'cancelled' && value.order_state !== 'cancelled'
    || value.workflow_revision === previous.workflow_revision && value.order_state !== previous.order_state
    || value.observation_revision === previous.observation_revision && canonicalLiveHandoff(value) !== canonicalLiveHandoff(previous)))
    fail('office_order_version_conflict', false, 409);
  return freeze(structuredClone(value));
}
export function signOfficeRequest(raw, timestamp, secret, path) {
  if (![OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH].includes(path)
    || typeof raw !== 'string' || Buffer.byteLength(raw) > 16384 || !/^\d{10}$/.test(timestamp ?? '')
    || !/^[A-Za-z0-9_-]{32,256}$/.test(secret ?? '')) fail();
  return 'v1=' + createHmac('sha256', secret).update('ATS-FIREWOOD-OFFICE-LIVE-V1\n' + timestamp + '\nPOST\n' + path + '\n' + raw).digest('hex');
}
export function verifyOfficeSignature({ raw, timestamp, secret, path, signature, nowMs = Date.now() }) {
  if (!/^v1=[a-f0-9]{64}$/.test(signature ?? '') || !/^\d{10}$/.test(timestamp ?? '')
    || !Number.isSafeInteger(nowMs) || Math.abs(nowMs / 1000 - Number(timestamp)) > 300) return false;
  try { return timingSafeEqual(Buffer.from(signature), Buffer.from(signOfficeRequest(raw, timestamp, secret, path))); } catch { return false; }
}
