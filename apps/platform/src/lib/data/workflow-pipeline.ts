import "server-only";

import { createClient } from "@/lib/supabase/server";

export type WorkflowPipelineStage = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export async function getWorkflowPipelineStages(): Promise<{
  stages: WorkflowPipelineStage[];
  errors: string[];
}> {
  const supabase = await createClient();
  if (!supabase) return { stages: stageDefinitions.map((stage) => ({ ...stage, count: 0 })), errors: ["Supabase is not configured."] };

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const queries = [
    supabase.from("jobs").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "new_lead"),
    supabase.from("follow_up_tasks").select("id", { count: "exact", head: true }).in("task_type", ["call_customer", "customer_callback", "schedule_estimate"]).in("status", ["open", "in_progress", "waiting"]).lte("due_at", dayEnd.toISOString()),
    supabase.from("quotes").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "draft"),
    supabase.from("quotes").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["sent", "change_requested"]),
    supabase.from("jobs").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "accepted"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["scheduled", "in_progress"]).gte("scheduled_start_at", now.toISOString()).lt("scheduled_start_at", weekEnd.toISOString()),
    supabase.from("jobs").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["completed", "ready_to_invoice"]),
    supabase.from("invoices").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["sent", "partially_paid", "overdue"]).gt("balance_due_cents", 0),
    supabase.from("follow_up_tasks").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress", "waiting"]).lte("due_at", dayEnd.toISOString()),
  ];
  const results = await Promise.allSettled(queries);
  const errors: string[] = [];
  const stages = stageDefinitions.map((stage, index) => {
    const result = results[index];
    if (result.status === "rejected") {
      errors.push(`${stage.label}: ${result.reason instanceof Error ? result.reason.message : "Unavailable"}`);
      return { ...stage, count: 0 };
    }
    if (result.value.error) errors.push(`${stage.label}: ${result.value.error.message}`);
    return { ...stage, count: result.value.count ?? 0 };
  });

  return { stages, errors };
}

const stageDefinitions: Omit<WorkflowPipelineStage, "count">[] = [
  { id: "new-leads", label: "New leads", href: "/admin/jobs?status=new_lead" },
  { id: "awaiting-contact", label: "Awaiting contact", href: "/admin/follow-ups?view=due" },
  { id: "quotes-prepare", label: "Quotes to prepare", href: "/admin/quotes?status=draft" },
  { id: "quotes-response", label: "Awaiting response", href: "/admin/quotes?status=sent" },
  { id: "awaiting-schedule", label: "Awaiting schedule", href: "/admin/jobs?status=accepted" },
  { id: "scheduled-week", label: "Scheduled this week", href: "/admin/schedule?view=week" },
  { id: "awaiting-invoice", label: "Awaiting invoice", href: "/admin/jobs?status=ready_to_invoice" },
  { id: "awaiting-payment", label: "Awaiting payment", href: "/admin/invoices?status=sent" },
  { id: "follow-ups-due", label: "Follow-ups due", href: "/admin/follow-ups?view=due" },
];
