import 'server-only';
import { parseBusinessDateTime, toBusinessDateTimeLocal } from '../business-time.ts';
import type { FirewoodOfficeActionState } from './office-ui-types';
import { validateOfficeAccounting } from './handoff/office-accounting.mjs';

type Dependencies = { client: any; userId: string | null; roles: readonly string[]; admitted: boolean };
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const failure = (message: string): FirewoodOfficeActionState => ({ status: 'error', message });
const common = ['intent', 'request_id', 'order_id', 'expected_revision'];
const fields: Record<string, string[]> = {
  approve_price: ['draft_hash', 'wood_price', 'stacking_price', 'reason', 'office_price_confirmed'],
  revoke_price: ['approval_id', 'reason'],
  save_delivery_window: ['invoice_id', 'window_start', 'window_end', 'reason', 'ledger_hash'],
  request_cancellation: ['invoice_id', 'cancellation_reason', 'reason', 'confirm_hold', 'ledger_hash'],
  confirm_cancellation: ['invoice_id', 'expected_cancellation_revision', 'ledger_hash', 'reason', 'confirm_cancellation'],
  credit_cancellation: ['invoice_id', 'ledger_hash', 'reason', 'confirm_credit'],
};
function cents(value: string) {
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}
export function parseFirewoodOfficeTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const result = parseBusinessDateTime(value);
  if (!result || toBusinessDateTimeLocal(result) !== value) return null;
  // The repeated autumn hour has two meanings. Do not silently choose one.
  for (const offset of [-3_600_000, 3_600_000]) if (toBusinessDateTimeLocal(result.getTime() + offset) === value) return null;
  return result.toISOString();
}
async function rpc(client: any, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
  if (!result || result.error) throw result?.error ?? Error('Office result unavailable');
  return result.data;
}

// The browser supplies intent and optimistic concurrency checks only. SQL rereads
// immutable drafts, access and the ledger inside its owned transaction.
export async function runFirewoodOfficeCommand(form: FormData, deps: Dependencies): Promise<FirewoodOfficeActionState> {
  if (!deps.admitted) return failure('Website order management is not active yet. Existing firewood invoices remain available.');
  if (!uuid(deps.userId) || !deps.roles.some(role => role === 'owner' || role === 'admin'))
    return failure('An active owner or administrator must review this order.');
  const value = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)) : '';
  const intent = value('intent'), allowed = fields[intent];
  if (!Object.hasOwn(fields, intent)) return failure('Choose a valid office action.');
  for (const key of form.keys()) if (!key.startsWith('$ACTION_')
    && (![...common, ...allowed].includes(key) || form.getAll(key).length !== 1 || typeof form.get(key) !== 'string'))
    return failure('This form could not be verified. Refresh the order before trying again.');
  const order = value('order_id'), requestId = value('request_id'), revisionText = value('expected_revision');
  const reason = value('reason').trim();
  if (!uuid(order) || !uuid(requestId) || !/^\d{1,9}$/.test(revisionText) || !reason || reason.length > 500
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason))
    return failure('Check the order, review version and required reason, then try again.');
  const revision = Number(revisionText);
  try {
    const record = await rpc(deps.client, 'inspect_firewood_live_office', { p_order: order });
    if (!record || record.order?.order_id !== order) return failure('The order could not be confirmed. Refresh before continuing.');
    const args: Record<string, unknown> = { p_order: order, p_expected_revision: revision, p_reason: reason, p_request_id: requestId };
    let operation: string, message: string;
    if (intent === 'approve_price') {
      const wood = cents(value('wood_price')), stacking = cents(value('stacking_price'));
      if (!record.price_request || !hash(value('draft_hash')) || record.price_request.draft_hash !== value('draft_hash')
        || value('office_price_confirmed') !== 'confirmed' || wood === null || wood < 1 || stacking === null)
        return failure('Confirm the requested order, residential use and approved prices before saving.');
      operation = 'approve_firewood_live_office_request'; args.p_wood_cents = wood; args.p_stacking_cents = stacking;
      message = 'Price approved. The customer must review and accept it before an invoice is prepared.';
    } else if (intent === 'revoke_price') {
      if (!uuid(value('approval_id')) || record.price_request?.approval?.approval_id !== value('approval_id'))
        return failure('The price approval could not be confirmed. Refresh before revoking it.');
      operation = 'revoke_firewood_live_office_request'; message = 'The unaccepted price approval was revoked. History is retained.';
    } else {
      const invoice = value('invoice_id');
      if (!uuid(invoice) || record.order.invoice_id !== invoice || !hash(value('ledger_hash')))
        return failure('The accepted order and payment review could not be confirmed. Refresh before continuing.');
      delete args.p_order; delete args.p_expected_revision; args.p_revision = revision; args.p_invoice = invoice;
      if (intent === 'save_delivery_window') {
        const start = parseFirewoodOfficeTime(value('window_start')), end = parseFirewoodOfficeTime(value('window_end'));
        if (!start || !end || Date.parse(end) <= Date.parse(start)) return failure('Enter an agreed start and end in Eastern time. Avoid the repeated or missing daylight-saving hour.');
        operation = 'record_firewood_live_delivery'; delete args.p_reason;
        args.p_start = start; args.p_end = end; args.p_evidence = reason;
        message = 'The agreed delivery window was recorded. No message was sent.';
      } else if (intent === 'request_cancellation') {
        if (value('confirm_hold') !== 'confirmed' || !['customer_request', 'angel_cancelled', 'cannot_fulfill', 'declined_angel_reschedule'].includes(value('cancellation_reason')))
          return failure('Choose a cancellation reason and confirm the payment and delivery hold.');
        operation = 'request_firewood_live_cancellation'; args.p_reason_code = value('cancellation_reason');
        message = 'Cancellation requested. New collection and delivery are on hold; review the payment and refund status next.';
      } else if (intent === 'credit_cancellation') {
        if (value('confirm_credit') !== 'confirmed') return failure('Confirm that this releases the cancelled invoice balance without sending money.');
        validateOfficeAccounting(record.financial?.accounting);
        operation = 'credit_firewood_live_cancellation'; args.p_ledger_hash = value('ledger_hash');
        message = 'The cancelled invoice balance was released. Payment and refund history are retained. No money or message was sent.';
      } else {
        if (value('confirm_cancellation') !== 'confirmed' || value('expected_cancellation_revision') !== revisionText)
          return failure('Review the current cancellation and confirm before saving.');
        operation = 'confirm_firewood_live_cancellation'; delete args.p_reason;
        args.p_ledger_hash = value('ledger_hash'); args.p_notes = reason;
        message = 'Cancellation confirmed. Payment and delivery history are retained. No refund or message was issued.';
      }
    }
    const result = await rpc(deps.client, operation, args);
    if (!result || result.order_id !== order || !Number.isSafeInteger(result.revision)
      || result.revision < 1 || record.order.invoice_id && intent !== 'approve_price' && intent !== 'revoke_price' && result.invoice_id !== record.order.invoice_id)
      return failure('The result could not be confirmed. Refresh before retrying; your previous click may already be saved.');
    if (intent === 'credit_cancellation') {
      const accounting = validateOfficeAccounting(result.accounting, null, validateOfficeAccounting(record.financial?.accounting));
      if (accounting.credit_id === null || accounting.original_principal_cents !== record.order.principal_cents
        || result.state !== 'cancellation_requested') return failure('The balance release could not be confirmed. Refresh before retrying; your previous click may already be saved.');
    }
    return { status: 'success', message };
  } catch (error: any) {
    if (error?.code === '40001' || error?.code === '23505') return failure('This review changed or was already saved. Refresh the order before trying again.');
    if (intent === 'confirm_cancellation') return failure('Cancellation cannot be confirmed until payment and refund review is complete. Refresh the order for the current status.');
    if (intent === 'credit_cancellation') return failure('The invoice balance cannot be released until the cancellation, payment and checkout review is complete. Refresh the order for the current status.');
    return failure('The office action could not be confirmed. Refresh before retrying; your previous click may already be saved.');
  }
}
