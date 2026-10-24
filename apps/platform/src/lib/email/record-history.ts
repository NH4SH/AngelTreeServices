import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEmailColumns, recordEmailScope, type RecordEmailScope, type RecordEmailView } from "@/lib/email/record-history-scope";

export const recordEmailPageSize = 30;
const attentionStatuses = ["delayed", "failed", "bounced", "complained", "suppressed"];
const attentionFilter = "status.eq.failed,delivery_status.in.(delayed,failed,bounced,complained,suppressed),error_message.eq.provider_outcome_unknown";
export type RecordEmailItem = {
  id: string; subject: string; recipient_email: string; email_type: string; status: "sent" | "failed";
  created_at: string; sent_at: string | null; delivery_status: string | null; delivery_status_at: string | null;
  outbound_delivery_id: string | null; provider_message_id: string | null; error_message: string | null;
};
export type RecordEmailPage = { data: RecordEmailItem[]; count: number | null; page: number; error: string | null };
export type EmailHistoryRecord = { state: "found"; label: string } | { state: "missing" } | { state: "unavailable" };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const nullable = (v: unknown) => v === null || typeof v === "string";
const countValid = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function recordEmailPageNumber(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d*$/.test(value))) return 1;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= Math.floor(Number.MAX_SAFE_INTEGER / recordEmailPageSize) ? n : 1;
}

export async function readEmailHistoryRecord(client: SupabaseClient | null, scope: RecordEmailScope): Promise<EmailHistoryRecord> {
  const valid = recordEmailScope(scope?.recordType, scope?.recordId);
  if (!client || !valid) return { state: "unavailable" };
  const spec = {
    quote: { table: "quotes", field: "quote_number", title: "Proposal" },
    invoice: { table: "invoices", field: "invoice_number", title: "Invoice" },
    change_order: { table: "change_orders", field: "change_order_number", title: "Change order" },
  }[valid.recordType];
  try {
    const { data, error } = await client.from(spec.table).select(`id,${spec.field}`).eq("id", valid.recordId)
      .limit(1).abortSignal(AbortSignal.timeout(5_000)).maybeSingle();
    if (error || data === undefined) return { state: "unavailable" };
    if (data === null) return { state: "missing" };
    const value: unknown = data;
    if (typeof value !== "object" || !value || Array.isArray(value)) return { state: "unavailable" };
    const row = value as Record<string, unknown>;
    if (row.id !== valid.recordId) return { state: "unavailable" };
    const label = row[spec.field];
    return { state: "found", label: typeof label === "string" && label.trim() ? `${spec.title} · ${label}` : spec.title };
  } catch { return { state: "unavailable" }; }
}

// Same caller/RLS, narrow source predicate and shared deadline on every read.
// No durable-delivery bodies, provider payloads, tokens or mutation commands.
export async function readRecordEmailPage(client: SupabaseClient | null, scope: RecordEmailScope, view: RecordEmailView, requestedPage: unknown = 1): Promise<RecordEmailPage> {
  const page = recordEmailPageNumber(requestedPage), valid = recordEmailScope(scope?.recordType, scope?.recordId);
  const unavailable = (): RecordEmailPage => ({ data: [], count: null, page, error: "Recorded emails could not be loaded. Refresh this page to try again." });
  if (!client || !valid || !["all", "attention"].includes(view)) return unavailable();
  const column = recordEmailColumns[valid.recordType], signal = AbortSignal.timeout(5_000);
  const columns = `id,subject,recipient_email,email_type,status,created_at,sent_at,delivery_status,delivery_status_at,outbound_delivery_id,provider_message_id,error_message,${column}`;
  const scoped = (head = false) => {
    const query = client.from("email_events").select(head ? "id" : columns, { count: "exact", ...(head ? { head: true } : {}) }).eq(column, valid.recordId);
    return view === "attention" ? query.or(attentionFilter) : query;
  };
  const query = (current: number) => scoped().order("created_at", { ascending: false }).order("id", { ascending: true })
    .range((current - 1) * recordEmailPageSize, current * recordEmailPageSize - 1).abortSignal(signal);
  const validRow = (value: unknown): value is RecordEmailItem => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>, deliveryStatus = row.delivery_status;
    if (!uuid(row.id) || row[column] !== valid.recordId || typeof row.subject !== "string"
      || typeof row.recipient_email !== "string" || typeof row.email_type !== "string" || row.status !== "sent" && row.status !== "failed"
      || !date(row.created_at) || row.sent_at !== null && !date(row.sent_at)
      || deliveryStatus !== null && (typeof deliveryStatus !== "string" || !["pending", "accepted", "delayed", "delivered", "failed", "bounced", "complained", "suppressed"].includes(deliveryStatus))
      || row.delivery_status_at !== null && !date(row.delivery_status_at) || row.outbound_delivery_id !== null && !uuid(row.outbound_delivery_id)
      || !nullable(row.provider_message_id) || !nullable(row.error_message)) return false;
    return view !== "attention" || row.status === "failed" || typeof deliveryStatus === "string" && attentionStatuses.includes(deliveryStatus) || row.error_message === "provider_outcome_unknown";
  };
  try {
    let current = page, result = await query(current);
    if (current > 1 && (result.error?.code === "PGRST103" || !result.error && countValid(result.count) && (current - 1) * recordEmailPageSize >= result.count)) {
      const total = await scoped(true).abortSignal(signal);
      if (total.error || !countValid(total.count)) return unavailable();
      if (total.count === 0) return { data: [], count: 0, page: 1, error: null };
      current = Math.min(current, Math.ceil(total.count / recordEmailPageSize));
      result = await query(current);
    }
    const rows: unknown = result.data;
    if (result.error || !countValid(result.count) || !Array.isArray(rows)
      || rows.length !== Math.min(recordEmailPageSize, Math.max(0, result.count - (current - 1) * recordEmailPageSize)) || !rows.every(validRow)) return unavailable();
    return { data: rows, count: result.count, page: current, error: null };
  } catch { return unavailable(); }
}
