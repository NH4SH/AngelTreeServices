import {callDeliveryCommand} from "@/lib/email/delivery-commands";
import { SetupRequired } from "@/components/SetupRequired";
import { ListPagination } from "@/components/list-pagination";
import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole,platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { formatBusinessDateTime } from "@/lib/business-time";
import { emailDeliveryLabel } from "@/lib/email/delivery-labels";
import { OfficeNoticeControl,ReviewControls,LegacyReviewControl,SourceActivityControl } from "./ReviewControls";
type Row={id:string;kind:string;recipient:string;subject:string;state:string;delivery_status:string;provider_message_id:string|null;attempt_count:number;first_dispatched_at:string|null;lease_expires_at:string|null;repair_state:string;problem_code:string|null;created_at:string;retry_window_open:boolean;followup_sync_pending:boolean;quote_id:string|null;invoice_id:string|null;change_order_id:string|null;job_id:string|null};
export default async function DeliveryReviewPage({searchParams}:{searchParams:Promise<{all?:string;id?:string;page?:string;source_page?:string}>}) {
  const params=await searchParams,context=await getAuthenticatedPlatformContext('/admin/communications/delivery-review');
  if(!context.configured)return <SetupRequired title="Configure Supabase before reviewing delivery"/>;
  const canRead=hasAllowedRole(context.roles,platformRoleGroups.internalStaff),canManage=hasAllowedRole(context.roles,platformRoleGroups.accessApproval);
  const page=params.id?1:Math.max(1,Math.min(10000,Number(params.page)||1));
  const db=await createClient();const result=canRead&&db?await callDeliveryCommand(db,'list_outbound_deliveries',{p_all:params.all==='1',p_page:page,p_id:/^[a-f0-9-]{36}$/i.test(params.id??'')?params.id:null}):null;
  const sourcePage=Math.max(1,Math.min(10000,Number(params.source_page)||1));
  const sourceResult=canManage&&db?await callDeliveryCommand(db,"list_pending_customer_source_events",{p_page:sourcePage}):null;
  const pendingSources=sourceResult?.data as {total:number;events:{id:string;title:string;destination_path:string;created_at:string;preparation_problem:string|null}[]}|null|undefined;
  const sourceUnavailable=canManage&&(sourceResult?.error||!pendingSources||!Number.isSafeInteger(pendingSources.total)||pendingSources.total<0||!Array.isArray(pendingSources.events));
  const data=result?.data,rows=(data?.deliveries??[]) as Row[];
  return <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}><div className="shell app-content delivery-review-page">
    <Link href="/admin/communications">Back to Leads &amp; Communications</Link>
    <section className="page-heading"><div><h1>Delivery review</h1><p>Check what happened and repair CRM history without sending the same message twice.</p></div></section>
    {!canRead?<p className="form-message error" role="alert">This account cannot review email deliveries.</p>:result?.error?<p className="form-message error" role="alert">Delivery records could not be loaded. Refresh before taking action.</p>:<>
      <nav className="filter-pills" aria-label="Delivery view"><Link className={params.all!=='1'?'active':''} href="/admin/communications/delivery-review">Needs review</Link><Link className={params.all==='1'?'active':''} href="/admin/communications/delivery-review?all=1">Recent deliveries</Link></nav>
      <p className="form-helper">Accepted means the provider took the request. Delivery reported means a receiving mail server accepted it; it does not prove someone read it. Uncertain requests are held for review.</p>
      {!rows.length?<p className="inline-empty">No deliveries in this view. New sends appear here automatically; no email is sent by opening this page.</p>:<div className="record-list">{rows.map(row=>{
        const href=row.quote_id?`/admin/quotes/${row.quote_id}`:row.invoice_id?`/admin/invoices/${row.invoice_id}`:row.change_order_id?`/admin/change-orders/${row.change_order_id}`:row.job_id?`/admin/jobs/${row.job_id}`:null;
        const canRetry=!['replaced_before_dispatch','replaced_after_definite_rejection'].includes(row.problem_code??'')&&row.retry_window_open&&row.attempt_count<3&&['prepared','rejected','not_attempted','unknown','dispatching','cancelled'].includes(row.state)&&(!row.lease_expires_at||Date.parse(row.lease_expires_at)<=Date.now());
        const canCopy=row.state==='accepted'&&['accepted','delayed','delivered'].includes(row.delivery_status)&&(canManage||['quote','invoice','change_order'].includes(row.kind));
        return <article className="record-card" key={row.id}><div className="record-card-header"><div><h2>{row.subject}</h2><p>{row.recipient} · {formatBusinessDateTime(new Date(row.created_at),{dateStyle:'medium',timeStyle:'short'})}</p></div><span className="status-pill">{emailDeliveryLabel(row.delivery_status==='pending'?null:row.delivery_status,row.state==='unknown'||row.state==='dispatching'?'Delivery uncertain':'Not sent')}</span></div>
          <p>{row.followup_sync_pending?'Provider acceptance and CRM history are saved. Reminder preparation still needs review; repairing it does not send email.':row.repair_state==='source_changed'?'The record changed after this email was prepared. Its current details were preserved. Review the record before composing a current message.':row.state==='accepted'&&row.repair_state!=='complete'?'Provider acceptance is saved. CRM history still needs review; repairing it will not send another email.':row.state==='unknown'||row.state==='dispatching'?'The provider outcome is uncertain. Check evidence before authorizing another attempt.':row.repair_state==='complete'?'CRM history is reconciled.':row.state==='prepared'?'The saved message has not been dispatched.':'Review the saved delivery before trying again.'}</p>
          {row.provider_message_id?<p className="form-helper">Provider reference: {row.provider_message_id}</p>:null}
          {href?<p><Link href={href}>Open record</Link></p>:null}
          <ReviewControls id={row.id} recipient={row.recipient} providerReference={row.provider_message_id} canManage={canManage} canRetry={canRetry} canCopy={canCopy} canRepair={row.state==='accepted'}/>
        </article>;
      })}</div>}
      <ListPagination basePath="/admin/communications/delivery-review" count={data?.total??0} page={page} pageSize={50} params={{all:params.all,id:params.id,source_page:params.source_page}}/>
      {sourceUnavailable?<p className="form-message error" role="alert">Missing alerts could not be loaded. Refresh before taking action.</p>:null}
      {!sourceUnavailable&&pendingSources&&pendingSources.total>0?<details className="detail-panel" id="missing-customer-alerts"><summary>Customer activity awaiting alerts ({pendingSources.total})</summary>
        <p>The customer’s change is saved. Prepare its office alerts and saved emails here without sending email.</p>
        {pendingSources.events.map((event:{id:string;title:string;destination_path:string;created_at:string;preparation_problem:string|null})=><article className="record-row" key={event.id}>
          <strong>{event.title}</strong><p>{formatBusinessDateTime(new Date(event.created_at),{dateStyle:"medium",timeStyle:"short"})}</p>
          <Link href={event.destination_path}>Open record</Link>
          {event.preparation_problem?<p className="form-helper">Earlier activity needs manual review. No new email has been prepared.</p>:<SourceActivityControl sourceId={event.id}/>}
        </article>)}
        <ListPagination basePath="/admin/communications/delivery-review" count={pendingSources.total} page={sourcePage} pageSize={20} pageParam="source_page" params={{all:params.all,id:params.id,page:String(page)}}/>
      </details>:null}
      {data?.pending_office_notices?.length?<details className="detail-panel"><summary>Office notices not prepared</summary><p>Saved requests remain available. Preparing notices contacts the office, never the customer. Older requests without an original saved submission require manual review.</p>{data.pending_office_notices.map((row:{id:string;name:string;recoverable:boolean})=><div className="record-row" key={row.id}><Link href={`/admin/jobs/${row.id}`}>{row.name}</Link>{row.recoverable&&canManage?<OfficeNoticeControl jobId={row.id}/>:null}</div>)}</details>:null}
      {data?.legacy_attempts?.length?<details className="detail-panel"><summary>Earlier uncertain email attempts</summary><p>These attempts predate saved message versions. A provider check can repair their receipts; it will not guess their content, mark newer documents sent or resend them.</p>{data.legacy_attempts.map((row:{id:string;subject:string;recipient:string;provider_message_id:string|null;quote_id:string|null;invoice_id:string|null})=><article className="record-row" key={row.id}><strong>{row.subject}</strong><p>{row.recipient}</p>{row.quote_id||row.invoice_id?<Link href={row.invoice_id?`/admin/invoices/${row.invoice_id}`:`/admin/quotes/${row.quote_id}`}>Open record</Link>:null}{canManage?<LegacyReviewControl eventId={row.id} reference={row.provider_message_id}/>:null}</article>)}</details>:null}
      {data?.unmatched_events?<p className="form-helper">Some provider receipts could not be linked safely. They were retained without changing a customer record or sending email.</p>:null}
    </>}
  </div></PlatformFrame>;
}
