import Link from 'next/link';
import {PlatformFrame} from '@/components/PlatformFrame';
import {SetupRequired} from '@/components/SetupRequired';
import {getAuthenticatedPlatformContext} from '@/lib/auth/pageContext';
import {hasAllowedRole,platformRoleGroups} from '@/lib/auth/roles';
import {getSupervisedOperations} from '@/lib/data/operations';
import {calendarWorkerReadiness} from '@/lib/operations';
import {getGoogleCalendarConfiguration} from '@/lib/integrations/google-calendar/config';
import {formatBusinessDateTime} from '@/lib/business-time';
import {RenewalReview,CalendarRecoveryList} from '@/components/supervised-operations';
import {ListPagination} from '@/components/list-pagination';
export default async function OperationsPage({searchParams}:{searchParams:Promise<{page?:string}>}){
 const context=await getAuthenticatedPlatformContext('/admin/recurring/operations');
 if(!context.configured)return <SetupRequired title="Configure Supabase before opening operations"/>;
 if(!hasAllowedRole(context.roles,platformRoleGroups.internalStaff))return <PlatformFrame active="recurring" roles={context.roles} userEmail={context.user.email}><p role="alert">Office access is required.</p></PlatformFrame>;
 const canManage=hasAllowedRole(context.roles,platformRoleGroups.accessApproval),params=await searchParams,page=Math.min(10000,Math.max(1,Number.parseInt(params.page??'1',10)||1));
 const data=await getSupervisedOperations(page),config=getGoogleCalendarConfiguration(),ready=calendarWorkerReadiness(process.env,config.configured,Boolean(config.appBaseUrl));
 return <PlatformFrame active="recurring" roles={context.roles} userEmail={context.user.email}><div className="shell app-content operations-page">
  <Link className="back-link" href="/admin/recurring">Back to recurring services</Link><section className="page-heading"><div><h1>Recurring &amp; Calendar review</h1><p>Review upcoming work and recover calendar syncing, one decision at a time.</p></div><div className="page-heading-actions">{canManage?<a className="secondary-action" href="#calendar">Review Calendar syncing</a>:null}<Link className="secondary-action" href="/admin/follow-ups">Owned follow-ups</Link></div></section>
  {data.error?<p role="alert" className="form-message error">{data.error}</p>:<section><h2>Upcoming renewal reviews</h2><p>{data.count} new opportunities · up to 25 per page. Creating a review does not approve a price, create a quote, book work or send email.</p><p>Automatic renewal generation: <strong>{data.automatic===null?'Unavailable':data.automatic?'Enabled in existing settings':'Off'}</strong>. This screen does not change that setting.</p><RenewalReview candidates={data.candidates}/><ListPagination basePath="/admin/recurring/operations" count={data.count} page={data.page} pageSize={25} params={{}}/>
   <details className="handoff-edit"><summary>Recent approved reviews</summary>{data.runs.length?<ul>{data.runs.map((run,i)=><li key={run.created_at+i}>{formatBusinessDateTime(run.created_at)} · {run.created_count} created, {run.existing_count} already existed</li>)}</ul>:<p>No reviews have been approved from this screen.</p>}</details></section>}
  {canManage?<section id="calendar" className="operations-calendar"><h2>Calendar syncing</h2><p>Angel Tree remains the schedule of record. A queued retry mirrors current work through the existing worker.</p>
   <p><strong>{ready.ready?'Server configuration is ready':'Server configuration needs attention'}</strong>. Worker credentials {ready.worker?'ready':'need review'} · account connection setup {ready.oauth?'ready':'needs review'} · app address {ready.canonical?'ready':'needs review'}. Configuration readiness does not prove a worker is running.</p>
   <Link href="/employee/integrations/google-calendar">Review or reconnect my Google Calendar</Link>
   {data.calendarError?<p role="alert">{data.calendarError}</p>:data.calendar?<><dl className="operations-facts"><div><dt>Waiting</dt><dd>{(data.calendar.counts.pending??0)+(data.calendar.counts.retry??0)}</dd></div><div><dt>Processing</dt><dd>{data.calendar.counts.processing??0}</dd></div><div><dt>Needs review</dt><dd>{data.calendar.counts.exhausted??0}</dd></div><div><dt>Latest sync attempt</dt><dd>{time(data.calendar.last_attempt_at)}</dd></div><div><dt>Latest successful sync</dt><dd>{time(data.calendar.last_success_at)}</dd></div></dl>
    {data.calendar.reconnect_count?<p>{data.calendar.reconnect_count} account connections need attention. Each account owner must reconnect their own account; cleanup failures remain in their Calendar settings.</p>:null}
    <CalendarRecoveryList tasks={data.calendar.tasks} key={context.user.id}/></>:<p>Calendar status is unavailable. Refresh before retrying.</p>}
   <details className="handoff-edit"><summary>Other integration checks</summary><p>Use the existing recovery screens; no new sender or worker is enabled here.</p><div className="workflow-button-row"><Link href="/admin/communications/delivery-review">Email delivery review</Link><Link href="/admin/settings/system-health">System health and payment recovery</Link></div></details>
  </section>:<p>Owner and admin accounts manage Calendar recovery. Your recurring reviews and owned follow-ups remain available.</p>}
 </div></PlatformFrame>;
}
function time(value:string|null){return value?formatBusinessDateTime(value):'No attempt recorded';}
