import Link from "next/link";
import { ListPagination } from "@/components/list-pagination";
import { formatBusinessDateTime } from "@/lib/business-time";
import { emailDeliveryLabel } from "@/lib/email/delivery-labels";
import { recordEmailHistoryHref, recordEmailRecordHref, type RecordEmailScope, type RecordEmailView } from "@/lib/email/record-history-scope";
import { recordEmailPageSize, type RecordEmailPage } from "@/lib/email/record-history";

const date = (value: string) => formatBusinessDateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
export function RecordEmailHistoryBrowser({ scope, label, view, result }: { scope: RecordEmailScope; label: string; view: RecordEmailView; result: RecordEmailPage }) {
  const href = recordEmailHistoryHref(scope, view, result.page), basePath = href.split("?")[0];
  const Pages = () => <ListPagination basePath={basePath} count={result.count ?? 0} page={result.page} pageSize={recordEmailPageSize} params={{ view }} />;
  return <>
    <Link href={recordEmailRecordHref(scope)}>Back to record</Link>
    <section className="page-heading"><div><h1>Email history</h1><p>{label}</p></div></section>
    <p className="form-helper">Provider accepted means the email service accepted the request. Delivery reported means the receiving mail server accepted it; neither proves the customer read it.</p>
    <nav className="filter-pills" aria-label="Recorded email view">{(["all", "attention", "requests"] as const).map(tab => <Link key={tab} aria-current={view === tab ? "page" : undefined} className={view === tab ? "active" : ""} href={recordEmailHistoryHref(scope, tab)}>{tab === "all" ? "All recorded emails" : tab === "attention" ? "Needs attention" : "Prepared & unresolved"}</Link>)}</nav>
    <section className="detail-panel communication-queue-panel record-email-results" aria-labelledby="record-email-list-title">
      <div className="panel-heading-row"><h2 id="record-email-list-title">{view === "all" ? "Recorded emails" : "Emails needing attention"}</h2><a href={href} className="secondary-action compact-action">Refresh</a></div>
      {result.error ? <p className="form-message error" role="alert">Recorded emails could not be loaded. Refresh this page to try again.</p> : <>
        {result.count ? <p className="form-helper">Showing {(result.page - 1) * recordEmailPageSize + 1}–{(result.page - 1) * recordEmailPageSize + result.data.length} of {result.count.toLocaleString("en-US")} · Newest records first</p> : null}
        <Pages />
        {result.data.length ? <div className="communication-list">{result.data.map(item => {
          const uncertain = item.error_message === "provider_outcome_unknown";
          const status = uncertain && (!item.delivery_status || item.delivery_status === "pending") ? "Delivery outcome uncertain"
            : emailDeliveryLabel(item.delivery_status, item.status === "sent" ? "Accepted by email provider" : "Delivery attempt failed");
          const attention = uncertain || item.status === "failed" || ["delayed", "failed", "bounced", "complained", "suppressed"].includes(item.delivery_status ?? "");
          return <article className={`communication-row record-email-row status-${attention ? "failed" : "sent"}`} key={item.id}>
            <div><h3>{item.subject || "Email without a subject"}</h3><p>{item.recipient_email}</p>
              <p>{status} · {item.sent_at ? `Sent ${date(item.sent_at)}` : `Recorded ${date(item.created_at)}`}</p>
              {uncertain ? <p className="form-helper">Check the earlier attempt before considering another email.</p> : null}
              {item.outbound_delivery_id ? <Link href={`/admin/communications/delivery-review?id=${item.outbound_delivery_id}`}>Review this delivery</Link> : null}
              <details className="record-email-details"><summary>Delivery details</summary>
                {item.status === "sent" && !item.sent_at ? <p className="form-helper">Send date unavailable; the recorded date is shown.</p> : null}
                {!item.outbound_delivery_id ? <p className="form-helper">No linked delivery review is available for this entry.</p> : null}
                <dl className="record-details">
                <div><dt>Email type</dt><dd>{item.email_type.replaceAll("_", " ")}</dd></div>
                <div><dt>Recorded</dt><dd>{date(item.created_at)}</dd></div>
                {item.delivery_status_at ? <div><dt>Delivery status updated</dt><dd>{date(item.delivery_status_at)}</dd></div> : null}
                {item.provider_message_id ? <div><dt>Provider reference</dt><dd>{item.provider_message_id}</dd></div> : null}
              </dl></details>
            </div>
          </article>;
        })}</div> : <p className="inline-empty">{view === "all" ? "No emails have been recorded for this record yet." : "No recorded emails currently need attention."}</p>}
        <Pages />
      </>}
    </section>
    <p className="form-helper">Prepared or unresolved requests may not appear in recorded history yet. <Link href={recordEmailHistoryHref(scope, "requests")}>View this record’s delivery requests</Link> to check them. Opening or paging this history sends no email.</p>
  </>;
}
