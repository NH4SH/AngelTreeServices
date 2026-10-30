import { FirewoodLiveHandoffError, LIVE_HANDOFF_CONTRACT, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH,
  canonicalLiveHandoff } from './live-contract.mjs';
import { readLiveHandoffBody, isLiveHandoffConfiguration } from './live-handler.mjs';
import { reduceSettlement } from './settlement.mjs';
import { validateOfficeAccounting, officeSettlementInvoice } from './office-accounting.mjs';
import { OFFICE_CONTRACT, OFFICE_BASE_KEYS, OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH,
  OFFICE_ORDER_STATUS_PATH, parseOfficePriceRequest, parseOfficePriceStatusRequest,
  parseOfficeOrderStatusRequest, validateOfficePriceReceipt, validateOfficeOrderStatus, verifyOfficeSignature } from './office-contract.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export const officeUnavailable = () => json({ contract: OFFICE_CONTRACT, code: 'office_workflow_unavailable', retryable: false, payment_retry_required: false }, 503);

export async function handleOfficeHandoff(request, { config, db, now = Date.now, parsePriceRequest = parseOfficePriceRequest }) {
  if (!isLiveHandoffConfiguration(config) || config.officeEnabled !== true) return officeUnavailable();
  try {
    const url = new URL(request.url), host = new URL(config.portalOrigin).host, originalHost = request.headers.get('host');
    const external = url.origin === config.portalOrigin && (!originalHost || originalHost === host);
    const internal = ['localhost', '127.0.0.1'].includes(url.hostname) && originalHost === host;
    if (request.method !== 'POST' || !(external || internal) || url.search || url.hash
      || ![OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH].includes(url.pathname))
      return json({ code: 'invalid_request', retryable: false }, 400);
    if (request.headers.get('x-ats-key-id') !== config.keyId) return json({ code: 'unauthorized', retryable: false }, 401);
    const raw = await readLiveHandoffBody(request);
    if (!verifyOfficeSignature({ raw, timestamp: request.headers.get('x-ats-timestamp'), signature: request.headers.get('x-ats-signature'),
      secret: config.signingSecret, path: url.pathname, nowMs: now() })) return json({ code: 'unauthorized', retryable: false }, 401);
    let input;
    try { const value = JSON.parse(raw); input = url.pathname === OFFICE_PRICE_REQUEST_PATH ? parsePriceRequest(value)
      : url.pathname === OFFICE_PRICE_STATUS_PATH ? parseOfficePriceStatusRequest(value) : parseOfficeOrderStatusRequest(value); }
    catch (error) { if (error instanceof FirewoodLiveHandoffError) throw error; throw new FirewoodLiveHandoffError('invalid_request'); }
    const scope = await db.call('get_firewood_live_handoff_context', { p_source: config.sourceId });
    if (scope?.contract !== LIVE_HANDOFF_CONTRACT || scope.source_id !== config.sourceId || scope.environment_id !== config.environmentId
      || scope.account_id !== config.accountId || scope.mode !== 'live' || scope.livemode !== true
      || scope.terms_hash !== LIVE_TERMS_HASH || scope.payment_policy_hash !== LIVE_PAYMENT_POLICY_HASH)
      throw new FirewoodLiveHandoffError('isolation_unconfirmed', true, 503);
    const envelope = Object.fromEntries(OFFICE_BASE_KEYS.map(key => [key, input[key]]));
    if (url.pathname !== OFFICE_ORDER_STATUS_PATH) {
      const data = await db.call(url.pathname === OFFICE_PRICE_REQUEST_PATH ? 'request_firewood_live_office_price' : 'read_firewood_live_office_price', {
        p_source: config.sourceId, p_order: input.order_id, p_reference: input.reference, p_draft_hash: input.draft_hash, p_draft: input.draft });
      if (!data || data.order_id !== input.order_id || data.reference !== input.reference || data.draft_hash !== input.draft_hash)
        throw new FirewoodLiveHandoffError('office_price_unconfirmed', true, 503);
      return json(validateOfficePriceReceipt({ ...envelope, draft_hash: data.draft_hash, revision: data.revision,
        status: data.status, approval: data.approval, prices: data.prices }, input));
    }
    const args = { p_source: config.sourceId, p_order: input.order_id, p_invoice: input.invoice_id, p_hash: input.snapshot_hash };
    const ledger = await db.call('read_firewood_live_handoff', args), workflow = ledger?.workflow;
    if (!ledger || !/^[a-f0-9]{64}$/.test(ledger.ledger_hash ?? '') || !workflow
      || Object.keys(workflow).sort().join('|') !== ['state', 'revision', 'collection_held', 'fulfillment_held'].sort().join('|')
      || !['active', 'cancellation_requested', 'cancelled'].includes(workflow.state)
      || !Number.isSafeInteger(workflow.revision) || workflow.revision < 0
      || workflow.collection_held !== (workflow.state !== 'active') || workflow.fulfillment_held !== (workflow.state !== 'active'))
      throw new FirewoodLiveHandoffError('office_order_status_unconfirmed', true, 503);
    const accounting = validateOfficeAccounting(ledger.accounting, ledger.invoice);
    const money = reduceSettlement({ principal: ledger.invoice?.total_cents, invoice: officeSettlementInvoice(ledger.invoice, accounting), payments: ledger.payments,
      attempts: ledger.attempts, refunds: ledger.refunds, preference: ledger.invoice?.payment_preference, originalPaidEvidence: ledger.original_paid_evidence });
    const financial = { ...money, order_state: workflow.state, workflow_revision: workflow.revision, accounting,
      fulfillment_ready: money.fulfillment_ready && !workflow.fulfillment_held && accounting.credit_id === null };
    const recorded = await db.call('record_firewood_live_handoff_observation', { ...args, p_ledger_hash: ledger.ledger_hash, p_financial: financial });
    if (!recorded || canonicalLiveHandoff(recorded.financial) !== canonicalLiveHandoff(financial))
      throw new FirewoodLiveHandoffError('office_order_status_unconfirmed', true, 503);
    return json(validateOfficeOrderStatus({ ...envelope, snapshot_hash: input.snapshot_hash, invoice_id: input.invoice_id,
      ...financial, observation_revision: recorded.observation_revision, verification_source: 'crm_ledger' }, input));
  } catch (error) {
    const e = error instanceof FirewoodLiveHandoffError ? error : new FirewoodLiveHandoffError('office_workflow_unconfirmed', true, 503);
    return json({ contract: OFFICE_CONTRACT, code: e.code, retryable: e.retryable, payment_retry_required: false }, e.httpStatus);
  }
}
