import { isManualPaymentRequestId } from "../api/mobile-invoices.ts";

type ManualPaymentReceipt = {
  payment_id: string;
  payment_status: "succeeded" | "cancelled";
  replayed: boolean;
  balance_due_cents: number;
};
type ManualPaymentResolution =
  | { state: "recorded"; payment_id: string; payment_status: "succeeded" | "cancelled" }
  | { state: "abandoned"; payment_id: null; payment_status?: null };

export function isManualPaymentReceipt(value: unknown): value is ManualPaymentReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return isManualPaymentRequestId(receipt.payment_id)
    && (receipt.payment_status === "succeeded" || receipt.payment_status === "cancelled")
    && typeof receipt.replayed === "boolean" && (receipt.replayed || receipt.payment_status === "succeeded")
    && typeof receipt.balance_due_cents === "number" && Number.isSafeInteger(receipt.balance_due_cents)
    && receipt.balance_due_cents >= 0 && receipt.balance_due_cents <= 2147483647;
}

export function isManualPaymentResolution(value: unknown): value is ManualPaymentResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  if (receipt.state === "abandoned") {
    // First-time and replayed tombstones must positively confirm no payment.
    // Missing IDs or contradictory statuses must never unlock a new attempt.
    return receipt.payment_id === null && (receipt.payment_status === undefined || receipt.payment_status === null);
  }
  return receipt.state === "recorded" && isManualPaymentRequestId(receipt.payment_id)
    && (receipt.payment_status === "succeeded" || receipt.payment_status === "cancelled");
}
