import Link from "next/link";
import type { ReactNode } from "react";
import { formatBusinessDateTime } from "@/lib/business-time";
import { communicationQueuePageSize, type CommunicationQueuePage } from "@/lib/communications/queue-page";
import type { CustomerCommunication } from "@/lib/types/database";

export function CommunicationQueueSection({ title, icon, result, empty, anchor, pageParam, params, wide = false }: {
  title: string; icon: ReactNode; result: CommunicationQueuePage; empty: string; anchor: string;
  pageParam: string; params: Record<string, string | undefined>; wide?: boolean;
}) {
  const total = result.count;
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / communicationQueuePageSize));
  function href(page: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    query.set(pageParam, String(page));
    return `/admin/communications?${query}#${anchor}`;
  }
  function Pages() {
    if (result.error || totalPages <= 1) return null;
    return <nav className="list-pagination" aria-label={`${title} pages`}>
      {result.page > 1 ? <Link href={href(result.page - 1)}>Previous</Link> : <span aria-disabled="true" className="pagination-disabled">Previous</span>}
      <span className="pagination-position">Page {result.page} of {totalPages}</span>
      {result.page < totalPages ? <Link href={href(result.page + 1)}>Next</Link> : <span aria-disabled="true" className="pagination-disabled">Next</span>}
    </nav>;
  }
  return <article className={`detail-panel communication-queue-panel${wide ? " wide-detail-panel" : ""}`} id={anchor} aria-labelledby={`${anchor}-title`}>
    <h2 className="panel-title" id={`${anchor}-title`}>{icon}{title}</h2>
    {result.error ? <p className="form-message error" role="alert">{title} could not be loaded. Refresh this page to try again.</p> : <>
      {total ? <p className="inline-empty">Showing {(result.page - 1) * communicationQueuePageSize + 1}–{(result.page - 1) * communicationQueuePageSize + result.data.length} of {total.toLocaleString("en-US")}{pageParam === "reminder_page" ? " · Next due first" : " · Newest first"}</p> : null}
      <Pages />
      {result.data.length ? <div className="communication-list">{result.data.map(item => <Link className={`communication-row status-${item.status}`} href={recordHref(item)} key={item.id}>
        <div>
          <strong>{item.communication_type.replaceAll("_", " ")}</strong>
          <span>{item.status} - {formatBusinessDateTime(new Date(item.sent_at ?? item.scheduled_for), { dateStyle: "medium", timeStyle: "short" })}</span>
          <small>{item.recipient_email}</small>
          {item.skip_reason || item.last_error ? <small>{item.skip_reason || item.last_error}</small> : null}
        </div>
      </Link>)}</div> : <p className="inline-empty">{empty}</p>}
      <Pages />
    </>}
  </article>;
}

function recordHref(item: CustomerCommunication) {
  if (item.quote_id) return `/admin/quotes/${item.quote_id}`;
  if (item.invoice_id) return `/admin/invoices/${item.invoice_id}`;
  if (item.schedule_event_id) return `/admin/schedule?event=${item.schedule_event_id}`;
  if (item.appointment_id) return `/admin/schedule?appointment=${item.appointment_id}`;
  if (item.job_id) return `/admin/jobs/${item.job_id}`;
  return item.organization_id ? `/admin/organizations/${item.organization_id}` : `/admin/customers/${item.customer_id}`;
}
