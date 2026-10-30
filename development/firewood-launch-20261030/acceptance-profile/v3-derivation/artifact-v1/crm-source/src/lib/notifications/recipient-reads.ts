import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<any, "public", any>;
export type AdminRecipient = { id: string; email: string | null; full_name: string | null };
export type ActivityNotification = { id: string; recipient_user_id: string };
const pageSize = 200;
const idBatchSize = 100;

// Composite user_roles keys are unique per role. Page each role by user_id,
// avoiding both API row caps and offset shifts when earlier members are removed.
// Existing eligibility stays owner/admin + active profile; no access is widened.
export async function readCustomerActivityRecipients(db: Client): Promise<AdminRecipient[]> {
  const roles = await db.from("roles").select("id").in("name", ["owner", "admin"]);
  if (roles.error || !Array.isArray(roles.data)) throw Error("Notification roles could not be checked.");
  const ids = new Set<string>();
  for (const role of roles.data) {
    let after: string | null = null;
    while (true) {
      let query = db.from("user_roles").select("user_id").eq("role_id", role.id).order("user_id").limit(pageSize);
      if (after) query = query.gt("user_id", after);
      const result = await query;
      if (result.error || !Array.isArray(result.data)) throw Error("Notification memberships could not be checked.");
      for (const row of result.data) ids.add(row.user_id);
      if (result.data.length < pageSize) break;
      const next = result.data.at(-1)?.user_id;
      if (typeof next !== "string" || next === after) throw Error("Notification memberships did not advance.");
      after = next;
    }
  }
  const recipients: AdminRecipient[] = [];
  const uniqueIds = [...ids];
  for (let offset = 0; offset < uniqueIds.length; offset += idBatchSize) {
    const result = await db.from("profiles").select("id, email, full_name").in("id", uniqueIds.slice(offset, offset + idBatchSize)).eq("status", "active");
    if (result.error || !Array.isArray(result.data)) throw Error("Notification recipients could not be checked.");
    recipients.push(...result.data);
  }
  return recipients;
}

export async function readCustomerActivityPreferences(db: Client, userIds: string[]) {
  const ids = [...new Set(userIds)];
  const preferences = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < ids.length; offset += idBatchSize) {
    const result = await db.from("admin_notification_preferences").select("*").in("user_id", ids.slice(offset, offset + idBatchSize));
    if (result.error || !Array.isArray(result.data)) throw Error("Notification preferences could not be checked.");
    for (const row of result.data) preferences.set(row.user_id, row);
  }
  return preferences;
}

// Keep the existing notification INSERT atomic, then read its complete result
// independently of PostgREST's representation cap. No partial list authorizes I/O.
export async function readCustomerActivityNotifications(db: Client, activityId: string): Promise<ActivityNotification[]> {
  const rows: ActivityNotification[] = [];
  let after: string | null = null;
  while (true) {
    let query = db.from("admin_notifications").select("id, recipient_user_id").eq("activity_id", activityId).order("id").limit(pageSize);
    if (after) query = query.gt("id", after);
    const result = await query;
    if (result.error || !Array.isArray(result.data)) throw Error("Notification rows could not be confirmed.");
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
    const next = result.data.at(-1)?.id;
    if (typeof next !== "string" || next === after) throw Error("Notification rows did not advance.");
    after = next;
  }
}
