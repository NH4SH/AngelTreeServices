export type PaymentPrincipalParts = {
  amount_cents: number;
  dispute_status?: string | null;
  disputed_principal_cents?: number | null;
  refunded_principal_cents?: number | null;
};

/** Returns invoice principal still satisfied by a successful payment. */
export function netSuccessfulPaymentPrincipal(payment: PaymentPrincipalParts) {
  const refundedPrincipal = Math.max(0, Number(payment.refunded_principal_cents ?? 0));
  const lostDisputePrincipal = payment.dispute_status === "lost"
    ? Math.max(0, Number(payment.disputed_principal_cents ?? 0))
    : 0;

  // Surcharges are intentionally absent: they are processor revenue, not
  // invoice principal. Clamp combined refunds/disputes to prevent over-restore.
  return Math.max(0, Number(payment.amount_cents) - refundedPrincipal - lostDisputePrincipal);
}
