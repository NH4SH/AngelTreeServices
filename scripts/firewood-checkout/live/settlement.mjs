import { BINDING_KEYS, validateStatusReceipt, canonicalHandoff, FirewoodHandoffError } from './contract.mjs';
export function validateSettlement(value, request, prepared, previous = null) {
  const input = { ...Object.fromEntries(BINDING_KEYS.map(key => [key, request[key]])),
    invoice_id: prepared.invoice_id, known_revision: previous?.observation_revision ?? null };
  const status = validateStatusReceipt(value, input, previous), t = status.totals;
  if (t.invoice_principal_cents !== request.order.principal_cents
    || t.gross_refunded_cents > t.gross_collected_cents
    || status.payment_state === 'offline_pending' && (status.payment_pending || t.paid_principal_cents !== 0
      || !['cash_check_pickup', 'check_mail'].includes(status.payment_preference)))
    throw new FirewoodHandoffError('live_settlement_unconfirmed', true, 503);
  if (previous && status.observation_revision === previous.observation_revision
    && canonicalHandoff(status) !== canonicalHandoff(previous))
    throw new FirewoodHandoffError('live_settlement_version_conflict');
  return status;
}
