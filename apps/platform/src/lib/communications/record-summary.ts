import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataResult } from "@/lib/types/database";

const recordColumns = { quote: "quote_id", invoice: "invoice_id", job: "job_id", schedule_event: "schedule_event_id", appointment: "appointment_id" } as const;
export type ReminderRecordType = keyof typeof recordColumns;
export type ReminderSummaryPoint = { id: string; at: string; timing: "scheduled" | "sent" | "recorded" };
export type RecordReminderSummary = {
  nextScheduled: DataResult<ReminderSummaryPoint | null>;
  lastSent: DataResult<ReminderSummaryPoint | null>;
};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const unavailable = (): DataResult<ReminderSummaryPoint | null> => ({ data: null, error: "Reminder summary is unavailable. Refresh this record to check again." });
export function unavailableRecordReminderSummary(): RecordReminderSummary { return { nextScheduled: unavailable(), lastSent: unavailable() }; }

// Preserve Postgres microseconds when comparing the two bounded sent-date
// candidates. Date.parse alone rounds distinct timestamps to one millisecond.
function instant(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/);
  const milliseconds = Date.parse(value);
  if (!match || !Number.isFinite(milliseconds)) return null;
  return BigInt(milliseconds) * BigInt(1000) + BigInt((match[1] ?? "").padEnd(6, "0").slice(3));
}

export async function readRecordReminderSummary(supabase: SupabaseClient | null, recordType: ReminderRecordType, recordId: string): Promise<RecordReminderSummary> {
  if (!supabase || !Object.hasOwn(recordColumns, recordType) || !uuid(recordId)) return unavailableRecordReminderSummary();
  const column = recordColumns[recordType], id = recordId.toLowerCase(), signal = AbortSignal.timeout(5_000);
  async function candidate(kind: "next" | "sent" | "recorded"): Promise<DataResult<ReminderSummaryPoint | null>> {
    try {
      let query = supabase!.from("customer_communications").select(`id,status,scheduled_for,sent_at,updated_at,${column}`)
        .eq(column, id).eq("status", kind === "next" ? "pending" : "sent");
      if (kind === "sent") query = query.not("sent_at", "is", null);
      if (kind === "recorded") query = query.is("sent_at", null);
      const { data, error } = await query.order(kind === "next" ? "scheduled_for" : kind === "sent" ? "sent_at" : "updated_at", { ascending: kind === "next" })
        .order("id", { ascending: true }).limit(1).abortSignal(signal).maybeSingle();
      if (error || data === undefined) return unavailable();
      if (data === null) return { data: null, error: null };
      const at = kind === "next" ? data.scheduled_for : kind === "sent" ? data.sent_at : data.updated_at;
      if (Array.isArray(data) || !uuid(data.id) || (data as Record<string, unknown>)[column] !== id || data.status !== (kind === "next" ? "pending" : "sent")
        || kind === "recorded" && data.sent_at !== null || instant(at) === null) return unavailable();
      return { data: { id: data.id, at, timing: kind === "next" ? "scheduled" : kind }, error: null };
    } catch { return unavailable(); }
  }
  const [nextScheduled, sent, recorded] = await Promise.all([candidate("next"), candidate("sent"), candidate("recorded")]);
  if (sent.error || recorded.error) return { nextScheduled, lastSent: unavailable() };
  const candidates = [sent.data, recorded.data].filter((value): value is ReminderSummaryPoint => value !== null);
  candidates.sort((a, b) => { const left = instant(a.at)!, right = instant(b.at)!; return left === right ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0 : left > right ? -1 : 1; });
  return { nextScheduled, lastSent: { data: candidates[0] ?? null, error: null } };
}
