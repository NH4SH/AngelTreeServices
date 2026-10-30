// Proposed live protocol. Pure validation only: no routes, credentials or activation.
// The frozen sandbox/staging v2 contract is intentionally not imported or changed.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { LIVE_TERMS_POLICY } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/src/lib/firewood/handoff/live-terms.mjs';
export { LIVE_TERMS_CLAUSES, LIVE_TERMS_POLICY } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/src/lib/firewood/handoff/live-terms.mjs';

export class FirewoodLiveHandoffError extends Error {
  constructor(code = 'live_request_binding_invalid', retryable = false, httpStatus = 422) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

export const LIVE_HANDOFF_CONTRACT = 'firewood-invoice-handoff-live-v1';
export const LIVE_HANDOFF_SOURCE = 'website_firewood_invoice_live_v1';
export const LIVE_HANDOFF_ENVIRONMENT = 'ats_firewood_live_v1';
export const LIVE_ACCOUNT = 'acct_1Tv92EI7tY6VHUvU';
export const LIVE_PORTAL_ORIGIN = 'https://admin.angeltreeservices.org';
export const LIVE_WEBSITE_ORIGIN = 'https://checkout.angeltreeservices.org';
export const LIVE_PREPARE_PATH = '/api/integrations/firewood/live/v1/prepare';
export const LIVE_STATUS_PATH = '/api/integrations/firewood/live/v1/status';
export const LIVE_RENEW_PATH = '/api/integrations/firewood/live/v1/renew';
export const LIVE_REQUEST_MAX_BYTES = 16_384;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = () => { throw new FirewoodLiveHandoffError(); };
const exact = (value, keys) => {
  if (!object(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail();
};
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

// Canonical bytes are shared with Website; no local clock, environment or secret
// may change the accepted order hash.
export function canonicalLiveHandoff(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalLiveHandoff).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalLiveHandoff(value[key])).join(',') + '}';
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  fail();
}
export const liveHandoffDigest = value => createHash('sha256').update(canonicalLiveHandoff(value)).digest('hex');

export const LIVE_CATALOG = deepFreeze({
  currency: 'usd',
  quantities: [
    { id: 'half', label: 'Half cord', wood_cents: 30_000 },
    { id: 'full', label: 'Full cord', wood_cents: 45_000 },
    { id: 'two', label: 'Two cords', wood_cents: 84_000 },
  ],
  delivery_cents: 0,
  stacking_cents: 15_000,
});

// Separate versions prevent test terms/payment acceptance being reused live.
// These are reviewed business-policy identities, not generated runtime authority.
export const LIVE_TERMS_HASH = liveHandoffDigest(LIVE_TERMS_POLICY);
export const LIVE_ACCEPTED_TERMS = deepFreeze({
  ...LIVE_TERMS_POLICY, hash: LIVE_TERMS_HASH, accepted: true, householdUseConfirmed: true,
});
export const LIVE_PAYMENT_POLICY = deepFreeze({
  version: 'firewood-payment-options-live-2026-10-29-v1',
  channels: ['card', 'ach', 'cash_check_pickup', 'check_mail'],
  credit_surcharge_bps: 300,
  credit_eligibility: 'processor_confirmed_US_credit',
  debit_surcharge_bps: 0,
  prepaid_surcharge_bps: 0,
  ach_surcharge_bps: 0,
  offline_surcharge_bps: 0,
  fee_basis: 'outstanding_principal',
  surcharge_reporting: 'stripe_dedicated',
  exact_fee_review_before_confirmation: true,
  receipt_authority: 'crm',
  accepted: true,
});
export const LIVE_PAYMENT_POLICY_HASH = liveHandoffDigest(LIVE_PAYMENT_POLICY);

export function priceLiveOrder(input) {
  const item = LIVE_CATALOG.quantities.find(value => value.id === input?.quantity);
  if (!item || typeof input.stacking !== 'boolean' || input.veteran !== undefined && input.veteran !== false) fail();
  const stackingCents = input.stacking ? LIVE_CATALOG.stacking_cents : 0;
  return deepFreeze({ quantity: item.id, stacking: input.stacking, wood_cents: item.wood_cents,
    delivery_cents: 0, stacking_cents: stackingCents,
    principal_cents: item.wood_cents + stackingCents, currency: 'usd', tax_cents: 0 });
}

export const LIVE_CONTACT_KEYS = Object.freeze(['name', 'email', 'phone', 'address', 'address2', 'city', 'state', 'postal', 'notes']);
const stringField = (value, maximum, required = true, multiline = false) => {
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (typeof value !== 'string' || value.length > maximum || controls.test(value)) fail();
  const checked = value.trim();
  if (required && !checked) fail();
  return checked;
};

export function normalizeLiveContact(input, { allowSyntheticContacts = false } = {}) {
  exact(input, LIVE_CONTACT_KEYS);
  const email = stringField(input.email, 254).toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/iu.test(parts[0])
    || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) fail();
  const domain = domainToASCII(parts[1]);
  if (!domain || domain.length > 253 || !domain.includes('.')
    || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(label))
    || !/^[a-z]{2,63}$/iu.test(domain.split('.').at(-1))) fail();
  const reserved = /(?:^|\.)(?:invalid|test|localhost|example)$/iu.test(domain)
    || /^(?:.*\.)?example\.(?:com|net|org)$/iu.test(domain);
  if (reserved && !(allowSyntheticContacts === true && domain.endsWith('.invalid'))) fail();
  const phone = stringField(input.phone, 30);
  const digits = phone.replace(/\D/gu, '');
  if (!/^[+()\d .-]+$/u.test(phone) || !/^1?[2-9]\d{2}[2-9]\d{6}$/u.test(digits)) fail();
  const state = stringField(input.state, 2).toUpperCase();
  const postal = stringField(input.postal, 10);
  if (state !== 'VA' || !/^\d{5}(?:-\d{4})?$/u.test(postal)) fail();
  return deepFreeze({
    name: stringField(input.name, 100), email: parts[0] + '@' + domain,
    phone: digits.slice(-10), address: stringField(input.address, 150),
    address2: stringField(input.address2, 100, false), city: stringField(input.city, 100),
    state, postal, notes: stringField(input.notes, 500, false, true),
  });
}

export const LIVE_ORDER_KEYS = Object.freeze(['quantity', 'stacking', 'wood_cents', 'delivery_cents', 'stacking_cents', 'principal_cents',
  'currency', 'tax_cents', 'tax_basis', 'terms', 'accepted_at_ms', 'office_approval', 'contact', 'payment_policy']);

function normalizeLiveOrder(value, { nowMs, allowSyntheticContacts }) {
  exact(value, LIVE_ORDER_KEYS);
  const base = priceLiveOrder(value), contact = normalizeLiveContact(value.contact, { allowSyntheticContacts });
  if (canonicalLiveHandoff(value.payment_policy) !== canonicalLiveHandoff(LIVE_PAYMENT_POLICY)
    || canonicalLiveHandoff(value.terms) !== canonicalLiveHandoff(LIVE_ACCEPTED_TERMS)
    || !integer(value.wood_cents) || value.wood_cents < 1 || !integer(value.stacking_cents)
    || value.delivery_cents !== 0 || value.tax_cents !== 0 || value.currency !== 'usd'
    || value.tax_basis !== 'va_domestic_use_locality_exempt'
    || value.principal_cents !== value.wood_cents + value.stacking_cents
    || !Number.isSafeInteger(value.accepted_at_ms) || value.accepted_at_ms < 1 || value.accepted_at_ms > nowMs + 300_000) fail();
  if (value.office_approval === null) {
    if (value.wood_cents !== base.wood_cents || value.stacking_cents !== base.stacking_cents) fail();
  } else {
    exact(value.office_approval, ['approval_id', 'approved_at_ms', 'residential', 'single_discount_confirmed']);
    const approval = value.office_approval;
    if (!uuid(approval.approval_id) || approval.residential !== true || approval.single_discount_confirmed !== true
      || !Number.isSafeInteger(approval.approved_at_ms) || approval.approved_at_ms < 1
      || approval.approved_at_ms > value.accepted_at_ms || value.wood_cents > base.wood_cents
      || value.stacking_cents > base.stacking_cents) fail();
    // Syntax only. Future atomic CRM preparation MUST look up this office-issued
    // approval and verify its customer/order/prices. HMAC is not office approval.
  }
  return deepFreeze({ ...value, contact, terms: structuredClone(LIVE_ACCEPTED_TERMS),
    payment_policy: structuredClone(LIVE_PAYMENT_POLICY),
    office_approval: value.office_approval === null ? null : { ...value.office_approval } });
}

export const LIVE_BINDING_KEYS = Object.freeze(['contract', 'source_id', 'environment_id', 'account_id', 'mode', 'order_id', 'reference', 'snapshot_hash']);
function binding(value) {
  if (value.contract !== LIVE_HANDOFF_CONTRACT || value.source_id !== LIVE_HANDOFF_SOURCE
    || value.environment_id !== LIVE_HANDOFF_ENVIRONMENT || value.mode !== 'live' || value.account_id !== LIVE_ACCOUNT
    || !uuid(value.order_id) || value.reference !== 'FW-' + value.order_id.slice(0, 8).toUpperCase()
    || !/^[a-f0-9]{64}$/u.test(value.snapshot_hash ?? '')) fail();
}

export function parseLivePrepareRequest(value, { nowMs = Date.now(), allowSyntheticContacts = false } = {}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 1 || typeof allowSyntheticContacts !== 'boolean') fail();
  exact(value, [...LIVE_BINDING_KEYS, 'order']);
  binding(value);
  const order = normalizeLiveOrder(value.order, { nowMs, allowSyntheticContacts });
  if (value.snapshot_hash !== liveHandoffDigest(order)) fail();
  return deepFreeze({ ...value, order });
}

export function parseLiveStatusRequest(value) {
  exact(value, [...LIVE_BINDING_KEYS, 'invoice_id', 'known_revision']);
  binding(value);
  if (!uuid(value.invoice_id) || !(value.known_revision === null || integer(value.known_revision))) fail();
  return deepFreeze({ ...value });
}

export function parseLiveRenewRequest(value) {
  exact(value, [...LIVE_BINDING_KEYS, 'invoice_id', 'expected_capability_version']);
  binding(value);
  if (!uuid(value.invoice_id) || !integer(value.expected_capability_version) || value.expected_capability_version < 1) fail();
  return deepFreeze({ ...value });
}

export function signLiveHandoff(raw, timestamp, secret, path) {
  if (![LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH].includes(path)
    || typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > LIVE_REQUEST_MAX_BYTES
    || typeof timestamp !== 'string' || !/^\d{10}$/u.test(timestamp)
    || typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/u.test(secret)) fail();
  return 'v1=' + createHmac('sha256', secret)
    .update('ATS-FIREWOOD-LIVE-V1\n' + timestamp + '\nPOST\n' + path + '\n' + raw).digest('hex');
}

export function verifyLiveHandoffSignature({ raw, timestamp, secret, path, signature, nowMs = Date.now() }) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 1 || !/^v1=[a-f0-9]{64}$/u.test(signature ?? '')
    || !/^\d{10}$/u.test(timestamp ?? '') || Math.abs(nowMs / 1000 - Number(timestamp)) > 300) return false;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(signLiveHandoff(raw, timestamp, secret, path)));
  } catch { return false; }
}

export const LIVE_PREPARE_RECEIPT_KEYS = Object.freeze([...LIVE_BINDING_KEYS, 'invoice_id', 'invoice_number', 'preparation_status',
  'principal_cents', 'portal_url', 'expires_at', 'capability_version', 'replayed', 'receipt_authority',
  'order_confirmation_authority', 'payment_retry_required', 'delivery_completed', 'payment_execution_ready', 'execution_blockers']);
const exactReceipt = (value, keys) => object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const hasLiveBinding = value => {
  try { binding(value); return true; } catch { return false; }
};

export function validateLivePrepareReceipt(value, input) {
  const reject = () => { throw new FirewoodLiveHandoffError('live_preparation_unconfirmed', true, 503); };
  if (!exactReceipt(value, LIVE_PREPARE_RECEIPT_KEYS) || !hasLiveBinding(value)) reject();
  for (const key of LIVE_BINDING_KEYS) if (value[key] !== input[key]) reject();
  if (!uuid(value.invoice_id) || value.invoice_number !== 'INV-FW-' + input.order_id.toUpperCase()
    || value.principal_cents !== input.order?.principal_cents || value.preparation_status !== 'prepared'
    || typeof value.replayed !== 'boolean' || !integer(value.capability_version) || value.capability_version < 1
    || value.receipt_authority !== 'crm' || value.order_confirmation_authority !== 'website'
    || value.payment_retry_required !== false || value.delivery_completed !== false
    || typeof value.payment_execution_ready !== 'boolean' || !Array.isArray(value.execution_blockers)
    || !value.execution_blockers.every(item => typeof item === 'string' && /^[a-z][a-z0-9_]{0,79}$/u.test(item))
    || (value.payment_execution_ready ? value.execution_blockers.length !== 0 : value.execution_blockers.length === 0)) reject();
  if (!(value.expires_at === null || typeof value.expires_at === 'string' && Number.isFinite(Date.parse(value.expires_at)))) reject();
  if (value.portal_url !== null) {
    let url;
    try { url = new URL(value.portal_url); } catch { reject(); }
    if (url.origin !== LIVE_PORTAL_ORIGIN || !/^\/portal\/invoice\/[A-Za-z0-9_-]{40,200}$/u.test(url.pathname)
      || url.search || url.hash || url.username || url.password || !Number.isFinite(Date.parse(value.expires_at))) reject();
  }
  return deepFreeze(structuredClone(value));
}

export const LIVE_MONEY_KEYS = Object.freeze(['invoice_principal_cents', 'paid_principal_cents', 'surcharge_collected_cents',
  'gross_collected_cents', 'refunded_principal_cents', 'refunded_surcharge_cents', 'gross_refunded_cents', 'balance_due_cents']);
export const LIVE_STATUS_RECEIPT_KEYS = Object.freeze([...LIVE_BINDING_KEYS, 'invoice_id', 'payment_state', 'totals',
  'payment_preference', 'payment_pending', 'review_required', 'original_paid_evidence', 'payment_retry_required',
  'receipt_authority', 'order_confirmation_authority', 'delivery_completed', 'fulfillment_ready',
  'observation_revision', 'verification_source']);

export function validateLiveStatusReceipt(value, input, previous = null) {
  const reject = () => { throw new FirewoodLiveHandoffError('live_settlement_unconfirmed', true, 503); };
  if (!exactReceipt(value, LIVE_STATUS_RECEIPT_KEYS) || !hasLiveBinding(value)) reject();
  for (const key of LIVE_BINDING_KEYS) if (value[key] !== input[key]) reject();
  if (value.invoice_id !== input.invoice_id || !uuid(value.invoice_id) || !integer(value.observation_revision)
    || value.observation_revision < 1 || input.known_revision !== null && input.known_revision > value.observation_revision
    || !['unpaid', 'processing', 'paid', 'partially_paid', 'partially_refunded', 'refunded', 'disputed', 'offline_pending', 'failed', 'void'].includes(value.payment_state)
    || !exactReceipt(value.totals, LIVE_MONEY_KEYS) || !LIVE_MONEY_KEYS.every(key => integer(value.totals[key]))
    || value.receipt_authority !== 'crm' || value.order_confirmation_authority !== 'website'
    || value.payment_retry_required !== false || value.delivery_completed !== false || value.verification_source !== 'crm_ledger'
    || !['payment_pending', 'review_required', 'fulfillment_ready'].every(key => typeof value[key] === 'boolean')
    || !(value.payment_preference === null || LIVE_PAYMENT_POLICY.channels.includes(value.payment_preference))) reject();
  const totals = value.totals;
  if (totals.invoice_principal_cents < 1 || totals.paid_principal_cents > totals.invoice_principal_cents
    || totals.balance_due_cents !== totals.invoice_principal_cents - totals.paid_principal_cents
    || totals.gross_collected_cents < totals.surcharge_collected_cents
    || totals.refunded_surcharge_cents > totals.surcharge_collected_cents
    || totals.refunded_principal_cents > totals.gross_collected_cents - totals.surcharge_collected_cents
    || totals.gross_refunded_cents !== totals.refunded_principal_cents + totals.refunded_surcharge_cents
    || (totals.gross_refunded_cents > 0 || ['disputed', 'refunded', 'partially_refunded'].includes(value.payment_state)) && !value.review_required
    || value.payment_state === 'processing' && !value.payment_pending) reject();
  const original = value.original_paid_evidence;
  if (original !== null && (!exactReceipt(original, ['paid', 'observed_at', 'principal_cents', 'surcharge_collected_cents', 'gross_collected_cents', 'payment_ids'])
    || original.paid !== true || typeof original.observed_at !== 'string' || !Number.isFinite(Date.parse(original.observed_at))
    || original.principal_cents !== totals.invoice_principal_cents || !integer(original.surcharge_collected_cents)
    || original.gross_collected_cents !== original.principal_cents + original.surcharge_collected_cents
    || original.gross_collected_cents > totals.gross_collected_cents || original.surcharge_collected_cents > totals.surcharge_collected_cents
    || !Array.isArray(original.payment_ids) || original.payment_ids.length < 1 || !original.payment_ids.every(uuid)
    || new Set(original.payment_ids).size !== original.payment_ids.length)) reject();
  const fulfilled = value.payment_state === 'paid' && totals.balance_due_cents === 0
    && !value.payment_pending && !value.review_required && original !== null;
  if (value.fulfillment_ready !== fulfilled || value.payment_state === 'paid'
    && (totals.balance_due_cents !== 0 || value.payment_pending || value.review_required)) reject();
  if (previous && (value.invoice_id !== previous.invoice_id || value.snapshot_hash !== previous.snapshot_hash
    || value.observation_revision < previous.observation_revision || totals.invoice_principal_cents !== previous.totals?.invoice_principal_cents
    || previous.original_paid_evidence !== null && canonicalLiveHandoff(original) !== canonicalLiveHandoff(previous.original_paid_evidence)
    || value.observation_revision === previous.observation_revision && canonicalLiveHandoff(value) !== canonicalLiveHandoff(previous))) {
    throw new FirewoodLiveHandoffError('live_settlement_version_conflict', false, 409);
  }
  return deepFreeze(structuredClone(value));
}
