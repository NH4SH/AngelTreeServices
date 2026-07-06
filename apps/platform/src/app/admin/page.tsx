import {
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
import { getFollowUpsDue } from "@/lib/data/appointments";
import { getUnpaidInvoices } from "@/lib/data/invoices";
import { getDashboardJobSummaries } from "@/lib/data/jobs";
import { getOrganizationDashboardSummary } from "@/lib/data/organizations";
import { getQuotesAwaitingResponse } from "@/lib/data/quotes";
import type { AppointmentWithRelations } from "@/lib/types/database";

export default async function AdminPage() {
  const context = await getAuthenticatedPlatformContext("/admin");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the admin CRM" />;
  }

  const [jobSummaries, awaitingQuotes, followUps, organizationSummary] = await Promise.all([
    getDashboardJobSummaries(),
    getQuotesAwaitingResponse(),
    getFollowUpsDue(),
    getOrganizationDashboardSummary(),
  ]);
  const unpaidInvoices = await getUnpaidInvoices();

  const lanes: {
    title: string;
    description: string;
    Icon: LucideIcon;
    href: string;
    items: { title: string; meta: string }[];
    placeholder?: string;
  }[] = [
    {
      title: "New leads",
      description: "Requests that need first contact, qualification, or a quick call back.",
      Icon: PhoneCall,
      href: "/admin/jobs",
      items: jobSummaries.lanes.newLeads.map((job) => ({
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
      items: awaitingQuotes.data.map((quote) => ({
        title: quote.quote_number ?? "Sent quote",
        meta: quote.customers?.display_name ?? "Unknown customer",
      })),
    },
    {
      title: "Today's jobs",
      description: "Crew-ready work scheduled for today.",
      Icon: Truck,
      href: "/admin/schedule",
      items: jobSummaries.lanes.todaysJobs.map((job) => ({
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
        title: invoice.invoice_number ?? "Open invoice",
        meta: `${invoice.customers?.display_name ?? "Unknown customer"} - ${formatCurrency(invoice.balance_due_cents)}`,
      })),
    },
  ];
  const todayLanes = [lanes[3], lanes[4]];
  const attentionLanes = [lanes[0], lanes[1], lanes[2], lanes[5]];
  const pipelineSummary = [
    { label: "New leads", value: jobSummaries.lanes.newLeads.length },
    { label: "Estimates", value: jobSummaries.lanes.estimatesToSchedule.length },
    { label: "Quotes waiting", value: awaitingQuotes.data.length },
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

        {[jobSummaries.error, awaitingQuotes.error, followUps.error, unpaidInvoices.error, organizationSummary.error]
          .filter(Boolean)
          .map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="dashboard-grid" aria-label="CRM operational overview">
          <section className="panel dashboard-panel">
            <PanelHeader title="Today" detail="Scheduled work and reminders" />
            <div className="workflow-list">
              {todayLanes.map((lane) => <WorkflowLane lane={lane} key={lane.title} />)}
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
            <PanelHeader title="Quick actions" detail="Most common next steps" />
            <div className="quick-actions">
              <a href="/admin/customers">Add customer</a>
              <a href="/admin/jobs">Create job</a>
              <a href="/admin/quotes">Prepare quote</a>
              <a href="/admin/schedule">Open schedule</a>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <PanelHeader title="Recent activity" detail="Audit trail placeholder" />
            <p className="subtle-empty">
              Activity log entries will appear here after timeline events are wired into the CRM.
            </p>
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
            First usable workflow: customer to service location to job to quote
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
    items: { title: string; meta: string }[];
  };
}) {
  return (
    <a className="workflow-row" href={lane.href}>
      <span className="workflow-row-icon" aria-hidden="true">
        <lane.Icon size={15} />
      </span>
      <span>
        <strong>{lane.title}</strong>
        {lane.items[0] ? <small>{lane.items[0].title}: {lane.items[0].meta}</small> : <small>Clear for now</small>}
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
