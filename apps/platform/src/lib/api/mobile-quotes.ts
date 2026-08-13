import type { PlatformRoleName } from "@/lib/auth/roles";

export const mobileQuoteScopes = ["draft", "sent", "approved", "declined", "closed"] as const;
export type MobileQuoteScope = (typeof mobileQuoteScopes)[number];

export type MobileQuoteLineInput = {
  id?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type MobileQuoteWriteInput = {
  customerId?: string | null;
  organizationId?: string | null;
  serviceLocationId: string;
  customerMessage?: string | null;
  expiresAt?: string | null;
  recipientContactId?: string | null;
  approvalContactId?: string | null;
  lines: MobileQuoteLineInput[];
};

export function canManageMobileQuotes(roles: readonly PlatformRoleName[]) {
  return roles.some((role) => ["owner", "admin", "payroll_admin", "estimator"].includes(role));
}

export function normalizeMobileQuoteScope(value: string | null): MobileQuoteScope | null {
  return mobileQuoteScopes.includes(value as MobileQuoteScope) ? value as MobileQuoteScope : null;
}

export function quoteStatusesForScope(scope: MobileQuoteScope) {
  switch (scope) {
    case "draft": return ["draft"];
    case "sent": return ["sent", "change_requested"];
    case "approved": return ["approved"];
    case "declined": return ["declined"];
    case "closed": return ["expired", "cancelled"];
  }
}

export function validateMobileQuoteWriteInput(value: unknown): { value: MobileQuoteWriteInput | null; error: string } {
  if (!value || typeof value !== "object") return invalid("Enter the proposal details.");
  const input = value as Record<string, unknown>;
  const customerId = optionalString(input.customerId);
  const organizationId = optionalString(input.organizationId);
  const serviceLocationId = optionalString(input.serviceLocationId);
  if (Boolean(customerId) === Boolean(organizationId)) return invalid("Choose one customer or organization.");
  if (!serviceLocationId) return invalid("Choose a service location.");
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 50) {
    return invalid("Add at least one proposal line item.");
  }
  const lines: MobileQuoteLineInput[] = [];
  for (const raw of input.lines) {
    if (!raw || typeof raw !== "object") return invalid("Check each proposal line item.");
    const line = raw as Record<string, unknown>;
    const name = optionalString(line.name)?.slice(0, 120) ?? "";
    const description = normalizeMultiline(line.description);
    const quantity = Number(line.quantity);
    const unitPriceCents = Number(line.unitPriceCents);
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) return invalid("Each line needs a title and valid quantity.");
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || unitPriceCents > 100_000_000) return invalid("Each line needs a valid price.");
    lines.push({ id: optionalString(line.id), name, description, quantity, unitPriceCents });
  }
  return {
    value: {
      customerId,
      organizationId,
      serviceLocationId,
      customerMessage: normalizeMultiline(input.customerMessage),
      expiresAt: optionalString(input.expiresAt),
      recipientContactId: optionalString(input.recipientContactId),
      approvalContactId: optionalString(input.approvalContactId),
      lines,
    },
    error: "",
  };
}

function normalizeMultiline(value: unknown) {
  const text = typeof value === "string" ? value.replaceAll("\r\n", "\n").trimEnd() : "";
  return text.trim() ? text.slice(0, 12_000) : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function invalid(error: string) { return { value: null, error }; }
