// Live implementation candidate. Only a reviewed installer may supply runtime
// dependencies. The app routes currently have no installed live dependencies.
import { makeCapability, decryptCapability } from './handler.mjs';
import { reduceSettlement } from './settlement.mjs';
import {
  FirewoodLiveHandoffError, LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE,
  LIVE_HANDOFF_ENVIRONMENT, LIVE_ACCOUNT, LIVE_PORTAL_ORIGIN, LIVE_WEBSITE_ORIGIN,
  LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH, LIVE_REQUEST_MAX_BYTES,
  LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, LIVE_BINDING_KEYS,
  canonicalLiveHandoff, parseLivePrepareRequest, parseLiveStatusRequest,
  parseLiveRenewRequest, verifyLiveHandoffSignature,
  validateLivePrepareReceipt, validateLiveStatusReceipt,
} from './live-contract.mjs';

const response = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  ...(status === 503 ? { 'Retry-After': '5' } : {}),
} });
export const liveHandoffUnavailable = () => response({ contract: LIVE_HANDOFF_CONTRACT,
  code: 'handoff_unavailable', retryable: false, payment_retry_required: false }, 503);

export function isLiveHandoffConfiguration(config) {
  return config?.enabled === true && config.profile === 'live' && config.mode === 'live'
    && config.contract === LIVE_HANDOFF_CONTRACT && config.sourceId === LIVE_HANDOFF_SOURCE
    && config.environmentId === LIVE_HANDOFF_ENVIRONMENT && config.accountId === LIVE_ACCOUNT
    && config.portalOrigin === LIVE_PORTAL_ORIGIN && config.websiteOrigin === LIVE_WEBSITE_ORIGIN
    && config.termsHash === LIVE_TERMS_HASH && config.paymentPolicyHash === LIVE_PAYMENT_POLICY_HASH
    && /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(config.keyId ?? '')
    && /^[A-Za-z0-9_-]{32,256}$/.test(config.signingSecret ?? '')
    && Buffer.isBuffer(config.encryptionKey) && config.encryptionKey.length === 32
    && typeof config.collectorReady === 'boolean';
}

export async function readLiveHandoffBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' || !request.body)
    throw new FirewoodLiveHandoffError('invalid_request');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > LIVE_REQUEST_MAX_BYTES))
    throw new FirewoodLiveHandoffError('request_too_large', false, 413);
  const reader = request.body.getReader(), parts = []; let bytes = 0, deadline;
  const timeout = new Promise((_, reject) => {
    deadline = setTimeout(() => {
      reject(new FirewoodLiveHandoffError('request_timeout', true, 408));
      void reader.cancel().catch(() => {});
    }, 5000);
    deadline.unref?.();
  });
  try {
    for (;;) {
      const item = await Promise.race([reader.read(), timeout]); if (item.done) break;
      bytes += item.value.length;
      if (bytes > LIVE_REQUEST_MAX_BYTES) { await reader.cancel(); throw new FirewoodLiveHandoffError('request_too_large', false, 413); }
      parts.push(item.value);
    }
  } finally { clearTimeout(deadline); reader.releaseLock(); }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)); }
  catch { throw new FirewoodLiveHandoffError('invalid_request'); }
}

function scopeMatches(scope, config) {
  return scope?.contract === LIVE_HANDOFF_CONTRACT && scope.source_id === config.sourceId
    && scope.environment_id === config.environmentId && scope.account_id === config.accountId
    && scope.mode === 'live' && scope.livemode === true
    && scope.terms_hash === LIVE_TERMS_HASH && scope.payment_policy_hash === LIVE_PAYMENT_POLICY_HASH;
}

// parsePrepare is a dependency seam for isolated .invalid fixtures, never an
// environment/request option. The real route does not supply a custom parser.
export async function handleLiveHandoff(request, { config, db, now = Date.now, parsePrepare = parseLivePrepareRequest }) {
  if (!isLiveHandoffConfiguration(config)) return liveHandoffUnavailable();
  try {
    const url = new URL(request.url), path = url.pathname;
    // Ignore forwarded-host headers. Native Next can use an internal loopback
    // URL only when the original Host is the exact approved portal hostname.
    const originalHost = request.headers.get('host');
    const host = new URL(LIVE_PORTAL_ORIGIN).host;
    const external = url.origin === LIVE_PORTAL_ORIGIN && (!originalHost || originalHost === host);
    const internal = ['localhost', '127.0.0.1'].includes(url.hostname) && originalHost === host;
    if (request.method !== 'POST' || !(external || internal) || url.search || url.hash
      || ![LIVE_PREPARE_PATH, LIVE_STATUS_PATH, LIVE_RENEW_PATH].includes(path))
      return response({ code: 'invalid_request', retryable: false, payment_retry_required: false }, 400);
    const timestamp = request.headers.get('x-ats-timestamp'), signature = request.headers.get('x-ats-signature');
    if (request.headers.get('x-ats-key-id') !== config.keyId) return response({ code: 'unauthorized', retryable: false }, 401);
    const raw = await readLiveHandoffBody(request);
    if (!verifyLiveHandoffSignature({ raw, timestamp, signature, secret: config.signingSecret, path, nowMs: now() }))
      return response({ code: 'unauthorized', retryable: false }, 401);
    let input;
    try {
      const value = JSON.parse(raw);
      input = path === LIVE_PREPARE_PATH ? parsePrepare(value, { nowMs: now() })
        : path === LIVE_STATUS_PATH ? parseLiveStatusRequest(value) : parseLiveRenewRequest(value);
    } catch (error) {
      if (error instanceof FirewoodLiveHandoffError) throw error;
      throw new FirewoodLiveHandoffError('invalid_request');
    }
    const scope = await db.call('get_firewood_live_handoff_context', { p_source: config.sourceId });
    if (!scopeMatches(scope, config)) throw new FirewoodLiveHandoffError('isolation_unconfirmed', true, 503);
    if (path !== LIVE_STATUS_PATH) {
      const capability = makeCapability(config.encryptionKey, now());
      const data = path === LIVE_PREPARE_PATH
        ? await db.call('prepare_firewood_live_handoff', { p_source: config.sourceId, p_request: input, p_capability: capability })
        : await db.call('renew_firewood_live_handoff', { p_source: config.sourceId, p_order: input.order_id,
          p_invoice: input.invoice_id, p_hash: input.snapshot_hash, p_version: input.expected_capability_version, p_capability: capability });
      const { token_encrypted, ...receipt } = data ?? {};
      if (!config.collectorReady && receipt.payment_execution_ready === true) {
        receipt.payment_execution_ready = false; receipt.execution_blockers = ['collector_runtime_not_enabled'];
      }
      receipt.portal_url = token_encrypted
        ? LIVE_PORTAL_ORIGIN + '/portal/invoice/' + decryptCapability(token_encrypted, config.encryptionKey) : null;
      const valid = validateLivePrepareReceipt(receipt, path === LIVE_PREPARE_PATH ? input
        : { ...input, order: { principal_cents: receipt.principal_cents } });
      if (path === LIVE_RENEW_PATH && valid.invoice_id !== input.invoice_id)
        throw new FirewoodLiveHandoffError('binding_unconfirmed', true, 503);
      return response(valid, path === LIVE_PREPARE_PATH && !valid.replayed ? 201 : 200);
    }
    const args = { p_source: config.sourceId, p_order: input.order_id, p_invoice: input.invoice_id, p_hash: input.snapshot_hash };
    const ledger = await db.call('read_firewood_live_handoff', args);
    if (!ledger || !/^[a-f0-9]{64}$/.test(ledger.ledger_hash ?? '')) throw new FirewoodLiveHandoffError('settlement_unconfirmed', true, 503);
    // Once office workflows are installed, financial-only clients must upgrade.
    // Their old DTO cannot carry a cancellation hold or its monotonic revision.
    if (Object.hasOwn(ledger, 'workflow')) throw new FirewoodLiveHandoffError('office_workflow_status_required', false, 503);
    const financial = reduceSettlement({ principal: ledger.invoice?.total_cents, invoice: ledger.invoice,
      payments: ledger.payments, attempts: ledger.attempts, refunds: ledger.refunds,
      preference: ledger.invoice?.payment_preference, originalPaidEvidence: ledger.original_paid_evidence });
    const recorded = await db.call('record_firewood_live_handoff_observation', { ...args, p_ledger_hash: ledger.ledger_hash, p_financial: financial });
    if (!recorded || canonicalLiveHandoff(recorded.financial) !== canonicalLiveHandoff(financial))
      throw new FirewoodLiveHandoffError('settlement_unconfirmed', true, 503);
    const binding = Object.fromEntries(LIVE_BINDING_KEYS.map(key => [key, input[key]]));
    return response(validateLiveStatusReceipt({ ...binding, invoice_id: input.invoice_id, ...financial,
      observation_revision: recorded.observation_revision, verification_source: 'crm_ledger' }, input));
  } catch (error) {
    const e = error instanceof FirewoodLiveHandoffError ? error
      : new FirewoodLiveHandoffError('handoff_unconfirmed', true, 503);
    return response({ contract: LIVE_HANDOFF_CONTRACT, code: e.code, retryable: e.retryable, payment_retry_required: false }, e.httpStatus);
  }
}
