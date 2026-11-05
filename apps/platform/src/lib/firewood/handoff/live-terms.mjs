// Shared customer wording. Pure data so document renderers need no server crypto.
export const LIVE_TERMS_CLAUSES = Object.freeze([
  { label: 'Your order', text: 'This invoice records your accepted firewood quantity, delivery address, selected stacking and agreed price. Choosing a payment method does not confirm payment or complete delivery.' },
  { label: 'Delivery and stacking', text: 'Delivery is included. Optional stacking costs $150 once per delivery, with wheelbarrow access and a reasonable carry. Angel Tree Services will contact you with a delivery date within one week; this does not promise delivery within one week.' },
  { label: 'Payment', text: 'Choose bank account, card, cash or check pickup, or mail a check. Bank payments must settle, and cash or checks must be received and recorded before they count as paid.' },
  { label: 'Card fee', text: 'A 3% fee on the outstanding principal applies only to eligible US credit cards, subject to applicable limits and processor validation. Debit, prepaid, unknown-funding and non-US cards, bank payments, cash and checks are not surcharged. Review the exact fee and total before confirming, or choose another payment method.' },
  { label: 'Cancellation', text: 'A full refund applies before delivery is scheduled or at least 48 hours before the agreed delivery window begins. Later customer cancellations are non-refundable. A full refund applies if Angel cancels, cannot fulfill, or you decline an Angel-requested reschedule. Contact the office to arrange any refund.' },
  { label: 'Household use', text: 'Your accepted order confirms personal household use at the delivery address and records the qualifying Virginia domestic-fuel and local exemption with zero sales tax. Business purchases require office review.' },
  { label: 'Veterans pricing', text: 'Tell the office before purchasing. Residential veterans pricing requires office approval and applies to wood and stacking before taxes and other fees. Only one discount applies.' },
  { label: 'Help with your order', text: 'Call Angel Tree Services at (540) 388-8715. An expired payment link or failed payment does not cancel the order or create another invoice. Refunds, disputes and returned payments require office review before another payment.' },
].map(term => Object.freeze(term)));

export const LIVE_TERMS_POLICY = Object.freeze({
  version: 'firewood-household-live-2026-10-29-v1',
  currency: 'usd', deliveryCents: 0, stackingCents: 15_000, maximumCords: 2,
  notificationDays: 7, cancellationHours: 48, cutoff: 'delivery-window-start',
  unscheduledRefund: 'full', angelCancellationRefund: 'full', declinedAngelRescheduleRefund: 'full',
  lateCustomerCancellation: 'non-refundable', taxBasisPoints: 0, purchaseUse: 'personal-household-only',
  veterans: 'Inform Angel before purchase; office-approved price; residential only; one discount.',
  timezone: 'America/New_York', clauses: LIVE_TERMS_CLAUSES,
});
