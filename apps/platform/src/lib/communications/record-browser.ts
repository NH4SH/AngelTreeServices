import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reminderRecordScope, type ReminderBrowseScope } from "@/lib/communications/record-browse";

const records = {
  quote: { table: "quotes", title: "Proposal", field: "quote_number" },
  invoice: { table: "invoices", title: "Invoice", field: "invoice_number" },
  job: { table: "jobs", title: "Job", field: "id" },
  schedule_event: { table: "schedule_events", title: "Visit", field: "title" },
  appointment: { table: "appointments", title: "Appointment", field: "id" },
} as const;
export type ReminderBrowseRecord = { state: "found"; label: string } | { state: "missing" } | { state: "unavailable" };

// Verify the source under the same caller's RLS before describing an empty queue.
export async function readReminderBrowseRecord(client: SupabaseClient | null, scope: ReminderBrowseScope): Promise<ReminderBrowseRecord> {
  const valid = reminderRecordScope(scope?.recordType, scope?.recordId);
  if (!client || !valid) return { state: "unavailable" };
  const spec = records[valid.recordType];
  try {
    const { data, error } = await client.from(spec.table).select(spec.field === "id" ? "id" : `id,${spec.field}`)
      .eq("id", valid.recordId).limit(1).abortSignal(AbortSignal.timeout(5_000)).maybeSingle();
    if (error || data === undefined) return { state: "unavailable" };
    if (data === null) return { state: "missing" };
    const row: unknown = data;
    if (typeof row !== "object" || !row || Array.isArray(row) || !("id" in row) || row.id !== valid.recordId) return { state: "unavailable" };
    const label = (row as Record<string, unknown>)[spec.field];
    return { state: "found", label: spec.field !== "id" && typeof label === "string" && label.trim() ? `${spec.title} · ${label}` : spec.title };
  } catch { return { state: "unavailable" }; }
}
