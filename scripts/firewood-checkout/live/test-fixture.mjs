// Synthetic, in-process test data only. No fetch, provider, credential loader or
// actual production runtime imports this fixture.
import { randomUUID } from 'node:crypto';
import { BINDING_KEYS, PREPARE_PATH, STATUS_PATH, RENEW_PATH, LIVE_PORTAL_ORIGIN,
  LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, canonicalHandoff,
  parsePrepareRequest, parseStatusRequest, parseRenewRequest } from './contract.mjs';
import { verifyLiveHandoffSignature } from './live-contract.mjs';
import { createIsolatedLiveClient } from './client.mjs';

export const fixtureInput = () => ({ quantity: 'full', stacking: false, name: 'Isolated Live Profile Customer',
  email: 'production-profile@checkout.invalid', phone: '2025550194', address: '123 Synthetic Lane',
  address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407', notes: 'Isolated profile review only.',
  termsAccepted: true, householdUseConfirmed: true, termsHash: LIVE_TERMS_HASH, paymentPolicyHash: LIVE_PAYMENT_POLICY_HASH });
export function liveFixture({ keyId = 'isolated-live-website-tests' } = {}) {
  const secret = 'a'.repeat(64), mappings = new Map(); let at = Date.now(), ready = false, loseReply = false, calls = 0;
  const now = () => at;
  async function handle(request) {
    calls++; const path = new URL(request.url).pathname, raw = await request.text();
    if (request.headers.get('x-ats-key-id') !== keyId || !verifyLiveHandoffSignature({ raw, timestamp: request.headers.get('x-ats-timestamp'),
      signature: request.headers.get('x-ats-signature'), secret, path, nowMs: at })) return Response.json({ code: 'unauthorized' }, { status: 401 });
    const input = JSON.parse(raw);
    if (path === PREPARE_PATH) {
      const parsed = parsePrepareRequest(input, { nowMs: at, allowSyntheticContacts: true });
      let mapping = mappings.get(parsed.order_id);
      if (mapping && canonicalHandoff(mapping.request) !== canonicalHandoff(parsed)) return Response.json({ code: 'conflict' }, { status: 409 });
      if (!mapping) {
        const principal = parsed.order.principal_cents, binding = Object.fromEntries(BINDING_KEYS.map(k => [k, parsed[k]])), invoice = randomUUID();
        const receipt = { ...binding, invoice_id: invoice, invoice_number: 'INV-FW-' + parsed.order_id.toUpperCase(),
          principal_cents: principal, preparation_status: 'prepared', replayed: false, capability_version: 1,
          receipt_authority: 'crm', order_confirmation_authority: 'website', payment_retry_required: false,
          delivery_completed: false, payment_execution_ready: ready, execution_blockers: ready ? [] : ['collection_held'],
          portal_url: LIVE_PORTAL_ORIGIN + '/portal/invoice/' + 'b'.repeat(48), expires_at: new Date(at + 1800000).toISOString() };
        const status = { ...binding, invoice_id: invoice, observation_revision: 1, payment_state: 'unpaid',
          totals: { invoice_principal_cents: principal, paid_principal_cents: 0, surcharge_collected_cents: 0, gross_collected_cents: 0,
            refunded_principal_cents: 0, refunded_surcharge_cents: 0, gross_refunded_cents: 0, balance_due_cents: principal },
          payment_preference: null, payment_pending: false, review_required: false, original_paid_evidence: null,
          payment_retry_required: false, receipt_authority: 'crm', order_confirmation_authority: 'website',
          delivery_completed: false, fulfillment_ready: false, verification_source: 'crm_ledger' };
        mapping = { request: parsed, receipt, status }; mappings.set(parsed.order_id, mapping);
      } else mapping.receipt = { ...mapping.receipt, replayed: true };
      if (loseReply) { loseReply = false; throw Error('lost_reply_after_prepare'); }
      return Response.json(mapping.receipt);
    }
    const parsed = path === RENEW_PATH ? parseRenewRequest(input) : parseStatusRequest(input), mapping = mappings.get(parsed.order_id);
    if (!mapping || parsed.invoice_id !== mapping.receipt.invoice_id) return Response.json({}, { status: 409 });
    if (path === RENEW_PATH) {
      mapping.receipt = { ...mapping.receipt, capability_version: mapping.receipt.capability_version + 1,
        expires_at: new Date(at + 1800000).toISOString(), payment_execution_ready: ready,
        execution_blockers: ready ? [] : ['collection_held'] };
      return Response.json(mapping.receipt);
    }
    if (path !== STATUS_PATH) return Response.json({}, { status: 404 });
    return Response.json(mapping.status);
  }
  const client = createIsolatedLiveClient({ handle, keyId, secret, now });
  return { client, mappings, handle, now, keyId, secret, calls: () => calls,
    advance: ms => { at += ms; }, ready: value => { ready = value; }, loseNextReply: () => { loseReply = true; },
    latest: () => [...mappings.values()].at(-1),
    observe(state, { fee = 0, channel = 'ach' } = {}) {
      const m = [...mappings.values()].at(-1), p = m.request.order.principal_cents, old = m.status;
      if (state === 'paid') m.status = { ...old, observation_revision: old.observation_revision + 1, payment_state: 'paid',
        payment_preference: channel, fulfillment_ready: true, payment_pending: false, review_required: false,
        original_paid_evidence: { paid: true, observed_at: new Date(at).toISOString(), principal_cents: p,
          surcharge_collected_cents: fee, gross_collected_cents: p + fee, payment_ids: [randomUUID()] },
        totals: { ...old.totals, paid_principal_cents: p, balance_due_cents: 0, surcharge_collected_cents: fee, gross_collected_cents: p + fee } };
      else if (state === 'processing') m.status = { ...old, observation_revision: old.observation_revision + 1,
        payment_state: 'processing', payment_preference: 'ach', payment_pending: true, fulfillment_ready: false };
      else if (state === 'refund_pending') m.status = { ...old, observation_revision: old.observation_revision + 1,
        payment_state: 'processing', payment_pending: true, review_required: true, fulfillment_ready: false };
      else if (state === 'refunded') m.status = { ...old, observation_revision: old.observation_revision + 1,
        payment_state: 'refunded', payment_pending: false, review_required: true, fulfillment_ready: false,
        totals: { ...old.totals, paid_principal_cents: 0, balance_due_cents: p, refunded_principal_cents: p,
          refunded_surcharge_cents: old.totals.surcharge_collected_cents, gross_refunded_cents: old.totals.gross_collected_cents } };
      else if (state === 'offline_pending') m.status = { ...old, observation_revision: old.observation_revision + 1,
        payment_state: 'offline_pending', payment_preference: 'check_mail' };
      else throw Error('unknown_fixture_state');
      return m.status;
    },
  };
}
