import type { AdminNotification } from "../data/notifications";
import type { NotificationInboxTab } from "./scope";

export type NotificationInboxPayload = {
  unreadCount: number;
  systemUnreadCount: number;
  notifications: AdminNotification[];
};

const unavailable = "Notifications could not load. Please try again.";
class NotificationInboxError extends Error {}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const nullableText = (value: unknown) => value === null || typeof value === "string";
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

function notification(value: unknown): value is AdminNotification {
  return object(value) && typeof value.id === "string" && value.id.length > 0
    && typeof value.title === "string" && typeof value.category === "string"
    && nullableText(value.body) && nullableText(value.destination_path)
    && date(value.created_at) && (value.read_at === null || date(value.read_at));
}

// A proxy error, expired session or interrupted stream is not an empty inbox.
// Keep transport diagnostics and response bodies out of customer-facing errors.
export async function requestNotificationInbox(mode: "count" | "recent", tab: NotificationInboxTab = "activity", {
  request = fetch, signal,
}: { request?: typeof fetch; signal?: AbortSignal } = {}): Promise<NotificationInboxPayload> {
  try {
    const response = await request(mode === "count" ? "/api/admin/notifications?mode=count"
      : `/api/admin/notifications?mode=recent&tab=${tab}`, {
      cache: "no-store", redirect: "error",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
    if (response.status === 401) throw new NotificationInboxError("Your session ended. Sign in again to view notifications.");
    if (response.status === 403) throw new NotificationInboxError("Your account cannot view these notifications.");
    if (response.status === 429) throw new NotificationInboxError("Notifications are busy. Wait a moment and try again.");
    if (!response.ok || response.redirected) throw new NotificationInboxError(unavailable);
    const payload: unknown = await response.json();
    if (!object(payload) || !count(payload.unreadCount) || !count(payload.systemUnreadCount)
      || (mode === "recent" && (!Array.isArray(payload.notifications) || !payload.notifications.every(notification)))) {
      throw new NotificationInboxError(unavailable);
    }
    return { unreadCount: payload.unreadCount, systemUnreadCount: payload.systemUnreadCount,
      notifications: mode === "recent" ? payload.notifications as AdminNotification[] : [] };
  } catch (error) {
    if (error instanceof NotificationInboxError) throw error;
    throw new NotificationInboxError(error instanceof Error && error.name === "TimeoutError"
      ? "Notifications took too long to load. Please try again." : unavailable);
  }
}
