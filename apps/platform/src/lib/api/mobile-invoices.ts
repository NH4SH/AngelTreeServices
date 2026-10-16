import type { PlatformRoleName } from "@/lib/auth/roles";

export const mobileInvoiceScopes = ["draft", "outstanding", "paid", "overdue", "void"] as const;
export type MobileInvoiceScope = (typeof mobileInvoiceScopes)[number];
export const mobileManualPaymentMethods = ["check", "cash", "ach", "other"] as const;

export function canViewMobileInvoices(roles: readonly PlatformRoleName[]) {
  return roles.some((role) => ["owner", "admin", "payroll_admin", "estimator"].includes(role));
}
export function canRecordMobilePayments(roles: readonly PlatformRoleName[]) { return roles.some((role) => role === "owner" || role === "admin"); }
export function normalizeMobileInvoiceScope(value: string | null): MobileInvoiceScope | null { return mobileInvoiceScopes.includes(value as MobileInvoiceScope) ? value as MobileInvoiceScope : null; }
export function invoiceStatusesForScope(scope: MobileInvoiceScope) {
  if (scope === "outstanding") return ["sent", "partially_paid"];
  return [scope];
}
export function validateMobileManualPayment(value: unknown) {
  if (!value || typeof value !== "object") return { value: null, error: "Enter the payment details." };
  const input = value as Record<string, unknown>;
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  const amountCents = Number(input.amountCents);
  const method = typeof input.method === "string" ? input.method : "";
  const receivedAt = typeof input.receivedAt === "string" ? input.receivedAt : "";
  if (!isManualPaymentRequestId(requestId)) return { value: null, error: "Update the app to record payments with safe retry support." };
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) return { value: null, error: "Enter a valid payment amount." };
  if (!mobileManualPaymentMethods.includes(method as typeof mobileManualPaymentMethods[number])) return { value: null, error: "Choose check, cash, ACH, or other." };
  const date = new Date(receivedAt);
  if (!receivedAt || Number.isNaN(date.getTime())) return { value: null, error: "Choose a valid received date." };
  return { value: { requestId, amountCents, method, receivedAt: date.toISOString(), reference: text(input.reference, 160), notes: text(input.notes, 1000) }, error: "" };
}
export function isManualPaymentRequestId(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function text(value: unknown, limit: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null; }
