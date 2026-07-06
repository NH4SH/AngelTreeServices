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

  return (
    <PlatformFrame active="admin" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <Leaf aria-hidden="true" size={18} />
            Internal CRM
          </p>
          <h1>Keep leads, estimates, quotes, jobs, and follow-ups moving.</h1>
          <p>
            This dashboard reads from the protected CRM tables and stays empty until real staff users
            add records through the new admin pages.
          </p>
        </section>

        {[jobSummaries.error, awaitingQuotes.error, followUps.error, unpaidInvoices.error, organizationSummary.error]
          .filter(Boolean)
          .map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="admin-board workflow-board" aria-label="CRM workflow lanes">
          {lanes.map((lane) => (
            <article className="work-card workflow-card" key={lane.title}>
              <div className="workflow-card-top">
                <span className="workflow-icon" aria-hidden="true">
                  <lane.Icon size={20} />
                </span>
                <span className="workflow-count">{lane.items.length}</span>
              </div>
              <h2>{lane.title}</h2>
              <p>{lane.description}</p>
              {lane.items.length > 0 ? (
                <ul className="workflow-items">
                  {lane.items.slice(0, 3).map((item) => (
                    <li key={`${lane.title}-${item.title}-${item.meta}`}>
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workflow-empty">{lane.placeholder ?? "Nothing waiting here right now."}</p>
              )}
            </article>
          ))}
        </section>

        <section className="notice-panel">
          <strong><Building2 aria-hidden="true" size={18} /> Property manager and HOA workflow</strong>
          <p>
            {organizationSummary.data.length} organization account{organizationSummary.data.length === 1 ? "" : "s"} tracked.
            {" "}{organizationSummary.data.reduce((sum, detail) => sum + detail.jobs.filter((job) => !["completed", "paid", "lost", "cancelled"].includes(job.status)).length, 0)} open organization jobs,
            {" "}{organizationSummary.data.reduce((sum, detail) => sum + detail.quotes.filter((quote) => quote.status === "sent" || quote.status === "change_requested").length, 0)} quotes awaiting response,
            {" "}{organizationSummary.data.reduce((sum, detail) => sum + detail.invoices.filter((invoice) => ["sent", "partially_paid", "overdue"].includes(invoice.status)).length, 0)} unpaid invoices, and
            {" "}{organizationSummary.data.reduce((sum, detail) => sum + detail.jobs.filter((job) => ["completed", "invoiced", "paid"].includes(job.status)).length, 0)} recently completed jobs.
          </p>
          <div className="record-actions"><a href="/admin/organizations">Open organizations</a></div>
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
