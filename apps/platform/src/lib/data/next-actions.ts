import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import type { NextActionSubject } from "@/lib/next-actions";
import type { FollowUpTaskWithRelations } from "@/lib/types/database";

const staffContext = cache(async () => {
  const db = await createClient();
  if (!db) return null;
  const { data: { user } } = await db.auth.getUser();
  if (!user || !hasAllowedRole(await getUserRoles(db, user.id), platformRoleGroups.internalStaff)) return null;
  return db;
});

export async function getNextActions(subject?: NextActionSubject, id?: string, assignee?: string, dueOnly = false) {
  try {
    const db = await staffContext();
    if (!db) return { data: [] as FollowUpTaskWithRelations[], error: "Office access is required to view next actions." };
    let query = db.from("follow_up_tasks").select("*, customers(id, display_name), organizations(id, name), service_locations(id, label, street, city), assigned_profile:profiles!follow_up_tasks_assigned_to_user_id_fkey(id, full_name, email)").in("status", ["open", "in_progress", "waiting"]);
    if (subject && id) query = query.eq(subject, id);
    if (assignee) query = query.eq("assigned_to_user_id", assignee);
    if (dueOnly) {
      const now = new Date().toISOString();
      query = query.or(`and(snoozed_until.is.null,due_at.lte.${now}),snoozed_until.lte.${now}`);
    }
    const { data, error } = await query.order("due_at").limit(subject ? 20 : 100);
    return { data: (data ?? []) as FollowUpTaskWithRelations[], error: error ? "Next actions could not load. Try refreshing; do not assume the queue is empty." : null };
  } catch {
    return { data: [] as FollowUpTaskWithRelations[], error: "Next actions are temporarily unavailable. Please retry." };
  }
}

export const getNextActionStaff = cache(async () => {
  try {
    const db = await staffContext();
    if (!db) return [];
    const { data, error } = await db.from("profiles").select("id, full_name, email, user_roles!inner(roles!inner(name))").eq("status", "active").in("user_roles.roles.name", [...platformRoleGroups.internalStaff]).order("full_name").limit(100);
    if (error) return [];
    return (data ?? []).map(({ id, full_name, email }) => ({ id: String(id), full_name: full_name as string | null, email: email as string | null }));
  } catch { return []; }
});

export async function getCompletedEstimatesWithoutProposal() {
  try {
    const db = await staffContext();
    if (!db) return { data: [], error: "Office access is required." };
    const { data, error } = await db.from("schedule_events")
      .select("id, title, starts_at, job_id, proposals:quotes!quotes_estimate_schedule_event_id_fkey(id), jobs:jobs!schedule_events_job_id_fkey(id, archived_at, source_quote_id, quotes:quotes!quotes_job_id_fkey(id))")
      .eq("event_type", "estimate").eq("status", "completed")
      .order("starts_at", { ascending: false }).limit(100);
    if (error) return { data: [], error: "Completed estimates could not load. Review the schedule before assuming none need proposals." };
    const rows = (data ?? []) as unknown as { id: string; title: string; starts_at: string; job_id: string | null; proposals: { id: string }[]; jobs: { archived_at: string | null; source_quote_id: string | null; quotes: { id: string }[] } | null }[];
    return { data: rows.filter(row => !row.proposals.length && !row.jobs?.archived_at && !row.jobs?.source_quote_id && !row.jobs?.quotes.length), error: null };
  } catch { return { data: [], error: "Completed estimates are temporarily unavailable." }; }
}
