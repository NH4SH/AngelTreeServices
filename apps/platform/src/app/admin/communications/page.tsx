import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, Globe2, MailCheck, MessageSquareMore, PhoneCall, Settings2 } from "lucide-react";
import { CommunicationSettingsForm, RunCommunicationWorkerForm } from "@/components/communication-settings-form";
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
import type { CustomerCommunication } from "@/lib/types/database";

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const params = await searchParams;
  const page = positivePage(params.page);
  const context = await getAuthenticatedPlatformContext("/admin/communications");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening communications" />;

  const [settings, communications, websiteLeads] = await Promise.all([
    getCommunicationSettings(),
    getCustomerCommunications({ limit: 100 }),
    getWebsiteLeadInbox({ limit: 24, page, query: params.q }),
  ]);
  const canManageSettings = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const pending = communications.data.filter((item) => item.status === "pending").sort(byScheduledDate);
  const failed = communications.data.filter((item) => item.status === "failed");
  const recent = communications.data.filter((item) => !["pending", "failed"].includes(item.status)).slice(0, 20);

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

        <section className="communication-metric-grid">
          <Metric icon={<Globe2 size={19} />} label="Website leads" value={websiteLeads.count} />
          <Metric icon={<CalendarClock size={19} />} label="Scheduled" value={pending.length} />
          <Metric icon={<AlertTriangle size={19} />} label="Failed" value={failed.length} />
          <Metric icon={<MailCheck size={19} />} label="Recently completed" value={recent.length} />
        </section>

        <section className="detail-panel" id="website-leads">
          <div className="panel-heading-row">
            <div>
              <h2 className="panel-title"><Globe2 size={18} />Website lead inbox</h2>
              <p>Public requests are stored as legacy new-lead jobs until staff qualifies and converts them.</p>
            </div>
            {canManageSettings ? <Link className="secondary-action compact-action" href="/admin/communications/lead-intake">Lead intake diagnostics</Link> : null}
          </div>
          <ListSearch initialValue={params.q} label="Search website leads" placeholder="Search lead name, phone, email, address, service, status, or crew" />
          <WebsiteLeadRows rows={websiteLeads.data} />
          <ListPagination basePath="/admin/communications" count={websiteLeads.count} page={page} pageSize={24} params={{ q: params.q }} />
        </section>

        <section className="detail-grid communication-page-grid" id="inbox">
          <article className="detail-panel wide-detail-panel">
            <h2 className="panel-title"><CalendarClock size={18} />Scheduled reminders</h2>
            <CommunicationRows rows={pending} empty="No reminders are currently scheduled." />
          </article>
          <article className="detail-panel" id="history">
            <h2 className="panel-title"><AlertTriangle size={18} />Failed communications</h2>
            <CommunicationRows rows={failed} empty="No failed communications." />
          </article>
          <article className="detail-panel">
            <h2 className="panel-title"><MailCheck size={18} />Recent history</h2>
            <CommunicationRows rows={recent} empty="No communication history yet." />
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

function WebsiteLeadRows({ rows }: { rows: WebsiteLeadInboxItem[] }) {
  if (!rows.length) return <p className="inline-empty">No website leads have arrived yet.</p>;

  return (
    <div className="record-list website-lead-list">
      {rows.map((lead) => (
        <article className="record-card" key={lead.jobId}>
          <div className="record-card-header">
            <div>
              <h2>{lead.customerName}</h2>
              <p>{lead.sourceBadge} · {formatDateTime(lead.submittedAt)}</p>
            </div>
            <span className="status-pill">{lead.currentStatus.replaceAll("_", " ")}</span>
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
          </dl>
          {lead.duplicateOfJobId ? <p className="data-warning">Possible duplicate of lead {lead.duplicateOfJobId}.</p> : null}
          <div className="record-actions">
            <Link href={`/admin/jobs/${lead.jobId}`}>Open lead</Link>
            {lead.phone ? <a href={`tel:${lead.phone}`}>Call</a> : null}
            {lead.email ? <a href={`mailto:${lead.email}`}>Email</a> : null}
            <Link href={`/admin/schedule?new=1&event_type=estimate&job_id=${lead.jobId}`}>Schedule estimate</Link>
            <Link href={`/admin/quotes?new=1&job_id=${lead.jobId}`}>Create quote</Link>
          </div>
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
