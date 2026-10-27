import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseQuoteLookupRequest, type QuoteLookupRequest } from "@/lib/data/quote-lookup-pages";
import { lookupParty, lookupUuid, quoteLookupPageSize, type QuoteLookupPage } from "@/lib/quotes/lookup-contract";
import { escapeSearchLike } from "@/lib/record-search";

export type MaterialLookupPurpose = "vendor" | "delivery";

export function parseMaterialLookupRequest(params: URLSearchParams, purpose: string): QuoteLookupRequest | null {
  if (!["vendor", "delivery"].includes(purpose) || params.has("party")) return null;
  const input = parseQuoteLookupRequest(params);
  if (!input || input.kind !== "party") return null;
  const selected = input.selected ? lookupParty(input.selected) : null;
  if (purpose === "vendor" && (selected ? selected.kind !== "organization" : input.partyType !== "organization")) return null;
  return { ...input, partyType: selected?.kind ?? input.partyType };
}

/** Narrow, bounded choices with the same eligible parties as the materials forms. */
export async function readMaterialLookupPage(db: SupabaseClient<any, "public", any>, input: QuoteLookupRequest): Promise<QuoteLookupPage> {
  const customer = input.partyType === "customer", field = customer ? "display_name" : "name";
  let request = db.from(customer ? "customers" : "organizations").select(`id, ${field}`, { count: "exact" }).is("archived_at", null);
  if (customer) request = request.eq("status", "active");
  if (input.selected) request = request.eq("id", lookupParty(input.selected)!.id);
  if (input.query) request = request.ilike(field, `%${escapeSearchLike(input.query)}%`);
  const offset = input.selected ? 0 : (input.page - 1) * quoteLookupPageSize;
  const result = await request.order(field).order("id").range(offset, offset + quoteLookupPageSize - 1);
  if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count! < 0) throw Error("Lookup unavailable");
  const items = (result.data as unknown as Record<string, unknown>[]).map(row => {
    if (!lookupUuid(row.id) || typeof row[field] !== "string" || !row[field]) throw Error("Invalid lookup row");
    return { value: `${input.partyType}:${row.id}`, label: row[field] as string };
  });
  return { items, page: input.page, pageSize: quoteLookupPageSize, total: result.count! };
}
