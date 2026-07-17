import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Building2,
  Clock3,
  Leaf,
  MessageSquareMore,
  PhoneCall,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getFollowUpsDue } from "@/lib/data/appointments";
import { getUnpaidInvoices } from "@/lib/data/invoices";
import { getDashboardJobSummaries } from "@/lib/data/jobs";
import { getOrganizationDashboardSummary } from "@/lib/data/organizations";
import { getQuoteDashboardSummaries } from "@/lib/data/quotes";
import { getScheduleDashboardSummary } from "@/lib/data/schedule";
import { getCommunicationDashboardSummary } from "@/lib/data/communications";
import { getEquipmentDashboardSummary } from "@/lib/data/equipment";
import { getEmployeeDashboardSummary } from "@/lib/data/employees";
import { getDashboardReportingSummary } from "@/lib/data/reports";
import type { AppointmentWithRelations } from "@/lib/types/database";

export default async function AdminPage() {
  const context = await getAuthenticatedPlatformContext("/admin");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the admin CRM" />;
  }

  const [jobSummaries, quoteSummaries, followUps, unpaidInvoices, organizationSummary, scheduleSummary, communicationSummary, equipmentSummary, employeeSummary, reportingSummary] = await Promise.all([
    getDashboardJobSummaries(),
    getQuoteDashboardSummaries(),
    getFollowUpsDue(),
    getUnpaidInvoices(),
    getOrganizationDashboardSummary(),
    getScheduleDashboardSummary(),
    getCommunicationDashboardSummary(),
    getEquipmentDashboardSummary(),
    getEmployeeDashboardSummary(),
    getDashboardReportingSummary(hasAllowedRole(context.roles, platformRoleGroups.financialReporting)),
  ]);

  const lanes: {
    title: string;
    description: string;
    Icon: LucideIcon;
    href: string;
    items: { href: string; title: string; meta: string }[];
    placeholder?: string;
  }[] = [
    {
      title: "Draft quotes",
      description: "Proposals that still need scope, pricing, or a deliberate send.",
      Icon: ClipboardCheck,
      href: "/admin/quotes",
      items: quoteSummaries.data.drafts.map((quote) => ({
        href: `/admin/quotes/${quote.id}`,
        title: quote.quote_number ?? "Draft quote",
        meta: quote.customers?.display_name ?? "Unknown customer",
      })),
    },
    {
      title: "New leads",
      description: "Requests that need first contact, qualification, or a quick call back.",
      Icon: PhoneCall,
      href: "/admin/jobs",
      items: jobSummaries.lanes.newLeads.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.customers?.display_name ?? "Unknown customer",
        meta: job.requested_scope ?? "No scope entered yet",
      })),
    },
    {
      title: "Estimates to schedule",
      description: "Qualified work that needs an on-site estimate window.",
      Icon: CalendarDays,
      href: "/admin/jobs",
      items: jobSummaries.lanes.estimatesToSchedule.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.customers?.display_name ?? "Unknown customer",
        meta: job.service_locations
          ? `${job.service_locations.street}, ${job.service_locations.city}`
          : "No service location",
      })),
    },
    {
      title: "Quotes awaiting response",
      description: "Sent quotes that need approval, edits, or a thoughtful reminder.",
      Icon: MessageSquareMore,
      href: "/admin/quotes",
      items: quoteSummaries.data.awaitingResponse.map((quote) => ({
        href: `/admin/quotes/${quote.id}`,
        title: quote.quote_number ?? "Sent quote",
        meta: quote.customers?.display_name ?? "Unknown customer",
      })),
    },
    {
      title: "Approved work to schedule",
      description: "Accepted work orders that need a crew date or schedule event.",
      Icon: CalendarDays,
      href: "/admin/jobs",
      items: jobSummaries.lanes.approvedWorkToSchedule.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.customers?.display_name ?? "Unknown customer",
        meta: job.requested_scope ?? "Approved work order",
      })),
    },
    {
      title: "Completed work to invoice",
      description: "Finished work orders ready for one linked customer invoice.",
      Icon: CircleDollarSign,
      href: "/admin/jobs",
      items: jobSummaries.lanes.completedWorkToInvoice.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.customers?.display_name ?? "Unknown customer",
        meta: job.service_type?.replace("_", " ") ?? "Completed work order",
      })),
    },
    {
      title: "Today's jobs",
      description: "Crew-ready work scheduled for today.",
      Icon: Truck,
      href: "/admin/schedule",
      items: jobSummaries.lanes.todaysJobs.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.service_type?.replace("_", " ") ?? "Service job",
        meta: job.customers?.display_name ?? "Unknown customer",
      })),
    },
    {
      title: "Follow-ups due",
      description: "Callbacks, post-job check-ins, and lead reminders due now.",
      Icon: Clock3,
      href: "/admin/schedule",
      items: followUps.data.map((appointment) => ({
        href: `/admin/schedule?appointment=${appointment.id}`,
        title: appointment.jobs?.service_type?.replace("_", " ") ?? "Follow-up",
        meta: formatFollowUpMeta(appointment),
      })),
    },
    {
      title: "Unpaid invoices",
      description: "Sent, partially paid, or overdue invoices needing office follow-up.",
      Icon: CircleDollarSign,
      href: "/admin/invoices",
      items: unpaidInvoices.data.map((invoice) => ({
        href: `/admin/invoices/${invoice.id}`,
        title: invoice.invoice_number ?? "Open invoice",
        meta: `${invoice.customers?.display_name ?? "Unknown customer"} - ${formatCurrency(invoice.balance_due_cents)}`,
      })),
    },
  ];
  const attentionLanes = [lanes[0], lanes[1], lanes[2], lanes[3], lanes[4], lanes[5], lanes[8]];
  const pipelineSummary = [
    { label: "Draft quotes", value: quoteSummaries.data.drafts.length },
    { label: "New leads", value: jobSummaries.lanes.newLeads.length },
    { label: "Estimates", value: jobSummaries.lanes.estimatesToSchedule.length },
    { label: "Quotes waiting", value: quoteSummaries.data.awaitingResponse.length },
    { label: "Ready to invoice", value: jobSummaries.lanes.completedWorkToInvoice.length },
    { label: "Open invoices", value: unpaidInvoices.data.length },
  ];

  return (
    <PlatformFrame active="admin" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content dashboard-page">
        <section className="page-heading dashboard-heading">
          <div>
            <p className="surface-label">
              <Leaf aria-hidden="true" size={15} />
              Internal CRM
            </p>
            <h1>Dashboard</h1>
            <p>Today's operational overview.</p>
          </div>
          <p className="dashboard-date">{formatDashboardDate()}</p>
        </section>

        {[jobSummaries.error, quoteSummaries.error, followUps.error, unpaidInvoices.error, organizationSummary.error, scheduleSummary.error, communicationSummary.error, equipmentSummary.error, employeeSummary.error, reportingSummary.error]
          .filter(Boolean)
          .map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="dashboard-grid" aria-label="CRM operational overview">
          <section className="panel dashboard-panel dashboard-reporting-panel">
            <PanelHeader title="This month" detail="Sales, cash, and accounts receivable" />
            <div className="pipeline-list">
              <a className="pipeline-row" href="/admin/reports?view=quotes"><span>Approved quote value</span><strong>{formatCurrency(reportingSummary.data.approvedQuoteCents)}</strong></a>
              <a className="pipeline-row" href="/admin/reports?view=quotes"><span>Quote approval rate</span><strong>{reportingSummary.data.quoteApprovalRate == null ? "N/A" : `${reportingSummary.data.quoteApprovalRate.toFixed(1)}%`}</strong></a>
              <a className="pipeline-row" href="/admin/reports?view=revenue"><span>Invoiced</span><strong>{hasAllowedRole(context.roles, platformRoleGroups.financialReporting) ? formatCurrency(reportingSummary.data.invoicedCents) : "Restricted"}</strong></a>
              <a className="pipeline-row" href="/admin/reports?view=revenue"><span>Collected</span><strong>{hasAllowedRole(context.roles, platformRoleGroups.financialReporting) ? formatCurrency(reportingSummary.data.collectedCents) : "Restricted"}</strong></a>
              <a className="pipeline-row" href="/admin/reports?view=revenue"><span>Outstanding / overdue</span><strong>{hasAllowedRole(context.roles, platformRoleGroups.financialReporting) ? `${formatCurrency(reportingSummary.data.outstandingCents)} / ${formatCurrency(reportingSummary.data.overdueCents)}` : "Restricted"}</strong></a>
            </div>
          </section>
          <section className="panel dashboard-panel">
            <PanelHeader title="Today's crew schedule" detail="Who is scheduled where today" />
            <div className="workflow-list schedule-dashboard-list">
              {scheduleSummary.data.todaysCrewSchedules.length ? (
                scheduleSummary.data.todaysCrewSchedules.map((group) => (
                  <a className="workflow-row" href={`/admin/schedule?assigned_user_id=${group.user.id}`} key={group.user.id}>
                    <span className="workflow-row-icon" aria-hidden="true">
                      <Truck size={15} />
                    </span>
                    <span>
                      <strong>{group.user.full_name || group.user.email || "Crew member"}</strong>
                      <small>
                        {group.entries[0]
                          ? `${group.entries[0].title} - ${group.entries[0].location_label || "No location"}`
                          : "No assigned work today"}
                      </small>
                    </span>
                    <b>{group.entries.length}</b>
                  </a>
                ))
              ) : (
                <p className="subtle-empty">No crew schedule assigned for today yet.</p>
              )}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Needs attention" detail="Items most likely to stall" />
            <div className="workflow-list">
              {attentionLanes.map((lane) => <WorkflowLane lane={lane} key={lane.title} />)}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Pipeline" detail="Current office load" />
            <div className="pipeline-list">
              {pipelineSummary.map((item) => (
                <div className="pipeline-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Customer communications" detail="Reminder queue and delivery attention" />
            <div className="pipeline-list">
              <a className="pipeline-row" href="/admin/communications"><span>Follow-ups due today</span><strong>{communicationSummary.data.dueToday.length}</strong></a>
              <a className="pipeline-row" href="/admin/quotes"><span>Quotes awaiting response</span><strong>{communicationSummary.data.quotesAwaitingResponseCount}</strong></a>
              <a className="pipeline-row" href="/admin/schedule?event_type=estimate&status=scheduled"><span>Appointments needing confirmation</span><strong>{scheduleSummary.data.upcomingEstimates.filter((entry) => entry.status === "scheduled").length}</strong></a>
              <a className="pipeline-row" href="/admin/communications"><span>Scheduled reminders</span><strong>{communicationSummary.data.scheduled.length}</strong></a>
              <a className="pipeline-row" href="/admin/communications"><span>Failed communications</span><strong>{communicationSummary.data.failed.length}</strong></a>
              <a className="pipeline-row" href="/admin/invoices"><span>Overdue invoices</span><strong>{communicationSummary.data.overdueInvoiceCount}</strong></a>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Fleet attention" detail="Safety, repairs, maintenance, and expiring documents" />
            <div className="pipeline-list">
              <a className="pipeline-row" href="/admin/equipment?status=out_of_service"><span>Out of service</span><strong>{equipmentSummary.data.outOfService.length}</strong></a>
              <a className="pipeline-row" href="/admin/equipment?status=maintenance_due"><span>Maintenance due soon</span><strong>{equipmentSummary.data.dueMaintenance.length}</strong></a>
              <a className="pipeline-row" href="/admin/equipment"><span>Open problem reports</span><strong>{equipmentSummary.data.openProblems.length}</strong></a>
              <a className="pipeline-row" href="/admin/equipment"><span>Failed inspections</span><strong>{equipmentSummary.data.failedInspections.length}</strong></a>
              <a className="pipeline-row" href="/admin/equipment"><span>Documents expiring in 30 days</span><strong>{equipmentSummary.data.expiringDocuments.length}</strong></a>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Employee readiness" detail="Onboarding, access, training, credentials, and return review" />
            <div className="pipeline-list">
              <a className="pipeline-row" href="/admin/employees?status=onboarding"><span>Employees onboarding</span><strong>{employeeSummary.data.onboarding.length}</strong></a>
              <a className="pipeline-row" href="/admin/access"><span>Access requests awaiting approval</span><strong>{employeeSummary.data.pendingAccess.length}</strong></a>
              <a className="pipeline-row" href="/admin/employees?credential=expiring"><span>Credentials expiring soon</span><strong>{employeeSummary.data.expiring.length}</strong></a>
              <a className="pipeline-row" href="/admin/employees?credential=expired"><span>Expired credentials</span><strong>{employeeSummary.data.expired.length}</strong></a>
              <a className="pipeline-row" href="/admin/employees?training=none"><span>Missing training records</span><strong>{employeeSummary.data.missingTraining.length}</strong></a>
              <a className="pipeline-row" href="/admin/safety"><span>Safety acknowledgments pending</span><strong>{employeeSummary.data.pendingSafetyAcknowledgments.length}</strong></a>
              <a className="pipeline-row" href="/admin/employees"><span>Documents awaiting verification</span><strong>{employeeSummary.data.pendingDocuments.length}</strong></a>
              <a className="pipeline-row" href="/admin/equipment"><span>Equipment/PPE overdue for return</span><strong>{employeeSummary.data.equipmentDueBack.length}</strong></a>
              <a className="pipeline-row" href="/admin/employees?status=inactive"><span>Inactive access requiring review</span><strong>{employeeSummary.data.inactiveAccessReview.length}</strong></a>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Unassigned work" detail="Scheduled visits still missing crew" />
            <div className="workflow-list schedule-dashboard-list">
              {scheduleSummary.data.unassignedEntries.length ? (
                scheduleSummary.data.unassignedEntries.slice(0, 5).map((entry) => (
                  <a className="workflow-row" href={entry.source === "schedule_event" ? `/admin/schedule?event=${entry.id}` : `/admin/schedule?appointment=${entry.id}`} key={`${entry.source}-${entry.id}`}>
                    <span className="workflow-row-icon" aria-hidden="true">
                      <AlertTriangle size={15} />
                    </span>
                    <span>
                      <strong>{entry.title}</strong>
                      <small>{entry.location_label || "No location yet"}</small>
                    </span>
                    <b>Open</b>
                  </a>
                ))
              ) : (
                <p className="subtle-empty">All visible job work has someone assigned.</p>
              )}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Schedule conflicts" detail="Overlaps and missing schedule details" />
            <div className="workflow-list schedule-dashboard-list">
              {scheduleSummary.data.conflicts.length ? (
                scheduleSummary.data.conflicts.slice(0, 5).map((conflict) => (
                  <a className="workflow-row" href={conflict.href} key={conflict.id}>
                    <span className="workflow-row-icon" aria-hidden="true">
                      <AlertTriangle size={15} />
                    </span>
                    <span>
                      <strong>{conflict.title}</strong>
                      <small>{conflict.detail}</small>
                    </span>
                    <b>{conflict.kind === "overlap" ? "Conflict" : "Check"}</b>
                  </a>
                ))
              ) : (
                <p className="subtle-empty">No schedule conflicts are visible in today's window.</p>
              )}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Upcoming estimates" detail="Estimate visits coming up next" />
            <div className="workflow-list schedule-dashboard-list">
              {scheduleSummary.data.upcomingEstimates.length ? (
                scheduleSummary.data.upcomingEstimates.slice(0, 5).map((entry) => (
                  <a className="workflow-row" href={entry.source === "schedule_event" ? `/admin/schedule?event=${entry.id}` : `/admin/schedule?appointment=${entry.id}`} key={`${entry.source}-${entry.id}`}>
                    <span className="workflow-row-icon" aria-hidden="true">
                      <CalendarDays size={15} />
                    </span>
                    <span>
                      <strong>{entry.customer_label || entry.title}</strong>
                      <small>{entry.location_label || entry.subtitle}</small>
                    </span>
                    <b>{formatShortDate(entry.starts_at)}</b>
                  </a>
                ))
              ) : (
                <p className="subtle-empty">No upcoming estimates are scheduled yet.</p>
              )}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Quick actions" detail="Most common next steps" />
            <div className="quick-actions">
              <a href="/admin/customers">Add customer</a>
              <a href="/admin/jobs">Create job</a>
              <a href="/admin/quotes">Prepare quote</a>
              <a href="/admin/schedule">Open schedule</a>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Property managers and HOAs" detail="Repeat-account overview" />
            <div className="pipeline-list">
              <div className="pipeline-row"><span>Accounts</span><strong>{organizationSummary.data.length}</strong></div>
              <div className="pipeline-row"><span>Open jobs</span><strong>{organizationSummary.data.reduce((sum, detail) => sum + detail.jobs.filter((job) => !["completed", "paid", "lost", "cancelled"].includes(job.status)).length, 0)}</strong></div>
              <div className="pipeline-row"><span>Quotes waiting</span><strong>{organizationSummary.data.reduce((sum, detail) => sum + detail.quotes.filter((quote) => quote.status === "sent" || quote.status === "change_requested").length, 0)}</strong></div>
              <div className="pipeline-row"><span>Unpaid invoices</span><strong>{organizationSummary.data.reduce((sum, detail) => sum + detail.invoices.filter((invoice) => ["sent", "partially_paid", "overdue"].includes(invoice.status)).length, 0)}</strong></div>
            </div>
            <div className="record-actions"><a href="/admin/organizations">Open organizations</a></div>
          </section>
        </section>

        <section className="notice-panel">
          <strong>
            <Zap aria-hidden="true" size={18} />
            Protected but still early
          </strong>
          <p>
            These pages use Supabase Auth and RLS-aware queries. Before real operation, assign staff
            roles in Supabase and keep customer portal policies separate from internal CRM access.
          </p>
        </section>

        <section className="workflow-strip" aria-label="First workflow">
          <span>
            <ClipboardCheck aria-hidden="true" size={18} />
            Operational workflow: estimate to quote to scheduled work to invoice
          </span>
        </section>
      </div>
    </PlatformFrame>
  );
}

function PanelHeader({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

function WorkflowLane({
  lane,
}: {
  lane: {
    title: string;
    Icon: LucideIcon;
    href: string;
    items: { href: string; title: string; meta: string }[];
  };
}) {
  const preview = lane.items[0];

  return (
    <a className="workflow-row" href={preview?.href ?? lane.href}>
      <span className="workflow-row-icon" aria-hidden="true">
        <lane.Icon size={15} />
      </span>
      <span>
        <strong>{lane.title}</strong>
        {preview ? <small>{preview.title}: {preview.meta}</small> : <small>Clear for now</small>}
      </span>
      <b>{lane.items.length}</b>
    </a>
  );
}

function formatDashboardDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatFollowUpMeta(appointment: AppointmentWithRelations) {
  const dueAt = new Date(appointment.starts_at);
  const today = new Date();
  const timing = dueAt.toDateString() === today.toDateString() ? "Due today" : "Overdue";
  const detail = appointment.calendar_notes ?? formatDate(appointment.starts_at);

  return `${timing}: ${detail}`;
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
