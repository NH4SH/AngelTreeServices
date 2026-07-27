"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";

export type NotificationActionState = {
  message: string;
  status: "idle" | "success" | "error";
};

const denied = { message: "Owner or admin access is required.", status: "error" as const };

export async function setNotificationReadState(
  _state: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const context = await getAuthenticatedPlatformContext("/admin/notifications");
  if (!context.configured || !context.supabase || !context.user) return { message: "Supabase is not configured.", status: "error" };
  if (!hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) return denied;
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  const markRead = String(formData.get("read") ?? "") === "1";
  if (!notificationId) return { message: "Notification is missing.", status: "error" };
  const { error } = await context.supabase
    .from("admin_notifications")
    .update({ read_at: markRead ? new Date().toISOString() : null })
    .eq("id", notificationId)
    .eq("recipient_user_id", context.user.id);
  if (error) return { message: error.message, status: "error" };
  revalidatePath("/admin/notifications");
  return { message: markRead ? "Marked read." : "Marked unread.", status: "success" };
}

export async function markAllNotificationsRead(
  _state: NotificationActionState,
  _formData: FormData,
): Promise<NotificationActionState> {
  const context = await getAuthenticatedPlatformContext("/admin/notifications");
  if (!context.configured || !context.supabase || !context.user) return { message: "Supabase is not configured.", status: "error" };
  if (!hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) return denied;
  const { error } = await context.supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", context.user.id)
    .is("read_at", null);
  if (error) return { message: error.message, status: "error" };
  revalidatePath("/admin/notifications");
  return { message: "All notifications marked read.", status: "success" };
}

export async function updateNotificationPreferences(
  _state: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const context = await getAuthenticatedPlatformContext("/admin/settings/notifications");
  if (!context.configured || !context.supabase || !context.user) return { message: "Supabase is not configured.", status: "error" };
  if (!hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) return denied;
  const { error } = await context.supabase.from("admin_notification_preferences").upsert({
    change_order_email_enabled: checked(formData, "change_order_email_enabled"),
    customer_update_email_enabled: checked(formData, "customer_update_email_enabled"),
    file_email_enabled: checked(formData, "file_email_enabled"),
    message_email_enabled: checked(formData, "message_email_enabled"),
    payment_email_enabled: checked(formData, "payment_email_enabled"),
    quote_email_enabled: checked(formData, "quote_email_enabled"),
    user_id: context.user.id,
  }, { onConflict: "user_id" });
  if (error) return { message: error.message, status: "error" };
  revalidatePath("/admin/settings/notifications");
  return { message: "Notification preferences saved.", status: "success" };
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "1";
}
