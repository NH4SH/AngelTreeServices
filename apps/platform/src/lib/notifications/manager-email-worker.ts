import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { recordActivity } from "@/lib/activity-log";
import { getEmailProviderConfig } from "@/lib/email/config";
import { sendTransactionalEmail, type SendEmailInput } from "@/lib/email/send";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import { formatBusinessDateTime } from "@/lib/business-time";
import { buildManagerSummary } from "./manager-email-summary";
import { canRetryManagerEmail, managerDigestKey, managerEmailClock, managerEmailHtml, managerEmailWindow, type ManagerEmailKind } from "./manager-email-policy";

type Payload = { to: string; subject: string; text: string; html: string; from: string; replyTo: string };
type QueueRow = { id: string; recipient_user_id: string; title: string; body: string; destination_path: string; email_status: string; manager_email_kind: ManagerEmailKind; manager_email_key: string; handoff_task_id: string | null; digest_date: string | null; manager_email_attempts: number; manager_email_first_attempt_at: string | null; manager_email_payload: Payload | null };

async function recipient(db: SupabaseClient<any>, userId: string) {
  const [{ data: profile, error }, memberships] = await Promise.all([
    db.from("profiles").select("id").eq("id", userId).eq("status", "active").maybeSingle(), db.from("user_roles").select("roles(name)").eq("user_id", userId),
  ]);
  if (error || memberships.error) throw new Error("Recipient lookup unavailable");
  const roles = (memberships.data ?? []).flatMap(row => Array.isArray(row.roles) ? row.roles : [row.roles]).filter(Boolean);
  if (!profile || !roles.some(role => ["owner", "admin"].includes(role.name))) return null;
  const { data, error: authError } = await db.auth.admin.getUserById(userId);
  if (authError) throw new Error("Recipient identity unavailable");
  return data.user?.email_confirmed_at && data.user.email ? data.user.email.trim().toLowerCase() : null;
}

export async function processManagerEmails(input: {
  db?: SupabaseClient<any>; now?: Date; send?: (input: SendEmailInput) => ReturnType<typeof sendTransactionalEmail>;
} = {}) {
  const db = input.db ?? getServiceRoleClient();
  const now = input.now ?? new Date();
  const send = input.send ?? sendTransactionalEmail;
  const config = getEmailProviderConfig();
  if (!db || !config || !buildCanonicalAppUrl("/admin")) throw new Error("Manager email configuration unavailable");
  if (!managerEmailWindow("handoff", now)) return { queued: 0, sent: 0, skipped: 0, failed: 0, errors: 0 };
  const result = { queued: 0, sent: 0, skipped: 0, failed: 0, errors: 0 };
  const started = Date.now();

  // Once per manager/business date. Interrupted enqueue is recovered by the
  // existing activity key and notification unique key on the next worker run.
  const prefs = await db.from("admin_notification_preferences").select("user_id, daily_summary_hour").eq("daily_summary_email_enabled", true).order("user_id").limit(100);
  if (prefs.error) throw new Error("Manager notification preferences unavailable");
  for (const pref of prefs.data ?? []) {
    // Leave time for delivery; later scheduler runs pick up the remaining work.
    if (result.queued >= 3 || Date.now() - started > 5_000) break;
    try {
    if (!managerEmailWindow("digest", now, pref.daily_summary_hour)) continue;
    const key = managerDigestKey(pref.user_id, now);
    const existing = await db.from("admin_notifications").select("id").eq("manager_email_key", key).maybeSingle();
    if (existing.error) throw new Error("Manager notification queue unavailable");
    if (existing.data || !await recipient(db, pref.user_id)) continue;
    const body = await buildManagerSummary(db, pref.user_id, now);
    const activity = await recordActivity(db, { actorType: "system", eventType: "manager_daily_summary_queued", subjectId: pref.user_id, subjectType: "profile", summary: "Morning operations summary queued.", idempotencyKey: key, destinationPath: "/admin" });
    if (!activity.id) throw new Error("Summary activity could not be recorded");
    const queued = await db.from("admin_notifications").upsert({ activity_id: activity.id, recipient_user_id: pref.user_id, category: "other", title: `Morning operations - ${managerEmailClock(now).date}`, body, destination_path: "/admin", manager_email_kind: "digest", manager_email_key: key, digest_date: managerEmailClock(now).date }, { onConflict: "manager_email_key", ignoreDuplicates: true });
    if (queued.error) throw new Error("Summary could not be queued");
    result.queued++;
    } catch { result.errors++; }
  }

  const stale = new Date(now.getTime() - 10 * 60_000).toISOString();
  const pending = await db.from("admin_notifications").select("*").not("manager_email_kind", "is", null).in("email_status", ["pending", "failed"]).lte("manager_email_next_attempt_at", now.toISOString()).or(`manager_email_claimed_at.is.null,manager_email_claimed_at.lt.${stale}`).order("manager_email_next_attempt_at").limit(10);
  if (pending.error) throw new Error("Manager delivery queue unavailable");
  for (const row of (pending.data ?? []) as QueueRow[]) {
    if (Date.now() - started > 12_000) break;
    try {
    const finish = async (status: "sent" | "failed" | "skipped", problem: string | null, retry = false) => {
      const updated = await db.from("admin_notifications").update({ email_status: status, manager_email_problem: problem, manager_email_claimed_at: null, manager_email_next_attempt_at: retry ? new Date(now.getTime() + 15 * 60_000).toISOString() : null }).eq("id", row.id).eq("manager_email_attempts", row.manager_email_attempts).in("email_status", ["pending", "failed"]);
      if (updated.error) throw new Error("Manager delivery state could not be recorded");
      result[status]++;
    };
    if (!canRetryManagerEmail(row.manager_email_attempts, row.manager_email_first_attempt_at, now)) { await finish("failed", "retry_window_ended"); continue; }
    const preferences = await db.from("admin_notification_preferences").select("daily_summary_email_enabled, handoff_email_enabled, daily_summary_hour").eq("user_id", row.recipient_user_id).maybeSingle();
    if (preferences.error) throw new Error("Manager preferences could not be checked");
    const enabled = row.manager_email_kind === "digest" ? preferences.data?.daily_summary_email_enabled : preferences.data?.handoff_email_enabled;
    const to = await recipient(db, row.recipient_user_id);
    if (!enabled || !to) { await finish("skipped", "recipient_or_preference_disabled"); continue; }
    if (row.manager_email_kind === "digest" && row.digest_date !== managerEmailClock(now).date) { await finish("skipped", "summary_date_passed"); continue; }
    if (!managerEmailWindow(row.manager_email_kind, now, preferences.data?.daily_summary_hour)) continue;
    let body = row.body;
    if (row.manager_email_kind === "handoff") {
      const task = await db.from("follow_up_tasks").select("title, due_at, assigned_to_user_id, status").eq("id", row.handoff_task_id).maybeSingle();
      if (task.error) throw new Error("Assigned task could not be checked");
      if (!task.data || task.data.assigned_to_user_id !== row.recipient_user_id || ["completed", "cancelled"].includes(task.data.status)) { await finish("skipped", "task_no_longer_assigned"); continue; }
      body = `${task.data.title}\nDue: ${formatBusinessDateTime(task.data.due_at)} Eastern time`;
    }
    const path = row.destination_path === "/admin" || row.destination_path?.startsWith("/admin/") ? row.destination_path : "/admin/follow-ups?assigned=me";
    const text = `${body}\n\nOpen in Angel Tree: ${buildCanonicalAppUrl(path)}\n\nEmail preferences: ${buildCanonicalAppUrl("/admin/settings/notifications")}`;
    const payload = row.manager_email_payload ?? { to, subject: row.title, text, html: managerEmailHtml(body, [
      { label: "Open in Angel Tree", href: buildCanonicalAppUrl(path)! },
      { label: "Email preferences", href: buildCanonicalAppUrl("/admin/settings/notifications")! },
    ]), from: config.from, replyTo: config.replyTo };
    if (payload.to !== to || payload.from !== config.from || payload.replyTo !== config.replyTo) { await finish("failed", "email_configuration_changed"); continue; }

    // Compare-and-set prevents two workers from sending the same queue item.
    const claim = await db.from("admin_notifications").update({ manager_email_claimed_at: now.toISOString(), manager_email_attempts: row.manager_email_attempts + 1, manager_email_first_attempt_at: row.manager_email_first_attempt_at ?? now.toISOString(), manager_email_payload: payload, email_attempted_at: now.toISOString() }).eq("id", row.id).eq("manager_email_attempts", row.manager_email_attempts).in("email_status", ["pending", "failed"]).or(`manager_email_claimed_at.is.null,manager_email_claimed_at.lt.${stale}`).select("id").maybeSingle();
    if (claim.error) throw new Error("Manager delivery claim failed");
    if (!claim.data) continue;
    row.manager_email_attempts++;
    const sent = await send({ to: payload.to, subject: payload.subject, text: payload.text, html: payload.html, idempotencyKey: row.manager_email_key, emailType: row.manager_email_kind === "digest" ? "manager_daily_summary" : "manager_handoff", supabase: db, signal: AbortSignal.timeout(10_000) });
    await finish(sent.ok ? "sent" : "failed", sent.ok ? (sent.historyRecorded ? null : "accepted_history_unavailable") : "provider_rejected_or_unavailable", !sent.ok && sent.retryable && row.manager_email_attempts < 3);
    } catch { result.errors++; }
  }
  return result;
}
