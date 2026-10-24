import { CalendarClock, MailCheck } from "lucide-react";
import { formatBusinessDateTime } from "@/lib/business-time";
import type { RecordReminderSummary as Summary } from "@/lib/communications/record-summary";

export function RecordReminderSummary({ summary }: { summary: Summary | null }) {
  const last = summary?.lastSent, next = summary?.nextScheduled;
  const failed = !summary || !!last?.error || !!next?.error;
  const date = (value: string) => formatBusinessDateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  return <>
    <div className="communication-summary-row">
      <span>
        <MailCheck aria-hidden="true" size={17} />
        <strong>Last sent</strong>
        {!last || last.error ? "Unavailable" : last.data ? date(last.data.at) : "None yet"}
        {last?.data?.timing === "recorded" && !last.error ? <small>Recorded time; send date unavailable.</small> : null}
      </span>
      <span>
        <CalendarClock aria-hidden="true" size={17} />
        <strong>Next scheduled</strong>
        {!next || next.error ? "Unavailable" : next.data ? date(next.data.at) : "None"}
      </span>
    </div>
    {failed ? <p className="form-message error" role="status">Reminder summary could not be checked. Refresh this record to try again.</p> : null}
  </>;
}
