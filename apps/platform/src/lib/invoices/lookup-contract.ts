import type { QuoteLookupOption } from "@/lib/quotes/lookup-contract";

export const invoiceLookupNames = ["contracting_party", "service_location_id", "job_id"] as const;
export type InvoiceLookupName = typeof invoiceLookupNames[number];
export type InvoiceLookupValues = Record<InvoiceLookupName, string>;
export type InvoiceLookupSeeds = Partial<Record<InvoiceLookupName, QuoteLookupOption>>;
export function invoiceLookupValuesFrom(fields: Record<string, unknown>): InvoiceLookupValues {
  return Object.fromEntries(invoiceLookupNames.map(name => [name, typeof fields[name] === "string" ? fields[name] : ""])) as InvoiceLookupValues;
}
