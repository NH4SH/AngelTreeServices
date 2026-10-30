// Candidate-only accounting interpretation. Credits release debt; they are not
// payments, refunds, email delivery, or a change to the accepted order price.
import { FirewoodLiveHandoffError } from './live-contract.mjs';

export const OFFICE_ACCOUNTING_KEYS = Object.freeze(['issued_at', 'original_principal_cents',
  'raw_balance_due_cents', 'credited_principal_cents', 'collectible_balance_cents', 'credit_id']);
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const reject = () => { throw new FirewoodLiveHandoffError('office_accounting_unconfirmed', true, 503); };

export function validateOfficeAccounting(value, invoice = null, previous = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...OFFICE_ACCOUNTING_KEYS].sort().join('|')
    || typeof value.issued_at !== 'string' || !Number.isFinite(Date.parse(value.issued_at))
    || !OFFICE_ACCOUNTING_KEYS.filter(key => key.endsWith('_cents')).every(key => integer(value[key]))
    || value.original_principal_cents < 1 || value.raw_balance_due_cents > value.original_principal_cents
    || value.credited_principal_cents > value.original_principal_cents
    || value.collectible_balance_cents !== Math.max(0, value.raw_balance_due_cents - value.credited_principal_cents)
    || !(value.credit_id === null && value.credited_principal_cents === 0
      || uuid(value.credit_id) && value.credited_principal_cents === value.original_principal_cents
        && value.collectible_balance_cents === 0)) reject();
  if (invoice && (invoice.total_cents !== value.original_principal_cents
    || invoice.balance_due_cents !== value.collectible_balance_cents
    || value.credit_id !== null && (invoice.status !== 'credited' || invoice.paid_at !== null)
    || value.credit_id === null && invoice.status === 'credited')) reject();
  if (previous && (value.issued_at !== previous.issued_at
    || value.original_principal_cents !== previous.original_principal_cents
    || previous.credit_id !== null && (value.credit_id !== previous.credit_id
      || value.credited_principal_cents !== previous.credited_principal_cents))) reject();
  return Object.freeze(structuredClone(value));
}

// The frozen money reducer intentionally knows nothing about debt releases.
// Validate the real stored accounting result first, then give it only the raw
// cash-ledger balance it has always required. Never turn credit into paid money.
export function officeSettlementInvoice(invoice, accounting) {
  const valid = validateOfficeAccounting(accounting, invoice);
  return { ...invoice, balance_due_cents: valid.raw_balance_due_cents,
    status: invoice.status === 'credited' ? valid.raw_balance_due_cents === 0 ? 'paid' : 'sent' : invoice.status };
}
