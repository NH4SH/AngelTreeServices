// Candidate validation only. This module never constructs a provider client,
// reads credentials, sends a receipt, or authorizes a runtime installation.
import { LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_ACCOUNT, LIVE_TERMS_POLICY, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH,
  FirewoodLiveHandoffError } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/src/lib/firewood/handoff/live-contract.mjs';

export function isLiveFirewoodInvoice(invoice) {
  return invoice?.document_terms_version === LIVE_TERMS_POLICY.version
    || invoice?.document_terms_version?.startsWith('firewood-household-live-') === true
    || invoice?.invoice_number?.startsWith('INV-FW-') === true;
}
export function validateLiveCollectorContext(context, invoiceId) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(invoiceId ?? '')
    || context?.managed !== true || context.contract !== LIVE_HANDOFF_CONTRACT
    || context.source_id !== LIVE_HANDOFF_SOURCE || context.environment_id !== LIVE_HANDOFF_ENVIRONMENT
    || context.account_id !== LIVE_ACCOUNT || context.mode !== 'live' || context.livemode !== true
    || context.terms_hash !== LIVE_TERMS_HASH || context.payment_policy_hash !== LIVE_PAYMENT_POLICY_HASH
    || context.receipt_authority !== 'crm' || context.surcharge_reporting !== true
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.order_id ?? '')
    || context.invoice_id !== invoiceId || context.allowed !== true
    || context.already_paid !== false || context.review_required !== false)
    throw new FirewoodLiveHandoffError('live_collection_unconfirmed', false, 503);
  return Object.freeze({ profile: 'firewood-live-v1', mode: 'live', sourceId: LIVE_HANDOFF_SOURCE,
    orderId: context.order_id, invoiceId, accountId: LIVE_ACCOUNT, receiptAuthority: 'crm', surchargeReporting: true });
}

export function liveSurchargeFields(policy, { principalCents, surchargeCents, funding, country }) {
  if (policy?.profile !== 'firewood-live-v1' || policy.mode !== 'live'
    || policy.accountId !== LIVE_ACCOUNT || policy.sourceId !== LIVE_HANDOFF_SOURCE
    || policy.receiptAuthority !== 'crm' || policy.surchargeReporting !== true
    || !Number.isSafeInteger(principalCents) || principalCents < 1
    || !Number.isSafeInteger(surchargeCents) || surchargeCents < 0)
    throw new FirewoodLiveHandoffError('live_surcharge_unconfirmed');
  const credit = funding === 'credit' && country === 'US';
  if (surchargeCents !== (credit ? Math.round(principalCents * 300 / 10_000) : 0))
    throw new FirewoodLiveHandoffError('live_surcharge_unconfirmed');
  return surchargeCents === 0 ? null : Object.freeze({ amount: surchargeCents, enforce_validation: 'enabled' });
}
