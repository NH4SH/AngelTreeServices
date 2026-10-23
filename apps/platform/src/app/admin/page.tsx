import { formatBusinessDateTime, getBusinessDateKey } from "@/lib/business-time";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Boxes,
  Clock3,
  MessageSquareMore,
  PhoneCall,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NextActionsPanel } from "@/components/NextActionsPanel";
import { CompletedEstimatesPanel } from "@/components/CompletedEstimatesPanel";
import { shiftScheduleDateKey } from "@/lib/schedule/event-form";
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
import { DashboardMoney, DashboardMoneyLoading } from "@/components/dashboard/DashboardMoney";
import { DashboardPeriodLinks } from "@/components/dashboard/DashboardPeriodLinks";
import type { PlatformRoleName } from "@/lib/auth/roles";
import { dashboardPeriod } from "@/lib/dashboard/cash-series";
import "./dashboard.css";
import { getMaterialsDashboardSummary } from "@/lib/data/materials";
import { getWorkflowPipelineStages } from "@/lib/data/workflow-pipeline";
import type { AppointmentWithRelations } from "@/lib/types/database";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const period = dashboardPeriod((await searchParams).range);
  const context = await getAuthenticatedPlatformContext("/admin");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the admin CRM" />;
  }

  return <PlatformFrame active="admin" roles={context.roles} userEmail={context.user.email} appearance="dashboard-dark">
    <div className="shell app-content business-dashboard">
        <header className="business-dashboard-heading">
          <div><h1>Dashboard</h1><p>{formatDashboardDate()}</p></div>
          <Link prefetch={false} className="dashboard-primary-action" href="/admin/quotes?new=1">New quote <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </header>
        <nav className="dashboard-jump-links" aria-label="Dashboard sections"><a href="#dashboard-money-title">Money</a><a href="#dashboard-next-title">Next up</a><a href="#dashboard-daybook-title">Today’s work</a></nav>
      <div className="dashboard-focus-grid">
        <section className="dashboard-money" aria-labelledby="dashboard-money-title">
          <div className="dashboard-section-heading"><h2 id="dashboard-money-title">{hasAllowedRole(context.roles, platformRoleGroups.financialReporting) ? "Money overview" : "Your sales"}</h2><Link prefetch={false} href={`/admin/reports?view=${hasAllowedRole(context.roles, platformRoleGroups.financialReporting) ? "revenue" : "quotes"}&range=${period}`}>Open reports <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
          <DashboardPeriodLinks period={period} />
          <Suspense key={period} fallback={<DashboardMoneyLoading />}><DashboardMoney period={period} /></Suspense>
        </section>
        <Suspense key={`work-${period}`} fallback={<DashboardOperationsLoading />}><DashboardOperations roles={context.roles} userId={context.user.id} /></Suspense>
      </div>
    </div>
  </PlatformFrame>;
}

async function DashboardOperations({roles, userId}: {roles: PlatformRoleName[]; userId: string}) {
  const [jobSummaries, quoteSummaries, followUps, unpaidInvoices, organizationSummary, scheduleSummary, communicationSummary, equipmentSummary, employeeSummary, materialsSummary, workflowPipeline] = await Promise.all([
    loadOptionalDashboardModule("Jobs", getDashboardJobSummaries(), {
      lanes: {
        newLeads: [],
        estimatesToSchedule: [],
        approvedWorkToSchedule: [],
        completedWorkToInvoice: [],
        todaysJobs: [],
      },
      error: "Job summaries are temporarily unavailable.",
    }),
    loadOptionalDashboardModule("Quotes", getQuoteDashboardSummaries(), {
      data: { drafts: [], awaitingResponse: [] },
      error: "Quote summaries are temporarily unavailable.",
    }),
    loadOptionalDashboardModule("Follow-ups", getFollowUpsDue(), {
      data: [],
      error: "Follow-ups are temporarily unavailable.",
    }),
    loadOptionalDashboardModule("Invoices", getUnpaidInvoices(), {
      data: [],
      error: "Invoice summaries are temporarily unavailable.",
    }),
    loadOptionalDashboardModule("Organizations", getOrganizationDashboardSummary(), { data: [], error: "Organizations are temporarily unavailable." }),
    loadOptionalDashboardModule("Schedule", getScheduleDashboardSummary(), { data: { conflicts: [], todaysCrewSchedules: [], unassignedEntries: [], upcomingEstimates: [] }, error: "Schedule is temporarily unavailable." }),
    loadOptionalDashboardModule("Communications", getCommunicationDashboardSummary(), { data: { dueToday: [], failed: [], overdueInvoiceCount: 0, quotesAwaitingResponseCount: 0, scheduled: [] }, error: "Communications are temporarily unavailable." }),
    loadOptionalDashboardModule("Equipment", getEquipmentDashboardSummary(), { data: { dueMaintenance: [], failedInspections: [], openProblems: [], expiringDocuments: [], outOfService: [] }, error: "Equipment is temporarily unavailable." }),
    loadOptionalDashboardModule("Employees", getEmployeeDashboardSummary(), { data: { onboarding: [], pendingAccess: [], expiring: [], expired: [], missingTraining: [], pendingSafetyAcknowledgments: [], pendingDocuments: [], pendingRequests: [], equipmentDueBack: [], inactiveAccessReview: [] }, error: "Employee readiness is temporarily unavailable." }),
    loadOptionalDashboardModule("Materials", getMaterialsDashboardSummary(), { data: { items: [] }, error: "Materials are temporarily unavailable." }),
    loadOptionalDashboardModule("Workflow", getWorkflowPipelineStages(), {
      stages: [],
      errors: ["Workflow counts are temporarily unavailable."],
    }),
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
      title: "Materials attention",
      description: "Low stock, missing disposal receipts, and due customer deliveries.",
      Icon: Boxes,
      href: "/admin/materials",
      items: materialsSummary.data.items,
      placeholder: "No material issues need attention.",
    },
    {
      title: "Draft quotes",
      description: "Proposals that still need scope, pricing, or a deliberate send.",
      Icon: ClipboardCheck,
      href: "/admin/quotes",
      items: quoteSummaries.data.drafts.map((quote) => ({
        href: `/admin/quotes/${quote.id}`,
        title: quote.quote_number ?? `Quote for ${quote.organizations?.name ?? quote.customers?.display_name ?? "customer"}`,
        meta: quote.organizations?.name ?? quote.customers?.display_name ?? "Unknown contracting party",
      })),
    },
    {
      title: "New leads",
      description: "Requests that need first contact, qualification, or a quick call back.",
      Icon: PhoneCall,
      href: "/admin/communications#website-leads",
      items: jobSummaries.lanes.newLeads.map((job) => ({
        href: `/admin/schedule?new=1&lead=${job.id}`,
        title: job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party",
        meta: job.requested_scope ?? "No scope entered yet",
      })),
    },
    {
      title: "Estimates to schedule",
      description: "Qualified work that needs an on-site estimate window.",
      Icon: CalendarDays,
      href: "/admin/communications#website-leads",
      items: jobSummaries.lanes.estimatesToSchedule.map((job) => ({
        href: `/admin/schedule?new=1&lead=${job.id}`,
        title: job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party",
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
        title: quote.quote_number ?? `Quote for ${quote.organizations?.name ?? quote.customers?.display_name ?? "customer"}`,
        meta: quote.organizations?.name ?? quote.customers?.display_name ?? "Unknown contracting party",
      })),
    },
    {
      title: "Approved work to schedule",
      description: "Accepted work orders that need a crew date or schedule event.",
      Icon: CalendarDays,
      href: "/admin/jobs?view=to_be_scheduled",
      items: jobSummaries.lanes.approvedWorkToSchedule.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party",
        meta: job.requested_scope ?? "Approved work order",
      })),
    },
    {
      title: "Completed work to invoice",
      description: "Finished work orders ready for one linked customer invoice.",
      Icon: CircleDollarSign,
      href: "/admin/jobs?view=billing&invoice=none",
      items: jobSummaries.lanes.completedWorkToInvoice.map((job) => ({
        href: `/admin/jobs/${job.id}`,
        title: job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party",
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
        meta: job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party",
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
        meta: `${invoice.organizations?.name ?? invoice.customers?.display_name ?? "Unknown contracting party"} - ${formatCurrency(invoice.balance_due_cents)}`,
      })),
    },
  ];
  const attentionLanes = [lanes[2], lanes[3], lanes[1], lanes[4], lanes[5], lanes[6], lanes[9], lanes[8], lanes[0]];
  const today = getBusinessDateKey(new Date());
  const tomorrow = shiftScheduleDateKey(today, 1);

  const stageCountsAvailable = workflowPipeline.errors.length === 0;
  const priorities = [
    { id: "new-leads", label: "Contact new leads", detail: "Turn an enquiry into a conversation", lane: lanes[2] },
    { id: "awaiting-invoice", label: "Invoice finished work", detail: "Send the next customer invoice", lane: lanes[6] },
    { id: "awaiting-schedule", label: "Schedule approved work", detail: "Put accepted work on the calendar", lane: lanes[5] },
    { id: "quotes-prepare", label: "Finish draft quotes", detail: "Review scope, pricing and send", lane: lanes[1] },
  ].map(item => ({ ...item, count: stageCountsAvailable ? workflowPipeline.stages.find(stage => stage.id === item.id)?.count : undefined }));
  const warnings = Array.from(new Set([jobSummaries.error, quoteSummaries.error, followUps.error, unpaidInvoices.error, organizationSummary.error, scheduleSummary.error, communicationSummary.error, equipmentSummary.error, employeeSummary.error, materialsSummary.error].filter((message): message is string => Boolean(message))));

  return <>
        {warnings.length ? <details className="dashboard-data-notices"><summary><AlertTriangle size={16} aria-hidden="true" /> Some dashboard information is unavailable</summary>{warnings.map(message => <p key={message}>{message}</p>)}</details> : null}
          <aside className="dashboard-next-up" aria-labelledby="dashboard-next-title">
            <div className="dashboard-section-heading"><h2 id="dashboard-next-title">Next up</h2><span>Keep work moving</span></div>
            {scheduleSummary.data.conflicts.length ? <Link prefetch={false} href="/admin/schedule" className="dashboard-schedule-alert"><AlertTriangle size={17} aria-hidden="true" /><span>Review schedule conflicts<span>{scheduleSummary.data.conflicts.length} in the loaded window</span></span><ArrowRight size={16} aria-hidden="true" /></Link> : null}
            <div className="dashboard-priority-list">{priorities.map((item, index) => <Link prefetch={false} className="dashboard-priority" href={item.id === "quotes-prepare" ? "/admin/quotes?status=draft" : item.lane.href} key={item.id}>
              <span className="dashboard-priority-order">0{index + 1}</span><span className="dashboard-priority-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className="dashboard-priority-count">{item.count?.toLocaleString() ?? "—"}</span><ArrowUpRight size={16} aria-hidden="true" />
            </Link>)}</div>
            {!stageCountsAvailable ? <p className="dashboard-muted" role="status">Counts unavailable. Open a queue to review its records.</p> : null}
            <div className="dashboard-next-footer"><Link prefetch={false} href="/admin/follow-ups?view=due">Review due follow-ups <ArrowRight size={16} aria-hidden="true" /></Link><Link prefetch={false} href="/admin/communications/delivery-review">Delivery review</Link></div>
          </aside>
        <section className="dashboard-daybook" aria-labelledby="dashboard-daybook-title">
          <div className="dashboard-section-heading"><div><h2 id="dashboard-daybook-title">The next two days</h2></div><Link prefetch={false} href="/admin/schedule">Full schedule <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
          <div className="dashboard-days">{[today, tomorrow].map(day => {
            const entries = (scheduleSummary.data.nextTwoDays ?? []).filter(entry => getBusinessDateKey(entry.starts_at) === day && ["estimate", "job", "emergency", "maintenance"].includes(entry.event_type));
            return <section className="dashboard-day" key={day} aria-label={day === today ? "Today's work" : "Tomorrow's work"}>
              <header><h3>{day === today ? "Today" : "Tomorrow"}</h3><span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</span></header>
              {scheduleSummary.error ? <p className="dashboard-muted" role="status">This schedule preview is unavailable.</p> : !entries.length ? <div className="dashboard-day-empty"><CalendarDays size={24} aria-hidden="true" /><p>No work in this preview.</p><Link prefetch={false} href={`/admin/schedule?date=${day}`}>Review the day <ArrowRight size={14} aria-hidden="true" /></Link></div> : <ol className="dashboard-agenda">{entries.slice(0, 4).map(entry => <li key={`${entry.source}-${entry.id}`}><Link prefetch={false} href={`/admin/schedule?date=${day}&${entry.source === "appointment" ? "appointment" : "event"}=${entry.id}`}>
                <time dateTime={entry.starts_at}>{formatBusinessDateTime(entry.starts_at, { hour: "numeric", minute: "2-digit" })}</time><span><strong>{entry.customer_label || entry.title}</strong><small>{entry.event_type.replaceAll("_", " ")} · {entry.status.replaceAll("_", " ")}</small><small>{entry.location_label || "Location needs review"}{entry.assignees.length ? "" : " · Crew needed"}</small></span><ArrowUpRight size={15} aria-hidden="true" />
              </Link></li>)}</ol>}
              <Link prefetch={false} className="dashboard-day-link" href={`/admin/schedule?date=${day}`}>Open full day <ArrowRight size={15} aria-hidden="true" /></Link>
            </section>;
          })}</div>
        </section>

        <div className="dashboard-work-grid">
          <section className="dashboard-workflow" aria-labelledby="dashboard-workflow-title"><div className="dashboard-section-heading"><h2 id="dashboard-workflow-title">Work in progress</h2><span>Current queues</span></div><dl>{workflowPipeline.stages.map(stage => <div key={stage.id}><dt><Link prefetch={false} href={dashboardQueueHref(stage.id, stage.href)}>{stage.label}<ArrowUpRight size={14} aria-hidden="true" /></Link></dt><dd>{stageCountsAvailable ? stage.count.toLocaleString() : "—"}</dd></div>)}</dl>{!stageCountsAvailable ? <p className="dashboard-muted">Some counts could not be confirmed. Open the full queues for details.</p> : null}</section>
          <div className="dashboard-handoffs"><Suspense fallback={<p role="status">Loading your due handoffs…</p>}><NextActionsPanel dueOnly assignedTo={userId} limit={3} /></Suspense></div>
        </div>

        <details className="dashboard-secondary-section"><summary><span>Browse attention queues<small>Leads, quotes, invoices, follow-ups and materials</small></span><ChevronDown size={20} aria-hidden="true" /></summary><div className="dashboard-queue-grid">{attentionLanes.map(lane => <WorkflowLane lane={lane} key={lane.title} />)}</div></details>
        <details className="dashboard-secondary-section"><summary><span>Estimate follow-through<small>Review completed visits without a linked proposal</small></span><ChevronDown size={20} aria-hidden="true" /></summary><Suspense fallback={<p role="status">Loading estimate follow-through…</p>}><CompletedEstimatesPanel /></Suspense></details>
        <details className="dashboard-secondary-section" id="schedule-checks"><summary><span>Business checks<small>Crew, communications, equipment, employee readiness and accounts</small></span><ChevronDown size={20} aria-hidden="true" /></summary><p className="dashboard-preview-note">These are bounded previews. Open a full area to review every record.</p><div className="dashboard-checks-grid">
          <section className="panel dashboard-panel">
            <PanelHeader title="Today's crew schedule" detail="Loaded schedule preview" />
            <div className="workflow-list schedule-dashboard-list">
              {scheduleSummary.data.todaysCrewSchedules.length ? (
                scheduleSummary.data.todaysCrewSchedules.map((group) => (
                  <Link prefetch={false} className="workflow-row" href={`/admin/schedule?assigned_user_id=${group.user.id}`} key={group.user.id}>
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
                  </Link>
                ))
              ) : (
                <p className="subtle-empty">No crew schedule assigned for today yet.</p>
              )}
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Customer communications" detail="Loaded reminder and delivery preview" />
            <div className="pipeline-list">
              <Link prefetch={false} className="pipeline-row" href="/admin/communications"><span>Follow-ups due today</span><strong>{communicationSummary.data.dueToday.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/quotes"><span>Quotes awaiting response</span><strong>{communicationSummary.data.quotesAwaitingResponseCount}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/schedule?event_type=estimate&status=scheduled"><span>Appointments needing confirmation</span><strong>{scheduleSummary.data.upcomingEstimates.filter((entry) => entry.status === "scheduled").length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/communications"><span>Scheduled reminders</span><strong>{communicationSummary.data.scheduled.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/communications/delivery-review"><span>Failed communications — review delivery</span><strong>{communicationSummary.data.failed.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/invoices"><span>Overdue invoices</span><strong>{communicationSummary.data.overdueInvoiceCount}</strong></Link>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Fleet attention" detail="Safety, repairs, maintenance, and expiring documents" />
            <div className="pipeline-list">
              <Link prefetch={false} className="pipeline-row" href="/admin/equipment?status=out_of_service"><span>Out of service</span><strong>{equipmentSummary.data.outOfService.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/equipment?status=maintenance_due"><span>Maintenance due soon</span><strong>{equipmentSummary.data.dueMaintenance.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/equipment"><span>Open problem reports</span><strong>{equipmentSummary.data.openProblems.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/equipment"><span>Failed inspections</span><strong>{equipmentSummary.data.failedInspections.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/equipment"><span>Documents expiring in 30 days</span><strong>{equipmentSummary.data.expiringDocuments.length}</strong></Link>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Employee readiness" detail="Onboarding, access, training, credentials, and return review" />
            <div className="pipeline-list">
              <Link prefetch={false} className="pipeline-row" href="/admin/employees?status=onboarding"><span>Employees onboarding</span><strong>{employeeSummary.data.onboarding.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/access"><span>Access requests awaiting approval</span><strong>{employeeSummary.data.pendingAccess.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/employees?credential=expiring"><span>Credentials expiring soon</span><strong>{employeeSummary.data.expiring.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/employees?credential=expired"><span>Expired credentials</span><strong>{employeeSummary.data.expired.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/employees?training=none"><span>Missing training records</span><strong>{employeeSummary.data.missingTraining.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/safety"><span>Safety acknowledgments pending</span><strong>{employeeSummary.data.pendingSafetyAcknowledgments.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/employees"><span>Documents awaiting verification</span><strong>{employeeSummary.data.pendingDocuments.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/equipment"><span>Equipment/PPE overdue for return</span><strong>{employeeSummary.data.equipmentDueBack.length}</strong></Link>
              <Link prefetch={false} className="pipeline-row" href="/admin/employees?status=inactive"><span>Inactive access requiring review</span><strong>{employeeSummary.data.inactiveAccessReview.length}</strong></Link>
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
              <Link prefetch={false} href="/admin/customers">Add customer</Link>
              <Link prefetch={false} href="/admin/jobs">Create job</Link>
              <Link prefetch={false} href="/admin/quotes">Prepare quote</Link>
              <Link prefetch={false} href="/admin/invoices?new=1">New invoice</Link>
              <Link prefetch={false} href="/admin/schedule">Open schedule</Link>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Property managers and HOAs" detail="Loaded repeat-account preview" />
            <div className="pipeline-list">
              <div className="pipeline-row"><span>Accounts</span><strong>{organizationSummary.data.length}</strong></div>
              <div className="pipeline-row"><span>Open jobs</span><strong>{organizationSummary.data.reduce((sum, detail) => sum + detail.jobs.filter((job) => !["completed", "paid", "lost", "cancelled"].includes(job.status)).length, 0)}</strong></div>
              <div className="pipeline-row"><span>Quotes waiting</span><strong>{organizationSummary.data.reduce((sum, detail) => sum + detail.quotes.filter((quote) => quote.status === "sent" || quote.status === "change_requested").length, 0)}</strong></div>
              <div className="pipeline-row"><span>Unpaid invoices</span><strong>{organizationSummary.data.reduce((sum, detail) => sum + detail.invoices.filter((invoice) => ["sent", "partially_paid", "overdue"].includes(invoice.status)).length, 0)}</strong></div>
            </div>
            <div className="record-actions"><Link prefetch={false} href="/admin/organizations">Open organizations</Link></div>
          </section>
        </div></details>
        <footer className="dashboard-footer"><div><strong>Storm or urgent call?</strong><p>Confirm the callback number, service address, hazard and crew availability before promising an arrival time.</p></div><Link prefetch={false} href="/admin/schedule?new=1&event_type=emergency">Arrange a response <ArrowUpRight size={16} aria-hidden="true" /></Link>{hasAllowedRole(roles, platformRoleGroups.accessApproval) ? <Link prefetch={false} href="/admin/settings/system-health">System health</Link> : null}</footer>
  </>;
}

function DashboardOperationsLoading() {
  return <>
    <aside className="dashboard-next-up dashboard-next-loading" aria-busy="true"><h2>Next up</h2><p className="dashboard-muted" role="status">Loading work priorities…</p></aside>
    <section className="dashboard-daybook dashboard-operations-loading" aria-busy="true"><h2>The next two days</h2><p className="dashboard-muted" role="status">Loading your schedule and work queues…</p></section>
  </>;
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
    <details className="attention-queue">
    <summary className="workflow-row">
      <span className="workflow-row-icon" aria-hidden="true">
        <lane.Icon size={15} />
      </span>
      <span>
        <strong>{lane.title}</strong>
        {preview ? <small>{preview.title}: {preview.meta}</small> : <small>No items in this preview</small>}
      </span>
      <b>{lane.items.length} in preview <ChevronDown aria-hidden="true" size={15} /></b>
    </summary>
    <div className="workflow-list">{lane.items.map(item => <Link prefetch={false} className="workflow-row" key={item.href} href={item.href}><span><strong>{item.title}</strong><small>{item.meta}</small></span></Link>)}</div>
    <Link prefetch={false} className="secondary-action" href={lane.href}>View all {lane.title.toLowerCase()}</Link>
    </details>
  );
}

function formatDashboardDate() {
  return formatBusinessDateTime(new Date(), {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatDate(value: string) {
  return formatBusinessDateTime(new Date(value), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(value: string) {
  return formatBusinessDateTime(value, {
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

async function loadOptionalDashboardModule<T>(label: string, loader: Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader;
  } catch (error) {
    console.error(`${label} dashboard module failed`, error);
    return fallback;
  }
}

function formatFollowUpMeta(appointment: AppointmentWithRelations) {
  const timing = getBusinessDateKey(appointment.starts_at) === getBusinessDateKey(new Date()) ? "Due today" : "Overdue";
  const detail = appointment.calendar_notes ?? formatDate(appointment.starts_at);

  return `${timing}: ${detail}`;
}

function dashboardQueueHref(id: string, fallback: string) {
  if (id === "awaiting-schedule") return "/admin/jobs?view=to_be_scheduled";
  if (id === "awaiting-invoice") return "/admin/jobs?view=billing&invoice=none";
  return fallback;
}
