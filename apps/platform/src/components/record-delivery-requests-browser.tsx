import Link from "next/link";
import { ListPagination } from "@/components/list-pagination";
import { formatBusinessDateTime } from "@/lib/business-time";
import { emailDeliveryLabel } from "@/lib/email/delivery-labels";
import { recordEmailHistoryHref, recordEmailRecordHref, type RecordEmailScope } from "@/lib/email/record-history-scope";
import { recordDeliveryPageSize, type RecordDeliveryItem, type RecordDeliveryPage } from "@/lib/email/record-delivery-requests";

const date = (v: string) => formatBusinessDateTime(new Date(v), { dateStyle: "medium", timeStyle: "short" });
export function requestOutcome(item: RecordDeliveryItem): string {
  switch (item.state) {
    case "prepared": return item.attempt_count === 0 ? "Prepared — not sent" : "Prepared for another attempt";
    case "dispatching": return "Sending — outcome pending";
    case "unknown": return "Delivery outcome uncertain";
    case "not_attempted": return "No confirmed send";
    case "rejected": return "Provider rejected request";
    case "cancelled": return "Request cancelled";
    default: return item.delivery_status === "pending" ? "Accepted by email provider" : emailDeliveryLabel(item.delivery_status);
  }
}
export function RecordDeliveryRequestsBrowser({ scope, label, result }: { scope: RecordEmailScope; label: string; result: RecordDeliveryPage }) {
  const href = recordEmailHistoryHref(scope, "requests", result.page);
  const Pages = () => <ListPagination basePath={href.split("?")[0]} count={result.count ?? 0} page={result.page} pageSize={recordDeliveryPageSize} params={{ view: "requests" }} />;
  return <>
    <Link href={recordEmailRecordHref(scope)}>Back to record</Link>
    <section className="page-heading"><div><h1>Email history</h1><p>{label}</p></div></section>
    <p className="form-helper">Check requests that are prepared, still in progress or need review. Some have no recorded email outcome yet. Opening this view sends no email.</p>
    <nav className="filter-pills" aria-label="Recorded email view">
      <Link href={recordEmailHistoryHref(scope)}>All recorded emails</Link><Link href={recordEmailHistoryHref(scope, "attention")}>Needs attention</Link>
      <Link className="active" aria-current="page" href={recordEmailHistoryHref(scope, "requests")}>Prepared &amp; unresolved</Link>
    </nav>
    <section className="detail-panel communication-queue-panel record-email-results" aria-labelledby="record-request-list-title">
      <div className="panel-heading-row"><h2 id="record-request-list-title">Prepared &amp; unresolved requests</h2><a href={href} className="secondary-action compact-action">Refresh</a></div>
      {result.error ? <p className="form-message error" role="alert">Delivery requests could not be loaded. Refresh this page to try again.</p> : <>
        {result.count ? <p className="form-helper">Showing {(result.page - 1) * recordDeliveryPageSize + 1}–{(result.page - 1) * recordDeliveryPageSize + result.data.length} of {result.count.toLocaleString("en-US")} · Newest requests first</p> : null}
        <Pages />
        {result.data.length ? <div className="communication-list">{result.data.map(item => <article className={`communication-row record-email-row status-${["unknown", "rejected"].includes(item.state) || ["delayed", "failed", "bounced", "complained", "suppressed"].includes(item.delivery_status) ? "failed" : item.state === "accepted" ? "sent" : "skipped"}`} key={item.id}>
          <div><h3>{item.subject || "Email without a subject"}</h3><p>{item.recipient || "Recipient unavailable"}</p>
            <p>{requestOutcome(item)} · Prepared {date(item.created_at)}</p>
            {item.state === "unknown" || item.state === "dispatching" ? <p className="form-helper">Check this attempt before considering another email.</p> : null}
            {item.followup_sync_pending ? <p className="form-helper">Follow-up update pending.</p> : null}
            {item.repair_state === "source_changed" ? <p className="form-helper">The record changed after preparation. Review this request.</p> : null}
            {item.state === "accepted" && ["pending", "needs_review"].includes(item.repair_state) ? <p className="form-helper">Email accepted; record update needs review.</p> : null}
            <Link href={`/admin/communications/delivery-review?id=${item.id}`}>Review this delivery</Link>
            <details className="record-email-details"><summary>Request details</summary><dl className="record-details">
              <div><dt>Attempts recorded</dt><dd>{item.attempt_count}</dd></div>
              {item.first_dispatched_at ? <div><dt>First attempt</dt><dd>{date(item.first_dispatched_at)}</dd></div> : null}
              {item.last_dispatched_at ? <div><dt>Latest attempt</dt><dd>{date(item.last_dispatched_at)}</dd></div> : null}
              {item.accepted_at ? <div><dt>Provider accepted</dt><dd>{date(item.accepted_at)}</dd></div> : null}
              {item.provider_message_id ? <div><dt>Provider reference</dt><dd>{item.provider_message_id}</dd></div> : null}
            </dl></details>
          </div>
        </article>)}</div> : <p className="inline-empty">No prepared or unresolved delivery requests for this record. Recorded emails remain available in All recorded emails.</p>}
        <Pages />
      </>}
    </section>
    <p className="form-helper">These are delivery requests, not a second email-history total. A request can also have a recorded outcome. Review actions and their safety checks remain in Delivery review; this view cannot send or retry an email.</p>
  </>;
}
