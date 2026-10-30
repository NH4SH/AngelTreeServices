import { createHash, createHmac, randomUUID } from 'node:crypto';

export const CRM_CONTRACT = 'firewood-test-import-v1';
export const CRM_TERMS = 'firewood-checkout-test-2026-10-25';
export const CRM_PATH = '/api/integrations/firewood/test-import';
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value);
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : object(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value);
export const digest = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex');

export function createCrmBinding(order, config) {
  const q = order.quote,
    contact = Object.fromEntries(
      Object.entries(order.contact).map(([key, value]) => [key, value.trim()]),
    );
  contact.email = contact.email.toLowerCase();
  contact.state = contact.state.toUpperCase();
  contact.phone = contact.phone.replace(/\D/gu, '').slice(-10);
  const snapshot = {
    quantity: q.quantity,
    stacking: q.stacking,
    wood_cents: q.woodCents,
    delivery_cents: 0,
    stacking_cents: q.stackingCents,
    total_cents: q.totalCents,
    currency: 'usd',
    tax_assumption: 'unresolved_test_only',
    terms_version: CRM_TERMS,
    contact,
  };
  const id = randomUUID();
  return {
    contract: CRM_CONTRACT,
    source_id: config.sourceId,
    account_id: config.accountId,
    order_id: id,
    attempt_id: randomUUID(),
    reference: `FW-TEST-${id.replaceAll('-', '').toUpperCase()}`,
    snapshot_hash: digest(snapshot),
    order: snapshot,
  };
}
export const crmMetadata = (binding) => ({
  purpose: 'firewood_test_only',
  ats_contract: binding.contract,
  ats_source: binding.source_id,
  ats_order_id: binding.order_id,
  ats_snapshot_hash: binding.snapshot_hash,
  ats_attempt_id: binding.attempt_id,
  quantity: binding.order.quantity,
  stacking: String(binding.order.stacking),
});

export class CrmSyncError extends Error {
  constructor(code, retryable = false, delayMs = 0) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.delayMs = delayMs;
  }
}
export function crmTestConfig(env) {
  if (env.FIREWOOD_CRM_TEST_ENABLED !== '1') return null;
  try {
    const url = new URL(env.FIREWOOD_CRM_TEST_ORIGIN);
    const config = {
      origin: url.origin,
      sourceId: env.FIREWOOD_TEST_IMPORT_SOURCE_ID,
      accountId: env.FIREWOOD_TEST_STRIPE_ACCOUNT_ID,
      keyId: env.FIREWOOD_TEST_IMPORT_KEY_ID,
      signingSecret: env.FIREWOOD_TEST_IMPORT_SHARED_SECRET,
    };
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !/^[a-z][a-z0-9_-]{2,63}$/u.test(config.sourceId ?? '') ||
      !/^acct_[A-Za-z0-9]+$/u.test(config.accountId ?? '') ||
      !/^[A-Za-z0-9_-]{1,64}$/u.test(config.keyId ?? '') ||
      typeof config.signingSecret !== 'string' ||
      config.signingSecret.length < 32
    )
      throw new Error();
    return Object.freeze(config);
  } catch {
    throw new Error(
      'The dedicated local CRM test connection is invalid. Hosted CRM addresses are refused.',
    );
  }
}

export function validateCrmReceipt(value, request, previous = null, intentId) {
  const fail = () => {
    throw new CrmSyncError('response_unconfirmed', true);
  };
  if (!object(value)) fail();
  for (const key of [
    'contract',
    'source_id',
    'account_id',
    'order_id',
    'reference',
    'attempt_id',
    'session_id',
  ])
    if (value[key] !== request[key]) fail();
  if (
    value.mode !== 'test' ||
    value.import_status !== 'recorded' ||
    !uuid(value.invoice_id) ||
    !uuid(value.payment_id) ||
    typeof value.payment_intent_id !== 'string' ||
    !/^pi_[A-Za-z0-9_]+$/u.test(value.payment_intent_id) ||
    value.invoice_number !== `TEST-FW-${request.order_id}` ||
    value.total_cents !== request.order.total_cents ||
    value.currency !== 'usd' ||
    typeof value.replayed !== 'boolean' ||
    value.notification_authority !== 'website' ||
    value.crm_customer_email_sent !== false ||
    value.delivery_completed !== false ||
    !object(value.original_receipt) ||
    value.original_receipt.paid !== true ||
    value.original_receipt.balance_due_cents !== 0 ||
    !['draft', 'sent', 'paid', 'partially_paid', 'overdue'].includes(
      value.invoice_status,
    ) ||
    !Number.isSafeInteger(value.balance_due_cents) ||
    value.balance_due_cents < 0 ||
    value.balance_due_cents > request.order.total_cents ||
    !Number.isSafeInteger(value.refund_cents) ||
    value.refund_cents < 0 ||
    value.refund_cents > request.order.total_cents ||
    !(
      value.dispute_status === null ||
      [
        'warning_needs_response',
        'warning_under_review',
        'warning_closed',
        'needs_response',
        'under_review',
        'won',
        'lost',
      ].includes(value.dispute_status)
    ) ||
    value.review_required !==
      (value.refund_cents > 0 || value.dispute_status !== null) ||
    (!value.review_required &&
      (value.invoice_status !== 'paid' || value.balance_due_cents !== 0))
  )
    fail();
  if (typeof intentId !== 'string' || value.payment_intent_id !== intentId)
    fail();
  if (
    previous &&
    ['invoice_id', 'payment_id', 'payment_intent_id', 'invoice_number'].some(
      (key) => value[key] !== previous[key],
    )
  )
    throw new CrmSyncError('mapping_conflict');
  // Retain only the agreed receipt fields, never arbitrary returned customer data.
  const keys = [
    'contract',
    'source_id',
    'account_id',
    'order_id',
    'reference',
    'attempt_id',
    'session_id',
    'mode',
    'import_status',
    'invoice_id',
    'invoice_number',
    'payment_id',
    'payment_intent_id',
    'total_cents',
    'currency',
    'invoice_status',
    'balance_due_cents',
    'replayed',
    'notification_authority',
    'crm_customer_email_sent',
    'delivery_completed',
    'refund_cents',
    'dispute_status',
    'review_required',
  ];
  return {
    ...Object.fromEntries(keys.map((key) => [key, value[key]])),
    original_receipt: { paid: true, balance_due_cents: 0 },
  };
}

export function createCrmClient(
  config,
  { fetcher = fetch, now = Date.now } = {},
) {
  // Validate injected configuration too; tests cannot accidentally target hosted CRM.
  config = crmTestConfig({
    FIREWOOD_CRM_TEST_ENABLED: '1',
    FIREWOOD_CRM_TEST_ORIGIN: config.origin,
    FIREWOOD_TEST_IMPORT_SOURCE_ID: config.sourceId,
    FIREWOOD_TEST_STRIPE_ACCOUNT_ID: config.accountId,
    FIREWOOD_TEST_IMPORT_KEY_ID: config.keyId,
    FIREWOOD_TEST_IMPORT_SHARED_SECRET: config.signingSecret,
  });
  return {
    config,
    async send(request, previous, intentId) {
      if (
        request.source_id !== config.sourceId ||
        request.account_id !== config.accountId
      )
        throw new CrmSyncError('source_configuration_review');
      const body = JSON.stringify(request),
        timestamp = String(Math.floor(now() / 1000));
      if (Buffer.byteLength(body) > 16384)
        throw new CrmSyncError('request_review');
      const signature = `v1=${createHmac('sha256', config.signingSecret).update(`${timestamp}\nPOST\n${CRM_PATH}\n${body}`).digest('hex')}`;
      let response;
      try {
        response = await fetcher(config.origin + CRM_PATH, {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
          headers: {
            'Content-Type': 'application/json',
            'X-ATS-Key-Id': config.keyId,
            'X-ATS-Timestamp': timestamp,
            'X-ATS-Signature': signature,
          },
          body,
        });
      } catch {
        throw new CrmSyncError('connection_unconfirmed', true);
      }
      if (![200, 201].includes(response.status)) {
        if ([401, 403, 409, 422, 400, 413].includes(response.status))
          throw new CrmSyncError(`http_${response.status}_review`);
        const seconds = Number(response.headers.get('retry-after'));
        throw new CrmSyncError(
          'service_unconfirmed',
          true,
          Number.isFinite(seconds)
            ? Math.min(300, Math.max(5, seconds)) * 1000
            : 5000,
        );
      }
      let value;
      try {
        const raw = await response.text();
        if (Buffer.byteLength(raw) > 16384) throw new Error();
        value = JSON.parse(raw);
      } catch {
        throw new CrmSyncError('response_unconfirmed', true);
      }
      return validateCrmReceipt(value, request, previous, intentId);
    },
  };
}
