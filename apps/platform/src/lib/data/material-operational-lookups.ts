import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupUuid, quoteLookupPageSize, type QuoteLookupPage } from "@/lib/quotes/lookup-contract";
import { operationalLookupKinds, type OperationalLookupKind } from "@/lib/materials/operational-lookups";
import { materialLabel } from "@/lib/materials/definitions";
import { escapeSearchLike } from "@/lib/record-search";

export type OperationalLookupRequest = { kind: OperationalLookupKind; query: string; page: number; selected: string };
export function parseOperationalLookupRequest(params: URLSearchParams): OperationalLookupRequest | null {
  if ([...params.keys()].some(key => !["kind", "party_type", "q", "page", "selected"].includes(key) || params.getAll(key).length !== 1)) return null;
  const kind = params.get("kind") as OperationalLookupKind, query = (params.get("q") ?? "").trim(), page = params.get("page") ?? "1", selected = params.get("selected") ?? "";
  if (!operationalLookupKinds.includes(kind) || params.has("party_type") && params.get("party_type") !== "customer"
    || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query) || !/^[1-9]\d{0,4}$/.test(page)
    || selected && (!lookupUuid(selected) || query || page !== "1")) return null;
  return { kind, query, page: Number(page), selected };
}

/** Eligible operational choices, through caller RLS; no financial/private fields. */
export async function readOperationalLookupPage(db: SupabaseClient<any, "public", any>, input: OperationalLookupRequest): Promise<QuoteLookupPage> {
  const settings = input.kind === "material" ? { table: "material_catalog", fields: "id, name, default_unit", order: "name", search: ["name", "sku", "description"] }
    : input.kind === "equipment" ? { table: "equipment_assets", fields: "id, asset_number, name", order: "name", search: ["name", "asset_number"] }
    : { table: "jobs", fields: "id, service_type, status, requested_scope", order: "updated_at", search: ["service_type", "requested_scope"] };
  let request = db.from(settings.table).select(settings.fields, { count: "exact" });
  if (input.kind === "equipment") request = request.eq("is_active", true);
  else request = request.is("archived_at", null);
  if (input.kind === "job") request = request.not("status", "in", "(paid,lost,cancelled)");
  if (input.selected) request = request.eq("id", input.selected);
  if (input.query) { const value = JSON.stringify(`%${escapeSearchLike(input.query)}%`); request = request.or(settings.search.map(field => `${field}.ilike.${value}`).join(",")); }
  const offset = input.selected ? 0 : (input.page - 1) * quoteLookupPageSize;
  const result = await request.order(settings.order, { ascending: input.kind !== "job" }).order("id").range(offset, offset + quoteLookupPageSize - 1);
  if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count! < 0) throw Error("Lookup unavailable");
  const items = (result.data as unknown as Record<string, any>[]).map(row => {
    if (!lookupUuid(row.id)) throw Error("Invalid lookup row");
    const label = input.kind === "material" ? typeof row.name === "string" && typeof row.default_unit === "string" ? `${row.name} (${materialLabel(row.default_unit)})` : ""
      : input.kind === "equipment" ? typeof row.name === "string" ? [row.asset_number, row.name].filter(Boolean).join(" - ") : ""
      : typeof row.status === "string" ? [materialLabel(row.service_type || "work order"), materialLabel(row.status), row.requested_scope?.slice(0, 90)].filter(Boolean).join(" - ") : "";
    if (!label) throw Error("Invalid lookup label");
    return { value: row.id, label };
  });
  return { items, page: input.page, pageSize: quoteLookupPageSize, total: result.count! };
}
