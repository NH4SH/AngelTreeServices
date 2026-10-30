import Link from 'next/link';
import {getNextActionStaff,getOfficeHandoffPage,getSchedulingHandoffGaps,type OfficeHandoff} from '@/lib/data/next-actions';
import {FollowUpActions} from '@/components/recurring-forms';
import {HandoffFilters,HandoffControls,HandoffPreview,TrackSchedulingControl} from '@/components/office-handoff-controls';
import {handoffFilters,isManagedSchedulingTask} from '@/lib/handoff-views';
import {nextActionHref} from '@/lib/next-actions';
import {ListPagination} from '@/components/list-pagination';
import {PlatformFrame} from '@/components/PlatformFrame';
import {SetupRequired} from '@/components/SetupRequired';
import {getAuthenticatedPlatformContext} from '@/lib/auth/pageContext';
import {hasAllowedRole,platformRoleGroups} from '@/lib/auth/roles';
import {formatBusinessDateTime} from '@/lib/business-time';
import {getCommunicationDashboardSummary} from '@/lib/data/communications';
import {getUnpaidInvoices} from '@/lib/data/invoices';
import {getQuotesAwaitingResponse} from '@/lib/data/quotes';
import {getRecurringOperationsDashboard} from '@/lib/data/recurring';
export default async function FollowUpsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
 const context=await getAuthenticatedPlatformContext('/admin/follow-ups');
 if(!context.configured)return <SetupRequired title="Configure Supabase before opening follow-ups"/>;
 const canRead=hasAllowedRole(context.roles,platformRoleGroups.internalStaff),canViewFinancials=hasAllowedRole(context.roles,platformRoleGroups.financialReporting);
 if(!canRead)return <PlatformFrame active="follow-ups" roles={context.roles} userEmail={context.user.email}><p role="alert">Office access is required.</p></PlatformFrame>;
 const filters=handoffFilters(await searchParams);
 const [handoffs,staff,gaps,communications,quotes,invoices,recurring]=await Promise.all([
  getOfficeHandoffPage(filters,context.user.id),getNextActionStaff(),getSchedulingHandoffGaps(),getCommunicationDashboardSummary(),getQuotesAwaitingResponse(),getUnpaidInvoices(),loadRecurring(canViewFinancials)
 ]);
 const errors=[handoffs.error,gaps.error,communications.error,quotes.error,invoices.error,recurring.error].filter((message):message is string=>Boolean(message));
 const recommendations=recurring.recommendations.filter(item=>['recommended','pending_office_review','deferred'].includes(item.status));
 const opportunities=recurring.occurrences.filter(item=>['upcoming','review_needed','quote_draft','quote_sent','approved'].includes(item.status));
 return <PlatformFrame active="follow-ups" roles={context.roles} userEmail={context.user.email}><div className="shell app-content follow-ups-page">
  <section className="page-heading"><div><h1>Follow-ups</h1><p>A clear owner, a return time, and the next step on each record.</p></div><div className="page-heading-actions"><Link className="secondary-action" href="/admin/communications/delivery-review">Review email delivery</Link><Link className="primary-action" href="/admin/recurring?new_task=1">Add follow-up</Link></div></section>
  {Array.from(new Set(errors)).map(message=><p className="form-message error" role="alert" key={message}>{message}</p>)}
  <HandoffFilters key={context.user.id} filters={filters} userId={context.user.id} staff={staff}/>
  <section className="office-handoffs" aria-label="Office handoffs"><header className="handoff-list-heading"><h2>Next actions</h2><p>{handoffs.count} matching handoffs · earliest return first</p></header>
   {handoffs.data.map(task=><HandoffRow task={task} staff={staff} key={task.id}/>)}
   {!handoffs.data.length&&!handoffs.error?<p className="inline-empty">No handoffs match this view. Try all office handoffs or review approved work below.</p>:null}
   <ListPagination basePath="/admin/follow-ups" count={handoffs.count} page={handoffs.page} pageSize={25} params={{assigned:filters.assigned,kind:filters.kind,due:filters.due}}/>
   {handoffs.data.length?<HandoffPreview staff={staff}/>:null}
  </section>
  {gaps.data.length?<details className="detail-panel handoff-gaps"><summary>Approved work needing a handoff check</summary><p>These work orders have no open scheduling handoff. Track them individually after review; opening this page creates no tasks or messages. Showing up to ten, oldest approval first.</p>{gaps.data.map(job=><article className="handoff-gap-row" key={job.id}><div><Link href={`/admin/jobs/${job.id}#job-schedule`}>{job.party_label}</Link><p>Approved {formatBusinessDateTime(job.approved_at)}</p></div><TrackSchedulingControl jobId={job.id}/></article>)}</details>:null}
  <section className="shared-follow-up-queues" aria-label="Shared office queues"><h2>Shared office queues</h2><p className="form-helper">These bounded previews stay shared, regardless of the handoff filters above. Open each record to take action.</p>
   <details className="detail-panel"><summary>Communication failures · {communications.data.failed.length} in this preview</summary><p>Check saved provider evidence before retrying any uncertain send.</p><Link className="secondary-action" href="/admin/communications/delivery-review">Open delivery review</Link><div className="follow-up-rows">{communications.data.failed.map(item=><Link className="follow-up-row" key={item.id} href={item.invoice_id?`/admin/invoices/${item.invoice_id}`:item.quote_id?`/admin/quotes/${item.quote_id}`:item.job_id?`/admin/jobs/${item.job_id}`:'/admin/communications'}><span><strong>{item.communication_type.replaceAll('_',' ')}</strong><small>Open the record and review its email history.</small></span></Link>)}</div>{!communications.data.failed.length?<p>No failed messages in this preview.</p>:null}</details>
   <details className="detail-panel"><summary>Waiting on customers · {quotes.data.length+invoices.data.length} in this preview</summary><div className="follow-up-rows">{quotes.data.map(q=><Link className="follow-up-row" key={q.id} href={`/admin/quotes/${q.id}`}><span><strong>{q.quote_number||'Quote'}</strong><small>{q.organizations?.name??q.customers?.display_name??'Customer'}</small></span>{canViewFinancials?<b>{money(q.total_cents)}</b>:null}</Link>)}{invoices.data.map(i=><Link className="follow-up-row" key={i.id} href={`/admin/invoices/${i.id}`}><span><strong>{i.invoice_number||'Open invoice'}</strong><small>{i.organizations?.name??i.customers?.display_name??'Customer'}</small></span>{canViewFinancials?<b>{money(i.balance_due_cents)}</b>:null}</Link>)}</div>{!quotes.data.length&&!invoices.data.length?<p>No customer responses or payments in this preview.</p>:null}</details>
   <details className="detail-panel"><summary>Future and recurring work · {recommendations.length+opportunities.length} in this preview</summary><div className="follow-up-rows">{recommendations.slice(0,12).map(item=><Link className="follow-up-row" key={item.id} href={`/admin/recurring?recommendation_id=${item.id}`}><span><strong>{item.title}</strong><small>{item.organizations?.name??item.customers?.display_name??'Future work recommendation'}</small></span><b>{item.recommended_timeframe||'Review'}</b></Link>)}{opportunities.slice(0,12).map(item=><Link className="follow-up-row" key={item.id} href={`/admin/recurring/${item.recurring_plan_id}`}><span><strong>{item.recurring_service_plans?.plan_name??'Recurring service'}</strong><small>{item.service_locations?.label||item.service_locations?.street||'Service location'}</small></span><b>{formatBusinessDateTime(item.target_service_date,{month:'short',day:'numeric'})}</b></Link>)}</div><Link href="/admin/recurring">Manage recurring services</Link></details>
  </section>
 </div></PlatformFrame>;
}
function HandoffRow({task,staff}:{task:OfficeHandoff;staff:Awaited<ReturnType<typeof getNextActionStaff>>}) {
 const managed=isManagedSchedulingTask(task),due=Date.parse(task.next_action_at)<=Date.now();
 return <article className="office-handoff-row"><div className="handoff-row-main"><Link href={nextActionHref(task)}><h3>{task.title}</h3></Link><p>{task.party_label} · {task.task_type.replaceAll('_',' ')}</p>{task.description?<p className="form-helper">{task.description}</p>:null}<p><strong>{task.needs_owner?'Needs an owner':task.assigned_label}</strong> · {task.status.replaceAll('_',' ')}</p><p className={due?'is-overdue':''}>{due?'Due':'Returns'} {formatBusinessDateTime(task.next_action_at)} · Added {formatBusinessDateTime(task.created_at,{month:'short',day:'numeric'})}</p></div>
 <div className="handoff-row-controls"><label className="handoff-select"><input type="checkbox" name="task_id" value={task.id} form="office-handoff-preview" aria-label={`Include ${task.title} for ${task.party_label} in preview`}/>Include in preview</label><FollowUpActions taskId={task.id} status={task.status} managed={managed} schedulingHref={nextActionHref(task)}/><HandoffControls taskId={task.id} version={task.updated_at} assignee={task.assigned_to_user_id} needsOwner={task.needs_owner} snoozedUntil={task.snoozed_until} staff={staff}/></div></article>;
}
async function loadRecurring(financials:boolean){try{return await getRecurringOperationsDashboard(financials);}catch{return{recommendations:[],occurrences:[],error:'Recurring follow-ups could not load. Open Recurring to review.'};}}
function money(cents:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);}
