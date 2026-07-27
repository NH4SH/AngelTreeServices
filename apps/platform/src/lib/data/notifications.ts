import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  notificationCategories,
  type NotificationCategory,
} from "@/lib/notifications/definitions";

export type AdminNotification = {
  body: string | null;
  category: NotificationCategory;
  created_at: string;
  destination_path: string | null;
  id: string;
  read_at: string | null;
  title: string;
};

export type ActivityLogEntry = {
  action_category: string | null;
  actor_label: string | null;
  actor_type: string;
  actor_user_id: string | null;
  changes_json: Record<string, unknown>;
  created_at: string;
  destination_path: string | null;
  event_type: string;
  id: string;
  metadata_json: Record<string, unknown>;
  record_label: string | null;
  subject_id: string;
  subject_type: string;
  summary: string | null;
};

export async function getNotificationInbox(input: {
  category?: string;
  page: number;
  pageSize: number;
  status?: string;
  userId: string;
}) {
  const supabase = await createClient();
  if (!supabase) return { count: 0, data: [] as AdminNotification[], error: "Supabase is not configured." };
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("admin_notifications")
    .select("id, category, title, body, destination_path, read_at, created_at", { count: "exact" })
    .eq("recipient_user_id", input.userId)
    .order("created_at", { ascending: false });
  if (input.status === "unread") query = query.is("read_at", null);
  if (input.status === "read") query = query.not("read_at", "is", null);
  if (notificationCategories.includes(input.category as NotificationCategory)) {
    query = query.eq("category", input.category);
  }
  const { data, count, error } = await query.range(from, from + input.pageSize - 1);
  return {
    count: count ?? 0,
    data: (data ?? []) as AdminNotification[],
    error: error?.message ?? null,
  };
}

export async function getNotificationPreferences(userId: string) {
  const supabase = await createClient();
  const defaults = {
    change_order_email_enabled: true,
    customer_update_email_enabled: true,
    file_email_enabled: true,
    message_email_enabled: true,
    payment_email_enabled: true,
    quote_email_enabled: true,
    user_id: userId,
  };
  if (!supabase) return { data: defaults, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("admin_notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { data: data ?? defaults, error: error?.message ?? null };
}

export async function getActivityLogPage(input: {
  action?: string;
  actor?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  recordType?: string;
}) {
  const supabase = await createClient();
  if (!supabase) return { actors: new Map<string, string>(), count: 0, data: [] as ActivityLogEntry[], error: "Supabase is not configured." };
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("activity_log")
    .select("id, actor_user_id, actor_type, actor_label, subject_type, subject_id, event_type, action_category, record_label, summary, metadata_json, changes_json, destination_path, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (input.actor) query = query.eq("actor_user_id", input.actor);
  if (input.action) query = query.eq("event_type", input.action);
  if (input.category) query = query.eq("action_category", input.category);
  if (input.recordType) query = query.eq("subject_type", input.recordType);
  if (input.dateFrom) query = query.gte("created_at", `${input.dateFrom}T00:00:00`);
  if (input.dateTo) query = query.lte("created_at", `${input.dateTo}T23:59:59.999`);
  const result = await query.range(from, from + input.pageSize - 1);
  const rows = (result.data ?? []) as ActivityLogEntry[];
  const actorIds = [...new Set(rows.flatMap((entry) => entry.actor_user_id ? [entry.actor_user_id] : []))];
  const profiles = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [], error: null };
  const actors = new Map((profiles.data ?? []).map((profile) => [
    profile.id as string,
    (profile.full_name || profile.email || "Platform user") as string,
  ]));
  return {
    actors,
    count: result.count ?? 0,
    data: rows,
    error: result.error?.message ?? profiles.error?.message ?? null,
  };
}

export async function getActivityFilterOptions() {
  const supabase = await createClient();
  if (!supabase) return { actions: [], actors: [], categories: [], recordTypes: [] };
  const [entries, profiles] = await Promise.all([
    supabase.from("activity_log").select("event_type, action_category, subject_type").order("created_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("id, full_name, email").order("full_name").limit(200),
  ]);
  return {
    actions: unique((entries.data ?? []).map((row) => row.event_type)),
    actors: (profiles.data ?? []).map((profile) => ({
      id: profile.id as string,
      label: (profile.full_name || profile.email || "Platform user") as string,
    })),
    categories: unique((entries.data ?? []).map((row) => row.action_category).filter(Boolean) as string[]),
    recordTypes: unique((entries.data ?? []).map((row) => row.subject_type)),
  };
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}
