export const systemHealthNotificationDestination = "/admin/settings/system-health";

export type NotificationInboxTab = "activity" | "system";

export function normalizeNotificationInboxTab(value?: string | null): NotificationInboxTab {
  return value === "system" ? "system" : "activity";
}

export function isSystemHealthNotification(input: { destination_path?: string | null }) {
  return input.destination_path === systemHealthNotificationDestination;
}
