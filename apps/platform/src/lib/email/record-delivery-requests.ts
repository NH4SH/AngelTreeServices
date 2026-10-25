import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEmailScope, type RecordEmailScope } from "@/lib/email/record-history-scope";

export const recordDeliveryPageSize = 30;
export type RecordDeliveryItem = {
  id: string; subject: string | null; recipient: string | null; state: string; delivery_status: string;
  repair_state: string; followup_sync_pending: boolean; attempt_count: number; created_at: string;
  first_dispatched_at: string | null; last_dispatched_at: string | null; accepted_at: string | null;
  provider_message_id: string | null;
};
export type RecordDeliveryPage = { data: RecordDeliveryItem[]; count: number | null; page: number; error: string | null };
const states = ["prepared", "dispatching", "accepted", "rejected", "unknown", "not_attempted", "cancelled"];
const deliveryStates = ["pending", "accepted", "delayed", "delivered", "failed", "bounced", "complained", "suppressed"];
const repairStates = ["pending", "complete", "source_changed", "needs_review", "acknowledged"];
const timestamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const nullableText = (v: unknown): v is string | null => v === null || typeof v === "string";
const nullableDate = (v: unknown): v is string | null => v === null || timestamp(v);
export function recordDeliveryPageNumber(v: unknown): number {
  if (typeof v !== "number" && (typeof v !== "string" || !/^[1-9]\d*$/.test(v))) return 1;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 71582788 ? n : 1;
}

// One read-only GET RPC; no global scan, service fallback, retry or body read.
export async function readRecordDeliveryPage(db: SupabaseClient | null, scope: RecordEmailScope, requestedPage: unknown = 1): Promise<RecordDeliveryPage> {
  const valid = recordEmailScope(scope?.recordType, scope?.recordId), page = recordDeliveryPageNumber(requestedPage);
  const unavailable = (): RecordDeliveryPage => ({ data: [], count: null, page, error: "Delivery requests could not be loaded." });
  if (!db || !valid) return unavailable();
  try {
    const { data, error } = await db.rpc("list_record_delivery_requests", { p_record_type: valid.recordType, p_record_id: valid.recordId, p_page: page }, { get: true }).abortSignal(AbortSignal.timeout(5_000));
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return unavailable();
    const value = data as Record<string, unknown>, total = value.total, actualPage = value.page, rows = value.deliveries;
    if (value.record_type !== valid.recordType || value.record_id !== valid.recordId || typeof total !== "number" || !Number.isSafeInteger(total) || total < 0
      || actualPage !== Math.min(page, Math.max(1, Math.ceil(total / recordDeliveryPageSize))) || !Array.isArray(rows)
      || rows.length !== Math.min(recordDeliveryPageSize, Math.max(0, total - (Number(actualPage) - 1) * recordDeliveryPageSize))) return unavailable();
    const items: RecordDeliveryItem[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row) || !recordEmailScope("invoice", row.id)
        || !nullableText(row.subject) || !nullableText(row.recipient) || !states.includes(row.state) || !deliveryStates.includes(row.delivery_status)
        || !repairStates.includes(row.repair_state) || typeof row.followup_sync_pending !== "boolean" || !Number.isInteger(row.attempt_count) || row.attempt_count < 0 || row.attempt_count > 3
        || !timestamp(row.created_at) || !nullableDate(row.first_dispatched_at) || !nullableDate(row.last_dispatched_at) || !nullableDate(row.accepted_at) || !nullableText(row.provider_message_id)
        || items.some(item => item.id === row.id)) return unavailable();
      // Explicit projection: unexpected fields in a response never reach the UI.
      items.push({ id: row.id, subject: row.subject, recipient: row.recipient, state: row.state, delivery_status: row.delivery_status,
        repair_state: row.repair_state, followup_sync_pending: row.followup_sync_pending, attempt_count: row.attempt_count,
        created_at: row.created_at, first_dispatched_at: row.first_dispatched_at, last_dispatched_at: row.last_dispatched_at,
        accepted_at: row.accepted_at, provider_message_id: row.provider_message_id });
    }
    return { data: items, count: total, page: Number(actualPage), error: null };
  } catch { return unavailable(); }
}
