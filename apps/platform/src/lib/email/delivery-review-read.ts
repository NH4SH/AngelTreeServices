import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const maybeText = (v: unknown): v is string | null => v === null || text(v);
const maybeId = (v: unknown): v is string | null => v === null || uuid(v);
const date = (v: unknown): v is string => text(v) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const maybeDate = (v: unknown): v is string | null => v === null || date(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const states = ["prepared", "dispatching", "accepted", "rejected", "unknown", "not_attempted", "cancelled"];
const statuses = ["pending", "accepted", "delayed", "delivered", "failed", "bounced", "complained", "suppressed"];
const repairs = ["pending", "complete", "source_changed", "needs_review", "acknowledged"];
export type DeliveryReviewScope = { valid: boolean; id: string | null; all: boolean; page: number; sourcePage: number };
export function deliveryReviewPageNumber(v: unknown): number {
  if (typeof v !== "number" && (typeof v !== "string" || !/^[1-9]\d*$/.test(v))) return 1;
  const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? Math.min(10000, n) : 1;
}
export function deliveryReviewScope(q: Record<string, unknown>): DeliveryReviewScope {
  const valid = q.id === undefined || uuid(q.id);
  return { valid, id: uuid(q.id) ? q.id.toLowerCase() : null, all: q.all === "1", page: q.id === undefined ? deliveryReviewPageNumber(q.page) : 1, sourcePage: deliveryReviewPageNumber(q.source_page) };
}
export function deliveryReviewHref(s: DeliveryReviewScope): string {
  const q = new URLSearchParams();
  if (!s.valid) q.set("id", "invalid"); else if (s.id) q.set("id", s.id);
  else { if (s.all) q.set("all", "1"); if (s.page > 1) q.set("page", String(s.page)); if (s.sourcePage > 1) q.set("source_page", String(s.sourcePage)); }
  return "/admin/communications/delivery-review" + (q.size ? "?" + q : "");
}
export type DeliveryReviewRow = { id: string; kind: string; recipient: string; subject: string; state: string; delivery_status: string; provider_message_id: string | null; attempt_count: number; first_dispatched_at: string | null; lease_expires_at: string | null; repair_state: string; problem_code: string | null; created_at: string; retry_window_open: boolean; followup_sync_pending: boolean; quote_id: string | null; invoice_id: string | null; change_order_id: string | null; job_id: string | null };
type Office = { id: string; name: string; recoverable: boolean };
type Legacy = { id: string; subject: string; recipient: string; provider_message_id: string | null; quote_id: string | null; invoice_id: string | null };
export type DeliveryReviewData = { total: number; deliveries: DeliveryReviewRow[]; pending_office_notices: Office[] | null; legacy_attempts: Legacy[] | null; unmatched_events: number | null };
export type DeliveryReviewRead = { state: "ready"; data: DeliveryReviewData; page: number } | { state: "invalid" | "missing" | "unavailable"; data: null; page: number };
const batch = <T,>(v: unknown, max: number, decode: (x: unknown) => T | null): T[] | null => {
  if (!Array.isArray(v) || v.length > max) return null;
  const rows = v.map(decode); if (rows.some(x => x === null)) return null;
  const ids = rows.map(x => (x as { id: string }).id); return new Set(ids).size === ids.length ? rows as T[] : null;
};
function row(v: unknown): DeliveryReviewRow | null {
  if (!object(v) || !uuid(v.id) || !text(v.kind) || !text(v.recipient) || !text(v.subject) || !text(v.state) || !states.includes(v.state)
    || !text(v.delivery_status) || !statuses.includes(v.delivery_status) || !text(v.repair_state) || !repairs.includes(v.repair_state)
    || !count(v.attempt_count) || v.attempt_count > 3 || !date(v.created_at) || !maybeDate(v.first_dispatched_at) || !maybeDate(v.lease_expires_at)
    || !maybeText(v.provider_message_id) || !maybeText(v.problem_code) || typeof v.retry_window_open !== "boolean" || typeof v.followup_sync_pending !== "boolean"
    || !maybeId(v.quote_id) || !maybeId(v.invoice_id) || !maybeId(v.change_order_id) || !maybeId(v.job_id)) return null;
  return { id: v.id, kind: v.kind, recipient: v.recipient, subject: v.subject, state: v.state, delivery_status: v.delivery_status,
    provider_message_id: v.provider_message_id, attempt_count: v.attempt_count, first_dispatched_at: v.first_dispatched_at, lease_expires_at: v.lease_expires_at,
    repair_state: v.repair_state, problem_code: v.problem_code, created_at: v.created_at, retry_window_open: v.retry_window_open, followup_sync_pending: v.followup_sync_pending,
    quote_id: v.quote_id, invoice_id: v.invoice_id, change_order_id: v.change_order_id, job_id: v.job_id };
}
function office(v: unknown): Office | null { return object(v) && uuid(v.id) && text(v.name) && typeof v.recoverable === "boolean" ? { id: v.id, name: v.name, recoverable: v.recoverable } : null; }
function legacy(v: unknown): Legacy | null { return object(v) && uuid(v.id) && text(v.subject) && text(v.recipient) && maybeText(v.provider_message_id) && maybeId(v.quote_id) && maybeId(v.invoice_id) ? { id: v.id, subject: v.subject, recipient: v.recipient, provider_message_id: v.provider_message_id, quote_id: v.quote_id, invoice_id: v.invoice_id } : null; }
function decode(v: unknown, s: DeliveryReviewScope, page: number): DeliveryReviewData | null {
  if (!object(v) || !count(v.total)) return null;
  const rows = batch(v.deliveries, 50, row);
  if (!rows || rows.length !== Math.min(50, Math.max(0, v.total - (page - 1) * 50))) return null;
  if (s.id && (v.total > 1 || rows.some(x => x.id.toLowerCase() !== s.id))) return null;
  if (!s.id && !s.all && rows.some(x => x.repair_state === "complete" && !x.followup_sync_pending && !["bounced", "complained", "failed", "suppressed"].includes(x.delivery_status))) return null;
  // A focused request never renders unrelated office/legacy recovery controls.
  return { total: v.total, deliveries: rows, pending_office_notices: s.id ? [] : batch(v.pending_office_notices, 20, office), legacy_attempts: s.id ? [] : batch(v.legacy_attempts, 20, legacy), unmatched_events: s.id ? 0 : count(v.unmatched_events) ? v.unmatched_events : null };
}
export async function readDeliveryReview(db: SupabaseClient | null, s: DeliveryReviewScope): Promise<DeliveryReviewRead> {
  const valid = s?.valid === true && (s.id === null || uuid(s.id)) && typeof s.all === "boolean" && Number.isInteger(s.page) && s.page >= 1 && s.page <= 10000 && (!s.id || s.page === 1);
  if (!valid) return { state: "invalid", data: null, page: 1 };
  const unavailable = (): DeliveryReviewRead => ({ state: "unavailable", data: null, page: s.page });
  if (!db) return unavailable();
  const signal = AbortSignal.timeout(5000);
  const query = async (page: number) => { const r = await db.rpc("list_outbound_deliveries", { p_all: s.all, p_page: page, ...(s.id ? { p_id: s.id } : {}) }, { get: true }).abortSignal(signal); return r.error ? null : decode(r.data, s, page); };
  try {
    let page = s.page, data = await query(page); if (!data) return unavailable();
    if (s.id && data.total === 0) return { state: "missing", data: null, page: 1 };
    if (!data.total) return { state: "ready", data, page: 1 };
    if (!s.id && (page - 1) * 50 >= data.total) { page = Math.min(10000, Math.ceil(data.total / 50)); data = await query(page); if (!data || data.total && (page - 1) * 50 >= data.total) return unavailable(); }
    return { state: "ready", data, page: data.total ? page : 1 };
  } catch { return unavailable(); }
}
export type PendingSourceEvent = { id: string; title: string; destination_path: string; created_at: string; preparation_problem: string | null };
export type PendingSourcePage = { total: number; events: PendingSourceEvent[]; page: number };
const destination = (v: unknown): v is string => text(v) && (v === "/admin/communications" || /^\/admin\/(quotes|invoices|change-orders|jobs)\/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v));
export async function readPendingSourceReview(db: SupabaseClient | null, requestedPage: unknown): Promise<PendingSourcePage | null> {
  if (!db) return null;
  let page = deliveryReviewPageNumber(requestedPage); const signal = AbortSignal.timeout(5000);
  const query = async (p: number): Promise<PendingSourcePage | null> => {
    const r = await db.rpc("list_pending_customer_source_events", { p_page: p }, { get: true }).abortSignal(signal), v: unknown = r.data;
    if (r.error || !object(v) || !count(v.total)) return null;
    const events = batch(v.events, 20, x => object(x) && uuid(x.id) && text(x.title) && destination(x.destination_path) && date(x.created_at) && maybeText(x.preparation_problem) ? { id: x.id, title: x.title, destination_path: x.destination_path, created_at: x.created_at, preparation_problem: x.preparation_problem } : null);
    return events && events.length === Math.min(20, Math.max(0, v.total - (p - 1) * 20)) ? { total: v.total, events, page: p } : null;
  };
  try { let r = await query(page); if (!r) return null; if (!r.total) return { ...r, page: 1 }; if ((page - 1) * 20 >= r.total) { page = Math.min(10000, Math.ceil(r.total / 20)); r = await query(page); if (!r || r.total && (page - 1) * 20 >= r.total) return null; } return r ? { ...r, page: r.total ? page : 1 } : null; } catch { return null; }
}
