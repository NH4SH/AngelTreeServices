import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerCommunication } from "@/lib/types/database";

export const communicationQueuePageSize = 30;
const views = {
  scheduled: { statuses: ["pending"], order: "scheduled_for", ascending: true },
  failed: { statuses: ["failed"], order: "updated_at", ascending: false },
  history: { statuses: ["processing", "sent", "skipped", "cancelled"], order: "created_at", ascending: false },
} as const;
export type CommunicationQueueView = keyof typeof views;
export type CommunicationQueuePage = {
  data: CustomerCommunication[];
  count: number | null;
  page: number;
  error: string | null;
};
export function communicationQueuePageNumber(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d*$/.test(value))) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= Math.floor(Number.MAX_SAFE_INTEGER / communicationQueuePageSize) ? page : 1;
}

// Caller-scoped reads only. Keep counts and rows under the same RLS, and recover
// once when a stale URL points past a queue that has shrunk since it was viewed.
export async function readCommunicationQueuePage(
  supabase: SupabaseClient | null, view: CommunicationQueueView, requestedPage: unknown = 1,
): Promise<CommunicationQueuePage> {
  const page = communicationQueuePageNumber(requestedPage);
  const unavailable = (): CommunicationQueuePage => ({ data: [], count: null, page, error: "Reminder records could not be loaded. Refresh this page before reviewing the queue." });
  if (!supabase || !Object.hasOwn(views, view)) return unavailable();
  const spec = views[view];
  const signal = AbortSignal.timeout(5_000);
  const query = (current: number) => supabase.from("customer_communications")
    .select("*", { count: "exact" }).in("status", [...spec.statuses])
    .order(spec.order, { ascending: spec.ascending }).order("id", { ascending: true })
    .range((current - 1) * communicationQueuePageSize, current * communicationQueuePageSize - 1).abortSignal(signal);
  const countValid = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  try {
    let current = page;
    let result = await query(current);
    if ((result.error?.code === "PGRST103" || (!result.error && countValid(result.count) && (current - 1) * communicationQueuePageSize >= result.count)) && current > 1) {
      const total = await supabase.from("customer_communications").select("id", { count: "exact", head: true })
        .in("status", [...spec.statuses]).abortSignal(signal);
      if (total.error || !countValid(total.count)) return unavailable();
      if (total.count === 0) return { data: [], count: 0, page: 1, error: null };
      current = Math.min(current, Math.ceil(total.count / communicationQueuePageSize));
      result = await query(current);
    }
    if (result.error || !countValid(result.count) || !Array.isArray(result.data)
      || result.data.length > communicationQueuePageSize
      || result.data.length !== Math.min(communicationQueuePageSize, Math.max(0, result.count - (current - 1) * communicationQueuePageSize))
      || result.data.some(row => !row || typeof row.id !== "string" || typeof row.communication_type !== "string"
        || !(spec.statuses as readonly string[]).includes(row.status) || typeof row.recipient_email !== "string"
        || !Number.isFinite(Date.parse(row.scheduled_for)) || row.sent_at !== null && !Number.isFinite(Date.parse(row.sent_at)))) return unavailable();
    return { data: result.data as CustomerCommunication[], count: result.count, page: current, error: null };
  } catch { return unavailable(); }
}
