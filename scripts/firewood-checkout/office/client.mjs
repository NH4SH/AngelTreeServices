// Inactive, in-process companion. No network, environment or credential loader.
import { LIVE_PORTAL_ORIGIN, canonicalLiveHandoff, liveHandoffDigest,
  FirewoodLiveHandoffError, priceLiveOrder } from './live-contract.mjs';
import { OFFICE_CONTRACT, OFFICE_BASE_KEYS, OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH,
  OFFICE_ORDER_STATUS_PATH, officeBinding, parseOfficePriceRequest, parseOfficePriceStatusRequest,
  parseOfficeOrderStatusRequest, validateOfficePriceReceipt, validateOfficeOrderStatus, signOfficeRequest } from './office-contract.mjs';

const clients = new WeakMap();
const fail = (code, retryable = false, status = 409) => { throw new FirewoodLiveHandoffError(code, retryable, status); };
const unavailable = () => fail('office_runtime_unbound', false, 503);
const base = value => Object.fromEntries(OFFICE_BASE_KEYS.map(key => [key, value[key]]));
export function assertOfficeClient(value, { isolated = false } = {}) {
  const context = clients.get(value);
  if (!context || isolated && !context.isolated) unavailable();
  return context;
}
export const officeIdentity = client => ({ contract: OFFICE_CONTRACT, binding: officeBinding('00000000-0000-4000-8000-000000000000'),
  execution: 'isolated-office-companion', keyId: assertOfficeClient(client, { isolated: true }).keyId });
export function createClosedOfficeClient() { return create(null); }
export function createIsolatedOfficeClient({ handle, keyId, secret, now = Date.now, timeoutMs = 12000 }) {
  if (typeof handle !== 'function' || !/^isolated-office-[a-z0-9-]{1,40}$/u.test(keyId ?? '')
    || !/^[a-f0-9]{64}$/u.test(secret ?? '') || typeof now !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 12000) unavailable();
  return create({ handle, keyId, secret, now, timeoutMs });
}

function create(test) {
  const clock = () => { if (!test) unavailable(); const at = test.now();
    if (!Number.isSafeInteger(at) || at < 1) unavailable(); return at; };
  const draftRequest = value => {
    if (!test) unavailable();
    if (!/@[^@\s]+\.invalid$/iu.test(value?.draft?.contact?.email ?? '')) fail('isolated_synthetic_contact_required');
    return parseOfficePriceRequest(value, { allowSyntheticContacts: true });
  };
  async function exchange(path, input) {
    if (!test) unavailable();
    const raw = canonicalLiveHandoff(input), timestamp = String(Math.floor(clock() / 1000));
    if (Buffer.byteLength(raw) > 16384) fail('office_request_too_large');
    let deadline, reader;
    const abort = new AbortController(), timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => { abort.abort(); reject(Error('bounded_exchange')); }, test.timeoutMs);
    });
    try {
      const response = await Promise.race([test.handle(new Request(LIVE_PORTAL_ORIGIN + path, {
        method: 'POST', signal: abort.signal, redirect: 'error', body: raw,
        headers: { 'Content-Type': 'application/json', 'X-ATS-Key-Id': test.keyId,
          'X-ATS-Timestamp': timestamp, 'X-ATS-Signature': signOfficeRequest(raw, timestamp, test.secret, path) },
      })), timeout]);
      if (!(response instanceof Response)) fail('office_response_unconfirmed', true, 503);
      if (!response.ok) fail([401, 403].includes(response.status) ? 'office_authorization_review'
        : response.status === 409 ? 'office_identity_review' : 'office_response_unconfirmed',
      response.status === 429 || response.status >= 500, response.status);
      reader = response.body?.getReader(); if (!reader) fail('office_response_unconfirmed', true, 503);
      const chunks = []; let size = 0;
      for (;;) {
        const part = await Promise.race([reader.read(), timeout]); if (part.done) break;
        size += part.value.byteLength; if (size > 65536) fail('office_response_too_large', true, 503);
        chunks.push(Buffer.from(part.value));
      }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch (error) {
      if (error instanceof FirewoodLiveHandoffError) throw error;
      fail('office_response_unconfirmed', true, 503);
    } finally { clearTimeout(deadline); if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); } }
  }
  function priceReceipt(value, request, previous = null) {
    const receipt = validateOfficePriceReceipt(value, request);
    if (previous && (receipt.revision < previous.revision
      || receipt.revision === previous.revision && canonicalLiveHandoff(receipt) !== canonicalLiveHandoff(previous)))
      fail('office_price_version_conflict');
    if (receipt.status === 'approved') {
      const at = clock(), approval = receipt.approval, expires = Date.parse(approval.expires_at), price = priceLiveOrder(request.draft);
      if (approval.approved_at_ms > at || expires <= at || expires <= approval.approved_at_ms
        || receipt.prices.wood_cents > price.wood_cents || receipt.prices.stacking_cents > price.stacking_cents)
        fail('office_price_expired_or_unconfirmed');
    }
    return receipt;
  }
  const value = {
    parseDraft: draftRequest,
    async requestPrice(input, previous = null) {
      const request = draftRequest(input); return priceReceipt(await exchange(OFFICE_PRICE_REQUEST_PATH, request), request, previous);
    },
    async priceStatus(input, previous = null) {
      const draft = draftRequest(input), request = parseOfficePriceStatusRequest({ ...base(draft), draft_hash: draft.draft_hash });
      return priceReceipt(await exchange(OFFICE_PRICE_STATUS_PATH, request), draft, previous);
    },
    async orderStatus(request, prepared, previous = null) {
      if (!test) unavailable();
      const input = parseOfficeOrderStatusRequest({ ...officeBinding(request.order_id), snapshot_hash: request.snapshot_hash,
        invoice_id: prepared.invoice_id, known_revision: previous?.observation_revision ?? null,
        known_workflow_revision: previous?.workflow_revision ?? null });
      const receipt = validateOfficeOrderStatus(await exchange(OFFICE_ORDER_STATUS_PATH, input), input, previous);
      if (receipt.totals.invoice_principal_cents !== request.order.principal_cents
        || receipt.totals.gross_refunded_cents > receipt.totals.gross_collected_cents
        || previous?.order_state === 'cancelled' && receipt.order_state !== 'cancelled')
        fail('office_lifecycle_or_principal_conflict');
      return receipt;
    },
  };
  clients.set(value, Object.freeze({ isolated: !!test, keyId: test?.keyId ?? null }));
  return Object.freeze(value);
}

export function makeOfficeDraft(orderId, chosen, client) {
  assertOfficeClient(client, { isolated: true });
  const draft = { quantity: chosen.quote.quantity, stacking: chosen.quote.stacking, contact: chosen.contact };
  return client.parseDraft({ ...officeBinding(orderId), draft, draft_hash: liveHandoffDigest(draft) });
}
