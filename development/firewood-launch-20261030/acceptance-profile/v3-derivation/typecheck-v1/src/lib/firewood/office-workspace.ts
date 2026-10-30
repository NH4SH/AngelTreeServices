import 'server-only';
import { formatBusinessDateTime } from '../business-time.ts';
import { LIVE_CATALOG } from './handoff/live-contract.mjs';
import { validateOfficeAccounting } from './handoff/office-accounting.mjs';
import type { FirewoodOfficeWorkspaceModel, FirewoodOfficeContact, FirewoodOfficePriceReview, FirewoodOfficeAcceptedOrder } from './office-ui-types';

type Params = { office_page?: string; office_order?: string; office_invoice?: string };
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const money = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const pageNumber = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1;
const dateLabel = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? formatBusinessDateTime(value) + ' Eastern' : 'Time not confirmed';
const statusLabels: Record<string, string> = { pending: 'Price review', approved: 'Price approved', expired: 'Approval expired', revoked: 'Approval revoked', active: 'Accepted', cancellation_requested: 'Cancellation requested', cancelled: 'Cancelled' };
const blockers: Record<string, string> = {
  payment_review: 'Payment information needs office review. Do not send a refund or request another payment based on this screen.',
  awaiting_settlement: 'A payment or checkout is still open or processing. Its final provider status must be confirmed before cancellation can finish.',
  awaiting_refund: 'A refund is still pending. Wait for its verified outcome before confirming cancellation.',
  refund_review: 'A full refund is due under the accepted terms. Arrange it through the existing office process; no refund is sent here.',
  cancellation_not_requested: 'Request cancellation before confirming it.',
  billing_closure_required: 'The order is on hold, but its invoice still needs an accounting review. Cancellation cannot finish while that balance remains collectible.',
  credit_already_recorded: 'The invoice balance has already been released. Refresh to review the recorded credit.',
  full_refund_required: 'Only a cancellation with full-refund eligibility can release this invoice balance.',
  checkout_closure_required: 'Every previous checkout must have verified closure before the invoice balance can be released.',
  full_refund_cancellation_required: 'Balance release is available only for a requested cancellation with full-refund eligibility.',
  payment_or_refund_pending: 'Wait for the pending payment or refund to finish before releasing the invoice balance.',
  refund_required: 'Recorded money is still retained. Complete the required refund review before releasing the invoice balance.',
  no_balance_to_credit: 'No outstanding invoice balance needs to be released.',
  use_clean_cancellation: 'No payment history needs a credit. Use the verified cancellation confirmation instead.',
  checkout_closure_review_required: 'Confirm the closure of each previous checkout under the existing invoice review before releasing the balance.',
};
function contact(value: any): FirewoodOfficeContact {
  if (!value || !['name', 'email', 'phone', 'address', 'address2', 'city', 'state', 'postal', 'notes'].every(key => typeof value[key] === 'string')) throw Error('Incomplete contact');
  return { name: value.name, email: value.email, phone: value.phone,
    address: [value.address, value.address2, [value.city, value.state, value.postal].filter(Boolean).join(', ')].filter(Boolean).join('\n'), instructions: value.notes };
}
async function rpc(client: any, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
  if (!result || result.error) throw Error('Office read unavailable'); return result.data;
}
export async function readFirewoodOfficeWorkspace(client: any, params: Params, { admitted, roles }: { admitted: boolean; roles: readonly string[] }): Promise<FirewoodOfficeWorkspaceModel> {
  if (!roles.some(role => role === 'owner' || role === 'admin')) return { status: 'unavailable', message: 'An active owner or administrator must open website order management.' };
  if (!admitted) return { status: 'unavailable', message: 'Website order management is prepared but not active yet. Existing firewood invoices remain available.' };
  try {
    const page = pageNumber(params.office_page), list = await rpc(client, 'list_firewood_acceptance_office', { p_page: page, p_page_size: 20 });
    if (!list || list.page !== page || list.page_size !== 20 || !Number.isSafeInteger(list.total_count)
      || list.total_count < 0 || !Array.isArray(list.items) || list.items.length > 20) throw Error('Invalid office page');
    const entries = list.items.map((item: any) => {
      const product = LIVE_CATALOG.quantities.find(value => value.id === item.quantity);
      if (!uuid(item.order_id) || !product || typeof item.customer_name !== 'string' || !statusLabels[item.state]
        || !['price_request', 'accepted_order'].includes(item.kind) || item.invoice_id !== null && !uuid(item.invoice_id)) throw Error('Invalid office row');
      return { kind: item.kind === 'price_request' ? 'price_review' as const : 'accepted_order' as const,
        orderId: item.order_id, ...(item.invoice_id ? { invoiceId: item.invoice_id } : {}), reference: item.reference,
        customerName: item.customer_name, description: product.label + (item.stacking ? ' with stacking' : ''),
        statusLabel: statusLabels[item.state], principalCents: money(item.principal_cents) };
    });
    let selected: FirewoodOfficePriceReview | FirewoodOfficeAcceptedOrder | null = null;
    const targetOrder = params.office_order ?? (params.office_invoice ? entries.find((entry: any) => entry.invoiceId === params.office_invoice)?.orderId : undefined);
    if (params.office_invoice && !uuid(params.office_invoice) || params.office_order && !uuid(params.office_order)
      || params.office_invoice && !targetOrder) throw Error('Invalid office selection');
    if (targetOrder) {
      const record = await rpc(client, 'inspect_firewood_acceptance_office', { p_order: targetOrder }), order = record?.order;
      const product = LIVE_CATALOG.quantities.find(value => value.id === order?.quantity);
      if (!order || order.order_id !== targetOrder || !product || params.office_invoice && order.invoice_id !== params.office_invoice) throw Error('Invalid office record');
      const customer = contact(order.contact);
      if (order.invoice_id === null) {
        const price = record.price_request;
        if (!price || !Number.isSafeInteger(price.revision) || price.revision < 1 || !/^[a-f0-9]{64}$/.test(price.draft_hash)) throw Error('Invalid price request');
        const approved = price.approval;
        selected = { kind: 'price_review', orderId: order.order_id, reference: order.reference, revision: price.revision,
          draftHash: price.draft_hash, contact: customer, quantityLabel: product.label, woodCents: product.wood_cents,
          stacking: order.stacking, stackingCents: order.stacking ? LIVE_CATALOG.stacking_cents : 0,
          approval: approved ? { id: approved.approval_id, status: price.status === 'approved' ? 'available' : price.status,
            woodCents: price.prices?.wood_cents, stackingCents: price.prices?.stacking_cents, expiresLabel: 'Expires ' + dateLabel(approved.expires_at) }
            : price.status === 'revoked' || price.status === 'expired' ? { id: '', status: price.status, woodCents: null,
              stackingCents: null, expiresLabel: 'A new office review is required.' } : null };
      } else {
        const life = record.lifecycle, financial = record.financial, verified = financial?.verified === true;
        const accounting = validateOfficeAccounting(financial?.accounting);
        if (!uuid(order.invoice_id) || !life || !['active', 'cancellation_requested', 'cancelled'].includes(life.state)
          || !Number.isSafeInteger(life.revision) || life.revision < 0 || !/^[a-f0-9]{64}$/.test(financial?.ledger_hash ?? '')
          || money(order.principal_cents) === null || money(order.wood_cents) === null || money(order.stacking_cents) === null
          || order.principal_cents !== order.wood_cents + order.stacking_cents
          || accounting.original_principal_cents !== order.principal_cents
          || verified && financial.balance_due_cents !== accounting.collectible_balance_cents
          || accounting.credit_id !== null && (financial.invoice_status !== 'credited' || life.state === 'active')) throw Error('Invalid accepted order');
        const warnings: string[] = [];
        if (!verified || financial.review_required) warnings.push(blockers.payment_review);
        if (financial.payment_pending) warnings.push(blockers.awaiting_settlement);
        if (financial.refund_pending) warnings.push(blockers.awaiting_refund);
        const returned = verified && financial.collected_gross_cents > 0 && financial.refunded_gross_cents >= financial.collected_gross_cents;
        selected = { kind: 'accepted_order', orderId: order.order_id, invoiceId: order.invoice_id, reference: order.reference,
          invoiceNumber: order.invoice_number, revision: life.revision, ledgerHash: financial.ledger_hash, contact: customer,
          quantityLabel: product.label, stacking: order.stacking, woodCents: order.wood_cents, stackingCents: order.stacking_cents,
          principalCents: order.principal_cents, moneyConfirmed: verified, invoiceVoided: financial.invoice_status === 'void',
          paymentLabel: financial.invoice_status === 'void' ? 'Invoice voided — no payment requested' : !verified ? 'Payment status not confirmed' : accounting.credit_id !== null ? 'Invoice balance released — no further payment due' : financial.review_required ? 'Payment requires review'
            : financial.payment_pending ? 'Payment or checkout in progress' : financial.refund_pending ? 'Refund pending'
              : returned ? 'Refund recorded' : financial.balance_due_cents === 0 ? 'Paid' : 'Payment not complete',
          paidPrincipalCents: verified ? money(financial.collected_principal_cents) : null,
          surchargeCents: verified ? money(financial.surcharge_collected_cents) : null,
          refundedCents: verified ? money(financial.refunded_gross_cents) : null,
          balanceDueCents: verified ? money(financial.balance_due_cents) : null, paymentWarnings: warnings,
          accounting: { issuedAtLabel: dateLabel(accounting.issued_at), rawBalanceDueCents: accounting.raw_balance_due_cents,
            creditedPrincipalCents: accounting.credited_principal_cents, collectibleBalanceCents: accounting.collectible_balance_cents, creditId: accounting.credit_id },
          deliveryWindow: life.delivery_window_start && life.delivery_window_end ? { startLabel: dateLabel(life.delivery_window_start),
            endLabel: dateLabel(life.delivery_window_end), evidence: life.delivery_evidence ?? '' } : null,
          cancellation: { status: life.state === 'active' ? 'none' : life.state === 'cancelled' ? 'confirmed' : 'requested',
            revision: life.revision, reasonLabel: life.cancellation_reason ?? undefined,
            policyLabel: life.refund_eligibility === 'full' ? 'Full refund applies under the accepted cancellation terms.'
              : life.refund_eligibility === 'non_refundable' ? 'The accepted terms make this late customer cancellation non-refundable.' : undefined,
            refundLabel: record.financial_disposition === 'refund_complete' ? 'Full refund recorded'
              : record.financial_disposition === 'no_refund_due' ? 'No refund due' : blockers[record.financial_disposition] ?? 'Payment review required',
            refundDueCents: verified && !financial.review_required && !financial.payment_pending && !financial.refund_pending
              && life.refund_eligibility === 'full' ? money(financial.retained_gross_cents) : null,
            blockers: (record.confirmation_blockers ?? []).filter((code: string) => code !== 'cancellation_not_requested').map((code: string) => blockers[code] ?? blockers.payment_review),
            canConfirm: record.can_confirm === true && verified && !financial.payment_pending && !financial.refund_pending && !financial.review_required,
            canCredit: record.can_credit === true && verified && accounting.credit_id === null && life.state === 'cancellation_requested'
              && life.refund_eligibility === 'full' && !financial.payment_pending && !financial.refund_pending && !financial.review_required,
            creditBlockers: (record.credit_blockers ?? []).map((code: string) => blockers[code] ?? 'Balance release needs office review. Refresh for the current payment and checkout status.') },
          history: (record.events ?? []).slice(-20).map((event: any, i: number) => ({ id: String(i), atLabel: dateLabel(event.created_at),
            actorLabel: 'Office reviewer', description: ({ price_approved: 'Price approved.', price_revoked: 'Price approval revoked.',
              delivery_recorded: 'Agreed delivery window recorded.', cancellation_requested: 'Cancellation requested; new collection and delivery held.',
              cancellation_confirmed: 'Cancellation confirmed without an automatic refund or message.',
              cancellation_credited: 'Cancelled order balance released. No payment, refund or message was sent.' } as Record<string, string>)[event.operation] ?? 'Office review recorded.' })) };
      }
    }
    return { status: 'ready', canManage: true, entries, page, hasMore: list.total_count > page * 20, selected };
  } catch { return { status: 'error', message: 'Website orders could not be confirmed. Refresh this page before making changes.' }; }
}
