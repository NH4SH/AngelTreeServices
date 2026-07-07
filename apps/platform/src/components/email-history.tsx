import { MailCheck, MailWarning } from "lucide-react";
import type { EmailEvent } from "@/lib/types/database";

export function EmailSetupNotice({ configured }: { configured: boolean }) {
  if (configured) {
    return null;
  }

  return (
    <p className="email-setup-notice" role="status">
      Email sending is not configured. Drafts are still available.
    </p>
  );
}

export function EmailHistoryList({ events }: { events: EmailEvent[] }) {
  if (events.length === 0) {
    return <p className="inline-empty">No email history yet.</p>;
  }

  return (
    <div className="email-history-list">
      {events.map((event) => (
        <article className={event.status === "failed" ? "email-history-row failed" : "email-history-row"} key={event.id}>
          <span className="email-history-icon" aria-hidden="true">
            {event.status === "failed" ? <MailWarning size={16} /> : <MailCheck size={16} />}
          </span>
          <div>
            <strong>{event.subject}</strong>
            <small>
              {formatEmailType(event.email_type)} to {event.recipient_email}
            </small>
            <small>
              {event.status === "sent" ? "Sent" : "Failed"} {formatDateTime(event.sent_at ?? event.created_at)}
              {event.provider_message_id ? `, ${event.provider_message_id}` : ""}
            </small>
            {event.error_message ? <p>{event.error_message}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatEmailType(value: EmailEvent["email_type"]) {
  return value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
