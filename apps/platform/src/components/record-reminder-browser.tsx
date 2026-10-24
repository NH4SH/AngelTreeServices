import Link from "next/link";
import { RecordReminderSummary } from "@/components/record-reminder-summary";
import { ReminderCancellation } from "@/components/reminder-cancellation";
import { formatBusinessDateTime } from "@/lib/business-time";
import { reminderBrowseHref, type ReminderBrowseScope } from "@/lib/communications/record-browse";
import { communicationQueuePageSize, type CommunicationQueuePage, type CommunicationQueueView } from "@/lib/communications/queue-page";
import type { RecordReminderSummary as Summary } from "@/lib/communications/record-summary";

const labels = { scheduled: "Scheduled", failed: "Failed", history: "History" };
const empty = { scheduled: "No reminders are currently scheduled for this record.", failed: "No failed reminders for this record.", history: "No reminder history for this record yet." };
const date = (value: string) => formatBusinessDateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
export function RecordReminderBrowser({ scope, label, returnTo, view, result, summary }: {
  scope: ReminderBrowseScope; label: string; returnTo: string; view: CommunicationQueueView; result: CommunicationQueuePage; summary: Summary;
}) {
  const href = (page: number, tab = view) => reminderBrowseHref(scope, tab, page, returnTo);
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / communicationQueuePageSize));
  function Pages() {
    return !result.error && pages > 1 ? <nav className="list-pagination" aria-label={`${labels[view]} reminder pages`}>
      {result.page > 1 ? <Link href={href(result.page - 1)}>Previous</Link> : <span aria-disabled="true" className="pagination-disabled">Previous</span>}
      <span className="pagination-position">Page {result.page} of {pages}</span>
      {result.page < pages ? <Link href={href(result.page + 1)}>Next</Link> : <span aria-disabled="true" className="pagination-disabled">Next</span>}
    </nav> : null;
  }
  return <>
    <Link href={returnTo}>Back to record</Link>
    <section className="page-heading"><div><p className="surface-label">{label}</p><h1>Reminders &amp; history</h1><p>Browse this record’s scheduled reminders and past outcomes.</p></div></section>
    <RecordReminderSummary summary={summary} />
    <nav className="filter-pills" aria-label="Record reminder view">{(Object.keys(labels) as CommunicationQueueView[]).map(tab => <Link key={tab} aria-current={view === tab ? "page" : undefined} className={view === tab ? "active" : ""} href={href(1, tab)}>{labels[tab]}</Link>)}</nav>
    <section className="detail-panel communication-queue-panel record-reminder-queue" aria-labelledby="record-reminder-list-title">
      <div className="panel-heading-row"><h2 id="record-reminder-list-title">{labels[view] === "Scheduled" ? "Scheduled reminders" : labels[view] === "Failed" ? "Failed reminders" : "Reminder history"}</h2><a href={href(result.page)} className="secondary-action compact-action">Refresh</a></div>
      {result.error ? <p className="form-message error" role="alert">Reminders could not be loaded. Refresh this page to try again.</p> : <>
        {result.count ? <p className="inline-empty">Showing {(result.page - 1) * communicationQueuePageSize + 1}–{(result.page - 1) * communicationQueuePageSize + result.data.length} of {result.count.toLocaleString("en-US")} · {view === "scheduled" ? "Next due first" : view === "failed" ? "Latest updates first" : "Newest records first"}</p> : null}
        <Pages />
        {result.data.length ? <div className="communication-list">{result.data.map(item => <article className={`communication-row status-${item.status}`} key={item.id}>
          <div><strong>{item.communication_type.replaceAll("_", " ")}</strong>
            <span>{item.status.charAt(0).toUpperCase() + item.status.slice(1)} · {item.status === "pending" ? `Scheduled ${date(item.scheduled_for)}` : item.status === "sent" && item.sent_at ? `Sent ${date(item.sent_at)}` : `Recorded ${date(item.updated_at)}`}</span>
            {item.status === "sent" && !item.sent_at ? <small>Send date unavailable.</small> : null}
            <small>{item.recipient_email}</small>
            {item.skip_reason || item.last_error ? <small>{item.skip_reason || item.last_error}</small> : null}
          </div>
          {item.status === "pending" ? <ReminderCancellation communication={item} refreshAfter /> : null}
        </article>)}</div> : <p className="inline-empty">{empty[view]}</p>}
        <Pages />
      </>}
    </section>
    <p className="form-helper">Reminder history records CRM outcomes. For provider delivery details, <Link href="/admin/communications/delivery-review">open Delivery review</Link>.</p>
  </>;
}
