import type { InvoiceStatus } from "@/lib/types/database";

const deliveredPaymentStatuses: InvoiceStatus[] = ["sent", "partially_paid", "overdue"];

export function canRecordManualInvoicePayment(status: InvoiceStatus, balanceDueCents: number) {
  return balanceDueCents > 0 && !["paid", "void"].includes(status);
}

export function isInvoiceCustomerPayable(status: InvoiceStatus, balanceDueCents: number) {
  return balanceDueCents > 0 && deliveredPaymentStatuses.includes(status);
}

export function isInvoiceReminderEligible(status: InvoiceStatus, balanceDueCents: number) {
  return isInvoiceCustomerPayable(status, balanceDueCents);
}

export function resolveInvoicePaymentStatus({
  balanceDueCents,
  currentStatus,
  dueAt,
  paidCents,
  sentAt,
  now = Date.now(),
}: {
  balanceDueCents: number;
  currentStatus: InvoiceStatus;
  dueAt: string | null;
  paidCents: number;
  sentAt: string | null;
  now?: number;
}): InvoiceStatus {
  if (currentStatus === "void") return "void";
  if (balanceDueCents === 0) return "paid";

  // A paid invoice can return to an open balance after a payment correction.
  // Without delivery metadata, that record must return to draft rather than
  // becoming customer-payable merely because some principal remains paid.
  if (!sentAt && ["draft", "paid"].includes(currentStatus)) return "draft";
  if (paidCents > 0) return "partially_paid";
  if (currentStatus === "overdue" || (dueAt && new Date(dueAt).getTime() < now)) return "overdue";
  return "sent";
}

