import type { QuoteEditorRecord } from "@/lib/types/database";
import type { QuoteLeadPrefill } from "@/lib/quotes/lead-prefill";

export const quoteLookupNames = ["contracting_party", "service_location_id", "job_id", "recipient_contact_id", "approval_contact_id", "onsite_contact_id", "billing_contact_id", "estimate_schedule_event_id"] as const;
export type QuoteLookupName = typeof quoteLookupNames[number];
export type QuoteLookupKind = "party" | "location" | "job" | "contact" | "estimate" | "material" | "equipment";
export type QuoteLookupOption = { value: string; label: string };
export type QuoteLookupValues = Record<QuoteLookupName, string>;
export type QuoteLookupSeeds = Partial<Record<QuoteLookupName, QuoteLookupOption>>;
export type QuoteLookupPage = { items: QuoteLookupOption[]; page: number; pageSize: number; total: number };
export const quoteLookupPageSize = 20;
export const quoteLookupKinds: Record<QuoteLookupName, QuoteLookupKind> = { contracting_party: "party", service_location_id: "location", job_id: "job", recipient_contact_id: "contact", approval_contact_id: "contact", onsite_contact_id: "contact", billing_contact_id: "contact", estimate_schedule_event_id: "estimate" };
export const lookupUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function lookupParty(value: string): { kind: "customer" | "organization"; id: string } | null {
  const [kind, id, extra] = value.split(":");
  return !extra && (kind === "customer" || kind === "organization") && lookupUuid(id) ? { kind, id } : null;
}
export function quoteLookupScope(kind: QuoteLookupKind, party: string) { return kind === "location" || kind === "job" || kind === "contact" ? party : ""; }
export function quoteLookupKey(userId: string, kind: QuoteLookupKind, scope: string, value: string) { return JSON.stringify([userId, kind, scope, value]); }
export function emptyQuoteLookupValues(): QuoteLookupValues { return Object.fromEntries(quoteLookupNames.map(name => [name, ""])) as QuoteLookupValues; }
export function quoteLookupValuesFrom(fields: Record<string, unknown>): QuoteLookupValues { return Object.fromEntries(quoteLookupNames.map(name => [name, typeof fields[name] === "string" ? fields[name] : ""])) as QuoteLookupValues; }
export function initialQuoteLookupValues(quote?: QuoteEditorRecord, prefill?: QuoteLeadPrefill | null, defaultCustomerId = ""): QuoteLookupValues {
  const values = quoteLookupValuesFrom({ contracting_party: quote ? quote.organization_id ? `organization:${quote.organization_id}` : quote.customer_id ? `customer:${quote.customer_id}` : "" : prefill?.partyValue ?? (defaultCustomerId ? `customer:${defaultCustomerId}` : ""),
    service_location_id: quote?.service_location_id ?? prefill?.serviceLocationId ?? "", job_id: quote?.job_id ?? prefill?.sourceJobId ?? "", recipient_contact_id: quote?.recipient_contact_id ?? prefill?.recipientContactId ?? "", approval_contact_id: quote?.approval_contact_id ?? prefill?.approvalContactId ?? "", onsite_contact_id: quote?.onsite_contact_id ?? prefill?.onsiteContactId ?? "", billing_contact_id: quote?.billing_contact_id ?? "", estimate_schedule_event_id: quote?.estimate_schedule_event_id ?? "" });
  if (lookupParty(values.contracting_party)?.kind !== "organization") for (const name of ["recipient_contact_id", "approval_contact_id", "onsite_contact_id", "billing_contact_id"] as const) values[name] = "";
  return values;
}
export function validLookupPage(value: unknown): value is QuoteLookupPage {
  if (!value || typeof value !== "object") return false;
  const page = value as QuoteLookupPage;
  return Number.isSafeInteger(page.page) && page.page > 0 && page.pageSize === quoteLookupPageSize && Number.isSafeInteger(page.total) && page.total >= 0
    && Array.isArray(page.items) && page.items.length <= Math.min(quoteLookupPageSize, page.total) && page.items.every(item => typeof item?.value === "string" && typeof item?.label === "string" && item.label.length > 0)
    && new Set(page.items.map(item => item.value)).size === page.items.length;
}
