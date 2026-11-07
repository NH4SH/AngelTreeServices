import {
  BINDING_KEYS, PREPARE_PATH, STATUS_PATH, RENEW_PATH, LIVE_PORTAL_ORIGIN,
  LIVE_ACCOUNT, HANDOFF_CONTRACT, HANDOFF_SOURCE, HANDOFF_ENVIRONMENT,
  LIVE_ACCEPTED_TERMS, PAYMENT_POLICY, canonicalHandoff, handoffDigest,
  parsePrepareRequest, parseStatusRequest, parseRenewRequest,
  normalizeLiveContact, signHandoff, validatePrepareReceipt, FirewoodHandoffError,
} from './contract.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from './live-profile.mjs';
import { validateSettlement } from './settlement.mjs';

const clients = new WeakMap();
const binding = request => Object.fromEntries(BINDING_KEYS.map(key => [key, request[key]]));
const closed = () => { throw new FirewoodHandoffError('live_runtime_unbound', false, 503); };
export function assertLiveClient(client, { isolated = false } = {}) {
  const value = clients.get(client);
  if (!value || isolated && !value.isolated) closed();
  return value;
}
export function liveStoreIdentity(client) {
  const context = assertLiveClient(client);
  return { profile: FIREWOOD_LIVE_REVIEW_PROFILE.profile, contract: HANDOFF_CONTRACT,
    source: HANDOFF_SOURCE, environment: HANDOFF_ENVIRONMENT, account: LIVE_ACCOUNT,
    portalOrigin: LIVE_PORTAL_ORIGIN, termsHash: FIREWOOD_LIVE_REVIEW_PROFILE.termsHash,
    paymentPolicyHash: FIREWOOD_LIVE_REVIEW_PROFILE.paymentPolicyHash,
    isolatedKeyId: context.keyId ?? null,
    execution: context.isolated ? 'isolated-live-profile-fixture' : 'unbound' };
}

export function prepareOrderBinding(row, client) {
  const context = assertLiveClient(client), quote = row.quote;
  if (!quote || quote.officeApproved === true && !quote.officeApproval || quote.officeApproved !== true && quote.officeApproval)
    throw new FirewoodHandoffError('live_order_approval_invalid');
  const order = { quantity: quote.quantity, stacking: quote.stacking, wood_cents: quote.woodCents,
    delivery_cents: quote.deliveryCents, stacking_cents: quote.stackingCents, principal_cents: quote.totalCents,
    currency: quote.currency, tax_cents: 0, tax_basis: 'va_domestic_use_locality_exempt',
    terms: row.terms, accepted_at_ms: Number(row.created_at), office_approval: quote.officeApproval ?? null,
    contact: normalizeLiveContact(row.contact, { allowSyntheticContacts: context.isolated }), payment_policy: PAYMENT_POLICY };
  return client.parseRequest({ contract: HANDOFF_CONTRACT, source_id: HANDOFF_SOURCE,
    environment_id: HANDOFF_ENVIRONMENT, account_id: LIVE_ACCOUNT, mode: 'live',
    order_id: row.id, reference: row.number, snapshot_hash: handoffDigest(order), order });
}

// The real profile has no environment/key/network loader. Its methods fail
// closed until the separately reviewed guarded installer supplies a real binding.
export function createClosedLiveClient() { return client(null); }

// In-process integration seam only. It cannot read a key, open a socket or select
// a URL. The supplied handler runs in this process against an isolated fixture.
export function createIsolatedLiveClient({ handle, keyId, secret, now = Date.now, timeoutMs = 12000 }) {
  if (typeof handle !== 'function' || !/^isolated-live-[a-z0-9-]{1,40}$/u.test(keyId ?? '')
    || !/^[a-f0-9]{64}$/u.test(secret ?? '') || typeof now !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 12000) closed();
  return client({ handle, keyId, secret, now, timeoutMs });
}
function client(test) {
  const options = () => ({ nowMs: test?.now() ?? Date.now(), allowSyntheticContacts: !!test });
  async function send(path, request) {
    if (!test) closed();
    const raw = canonicalHandoff(request);
    if (Buffer.byteLength(raw) > 16_384) throw new FirewoodHandoffError('live_handoff_request_too_large');
    const timestamp = String(Math.floor(test.now() / 1000));
    let deadline, reader;
    const abort = new AbortController(), timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => { abort.abort(); reject(Error('bounded_exchange')); }, test.timeoutMs);
    });
    try {
      let response;
      try {
        response = await Promise.race([test.handle(new Request(LIVE_PORTAL_ORIGIN + path, { method: 'POST', redirect: 'error', signal: abort.signal,
          headers: { 'Content-Type': 'application/json', 'X-ATS-Key-Id': test.keyId,
            'X-ATS-Timestamp': timestamp, 'X-ATS-Signature': signHandoff(raw, timestamp, test.secret, path) }, body: raw })), timeout]);
      } catch { throw new FirewoodHandoffError('live_handoff_connection_unconfirmed', true, 503); }
      if (!(response instanceof Response)) throw new FirewoodHandoffError('live_handoff_response_unconfirmed', true, 503);
      if (!response.ok) throw new FirewoodHandoffError([401, 403].includes(response.status) ? 'live_handoff_authorization_review'
        : response.status === 409 ? 'live_handoff_identity_review' : 'live_handoff_response_unconfirmed', response.status === 429 || response.status >= 500, response.status);
      reader = response.body?.getReader();
      if (!reader) throw new FirewoodHandoffError('live_handoff_response_unconfirmed', true, 503);
      const chunks = []; let size = 0;
      try {
        for (;;) { const part = await Promise.race([reader.read(), timeout]); if (part.done) break; size += part.value.byteLength;
          if (size > 65_536) throw Error('bounded_response'); chunks.push(Buffer.from(part.value)); }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch { void reader.cancel().catch(() => {}); throw new FirewoodHandoffError('live_handoff_response_unconfirmed', true, 503); }
    } finally { clearTimeout(deadline); reader?.releaseLock(); }
  }
  const value = {
    scope: FIREWOOD_LIVE_REVIEW_PROFILE,
    parseRequest: request => {
      if (test && !/@[^@\s]+\.invalid$/iu.test(request?.order?.contact?.email ?? ''))
        throw new FirewoodHandoffError('isolated_synthetic_contact_required');
      return parsePrepareRequest(request, options());
    },
    normalizeContact: contact => {
      if (test && !/@[^@\s]+\.invalid$/iu.test(contact?.email ?? ''))
        throw new FirewoodHandoffError('isolated_synthetic_contact_required');
      return normalizeLiveContact(contact, { allowSyntheticContacts: !!test });
    },
    async prepare(input) { const request = value.parseRequest(input); return validatePrepareReceipt(await send(PREPARE_PATH, request), request); },
    async renew(request, receipt) {
      const input = parseRenewRequest({ ...binding(request), invoice_id: receipt.invoice_id, expected_capability_version: receipt.capability_version });
      const renewed = validatePrepareReceipt(await send(RENEW_PATH, input), request);
      if (renewed.invoice_id !== receipt.invoice_id || renewed.capability_version < receipt.capability_version)
        throw new FirewoodHandoffError('live_handoff_identity_review');
      return renewed;
    },
    async status(request, receipt, previous = null) {
      const input = parseStatusRequest({ ...binding(request), invoice_id: receipt.invoice_id, known_revision: previous?.observation_revision ?? null });
      return validateSettlement(await send(STATUS_PATH, input), request, receipt, previous);
    },
  };
  clients.set(value, Object.freeze({ isolated: !!test, keyId: test?.keyId ?? null }));
  return Object.freeze(value);
}

export const acceptedLiveTerms = () => structuredClone(LIVE_ACCEPTED_TERMS);
