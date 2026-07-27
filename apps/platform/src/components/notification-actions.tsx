"use client";

import { CheckCheck, Mail, MailOpen } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  markAllNotificationsRead,
  setNotificationReadState,
  type NotificationActionState,
} from "@/lib/actions/notifications";

const initialState: NotificationActionState = { message: "", status: "idle" };

export function NotificationReadAction({ id, read }: { id: string; read: boolean }) {
  const [state, action, pending] = useReliableActionState(setNotificationReadState, initialState);
  return (
    <form action={action} className="notification-inline-action">
      <input name="notification_id" type="hidden" value={id} />
      <input name="read" type="hidden" value={read ? "0" : "1"} />
      <button aria-label={read ? "Mark unread" : "Mark read"} disabled={pending} title={read ? "Mark unread" : "Mark read"} type="submit">
        {read ? <Mail size={17} /> : <MailOpen size={17} />}
      </button>
      {state.status === "error" ? <span role="alert">{state.message}</span> : null}
    </form>
  );
}

export function MarkAllNotificationsRead() {
  const [state, action, pending] = useReliableActionState(markAllNotificationsRead, initialState);
  return (
    <form action={action} className="notification-mark-all">
      <button className="secondary-action" disabled={pending} type="submit">
        <CheckCheck size={17} />{pending ? "Updating…" : "Mark all read"}
      </button>
      {state.message ? <p className={`form-message ${state.status}`}>{state.message}</p> : null}
    </form>
  );
}
