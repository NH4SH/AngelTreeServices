/** Presentation only. Server token checks and financial/approval commands remain authoritative. */
export function customerQuoteState(status: string) {
  switch (status) {
    case "draft":
    case "sent":
      return { kind: "open", canRespond: true, title: "Review your proposal", message: "Review the work and pricing below, then approve the proposal or request a change." } as const;
    case "change_requested":
      return { kind: "changes", canRespond: true, title: "Changes requested", message: "Your change request is with Angel Tree Services for review. The proposal below is the current version." } as const;
    case "approved":
      return { kind: "approved", canRespond: false, title: "Proposal approved", message: "Thank you. Angel Tree Services will contact you to confirm scheduling and any final details." } as const;
    case "declined":
      return { kind: "closed", canRespond: false, title: "Proposal declined", message: "This proposal was declined. No further response is needed. Contact our office if you would like to discuss the work." } as const;
    case "expired":
      return { kind: "closed", canRespond: false, title: "Proposal expired", message: "This proposal is no longer open for approval. Contact our office for an updated proposal." } as const;
    case "cancelled":
      return { kind: "closed", canRespond: false, title: "Proposal no longer active", message: "This proposal has been cancelled. Contact our office if you have questions or would like to discuss the work." } as const;
    default:
      return { kind: "closed", canRespond: false, title: "Proposal unavailable for response", message: "You can review this copy, but a response is not available. Please contact our office for help." } as const;
  }
}

type PaymentState = { status: string; provider: string | null; payment_method: string | null; failed_at?: string | null; updated_at?: string };
export function customerInvoiceState({ status, amountDueCents, payments, returnedPayment }: { status: string; amountDueCents: number; payments: PaymentState[]; returnedPayment?: string }) {
  if (status === "void") return { kind: "void", label: "Voided", title: "This invoice is void", message: "No payment is requested for this invoice. Contact our office if you need an updated copy.", canChoose: false, refresh: false } as const;
  if (!Number.isSafeInteger(amountDueCents) || amountDueCents < 0) return { kind: "review", label: "Under review", title: "Please contact our office", message: "The remaining balance could not be confirmed. Please call us before making a payment.", canChoose: false, refresh: false } as const;
  if (amountDueCents === 0) return { kind: "settled", label: status === "paid" ? "Paid" : "Nothing due", title: status === "paid" ? "Payment received" : "No payment needed", message: "There is no remaining balance on this invoice. You can keep a copy for your records.", canChoose: false, refresh: false } as const;
  if (status === "paid") return { kind: "review", label: "Under review", title: "Please contact our office", message: "The payment status and remaining balance need review. Please call us before making another payment.", canChoose: false, refresh: false } as const;
  const collectible = ["sent", "partially_paid", "overdue"].includes(status);
  if (!collectible) return { kind: "review", label: "Contact our office", title: "Payment is not requested here", message: "Please contact Angel Tree Services for the current invoice and payment options.", canChoose: false, refresh: false } as const;
  const pending = payments.filter(p => p.status === "pending" && p.provider === "stripe");
  if (pending.length) {
    const bank = pending.every(p => p.payment_method === "ach");
    const card = pending.every(p => p.payment_method === "card");
    return { kind: "processing", label: bank ? "Bank payment processing" : card ? "Card payment processing" : "Payment processing", title: bank ? "Your bank payment is processing" : card ? "Your card payment is processing" : "Your payment is processing", message: bank ? "Please do not submit another payment while this clears. Bank payments may take several business days. The balance updates after the payment is confirmed." : "Please do not submit another payment while we wait for confirmation. The balance updates after the payment is confirmed.", canChoose: false, refresh: true } as const;
  }
  // Return URLs are customer-controlled context, never proof of a payment or its outcome.
  if (returnedPayment === "success" || returnedPayment === "processing") return { kind: "confirming", label: "Awaiting confirmation", title: "Confirming your payment", message: "This invoice has not yet confirmed a new payment. Please do not pay again while you check the status. Refresh below, or contact our office if you are unsure.", canChoose: false, refresh: true } as const;
  const failed = [...payments].filter(p => p.status === "failed" && p.provider === "stripe").sort((a,b) => Date.parse(b.failed_at ?? b.updated_at ?? "") - Date.parse(a.failed_at ?? a.updated_at ?? ""))[0];
  if (failed) return { kind: "failed", label: "Payment needs attention", title: "A payment attempt did not complete", message: "The remaining balance is shown above. You can choose a payment method below to try again, or contact our office for help.", canChoose: true, refresh: false } as const;
  if (returnedPayment === "cancelled") return { kind: "open", label: status === "overdue" ? "Overdue" : status === "partially_paid" ? "Partially paid" : "Awaiting payment", title: "Choose how to pay", message: "You returned from checkout. No new payment is confirmed on this invoice. Choose a method below, or contact our office if you are unsure.", canChoose: true, refresh: false } as const;
  return { kind: "open", label: status === "overdue" ? "Overdue" : status === "partially_paid" ? "Partially paid" : "Awaiting payment", title: "Choose how to pay", message: "Select a payment method below. A pickup or mailing preference does not mark this invoice paid.", canChoose: true, refresh: false } as const;
}

export type CustomerPaymentPreference = "ach" | "card" | "cash_check_pickup" | "check_mail";
export function initialCustomerPaymentPreference(selected: CustomerPaymentPreference | null, online: boolean, card: boolean): CustomerPaymentPreference {
  if (selected === "cash_check_pickup" || selected === "check_mail") return selected;
  if (selected === "card" && online && card) return selected;
  return online ? "ach" : "cash_check_pickup";
}
