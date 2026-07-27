import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordActivity,
  type ActivityChanges,
  type ActivityMetadata,
} from "@/lib/activity-log";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import {
  emailPreferenceFields,
  type NotificationCategory,
} from "@/lib/notifications/definitions";

type CustomerActivityInput = {
  body?: string | null;
  category: NotificationCategory;
  changeOrderId?: string | null;
  changes?: ActivityChanges;
  customerId?: string | null;
  destinationPath: string;
  eventType: string;
  idempotencyKey: string;
  invoiceId?: string | null;
  metadata?: ActivityMetadata;
  organizationId?: string | null;
  paymentId?: string | null;
  quoteId?: string | null;
  recordLabel?: string | null;
  subjectId: string;
  subjectType: string;
  summary: string;
  title: string;
};

type AdminRecipient = {
  email: string | null;
  full_name: string | null;
  id: string;
};

/** Emits customer-side activity without changing the primary workflow result. */
export async function emitCustomerActivity(input: CustomerActivityInput) {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    console.error("Customer activity notification skipped", {
      eventType: input.eventType,
      reason: "service_role_unavailable",
      subjectId: input.subjectId,
    });
    return;
  }

  try {
    const activity = await recordActivity(supabase, {
      actionCategory: input.category,
      actorType: "portal",
      changes: input.changes,
      destinationPath: input.destinationPath,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      organizationId: input.organizationId,
      recordLabel: input.recordLabel,
      summary: input.summary,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
    });

    if (!activity.created || !activity.id) return;

    const recipients = await getAdminRecipients(supabase);
    if (!recipients.length) return;

    const { data: created, error } = await supabase
      .from("admin_notifications")
      .insert(recipients.map((recipient) => ({
        activity_id: activity.id,
        body: input.body ?? input.summary,
        category: input.category,
        destination_path: input.destinationPath,
        organization_id: input.organizationId ?? null,
        recipient_user_id: recipient.id,
        title: input.title,
      })))
      .select("id, recipient_user_id");

    if (error) {
      console.error("Customer activity notification rows failed", {
        eventType: input.eventType,
        subjectId: input.subjectId,
        error,
      });
      return;
    }

    const preferences = await getEmailPreferences(supabase, recipients.map((recipient) => recipient.id));
    const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

    await Promise.all((created ?? []).map(async (notification) => {
      const recipient = recipientById.get(notification.recipient_user_id);
      const enabled = isEmailEnabled(preferences.get(notification.recipient_user_id), input.category);
      if (!recipient?.email || !enabled) {
        await updateEmailStatus(supabase, notification.id, "skipped");
        return;
      }

      const destination = buildCanonicalAppUrl(input.destinationPath);
      const email = await sendTransactionalEmail({
        emailType: "admin_customer_activity",
        html: buildEmailHtml(input, recipient, destination),
        idempotencyKey: `admin-activity:${notification.id}`,
        relatedCustomerId: input.customerId,
        relatedChangeOrderId: input.changeOrderId,
        relatedInvoiceId: input.invoiceId,
        relatedOrganizationId: input.organizationId,
        relatedPaymentId: input.paymentId,
        relatedQuoteId: input.quoteId,
        subject: input.title,
        supabase,
        text: buildEmailText(input, recipient, destination),
        to: recipient.email,
      });
      await updateEmailStatus(supabase, notification.id, email.ok ? "sent" : "failed");
    }));
  } catch (error) {
    console.error("Customer activity notification pipeline failed", {
      eventType: input.eventType,
      subjectId: input.subjectId,
      error,
    });
  }
}

async function getAdminRecipients(supabase: SupabaseClient<any, "public", any>) {
  const roles = await supabase.from("roles").select("id").in("name", ["owner", "admin"]);
  if (roles.error || !roles.data?.length) return [];
  const memberships = await supabase.from("user_roles").select("user_id").in("role_id", roles.data.map((role) => role.id));
  if (memberships.error || !memberships.data?.length) return [];
  const userIds = [...new Set(memberships.data.map((membership) => membership.user_id))];
  const profiles = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds)
    .eq("status", "active");
  if (profiles.error) return [];
  return (profiles.data ?? []) as AdminRecipient[];
}

async function getEmailPreferences(
  supabase: SupabaseClient<any, "public", any>,
  userIds: string[],
) {
  const result = await supabase.from("admin_notification_preferences").select("*").in("user_id", userIds);
  return new Map((result.data ?? []).map((preference) => [preference.user_id as string, preference]));
}

function isEmailEnabled(
  preference: Record<string, unknown> | undefined,
  category: NotificationCategory,
) {
  if (category === "other") return false;
  const field = emailPreferenceFields[category];
  return preference?.[field] !== false;
}

async function updateEmailStatus(
  supabase: SupabaseClient<any, "public", any>,
  notificationId: string,
  status: "sent" | "failed" | "skipped",
) {
  const { error } = await supabase
    .from("admin_notifications")
    .update({ email_attempted_at: new Date().toISOString(), email_status: status })
    .eq("id", notificationId);
  if (error) console.error("Notification email status update failed", { notificationId, status, error });
}

function buildEmailText(
  input: CustomerActivityInput,
  recipient: AdminRecipient,
  destination: string | null,
) {
  return [
    recipient.full_name ? `Hi ${recipient.full_name},` : "Hello,",
    "",
    input.summary,
    input.recordLabel ? `Record: ${input.recordLabel}` : "",
    `Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
    destination ? `Open in admin: ${destination}` : "",
  ].filter(Boolean).join("\n");
}

function buildEmailHtml(
  input: CustomerActivityInput,
  recipient: AdminRecipient,
  destination: string | null,
) {
  const text = buildEmailText(input, recipient, destination);
  return text.split("\n\n").map((paragraph) =>
    `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`,
  ).join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
