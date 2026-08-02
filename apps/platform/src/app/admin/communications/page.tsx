import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, Globe2, MailCheck, MessageSquareMore, PhoneCall, Settings2 } from "lucide-react";
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
  getCustomerCommunications,
  getWebsiteLeadInbox,
  type WebsiteLeadInboxItem,
} from "@/lib/data/communications";
import { getEmailEvents } from "@/lib/data/email-events";
import type { CustomerCommunication } from "@/lib/types/database";
import { LeadLifecycleActions } from "./LeadLifecycleActions";

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ lead_view?: string; page?: string; q?: string }> }) {
  const params = await searchParams;
  const page = positivePage(params.page);
  const leadView = params.lead_view === "spam" || params.lead_view === "archived" ? params.lead_view : "active";
  const context = await getAuthenticatedPlatformContext("/admin/communications");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening communications" />;

  const [settings, communications, websiteLeads, emailEvents] = await Promise.all([
    getCommunicationSettings(),
    getCustomerCommunications({ limit: 100 }),
    getWebsiteLeadInbox({ disposition: leadView, limit: 24, page, query: params.q }),
    getEmailEvents({ types: ["quote", "invoice", "change_order"], limit: 100 }),
  ]);
  const canManageSettings = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const canDeleteLeads = context.roles.includes("owner");
  const pending = communications.data.filter((item) => item.status === "pending").sort(byScheduledDate);
  const failed = communications.data.filter((item) => item.status === "failed");
  const recent = communications.data.filter((item) => !["pending", "failed"].includes(item.status)).slice(0, 20);
  const acceptedEmailCount = emailEvents.data.filter((item) => item.status === "sent").length;
  const failedEmailCount = emailEvents.data.filter((item) => item.status === "failed").length;
  const leadViewLabel = leadView === "active" ? "Active leads" : leadView === "spam" ? "Spam leads" : "Archived leads";

  return (
    <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <div>
            <p className="surface-label"><MessageSquareMore aria-hidden="true" size={18} />Office inbox</p>
            <h1>Leads &amp; Communications</h1>
            <p>Move new requests into estimates, callbacks, quotes, and reliable customer communication.</p>
          </div>
          {canManageSettings ? <RunCommunicationWorkerForm /> : null}
        </section>

        <nav className="local-workflow-tabs" aria-label="Lead and communication views">
          <a aria-current="page" href="#inbox"><MessageSquareMore size={16} />Inbox</a>
          <a href="#website-leads"><Globe2 size={16} />Website leads</a>
          <Link href="/admin/schedule?event_type=estimate"><CalendarClock size={16} />Estimate appointments</Link>
          <a href="#history"><MailCheck size={16} />Communication history</a>
        </nav>

        {settings.error ? <Warning message={settings.error} /> : null}
        {communications.error ? <Warning message={communications.error} /> : null}
        {websiteLeads.error ? <Warning message={websiteLeads.error} /> : null}
        {emailEvents.error ? <Warning message={`Email delivery history: ${emailEvents.error}`} /> : null}

        <section className="communication-metric-grid">
          <Metric icon={<Globe2 size={19} />} label={leadViewLabel} value={websiteLeads.count} />
          <Metric icon={<CalendarClock size={19} />} label="Pending messages" value={pending.length} />
          <Metric icon={<AlertTriangle size={19} />} label="Failed" value={failed.length + failedEmailCount} />
          <Metric icon={<MailCheck size={19} />} label="Provider accepted" value={acceptedEmailCount} />
        </section>

        <section className="detail-panel" id="website-leads">
          <div className="panel-heading-row">
            <div>
              <h2 className="panel-title"><Globe2 size={18} />Website lead inbox</h2>
              <p>Website requests stay here until staff schedule an estimate, prepare a quote, archive them, or mark them as spam.</p>
            </div>
            {canManageSettings ? <Link className="secondary-action compact-action" href="/admin/communications/lead-intake">Lead intake diagnostics</Link> : null}
          </div>
          <ListSearch initialValue={params.q} label="Search website leads" placeholder="Search lead name, phone, email, address, service, status, or crew" />
          <nav className="filter-pills lead-view-filters" aria-label="Website lead view">
            <Link aria-current={leadView === "active" ? "page" : undefined} href={leadViewHref("active", params.q)}>Active</Link>
            <Link aria-current={leadView === "spam" ? "page" : undefined} href={leadViewHref("spam", params.q)}>Spam</Link>
            <Link aria-current={leadView === "archived" ? "page" : undefined} href={leadViewHref("archived", params.q)}>Archived</Link>
          </nav>
          <WebsiteLeadRows canDelete={canDeleteLeads} canManage={canManageSettings} rows={websiteLeads.data} />
          <ListPagination basePath="/admin/communications" count={websiteLeads.count} page={page} pageSize={24} params={{ lead_view: leadView === "active" ? undefined : leadView, q: params.q }} />
        </section>

        <section className="detail-grid communication-page-grid" id="inbox">
          <article className="detail-panel wide-detail-panel">
            <h2 className="panel-title"><CalendarClock size={18} />Scheduled reminders</h2>
            <CommunicationRows rows={pending} empty="No reminders are currently scheduled." />
          </article>
          <article className="detail-panel">
            <h2 className="panel-title"><AlertTriangle size={18} />Failed communications</h2>
            <CommunicationRows rows={failed} empty="No failed communications." />
          </article>
          <article className="detail-panel">
            <h2 className="panel-title"><MailCheck size={18} />Recent history</h2>
            <CommunicationRows rows={recent} empty="No communication history yet." />
          </article>
          <article className="detail-panel wide-detail-panel" id="history">
            <h2 className="panel-title"><MailCheck size={18} />Quote and invoice email delivery</h2>
            <p className="inline-empty">Provider accepted means Resend accepted the message for delivery. It does not prove the recipient opened it or that every receiving mail server placed it in the inbox.</p>
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

function WebsiteLeadRows({ canDelete, canManage, rows }: { canDelete: boolean; canManage: boolean; rows: WebsiteLeadInboxItem[] }) {
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
            <Detail label="Service" value={lead.serviceRequested ?? "Not selected"} />
            <Detail label="Address" value={lead.address || "Needs confirmation"} />
            <Detail label="Assigned" value={lead.assignedStaff ?? "Unassigned"} />
            <Detail label="Last communication" value={lead.lastCommunication ?? "No staff communication yet"} />
            <Detail label="Next action" value={lead.nextAction ?? "Review lead"} />
            <Detail label="Office notification" value={lead.notificationStatus} />
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
        </article>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function CommunicationRows({ empty, rows }: { empty: string; rows: CustomerCommunication[] }) {
  if (!rows.length) return <p className="inline-empty">{empty}</p>;

  return (
    <div className="communication-list">
      {rows.map((item) => (
        <Link className={`communication-row status-${item.status}`} href={recordHref(item)} key={item.id}>
          <div>
            <strong>{item.communication_type.replaceAll("_", " ")}</strong>
            <span>{item.status} - {formatDateTime(item.sent_at ?? item.scheduled_for)}</span>
            <small>{item.recipient_email}</small>
            {item.skip_reason || item.last_error ? <small>{item.skip_reason || item.last_error}</small> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article className="communication-metric"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function Warning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function recordHref(item: CustomerCommunication) {
  if (item.quote_id) return `/admin/quotes/${item.quote_id}`;
  if (item.invoice_id) return `/admin/invoices/${item.invoice_id}`;
  if (item.schedule_event_id) return `/admin/schedule?event=${item.schedule_event_id}`;
  if (item.appointment_id) return `/admin/schedule?appointment=${item.appointment_id}`;
  if (item.job_id) return `/admin/jobs/${item.job_id}`;
  return item.organization_id
    ? `/admin/organizations/${item.organization_id}`
    : `/admin/customers/${item.customer_id}`;
}

function byScheduledDate(left: CustomerCommunication, right: CustomerCommunication) {
  return new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
