import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatBusinessDateTime } from "@/lib/business-time";
import { escapeSearchLike } from "@/lib/record-search";
import { lookupParty, lookupUuid, quoteLookupKinds, quoteLookupNames, quoteLookupPageSize, quoteLookupScope, type QuoteLookupKind, type QuoteLookupPage, type QuoteLookupSeeds, type QuoteLookupValues } from "@/lib/quotes/lookup-contract";

export type QuoteLookupRequest = { kind: QuoteLookupKind; partyType: "customer" | "organization"; party: string; query: string; page: number; selected: string };
export function parseQuoteLookupRequest(params: URLSearchParams): QuoteLookupRequest | null {
  if ([...params.keys()].some(key => !["kind", "party_type", "party", "q", "page", "selected"].includes(key) || params.getAll(key).length !== 1)) return null;
  const kind = params.get("kind") as QuoteLookupKind, partyType = params.get("party_type") ?? "customer", party = params.get("party") ?? "", query = (params.get("q") ?? "").trim(), rawPage = params.get("page") ?? "1", selected = params.get("selected") ?? "";
  if (!["party", "location", "job", "contact", "estimate"].includes(kind) || !["customer", "organization"].includes(partyType) || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query) || !/^[1-9]\d{0,4}$/.test(rawPage) || query && selected || selected && rawPage !== "1") return null;
  if (["location", "job", "contact"].includes(kind) && (!lookupParty(party) || kind === "contact" && lookupParty(party)?.kind !== "organization")) return null;
  if (selected && (kind === "party" ? !lookupParty(selected) : !lookupUuid(selected))) return null;
  return { kind, partyType: partyType as "customer" | "organization", party, query, page: Number(rawPage), selected };
}

/** All reads retain caller RLS. Input cannot provide table names, columns or operators. */
export async function readQuoteLookupPage(db: SupabaseClient<any, "public", any>, input: QuoteLookupRequest): Promise<QuoteLookupPage> {
  const { kind, party, query, page, selected } = input, scope = lookupParty(party), selectedParty = kind === "party" && selected ? lookupParty(selected) : null;
  const empty = { items: [], page, pageSize: quoteLookupPageSize, total: 0 };
  if (["location", "job", "contact"].includes(kind)) {
    if (!scope || kind === "contact" && scope.kind !== "organization") throw Error("Invalid lookup scope");
    const parent = await db.from(scope.kind === "customer" ? "customers" : "organizations").select("id").eq("id", scope.id).is("archived_at", null).maybeSingle();
    if (parent.error) throw Error("Lookup unavailable");
    if (!parent.data) return empty;
  }
  const partyType = selectedParty?.kind ?? input.partyType;
  const settings = kind === "party" ? partyType === "customer"
    ? { table: "customers", fields: "id, display_name", order: "display_name", search: ["display_name", "email", "phone"] }
    : { table: "organizations", fields: "id, name", order: "name", search: ["name", "billing_email", "billing_phone"] }
    : kind === "location" ? { table: "service_locations", fields: "id, label, street, city, state, postal_code", order: "created_at", search: ["label", "street", "city", "postal_code"] }
    : kind === "job" ? { table: "jobs", fields: "id, service_type, status, requested_scope", order: "created_at", search: ["requested_scope"] }
    : kind === "contact" ? { table: "organization_contacts", fields: "id, full_name, email, contact_roles", order: "full_name", search: ["full_name", "email"] }
    : { table: "schedule_events", fields: "id, title, starts_at", order: "starts_at", search: ["title", "location_label"] };
  let request = db.from(settings.table).select(settings.fields, { count: "exact" });
  if (kind === "contact") request = request.eq("organization_id", scope!.id).eq("is_active", true);
  else if (kind === "estimate") request = request.eq("event_type", "estimate");
  else request = request.is("archived_at", null);
  if (kind === "location" || kind === "job") request = scope!.kind === "customer" ? request.eq("customer_id", scope!.id).is("organization_id", null) : request.eq("organization_id", scope!.id).is("customer_id", null);
  if (selected) request = request.eq("id", selectedParty?.id ?? selected);
  if (query) {
    // Quote PostgREST values as well as escaping LIKE wildcards. Commas,
    // parentheses, quotes and backslashes remain literal search text.
    const pattern = JSON.stringify(`%${escapeSearchLike(query)}%`);
    request = request.or(settings.search.map(column => `${column}.ilike.${pattern}`).join(","));
  }
  const offset = selected ? 0 : (page - 1) * quoteLookupPageSize;
  const response = await request.order(settings.order, { ascending: !["created_at", "starts_at"].includes(settings.order) }).order("id").range(offset, offset + quoteLookupPageSize - 1);
  if (response.error || !Array.isArray(response.data) || !Number.isSafeInteger(response.count) || response.count! < 0) throw Error("Lookup unavailable");
  const items = (response.data as unknown as Record<string, any>[]).map(row => {
    if (!lookupUuid(row.id)) throw Error("Invalid lookup row");
    const label = kind === "party" ? row.display_name ?? row.name : kind === "location" ? [row.label, row.street, row.city, row.state, row.postal_code].filter(Boolean).join(", ")
      : kind === "contact" ? [row.full_name, row.email, row.contact_roles?.join(", ").replaceAll("_", " ")].filter(Boolean).join(" — ")
      : kind === "job" ? [row.service_type ?? "Work order", String(row.status).replaceAll("_", " "), row.requested_scope?.slice(0, 90)].filter(Boolean).join(" — ")
      : `${row.title} — ${formatBusinessDateTime(new Date(row.starts_at))}`;
    if (typeof label !== "string" || !label) throw Error("Invalid lookup label");
    return { value: kind === "party" ? `${partyType}:${row.id}` : row.id, label };
  });
  return { items, page, pageSize: quoteLookupPageSize, total: response.count! };
}

/** Only saved/pre-filled IDs are hydrated on the server, independently of page one. */
export async function getQuoteLookupSeeds(values: QuoteLookupValues) {
  const db = await createClient();
  if (!db) return { data: {} as QuoteLookupSeeds, error: "Quote selections could not load." };
  const promises = new Map<string, Promise<QuoteLookupPage>>();
  try {
    const entries = await Promise.all(quoteLookupNames.filter(name => values[name]).map(async name => {
      const kind = quoteLookupKinds[name], scope = quoteLookupScope(kind, values.contracting_party), key = `${kind}:${scope}:${values[name]}`;
      const input = parseQuoteLookupRequest(new URLSearchParams({ kind, party: scope, selected: values[name] }));
      if (!input) return [name, undefined] as const;
      if (!promises.has(key)) promises.set(key, readQuoteLookupPage(db, input));
      const result = await promises.get(key)!;
      return [name, result.items.find(item => item.value === values[name])] as const;
    }));
    return { data: Object.fromEntries(entries.filter(([, value]) => value)) as QuoteLookupSeeds, error: null };
  } catch { return { data: {} as QuoteLookupSeeds, error: "Quote selections could not load. Retry the lookup before saving." }; }
}
