import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordActivity } from "@/lib/activity-log";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import { sanitizeHealthSummary } from "./core";

type AlertInput = {
  componentKey: string;
  componentLabel: string;
  incidentId: string;
  kind: "incident" | "recovery";
  status: string;
  summary: string;
  timestamp: string;
};

export async function emitSystemHealthAlert(
  supabase: SupabaseClient<any, "public", any>,
  input: AlertInput,
) {
  const recovered = input.kind === "recovery";
  const title = recovered
    ? `Recovered: ${input.componentLabel}`
    : `System health alert: ${input.componentLabel}`;
  const summary = sanitizeHealthSummary(input.summary);
  const activity = await recordActivity(supabase, {
    actionCategory: "other",
    actorType: "system",
    destinationPath: "/admin/settings/system-health",
    eventType: recovered ? "system_health_incident_recovered" : "system_health_incident_opened",
    idempotencyKey: `system-health:${input.incidentId}:${input.kind}`,
    metadata: { component_key: input.componentKey, incident_id: input.incidentId, status: input.status },
    recordLabel: input.componentLabel,
    summary,
    subjectId: input.incidentId,
    subjectType: "system_health_incident",
  });
  if (!activity.created || !activity.id) return;

  const recipients = await getAdminRecipients(supabase);
  if (!recipients.length) return;
  const created = await supabase
    .from("admin_notifications")
    .insert(recipients.map((recipient) => ({
      activity_id: activity.id,
      body: summary,
      category: "other",
      destination_path: "/admin/settings/system-health",
      recipient_user_id: recipient.id,
      title,
    })))
    .select("id, recipient_user_id");
  if (created.error) return;

  const destination = buildCanonicalAppUrl("/admin/settings/system-health");
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  await Promise.all((created.data ?? []).map(async (notification) => {
    const recipient = recipientById.get(notification.recipient_user_id);
    if (!recipient?.email) {
      await updateEmailStatus(supabase, notification.id, "skipped");
      return;
    }
    const text = [
      recovered ? `${input.componentLabel} has recovered.` : `${input.componentLabel} entered an incident.`,
      `Status: ${input.status.replaceAll("_", " ")}`,
      `Time: ${formatEastern(input.timestamp)}`,
      `Reason: ${summary}`,
      destination ? `System Health: ${destination}` : "",
    ].filter(Boolean).join("\n");
    const email = await sendTransactionalEmail({
      emailType: "system_health_alert",
      html: text.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
      idempotencyKey: `system-health-alert:${input.incidentId}:${input.kind}:${recipient.id}`,
      subject: title,
      supabase,
      text,
      to: recipient.email,
    });
    await updateEmailStatus(supabase, notification.id, email.ok ? "sent" : "failed");
  }));
}

async function getAdminRecipients(supabase: SupabaseClient<any, "public", any>) {
  const roles = await supabase.from("roles").select("id").in("name", ["owner", "admin"]);
  if (roles.error || !roles.data?.length) return [];
  const memberships = await supabase.from("user_roles").select("user_id").in("role_id", roles.data.map((role) => role.id));
  if (memberships.error || !memberships.data?.length) return [];
  const userIds = [...new Set(memberships.data.map((membership) => membership.user_id))];
  const profiles = await supabase.from("profiles").select("id, email").in("id", userIds).eq("status", "active");
  return (profiles.data ?? []) as Array<{ id: string; email: string | null }>;
}

async function updateEmailStatus(
  supabase: SupabaseClient<any, "public", any>,
  notificationId: string,
  status: "sent" | "failed" | "skipped",
) {
  await supabase
    .from("admin_notifications")
    .update({ email_attempted_at: new Date().toISOString(), email_status: status })
    .eq("id", notificationId);
}

function formatEastern(value: string) {
  return new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
