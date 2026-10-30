import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDayRange } from "@/lib/business-time";

// Counts only: the email does not copy customer contact, financial, or scope data.
export async function buildManagerSummary(db: SupabaseClient<any>, userId: string, now: Date) {
  const range = getBusinessDayRange(now)!;
  const start = range.start.toISOString(), end = range.endExclusive.toISOString();
  const count = (table: string) => db.from(table).select("id", { count: "exact", head: true });
  const rows = await Promise.all([
    count("jobs").is("archived_at", null).eq("lead_disposition", "active").eq("status", "new_lead"),
    count("schedule_events").eq("event_type", "estimate").in("status", ["scheduled", "confirmed", "in_progress"]).gte("starts_at", start).lt("starts_at", end),
    count("schedule_events").in("event_type", ["job", "maintenance", "emergency"]).in("status", ["scheduled", "confirmed", "in_progress"]).gte("starts_at", start).lt("starts_at", end),
    db.from("jobs").select("id, booked:schedule_events!schedule_events_job_id_fkey(), legacy:appointments!appointments_job_id_fkey()", { count: "exact", head: true }).is("archived_at", null).eq("status", "accepted").eq("booked.event_type", "job").in("booked.status", ["scheduled", "confirmed", "in_progress", "completed"]).is("booked", null).eq("legacy.appointment_type", "job").in("legacy.status", ["scheduled", "confirmed", "in_progress", "completed"]).is("legacy", null),
    db.from("jobs").select("id, billed:invoices!invoices_job_id_fkey()", { count: "exact", head: true }).is("archived_at", null).in("status", ["completed", "ready_to_invoice"]).neq("billed.status", "void").is("billed", null),
    count("follow_up_tasks").in("status", ["open", "in_progress", "waiting"]).or(`assigned_to_user_id.eq.${userId},assigned_to_user_id.is.null`).or(`and(snoozed_until.is.null,due_at.lte.${now.toISOString()}),snoozed_until.lte.${now.toISOString()}`),
    count("invoices").is("archived_at", null).in("status", ["sent", "partially_paid", "overdue"]).gt("balance_due_cents", 0).lt("due_at", start),
  ]);
  if (rows.some(row => row.error)) throw new Error("Manager summary counts unavailable");
  const labels = ["New leads", "Today's estimate events", "Today's work events", "Approved work needing scheduling", "Completed jobs without invoices", "Your and shared office handoffs due", "Overdue invoices"];
  return labels.map((label, index) => `${label}: ${rows[index].count ?? 0}`).join("\n") + "\n\nSchedule counts cover the event calendar. Check the full Schedule for any legacy appointments. Counts reflect the time this summary was prepared.";
}
