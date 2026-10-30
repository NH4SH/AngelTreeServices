// Fictional display data only. No provider client, sender or runtime credentials.
export const officeOrderId = '5b573654-7485-4075-a2ac-ea92e2b14518';
export const officeInvoiceId = '48034c48-f673-4575-8648-b87db64b67e0';
export const officeContact = { name: 'Synthetic Firewood Customer', email: 'firewood-office@example.invalid', phone: '2025550148',
  address: '123 Synthetic Lane\nFredericksburg, VA 22407', instructions: 'Stack by the side gate.\nPlease call before arriving.' };
export function officePriceReview() {
  return { kind: 'price_review', orderId: officeOrderId, reference: 'FW-5B573654', revision: 1,
    draftHash: 'a'.repeat(64), contact: { ...officeContact }, quantityLabel: 'Full cord', woodCents: 45000,
    stacking: true, stackingCents: 15000, approval: null };
}
export function officeAcceptedOrder() {
  return { kind: 'accepted_order', orderId: officeOrderId, invoiceId: officeInvoiceId, reference: 'FW-5B573654',
    invoiceNumber: 'INV-FW-5B573654-7485-4075-A2AC-EA92E2B14518', revision: 2, ledgerHash: 'b'.repeat(64),
    contact: { ...officeContact }, quantityLabel: 'Full cord', stacking: true, woodCents: 45000, stackingCents: 15000,
    principalCents: 60000, moneyConfirmed: true, paymentLabel: 'Paid · eligible credit card',
    paidPrincipalCents: 60000, surchargeCents: 1800, refundedCents: 0, balanceDueCents: 0,
    accounting: { issuedAtLabel: 'Oct 29, 2026, 2:00 PM Eastern', rawBalanceDueCents: 0,
      creditedPrincipalCents: 0, collectibleBalanceCents: 0, creditId: null },
    paymentWarnings: [], deliveryWindow: null,
    cancellation: { status: 'none', revision: 0, blockers: [], canConfirm: false },
    history: [{ id: 'event-ui-1', atLabel: 'Oct 29, 2026, 2:00 PM Eastern', actorLabel: 'Office reviewer', description: 'Delivery details reviewed.' }] };
}
export function officeWorkspace(selected = officePriceReview()) {
  return { status: 'ready', canManage: true, entries: [{ kind: selected.kind, orderId: selected.orderId,
    ...(selected.invoiceId ? { invoiceId: selected.invoiceId } : {}), reference: selected.reference,
    customerName: selected.contact.name, description: 'Full cord with stacking', statusLabel: selected.kind === 'price_review' ? 'Price review' : 'Accepted',
    principalCents: 60000 }], page: 1, hasMore: false, selected };
}
