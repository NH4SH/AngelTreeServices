import { CalendarClock, CheckCircle2, CircleSlash2, MailWarning } from "lucide-react";
import type { CustomerCommunication } from "@/lib/types/database";

export function CommunicationHistoryList({ communications }: { communications: CustomerCommunication[] }) {
  if (!communications.length) return <p className="inline-empty">No scheduled reminder history yet.</p>;

  return (
    <div className="communication-list">
      {communications.map((item) => (
        <article className={`communication-row status-${item.status}`} key={item.id}>
          <span className="communication-row-icon" aria-hidden="true">{statusIcon(item.status)}</span>
          <div>
            <strong>{item.communication_type.replaceAll("_", " ")}</strong>
            <span>{item.status} - {formatDateTime(item.sent_at ?? item.scheduled_for)}</span>
            <small>{item.recipient_email}</small>
            {item.skip_reason || item.last_error ? <small>{item.skip_reason || item.last_error}</small> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function statusIcon(status: CustomerCommunication["status"]) {
  if (status === "sent") return <CheckCircle2 size={16} />;
  if (status === "failed") return <MailWarning size={16} />;
  if (["skipped", "cancelled"].includes(status)) return <CircleSlash2 size={16} />;
  return <CalendarClock size={16} />;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
