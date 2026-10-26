import "server-only";
import { normalizeAdminSearchTerm as normalizeSearchTerm, escapeSearchLike as escapeLike } from "@/lib/record-search";

import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";

export type AdminSearchRecordType =
  | "appointment"
  | "customer"
  | "invoice"
  | "job"
  | "organization"
  | "quote"
  | "schedule_event"
  | "service_location";

export type AdminSearchPage = {
  count: number;
  error: string | null;
  ids: string[];
  records: { id: string; recordType: AdminSearchRecordType }[];
};

export type AdminSearchFilters = {
  archived?: boolean;
  page?: number;
  pageSize?: number;
  query?: string;
  recordType: AdminSearchRecordType | AdminSearchRecordType[];
  sourceType?: string;
  statuses?: string[];
};

export async function getAdminSearchPage(filters: AdminSearchFilters): Promise<AdminSearchPage> {
  const supabase = await createClient();
  if (!supabase) return { count: 0, error: "Supabase is not configured.", ids: [], records: [] };

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, filters.pageSize ?? 25));
  // With no text search, the base table has the same IDs/status/archive fields
  // and RLS, without planning every relationship in the combined search view.
  const table = unsearchedDocumentTable(filters);
  if (table) {
    let request = supabase.from(table).select("id", { count: "exact" });
    request = filters.archived ? request.not("archived_at", "is", null) : request.is("archived_at", null);
    if (filters.statuses?.length) request = request.in("status", filters.statuses);
    const from = (page - 1) * pageSize;
    const { data, count, error } = await request.order("created_at", { ascending: false }).order("id").range(from, from + pageSize - 1);
    const ids = (data ?? []).map(row => String(row.id));
    return { count: count ?? 0, error: error ? safeStaffMessage(error.message) : null, ids,
      records: ids.map(id => ({ id, recordType: filters.recordType as AdminSearchRecordType })) };
  }
  let request = supabase
    .from("admin_record_search")
    .select("record_id, record_type", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("record_type")
    .order("record_id");

  request = Array.isArray(filters.recordType)
    ? request.in("record_type", filters.recordType)
    : request.eq("record_type", filters.recordType);
  request = filters.archived
    ? request.not("archived_at", "is", null)
    : request.is("archived_at", null);
  if (filters.statuses?.length) request = request.in("status", filters.statuses);
  if (filters.sourceType) request = request.eq("source_type", filters.sourceType);

  const query = normalizeSearchTerm(filters.query);
  if (query) request = request.ilike("search_text", `%${escapeLike(query)}%`);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await request.range(from, from + pageSize - 1);
  return {
    count: count ?? 0,
    error: error ? safeStaffMessage(error.message) : null,
    ids: (data ?? []).map((row) => row.record_id),
    records: (data ?? []).map((row) => ({ id: row.record_id, recordType: row.record_type as AdminSearchRecordType })),
  };
}

export async function countAdminSearchRecords(filters: Omit<AdminSearchFilters, "page" | "pageSize">) {
  const supabase = await createClient();
  if (!supabase) return { count: 0, error: "Supabase is not configured." };

  const table = unsearchedDocumentTable(filters);
  if (table) {
    let request = supabase.from(table).select("id", { count: "exact", head: true });
    request = filters.archived ? request.not("archived_at", "is", null) : request.is("archived_at", null);
    if (filters.statuses?.length) request = request.in("status", filters.statuses);
    const { count, error } = await request;
    return { count: count ?? 0, error: error ? safeStaffMessage(error.message) : null };
  }

  let request = supabase
    .from("admin_record_search")
    .select("record_id", { count: "exact", head: true });
  request = Array.isArray(filters.recordType)
    ? request.in("record_type", filters.recordType)
    : request.eq("record_type", filters.recordType);
  request = filters.archived
    ? request.not("archived_at", "is", null)
    : request.is("archived_at", null);
  if (filters.statuses?.length) request = request.in("status", filters.statuses);
  if (filters.sourceType) request = request.eq("source_type", filters.sourceType);
  const query = normalizeSearchTerm(filters.query);
  if (query) request = request.ilike("search_text", `%${escapeLike(query)}%`);

  const { count, error } = await request;
  return { count: count ?? 0, error: error ? safeStaffMessage(error.message) : null };
}

function unsearchedDocumentTable(filters: AdminSearchFilters) {
  if (normalizeSearchTerm(filters.query) || filters.sourceType) return null;
  return filters.recordType === "quote" ? "quotes" : filters.recordType === "invoice" ? "invoices" : null;
}
