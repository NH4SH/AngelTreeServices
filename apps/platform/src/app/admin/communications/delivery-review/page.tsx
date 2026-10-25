import { deliveryReviewScope, deliveryReviewHref, readDeliveryReview, readPendingSourceReview } from "@/lib/email/delivery-review-read";
import { SetupRequired } from "@/components/SetupRequired";
import { ListPagination } from "@/components/list-pagination";
import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole,platformRoleGroups } from "@/lib/auth/roles";
import { formatBusinessDateTime } from "@/lib/business-time";
import { emailDeliveryLabel } from "@/lib/email/delivery-labels";
import { OfficeNoticeControl,ReviewControls,LegacyReviewControl,SourceActivityControl } from "./ReviewControls";
export default async function DeliveryReviewPage({searchParams}:{searchParams:Promise<Record<string,unknown>>}) {
  const scope=deliveryReviewScope(await searchParams),context=await getAuthenticatedPlatformContext(deliveryReviewHref(scope));
  if(!context.configured)return <SetupRequired title="Configure Supabase before reviewing delivery"/>;
  const canRead=hasAllowedRole(context.roles,platformRoleGroups.internalStaff),canManage=hasAllowedRole(context.roles,platformRoleGroups.accessApproval);
  const result=canRead?await readDeliveryReview(context.supabase,scope):null;
  const data=result?.state==='ready'?result.data:null,rows=data?.deliveries??[],page=result?.page??scope.page;
  const showSources=canManage&&!!data&&!scope.id;
  const pendingSources=showSources?await readPendingSourceReview(context.supabase,scope.sourcePage):null;
  const sourceUnavailable=showSources&&!pendingSources,sourcePage=pendingSources?.page??scope.sourcePage;
  const href=deliveryReviewHref({...scope,page,sourcePage});
  const pages={all:scope.all?'1':undefined,id:scope.id??undefined,source_page:String(sourcePage)};
  return <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}><div className="shell app-content delivery-review-page">
    <Link href="/admin/communications">Back to Leads &amp; Communications</Link>
    <section className="page-heading"><div><h1>Delivery review</h1><p>Check what happened and repair CRM history without sending the same message twice.</p></div>{canRead?<a href={href} className="secondary-action">Refresh</a>:null}</section>
    {!canRead?<p className="form-message error" role="alert">This account cannot review email deliveries.</p>:result?.state==='invalid'?<p className="form-message error" role="alert">This delivery link is invalid. <Link href="/admin/communications/delivery-review">Open Delivery review</Link> to choose a saved request.</p>:result?.state==='missing'?<p className="form-message error" role="alert">This delivery request is not available. <Link href="/admin/communications/delivery-review">Open Delivery review</Link> to choose an existing request.</p>:!data?<p className="form-message error" role="alert">Delivery records could not be loaded. Refresh before taking action.</p>:<>
      <nav className="filter-pills" aria-label="Delivery view"><Link aria-current={!scope.id&&!scope.all?'page':undefined} className={!scope.id&&!scope.all?'active':''} href="/admin/communications/delivery-review">Needs review</Link><Link aria-current={!scope.id&&scope.all?'page':undefined} className={!scope.id&&scope.all?'active':''} href="/admin/communications/delivery-review?all=1">Recent deliveries</Link></nav>
      {scope.id?<p className="form-helper">Showing the selected delivery only. Open either queue above to review other requests.</p>:null}
      <p className="form-helper">Accepted means the provider took the request. Delivery reported means a receiving mail server accepted it; it does not prove someone read it. Uncertain requests are held for review.</p>
      {!rows.length?<p className="inline-empty">No deliveries in this view. New sends appear here automatically; no email is sent by opening this page.</p>:<div className="record-list">{rows.map(row=>{
        const href=row.quote_id?`/admin/quotes/${row.quote_id}`:row.invoice_id?`/admin/invoices/${row.invoice_id}`:row.change_order_id?`/admin/change-orders/${row.change_order_id}`:row.job_id?`/admin/jobs/${row.job_id}`:null;
        const canRetry=!['replaced_before_dispatch','replaced_after_definite_rejection'].includes(row.problem_code??'')&&row.retry_window_open&&row.attempt_count<3&&['prepared','rejected','not_attempted','unknown','dispatching','cancelled'].includes(row.state)&&(!row.lease_expires_at||Date.parse(row.lease_expires_at)<=Date.now());
        const canCopy=row.state==='accepted'&&['accepted','delayed','delivered'].includes(row.delivery_status)&&(canManage||['quote','invoice','change_order'].includes(row.kind));
        return <article className="record-card" key={row.id}><div className="record-card-header"><div><h2>{row.subject}</h2><p>{row.recipient} · {formatBusinessDateTime(new Date(row.created_at),{dateStyle:'medium',timeStyle:'short'})}</p></div><span className="status-pill">{emailDeliveryLabel(row.delivery_status==='pending'?null:row.delivery_status,row.state==='unknown'||row.state==='dispatching'?'Delivery uncertain':row.state==='accepted'?'Accepted by email provider':row.state==='prepared'&&row.attempt_count>0?'Prepared for another attempt':'Not sent')}</span></div>
          <p>{row.followup_sync_pending?'Provider acceptance and CRM history are saved. Reminder preparation still needs review; repairing it does not send email.':row.repair_state==='source_changed'?'The record changed after this email was prepared. Its current details were preserved. Review the record before composing a current message.':row.state==='accepted'&&row.repair_state!=='complete'?'Provider acceptance is saved. CRM history still needs review; repairing it will not send another email.':row.state==='unknown'||row.state==='dispatching'?'The provider outcome is uncertain. Check evidence before authorizing another attempt.':row.repair_state==='complete'?'CRM history is reconciled.':row.state==='prepared'?(row.attempt_count===0?'The saved message has not been dispatched.':'An earlier attempt is recorded. Review it before considering another email.'):'Review the saved delivery before trying again.'}</p>
          {row.provider_message_id?<p className="form-helper">Provider reference: {row.provider_message_id}</p>:null}
          {href?<p><Link href={href}>Open record</Link></p>:null}
          <ReviewControls id={row.id} recipient={row.recipient} providerReference={row.provider_message_id} canManage={canManage} canRetry={canRetry} canCopy={canCopy} canRepair={row.state==='accepted'}/>
        </article>;
      })}</div>}
      <ListPagination basePath="/admin/communications/delivery-review" count={data?.total??0} page={page} pageSize={50} params={pages}/>
      {sourceUnavailable?<p className="form-message error" role="alert">Missing alerts could not be loaded. Refresh before taking action.</p>:null}
      {!sourceUnavailable&&pendingSources&&pendingSources.total>0?<details className="detail-panel" id="missing-customer-alerts"><summary>Customer activity awaiting alerts ({pendingSources.total})</summary>
        <p>The customer’s change is saved. Prepare its office alerts and saved emails here without sending email.</p>
        {pendingSources.events.map((event:{id:string;title:string;destination_path:string;created_at:string;preparation_problem:string|null})=><article className="record-row" key={event.id}>
          <strong>{event.title}</strong><p>{formatBusinessDateTime(new Date(event.created_at),{dateStyle:"medium",timeStyle:"short"})}</p>
          <Link href={event.destination_path}>Open record</Link>
          {event.preparation_problem?<p className="form-helper">Earlier activity needs manual review. No new email has been prepared.</p>:<SourceActivityControl sourceId={event.id}/>}
        </article>)}
        <ListPagination basePath="/admin/communications/delivery-review" count={pendingSources.total} page={sourcePage} pageSize={20} pageParam="source_page" params={{all:scope.all?'1':undefined,page:String(page)}}/>
      </details>:null}
      {data.pending_office_notices===null?<p className="form-message error" role="alert">Office notice records could not be loaded. Refresh before preparing notices.</p>:null}
      {data?.pending_office_notices?.length?<details className="detail-panel"><summary>Office notices not prepared</summary><p>Saved requests remain available. Preparing notices contacts the office, never the customer. Older requests without an original saved submission require manual review.</p>{data.pending_office_notices.map((row:{id:string;name:string;recoverable:boolean})=><div className="record-row" key={row.id}><Link href={`/admin/jobs/${row.id}`}>{row.name}</Link>{row.recoverable&&canManage?<OfficeNoticeControl jobId={row.id}/>:null}</div>)}</details>:null}
      {data.legacy_attempts===null?<p className="form-message error" role="alert">Earlier email receipts could not be loaded. Refresh before reviewing them.</p>:null}
      {data?.legacy_attempts?.length?<details className="detail-panel"><summary>Earlier uncertain email attempts</summary><p>These attempts predate saved message versions. A provider check can repair their receipts; it will not guess their content, mark newer documents sent or resend them.</p>{data.legacy_attempts.map((row:{id:string;subject:string;recipient:string;provider_message_id:string|null;quote_id:string|null;invoice_id:string|null})=><article className="record-row" key={row.id}><strong>{row.subject}</strong><p>{row.recipient}</p>{row.quote_id||row.invoice_id?<Link href={row.invoice_id?`/admin/invoices/${row.invoice_id}`:`/admin/quotes/${row.quote_id}`}>Open record</Link>:null}{canManage?<LegacyReviewControl eventId={row.id} reference={row.provider_message_id}/>:null}</article>)}</details>:null}
      {data.unmatched_events===null?<p className="form-message error" role="alert">Provider receipt counts could not be checked. Refresh to try again.</p>:null}
      {data?.unmatched_events?<p className="form-helper">Some provider receipts could not be linked safely. They were retained without changing a customer record or sending email.</p>:null}
    </>}
  </div></PlatformFrame>;
}
