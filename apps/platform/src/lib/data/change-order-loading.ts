import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChangeOrderJobOption } from "@/lib/data/change-orders";
import { changeOrderJobLabel, isChangeOrderJobLookup, type ChangeOrderJobLookup } from "@/lib/change-orders/lookup-contract";
import { lookupUuid, quoteLookupPageSize, type QuoteLookupPage } from "@/lib/quotes/lookup-contract";
import { escapeSearchLike } from "@/lib/record-search";

export const changeOrderListSize = 25;
export function changeOrderPage(value?: string) { return value && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1; }
export type ChangeOrderListRow = { id: string; change_order_number: string; title: string; status: string; total_cents: number; invoice_id: string | null; customers: { display_name: string } | null; organizations: { name: string } | null; service_locations: { label: string | null; street: string } | null };
export async function getChangeOrdersPage(page: number) {
  const empty = { data: [] as ChangeOrderListRow[], count: 0, error: "Work additions could not load. Reload to try again." };
  const db = await createClient(); if (!db || !Number.isSafeInteger(page) || page < 1 || page > 99999) return empty;
  const r = await db.from("change_orders").select("id, change_order_number, title, status, total_cents, invoice_id, customers(display_name), organizations(name), service_locations(label, street)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range((page - 1) * changeOrderListSize, page * changeOrderListSize - 1);
  if (r.error || !Array.isArray(r.data) || !Number.isSafeInteger(r.count) || r.count! < 0) return empty;
  return { data: r.data as unknown as ChangeOrderListRow[], count: r.count!, error: null };
}
export async function getChangeOrderSummary() {
  const db = await createClient(), empty = { data: [null, null, null, null] as (number | null)[], error: "Work-addition totals could not load." };
  if (!db) return empty;
  const results = await Promise.all([
    db.from("change_orders").select("id", { count: "exact", head: true }).in("status", ["draft", "pending_internal_review"]),
    db.from("change_orders").select("id", { count: "exact", head: true }).in("status", ["ready_to_send", "sent", "change_requested"]),
    db.from("change_orders").select("id", { count: "exact", head: true }).eq("status", "approved"),
    db.from("change_orders").select("id", { count: "exact", head: true }).eq("status", "approved").is("invoice_id", null),
  ]);
  const failed = results.some(r => r.error || !Number.isSafeInteger(r.count) || r.count! < 0);
  return failed ? empty : { data: results.map(r => r.count!), error: null };
}

export type ChangeOrderLookupRequest = { kind: "job" | "contact"; page: number; query: string; selected: string; jobId: string };
export function parseChangeOrderLookupRequest(params: URLSearchParams): ChangeOrderLookupRequest | null {
  if ([...params.keys()].some(key => !["kind", "party_type", "party", "q", "page", "selected"].includes(key) || params.getAll(key).length !== 1)) return null;
  const kind = params.get("kind"), rawPage = params.get("page") ?? "1", query = (params.get("q") ?? "").trim(), selected = params.get("selected") ?? "", scope = params.get("party") ?? "";
  if (kind !== "job" && kind !== "contact" || !/^[1-9]\d{0,4}$/.test(rawPage) || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query) || selected && (!lookupUuid(selected) || query || rawPage !== "1") || params.has("party_type") && !["customer", "organization"].includes(params.get("party_type")!)) return null;
  if (kind === "contact" ? !scope.startsWith("job:") || !lookupUuid(scope.slice(4)) : Boolean(scope)) return null;
  return { kind, page: Number(rawPage), query, selected, jobId: kind === "contact" ? scope.slice(4) : "" };
}
export async function readChangeOrderLookupPage(db: SupabaseClient<any, "public", any>, input: ChangeOrderLookupRequest): Promise<QuoteLookupPage> {
  const { kind, page, query, selected, jobId } = input, empty = { items: [], page, pageSize: quoteLookupPageSize, total: 0 };
  let organizationId: string | null = null;
  if (kind === "contact") {
    const parent = await db.from("jobs").select("id, organization_id").eq("id", jobId).is("archived_at", null).maybeSingle();
    if (parent.error) throw Error("Lookup unavailable");
    if (!parent.data?.organization_id) return empty;
    organizationId = parent.data.organization_id;
  }
  let request = kind === "job" ? db.from("jobs").select("id, customer_id, organization_id, service_location_id, source_quote_id, status, service_type, customers:customers!jobs_customer_id_fkey(display_name), organizations(name), service_locations(label, street, city)", { count: "exact" }).is("archived_at", null)
    : db.from("organization_contacts").select("id, full_name, role_title, contact_roles", { count: "exact" }).eq("organization_id", organizationId!).eq("is_active", true);
  if (selected) request = request.eq("id", selected);
  if (query) request = kind === "job" ? request.ilike("requested_scope", `%${escapeSearchLike(query)}%`) : request.or(["full_name", "email"].map(column => `${column}.ilike.${JSON.stringify(`%${escapeSearchLike(query)}%`)}`).join(","));
  const offset = selected ? 0 : (page - 1) * quoteLookupPageSize;
  const r = await request.order(kind === "job" ? "created_at" : "full_name", { ascending: kind !== "job" }).order("id").range(offset, offset + quoteLookupPageSize - 1);
  if (r.error || !Array.isArray(r.data) || !Number.isSafeInteger(r.count) || r.count! < 0) throw Error("Lookup unavailable");
  const items = (r.data as unknown as Record<string, any>[]).map(row => {
    if (!lookupUuid(row.id)) throw Error("Invalid lookup row");
    if (kind === "job") { const job = row as ChangeOrderJobOption, option = { value: job.id, label: changeOrderJobLabel(job), job }; if (!isChangeOrderJobLookup(option)) throw Error("Invalid work order"); return option; }
    if (typeof row.full_name !== "string" || !row.full_name) throw Error("Invalid contact");
    return { value: row.id, label: `${row.full_name} - ${row.contact_roles?.length ? row.contact_roles.map((role: string) => role.replaceAll("_", " ")).join(", ") : row.role_title || "Contact"}` };
  });
  return { items, page, pageSize: quoteLookupPageSize, total: r.count! };
}
export async function getChangeOrderCreationSeed(jobId = "") {
  if (!jobId) return { data: undefined as ChangeOrderJobLookup | undefined, error: null };
  try {
    const input = parseChangeOrderLookupRequest(new URLSearchParams({ kind: "job", selected: jobId })), db = await createClient();
    if (!input || !db) throw Error("Work order unavailable");
    const result = await readChangeOrderLookupPage(db, input), option = result.items[0];
    if (!option || !isChangeOrderJobLookup(option)) throw Error("Work order unavailable");
    return { data: option, error: null };
  } catch { return { data: undefined, error: "The selected work order could not load. Review or retry it before saving." }; }
}
