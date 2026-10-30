import { createHash } from "node:crypto";

export const FIREWOOD_IMPORT_CONTRACT = "firewood-test-import-v1" as const;
export const FIREWOOD_CHECKOUT_TERMS = "firewood-checkout-test-2026-10-25" as const;
export type FirewoodQuantity = "half" | "full" | "two";
export type FirewoodContact = { name: string; email: string; phone: string; address: string; address2: string; city: string; state: string; postal: string; notes: string };
export type FirewoodOrder = { quantity: FirewoodQuantity; stacking: boolean; wood_cents: number; delivery_cents: 0; stacking_cents: number; total_cents: number; currency: "usd"; tax_assumption: "unresolved_test_only"; terms_version: typeof FIREWOOD_CHECKOUT_TERMS; contact: FirewoodContact };
export type FirewoodImportRequest = { contract: typeof FIREWOOD_IMPORT_CONTRACT; source_id: string; account_id: string; order_id: string; reference: string; attempt_id: string; session_id: string; snapshot_hash: string; order: FirewoodOrder };
export class FirewoodImportError extends Error {
  code: string;
  retryable: boolean;
  httpStatus: number;
  constructor(code: string, retryable = false, httpStatus = retryable ? 503 : 409) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new FirewoodImportError("invalid_request", false, 422);
  return encoded;
}
export const digest = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
const woodPrices = { half: 30000, full: 45000, two: 84000 } as const;
export const woodLabels = { half: "Half cord", full: "Full cord", two: "Two cords" } as const;
const exact = (v: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(v).sort().join("|") !== keys.sort().join("|")) throw new FirewoodImportError("invalid_request", false, 422);
};
function text(v: unknown, max: number, optional = false): string {
  if (typeof v !== "string" || v.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(v) || (!optional && !v.trim())) throw new FirewoodImportError("invalid_request", false, 422);
  return v.trim();
}

/** Normalize before hashing. The Website adapter must use this exact canonical
 * snapshot algorithm before creating its immutable Stripe metadata. */
export function parseFirewoodImport(value: unknown): FirewoodImportRequest {
  if (!record(value) || !record(value.order) || !record(value.order.contact)) throw new FirewoodImportError("invalid_request", false, 422);
  exact(value, ["contract", "source_id", "account_id", "order_id", "reference", "attempt_id", "session_id", "snapshot_hash", "order"]);
  const order = value.order, input = order.contact as Record<string, unknown>;
  exact(order, ["quantity", "stacking", "wood_cents", "delivery_cents", "stacking_cents", "total_cents", "currency", "tax_assumption", "terms_version", "contact"]);
  exact(input, ["name", "email", "phone", "address", "address2", "city", "state", "postal", "notes"]);
  if (value.contract !== FIREWOOD_IMPORT_CONTRACT || !uuid(value.order_id) || !uuid(value.attempt_id)
    || typeof value.source_id !== "string" || !/^[a-z][a-z0-9_-]{2,63}$/.test(value.source_id)
    || typeof value.account_id !== "string" || !/^acct_[A-Za-z0-9]+$/.test(value.account_id)
    || typeof value.reference !== "string" || !/^FW-TEST-[A-Z0-9]{8,48}$/.test(value.reference)
    || typeof value.session_id !== "string" || !/^cs_test_[A-Za-z0-9_]{8,200}$/.test(value.session_id)
    || !["half", "full", "two"].includes(String(order.quantity)) || typeof order.stacking !== "boolean") throw new FirewoodImportError("invalid_request", false, 422);
  const quantity = order.quantity as FirewoodQuantity, stackingCents = order.stacking ? 15000 : 0;
  if (order.wood_cents !== woodPrices[quantity] || order.delivery_cents !== 0 || order.stacking_cents !== stackingCents
    || order.total_cents !== woodPrices[quantity] + stackingCents || order.currency !== "usd"
    || order.tax_assumption !== "unresolved_test_only" || order.terms_version !== FIREWOOD_CHECKOUT_TERMS) throw new FirewoodImportError("order_totals_or_terms_invalid", false, 422);
  const contact: FirewoodContact = { name: text(input.name, 100), email: text(input.email, 254).toLowerCase(), phone: text(input.phone, 30),
    address: text(input.address, 150), address2: text(input.address2, 100, true), city: text(input.city, 100), state: text(input.state, 2).toUpperCase(), postal: text(input.postal, 10), notes: text(input.notes, 500, true) };
  const digits = contact.phone.replace(/\D/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || !/^[+()\d\s.\-]+$/.test(contact.phone) || !/^1?\d{10}$/.test(digits)
    || !/^[A-Z]{2}$/.test(contact.state) || !/^\d{5}(-\d{4})?$/.test(contact.postal)) throw new FirewoodImportError("invalid_contact", false, 422);
  contact.phone = digits.length === 11 ? digits.slice(1) : digits;
  const snapshot: FirewoodOrder = { quantity, stacking: order.stacking, wood_cents: woodPrices[quantity], delivery_cents: 0,
    stacking_cents: stackingCents, total_cents: woodPrices[quantity] + stackingCents, currency: "usd", tax_assumption: "unresolved_test_only", terms_version: FIREWOOD_CHECKOUT_TERMS, contact };
  if (value.snapshot_hash !== digest(snapshot)) throw new FirewoodImportError("snapshot_hash_invalid", false, 422);
  return { contract: FIREWOOD_IMPORT_CONTRACT, source_id: value.source_id, account_id: value.account_id, order_id: value.order_id.toLowerCase(),
    reference: value.reference, attempt_id: value.attempt_id.toLowerCase(), session_id: value.session_id, snapshot_hash: value.snapshot_hash, order: snapshot };
}

export function stripeSourceMetadata(input: FirewoodImportRequest): Record<string, string> {
  return { purpose: "firewood_test_only", ats_contract: input.contract, ats_source: input.source_id, ats_order_id: input.order_id,
    ats_snapshot_hash: input.snapshot_hash, ats_attempt_id: input.attempt_id, quantity: input.order.quantity, stacking: String(input.order.stacking) };
}
