import { websiteLeadNoticeLabel } from "@/lib/leads/notice-status";
import { formatBusinessDateTime } from "@/lib/business-time";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, Check, Globe2, MailCheck, MessageSquareMore, Settings2 } from "lucide-react";
import { CommunicationSettingsForm, RunCommunicationWorkerForm } from "@/components/communication-settings-form";
import { EmailHistoryList } from "@/components/email-history";
import { ListPagination } from "@/components/list-pagination";
import { ListSearch } from "@/components/list-search";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import {
  getCommunicationSettings,
  getWebsiteLeadInbox,
  type WebsiteLeadInboxItem,
} from "@/lib/data/communications";
import { getCommunicationQueuePage } from "@/lib/data/communication-queue";
import { getEmailEvents } from "@/lib/data/email-events";
import { CommunicationQueueSection } from "@/components/communication-queue-section";
import { LeadLifecycleActions } from "./LeadLifecycleActions";
import { SenderBlockControls } from "./SenderBlockControls";
import { getSenderBlockData, type SenderBlockData, type SenderControls } from "@/lib/leads/sender-blocks";

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ lead_view?: string; page?: string; q?: string; block_page?: string; block_history?: string; reminder_page?: string; failed_page?: string; history_page?: string }> }) {
  const params = await searchParams;
  const page = positivePage(params.page);
  const leadView = params.lead_view === "spam" || params.lead_view === "archived" ? params.lead_view : "active";
  const context = await getAuthenticatedPlatformContext("/admin/communications");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening communications" />;

  const [settings, pendingCommunications, failedCommunications, recentCommunications, websiteLeads, emailEvents] = await Promise.all([
    getCommunicationSettings(),
    getCommunicationQueuePage("scheduled", params.reminder_page),
    getCommunicationQueuePage("failed", params.failed_page),
    getCommunicationQueuePage("history", params.history_page),
    getWebsiteLeadInbox({ disposition: leadView, limit: 24, page, query: params.q }),
    getEmailEvents({ types: ["quote", "invoice", "change_order"], limit: 30 }),
  ]);
  const canManageSettings = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const canDeleteLeads = context.roles.includes("owner");
  const blockPage = Math.min(10000, positivePage(params.block_page));
  const blockHistory = params.block_history === "1";
  const senderBlocks = canManageSettings && leadView === "spam" ? await getSenderBlockData(websiteLeads.data.map(lead => lead.jobId), blockPage, blockHistory) : null;
  const queueParams = { ...params, reminder_page: String(pendingCommunications.page), failed_page: String(failedCommunications.page), history_page: String(recentCommunications.page) };
  const acceptedEmailCount = emailEvents.data.filter((item) => item.status === "sent").length;
  const failedEmailCount = emailEvents.data.filter((item) => item.status === "failed").length;
  const leadViewLabel = leadView === "active" ? "Active leads" : leadView === "spam" ? "Spam leads" : "Archived leads";

  return (
    <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content communication-page">
        <section className="page-heading">
          <div>
            <p className="surface-label"><MessageSquareMore aria-hidden="true" size={18} />Office inbox</p>
            <h1>Leads &amp; Communications</h1>
            <p>Move new requests into estimates, callbacks, quotes, and reliable customer communication.</p>
          </div>
          {canManageSettings ? <RunCommunicationWorkerForm /> : null}
        </section>

        <nav className="local-workflow-tabs" aria-label="Lead and communication sections">
          <a href="#inbox"><MessageSquareMore size={16} />Inbox</a>
          <a href="#website-leads"><Globe2 size={16} />Website leads</a>
          <Link href="/admin/schedule?event_type=estimate"><CalendarClock size={16} />Estimate appointments</Link>
          <Link href="/admin/communications/delivery-review">Delivery review</Link>
          <a href="#history"><MailCheck size={16} />Communication history</a>
        </nav>

        {settings.error ? <Warning message={settings.error} /> : null}
        {websiteLeads.error ? <Warning message={websiteLeads.error} /> : null}
        {emailEvents.error ? <Warning message={`Email delivery history: ${emailEvents.error}`} /> : null}

        <dl aria-label="Communication summary" className="communication-summary-strip">
          <Metric icon={<Globe2 size={19} />} label={leadViewLabel} value={websiteLeads.count} />
          <Metric icon={<CalendarClock size={19} />} label="Pending messages" value={pendingCommunications.count ?? "Unavailable"} />
          <Metric icon={<AlertTriangle size={19} />} label="Failed reminders" value={failedCommunications.count ?? "Unavailable"} />
          <Metric icon={<MailCheck size={19} />} label="Recent accepted" value={emailEvents.error ? "Unavailable" : acceptedEmailCount} />
        </dl>

        <section className="website-lead-workspace" id="website-leads">
          <div className="panel-heading-row">
            <div>
              <h2 className="panel-title"><Globe2 size={18} />Website lead inbox</h2>
              <p>Website requests stay here until staff schedule an estimate, prepare a quote, archive them, or mark them as spam.</p>
            </div>
            {canManageSettings ? <Link className="secondary-action compact-action" href="/admin/communications/lead-intake">Lead intake diagnostics</Link> : null}
          </div>
          <ListSearch initialValue={params.q} label="Search website leads" placeholder="Search lead name, phone, email, address, service, status, or crew" />
          <nav className="filter-pills lead-view-filters" aria-label="Website lead view">
            <LeadViewLink current={leadView === "active"} href={leadViewHref("active", params.q)} label="Active" />
            <LeadViewLink current={leadView === "spam"} href={leadViewHref("spam", params.q)} label="Spam" />
            <LeadViewLink current={leadView === "archived"} href={leadViewHref("archived", params.q)} label="Archived" />
          </nav>
          {leadView === "spam" ? <p className="muted">Marking a lead as spam hides this request. Use Block sender to stop future matching requests. Restoring a lead does not remove sender blocks.</p> : null}
          {senderBlocks?.error ? <Warning message={senderBlocks.error} /> : null}
          <WebsiteLeadRows canDelete={canDeleteLeads} canManage={canManageSettings} rows={websiteLeads.data} senderControls={senderBlocks?.controls ?? []} />
          <ListPagination basePath="/admin/communications" count={websiteLeads.count} page={page} pageSize={24} params={queueParams} />
          {senderBlocks && !senderBlocks.error ? <SenderBlockRegister data={senderBlocks} page={blockPage} leadPage={page} query={params.q} history={blockHistory} expanded={Boolean(params.block_page)} /> : null}
        </section>

        <section className="detail-grid communication-page-grid" id="inbox">
          <CommunicationQueueSection title="Scheduled reminders" icon={<CalendarClock size={18} />} result={pendingCommunications} empty="No reminders are currently scheduled." anchor="scheduled-reminders" pageParam="reminder_page" params={queueParams} wide />
          <CommunicationQueueSection title="Failed communications" icon={<AlertTriangle size={18} />} result={failedCommunications} empty="No failed communications." anchor="failed-reminders" pageParam="failed_page" params={queueParams} />
          <CommunicationQueueSection title="Recent history" icon={<MailCheck size={18} />} result={recentCommunications} empty="No communication history yet." anchor="reminder-history" pageParam="history_page" params={queueParams} />
          <article className="detail-panel wide-detail-panel" id="history">
            <h2 className="panel-title"><MailCheck size={18} />Quote and invoice email delivery</h2>
            <p className="inline-empty">Provider accepted means Resend accepted the message for delivery. It does not prove the recipient opened it or that every receiving mail server placed it in the inbox.</p>
            {!emailEvents.error ? <p className="inline-empty">Latest email records: {acceptedEmailCount} accepted, {failedEmailCount} failed.</p> : null}
            <EmailHistoryList events={emailEvents.data} />
          </article>
        </section>

        {canManageSettings && settings.data ? (
          <section className="form-panel communication-settings-panel">
            <h2><Settings2 aria-hidden="true" size={19} />Communication defaults</h2>
            <p>The master switch starts disabled after migration. Enable it only after a test customer, portal links, and Netlify worker environment are verified.</p>
            <CommunicationSettingsForm settings={settings.data} />
          </section>
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function LeadViewLink({ current, href, label }: { current: boolean; href: string; label: string }) {
  return <Link aria-current={current ? "page" : undefined} href={href}>{current ? <Check aria-hidden="true" size={15} /> : null}{label}</Link>;
}

function positivePage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function leadViewHref(view: "active" | "spam" | "archived", query?: string) {
  const params = new URLSearchParams();
  if (view !== "active") params.set("lead_view", view);
  if (query?.trim()) params.set("q", query.trim());
  const search = params.toString();
  return `/admin/communications${search ? `?${search}` : ""}#website-leads`;
}

function WebsiteLeadRows({ canDelete, canManage, rows, senderControls }: { canDelete: boolean; canManage: boolean; rows: WebsiteLeadInboxItem[]; senderControls: SenderControls[] }) {
  if (!rows.length) return <p className="inline-empty">No leads in this view.</p>;

  return (
    <div className="record-list website-lead-list">
      {rows.map((lead) => (
        <article className="record-card" key={lead.jobId}>
          <div className="record-card-header">
            <div>
              <h2>{lead.customerName}</h2>
              <p>{lead.sourceBadge} · {formatDateTime(lead.submittedAt)}</p>
            </div>
            <div className="lead-status-stack">
              {lead.leadDisposition !== "active" ? <span className={`status-pill lead-${lead.leadDisposition}`}>{lead.leadDisposition}</span> : null}
              <span className="status-pill">{lead.currentStatus.replaceAll("_", " ")}</span>
            </div>
          </div>
          <dl className="record-details website-lead-details">
            <Detail label="Phone" value={lead.phone ?? "Not provided"} />
            <Detail label="Email" value={lead.email ?? "Not provided"} />
            <Detail emphasis label="Preferred contact" value={formatPreferredContactMethod(lead.preferredContactMethod)} />
            <Detail label="Service" value={lead.serviceRequested ?? "Not selected"} />
            <Detail label="Address" value={lead.address || "Needs confirmation"} />
            <Detail label="Assigned" value={lead.assignedStaff ?? "Unassigned"} />
            <Detail label="Last communication" value={lead.lastCommunication ?? "No staff communication yet"} />
            <Detail emphasis label="Next action" value={lead.leadDisposition === "spam" ? "Review sender block or restore lead" : lead.nextAction ?? "Review lead"} />
            <Detail label="Office notification" value={lead.leadDisposition === "spam" && lead.notificationStatus === "pending" ? "Paused while marked as spam" : websiteLeadNoticeLabel(lead.notificationOutcome, lead.notificationStatus)} />
            <div className="website-lead-project-details">
              <dt>Project details</dt>
              <dd>{lead.projectDetails ?? "No project details provided."}</dd>
            </div>
          </dl>
          {lead.duplicateOfJobId ? <p className="data-warning">Possible duplicate of lead {lead.duplicateOfJobId}.</p> : null}
          {lead.linkedQuote ? <p className="inline-empty">Quote created · <Link href={`/admin/quotes/${lead.linkedQuote.id}`}>{lead.linkedQuote.label}</Link></p> : null}
          <div className="record-actions">
            <Link href={`/admin/jobs/${lead.jobId}`}>Open lead</Link>
            {lead.leadDisposition !== "spam" && lead.phone ? <a href={`tel:${lead.phone}`}>Call</a> : null}
            {lead.leadDisposition !== "spam" && lead.email ? <a href={`mailto:${lead.email}`}>Email</a> : null}
            {canManage && lead.leadDisposition === "active" && ["new_lead", "estimate_scheduled"].includes(lead.currentStatus)
              ? <Link href={`/admin/schedule?new=1&lead=${lead.jobId}`}>{lead.currentStatus === "estimate_scheduled" ? "Review estimate schedule" : "Schedule estimate"}</Link>
              : null}
            {lead.leadDisposition === "active" ? <Link href={`/admin/quotes?new=1&job_id=${lead.jobId}`}>Create quote</Link> : null}
          </div>
          {canManage ? <LeadLifecycleActions canDelete={canDelete} disposition={lead.leadDisposition} jobId={lead.jobId} label={lead.customerName} /> : null}
          {canManage && lead.leadDisposition === "spam" ? <div className="sender-block-action">{senderControls.find(s => s.jobId === lead.jobId)
            ? <SenderBlockControls sender={senderControls.find(s => s.jobId === lead.jobId)!} />
            : <p className="muted">Refresh to load sender blocking controls.</p>}</div> : null}
        </article>
      ))}
    </div>
  );
}

function SenderBlockRegister({ data, page, leadPage, query, history, expanded }: { data: SenderBlockData; page: number; leadPage: number; query?: string; history: boolean; expanded: boolean }) {
  return <details className="sender-block-register" id="sender-blocks" open={expanded || history || page > 1 || undefined}>
    <summary>Blocked senders <span>{data.activeCount} active</span></summary>
    <p>Exact email or phone matches only. Removing one block leaves other matches active. Existing customer accounts, quotes and invoices stay unchanged.</p>
    <nav className="filter-pills lead-view-filters" aria-label="Sender block view"><LeadViewLink current={!history} href={blockPageHref(1, leadPage, query, false)} label="Active blocks" /><LeadViewLink current={history} href={blockPageHref(1, leadPage, query, true)} label="All blocks and history" /></nav>
    {!data.rows.length ? <p className="inline-empty">{history ? "No sender block history yet." : "No active sender blocks. Mark a lead as spam, then choose Block sender."}</p> : <ul className="sender-block-list">
      {data.rows.map(block => <li key={block.id}>
        <div className="sender-block-row"><div><strong className="sender-block-identity">{block.value}</strong><p>{block.kind === "email" ? "Email" : "Phone"} · {block.unblocked_at ? "Unblocked" : "Blocked"} · {block.blocked_requests} blocked requests</p></div>
          {!block.unblocked_at ? <SenderBlockControls block={block} /> : null}</div>
        <p>{block.reason}</p><p className="muted">Blocked {formatDateTime(block.created_at)} · <Link href={`/admin/jobs/${block.source_job_id}`}>Original lead</Link></p>
        {block.unblocked_at ? <p className="muted">Unblocked {formatDateTime(block.unblocked_at)} · {block.unblock_reason}</p> : null}
      </li>)}
    </ul>}
    {data.count > 25 ? <nav aria-label="Sender block pages" className="record-actions">
      {page > 1 ? <Link href={blockPageHref(page - 1, leadPage, query, history)}>Previous blocks</Link> : null}
      <span>Page {page} of {Math.ceil(data.count / 25)}</span>
      {page * 25 < data.count ? <Link href={blockPageHref(page + 1, leadPage, query, history)}>Next blocks</Link> : null}
    </nav> : null}
  </details>;
}

function blockPageHref(page: number, leadPage: number, query: string | undefined, history: boolean) {
  const params = new URLSearchParams({ lead_view: "spam", block_page: String(page), page: String(leadPage) });
  if (query) params.set("q", query);
  if (history) params.set("block_history", "1");
  return `/admin/communications?${params}#sender-blocks`;
}

function Detail({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return <div className={emphasis ? "website-lead-emphasis" : undefined}><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatPreferredContactMethod(value: string | null) {
  switch (value) {
    case "phone":
      return "Phone call";
    case "text":
      return "Text message";
    case "email":
      return "Email";
    case "other":
      return "Other";
    default:
      return "No preference provided";
  }
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return <div><dt><span aria-hidden="true">{icon}</span>{label}</dt><dd>{value}</dd></div>;
}

function Warning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function formatDateTime(value: string) {
  return formatBusinessDateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
}
