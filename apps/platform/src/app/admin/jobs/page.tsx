import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FilePlus2,
  Filter,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { CreateInvoiceFromJobAction } from "@/components/workflow-actions";
import { duplicateJob } from "@/lib/actions/duplicate-records";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getAssignableUsers } from "@/lib/data/appointments";
import {
  getJobsIndexCities,
  getJobsIndexMetrics,
  getJobsOperationsPage,
  type JobsIndexFilters,
  type JobsIndexSort,
  type JobsOperationalView,
} from "@/lib/data/jobs";
import type { JobOperationsIndexRow } from "@/lib/types/database";

const operationalViews: Array<{ key: JobsOperationalView; label: string }> = [
  { key: "active", label: "Active" },
  { key: "to_be_scheduled", label: "To be scheduled" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In progress" },
  { key: "billing", label: "Billing" },
  { key: "completed", label: "Completed" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "all", label: "All" },
];

const sortOptions: Array<{ key: JobsIndexSort; label: string }> = [
  { key: "action", label: "Action needed" },
  { key: "scheduled", label: "Scheduled soonest" },
  { key: "updated", label: "Recently updated" },
  { key: "customer", label: "Customer" },
  { key: "value", label: "Highest value" },
];

const pageSize = 30;

type JobsSearchParams = Record<string, string | string[] | undefined>;

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobsSearchParams> }) {
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/jobs");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening jobs" />;

  const canManageJobs = hasAllowedRole(context.roles, platformRoleGroups.internalStaff);
  const canViewFinancials = hasAllowedRole(context.roles, platformRoleGroups.financialReporting);
  const filters = parseFilters(query, canViewFinancials);
  const [jobs, metrics, assignedUsers, cities] = await Promise.all([
    getJobsOperationsPage(filters),
    getJobsIndexMetrics(filters),
    getAssignableUsers(),
    getJobsIndexCities(),
  ]);
  const totalPages = Math.max(1, Math.ceil(jobs.count / pageSize));
  const closeoutEnabled = process.env.CREW_JOB_CLOSEOUT_ENABLED === "true";

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content jobs-index-page">
        <header className="jobs-index-header">
          <div>
            <p className="surface-label"><ClipboardCheck aria-hidden="true" size={18} />Field operations</p>
            <h1>Jobs</h1>
            <p>Schedule and manage approved field work.</p>
          </div>
          {canManageJobs ? <div className="jobs-index-header-actions">
            <Link className="primary-action" href="/admin/quotes?new=1"><FilePlus2 size={18} />New quote</Link>
            <Link className="secondary-action" href="/admin/jobs/new"><Plus size={18} />Add job</Link>
            {closeoutEnabled ? <details className="jobs-header-more"><summary aria-label="More job actions"><MoreHorizontal size={19} /></summary><Link href="/admin/jobs/closeouts">Closeout review</Link></details> : null}
          </div> : null}
        </header>

        {[jobs.error, metrics.error, assignedUsers.error, cities.error].filter(Boolean).map((message) => <DataWarning key={message} message={message ?? ""} />)}

        <nav aria-label="Job summaries" className="jobs-summary-strip">
          <SummaryLink href={buildJobsHref(query, { view: "to_be_scheduled", page: null })} label="To be scheduled" value={metrics.data.toBeScheduled} />
          <SummaryLink href={buildJobsHref(query, { view: "active", date: easternDateString(new Date()), page: null })} label="Today" value={metrics.data.today} />
          <SummaryLink href={buildJobsHref(query, { view: "in_progress", page: null })} label="In progress" value={metrics.data.inProgress} />
          <SummaryLink href={buildJobsHref(query, { view: "billing", invoice: "none", page: null })} label="Awaiting invoice" value={metrics.data.awaitingInvoice} />
          <SummaryLink href={buildJobsHref(query, { view: "billing", invoice: "unpaid", page: null })} label="Unpaid invoices" value={metrics.data.unpaidInvoices} />
        </nav>

        <section className="jobs-index-toolbar" aria-label="Job search and filters">
          <nav className="jobs-view-tabs" aria-label="Operational views">
            {operationalViews.map((view) => <Link aria-current={filters.view === view.key ? "page" : undefined} href={buildJobsHref(query, { view: view.key, page: null })} key={view.key}>{view.label}</Link>)}
          </nav>

          <form className="jobs-search-row" method="get">
            <input name="view" type="hidden" value={filters.view} />
            <label className="jobs-search-field"><Search aria-hidden="true" size={19} /><span className="sr-only">Search jobs</span><input defaultValue={filters.search} name="q" placeholder="Search customer, address, scope, quote, or invoice" type="search" /></label>
            <label><span className="sr-only">Sort jobs</span><select defaultValue={filters.sort} name="sort">{sortOptions.filter((option) => option.key !== "value" || canViewFinancials).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
            <button type="submit">Apply</button>
          </form>

          <details className="jobs-more-filters" open={hasMoreFilters(filters)}>
            <summary><Filter size={17} />More filters<ChevronDown size={17} /></summary>
            <form className="jobs-more-filter-grid" method="get">
              <input name="view" type="hidden" value={filters.view} />
              {filters.search ? <input name="q" type="hidden" value={filters.search} /> : null}
              <input name="sort" type="hidden" value={filters.sort} />
              <label>Scheduled date<input defaultValue={filters.scheduledDate} name="date" type="date" /></label>
              <label>Assigned crew<select defaultValue={filters.assignedCrewId} name="crew"><option value="">All employees</option><option value="unassigned">Unassigned</option>{assignedUsers.data.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Unnamed employee"}</option>)}</select></label>
              <label>City<select defaultValue={filters.city} name="city"><option value="">All cities</option>{cities.data.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
              <label>Priority<select defaultValue={filters.priority} name="priority"><option value="">All priorities</option><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
              <label>Invoice<select defaultValue={filters.invoiceStatus} name="invoice"><option value="">Any invoice state</option><option value="none">No invoice</option><option value="unpaid">Any unpaid</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select></label>
              <div className="jobs-filter-actions"><button type="submit">Apply filters</button><Link href={`/admin/jobs?view=${filters.view}`}>Clear filters</Link></div>
            </form>
          </details>
        </section>

        <div className="jobs-results-heading">
          <div><strong>{viewLabel(filters.view)}</strong><span>{jobs.count} {jobs.count === 1 ? "job" : "jobs"}</span></div>
          {filters.search ? <p>Results for “{filters.search}”</p> : null}
        </div>

        {jobs.data.length ? <div className="jobs-operations-list">{jobs.data.map((job) => <JobOperationsRow canManageJobs={canManageJobs} canViewFinancials={canViewFinancials} job={job} key={job.id} />)}</div> : <JobsEmptyState filters={filters} />}

        {totalPages > 1 ? <nav aria-label="Jobs pagination" className="jobs-pagination">
          <Link aria-disabled={filters.page <= 1} href={filters.page <= 1 ? buildJobsHref(query, { page: 1 }) : buildJobsHref(query, { page: filters.page - 1 })}>Previous</Link>
          <span>Page {Math.min(filters.page, totalPages)} of {totalPages}</span>
          <Link aria-disabled={filters.page >= totalPages} href={filters.page >= totalPages ? buildJobsHref(query, { page: totalPages }) : buildJobsHref(query, { page: filters.page + 1 })}>Next</Link>
        </nav> : null}
      </div>
    </PlatformFrame>
  );
}

function JobOperationsRow({ canManageJobs, canViewFinancials, job }: { canManageJobs: boolean; canViewFinancials: boolean; job: JobOperationsIndexRow }) {
  const canCreateInvoice = canManageJobs && !job.invoice_id && ["accepted", "scheduled", "in_progress", "completed", "completed_pending_review", "ready_to_invoice"].includes(job.job_status);
  const warnings = jobWarnings(job);
  return <article className={`jobs-operation-row state-${job.operational_state}`}>
    <div className="jobs-row-main">
      <div className="jobs-row-title-line"><div><h2><Link href={`/admin/jobs/${job.id}`}>{job.contracting_party_name}</Link></h2><p>{job.display_title}</p></div><span className={`job-operational-status state-${job.operational_state}`}>{operationalLabel(job.operational_state)}</span></div>
      <div className="jobs-row-location"><MapPin size={16} /><span>{formatAddress(job)}</span></div>
      <p className="jobs-row-scope">{job.requested_scope || "No approved scope has been entered."}</p>
      <div className="jobs-row-schedule"><CalendarDays size={16} /><strong>{scheduleLabel(job)}</strong><span><Truck size={15} />{job.assigned_crew_name ?? job.assigned_crew_email ?? "Crew unassigned"}</span></div>
      {warnings.length ? <div className="jobs-row-warnings">{warnings.map((warning) => <span key={warning}><TriangleAlert size={14} />{warning}</span>)}</div> : null}
    </div>

    <div className="jobs-row-commercial">
      <div><span>Quote</span>{job.quote_id ? <Link href={`/admin/quotes/${job.quote_id}`}><strong>{job.quote_number ?? "Approved quote"}</strong>{canViewFinancials && job.quote_total_cents !== null ? <small>{money(job.quote_total_cents)}</small> : <small>{job.quote_status ? title(job.quote_status) : "Linked"}</small>}</Link> : <p>No approved quote linked</p>}</div>
      <div><span>Invoice</span>{job.invoice_id ? <Link href={`/admin/invoices/${job.invoice_id}`}><strong>{job.invoice_number ?? "Invoice draft"}</strong><small>{invoiceSummary(job, canViewFinancials)}</small></Link> : <p>Invoice not created</p>}</div>
    </div>

    <div className="jobs-index-row-actions">
      <Link className="primary-action" href={`/admin/jobs/${job.id}`}>Open job</Link>
      {job.invoice_id ? <Link className="secondary-action" href={`/admin/invoices/${job.invoice_id}`}>{job.invoice_status === "paid" ? "View payment" : "Open invoice"}</Link> : null}
      {canCreateInvoice ? <CreateInvoiceFromJobAction jobId={job.id} operationalStatus={job.operational_state === "work_complete" ? undefined : operationalLabel(job.operational_state)} /> : null}
      {!job.appointment_id && ["accepted", "scheduled"].includes(job.job_status) ? <Link className="secondary-action" href={`/admin/jobs/${job.id}#job-schedule`}>Schedule</Link> : null}
      <details className="jobs-row-more"><summary aria-label={`More actions for ${job.contracting_party_name}`}><MoreHorizontal size={18} />More</summary><div><Link href={`/crew/jobs/${job.id}`}>Crew view</Link>{canManageJobs ? <DuplicateRecordButton action={duplicateJob} buttonClassName="jobs-more-button" hiddenFieldName="job_id" hiddenFieldValue={job.id} label="Duplicate work order" pendingLabel="Copying..." /> : null}</div></details>
    </div>
  </article>;
}

function SummaryLink({ href, label, value }: { href: string; label: string; value: number }) {
  return <Link href={href}><span>{label}</span><strong>{value}</strong></Link>;
}

function JobsEmptyState({ filters }: { filters: JobsIndexFilters }) {
  const content = filters.search
    ? ["No search results", "Try another customer, address, scope, quote, or invoice number."]
    : filters.view === "to_be_scheduled"
      ? ["No jobs need scheduling", "All approved jobs currently have a work appointment."]
      : filters.view === "billing"
        ? ["No jobs awaiting billing", "All matching work currently has the expected invoice state."]
        : filters.scheduledDate
          ? ["No work on this date", "There are no matching active job appointments scheduled for this date."]
          : ["No matching jobs", "Choose another operational view or remove a filter."];
  return <section className="jobs-compact-empty"><strong>{content[0]}</strong><p>{content[1]}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function parseFilters(query: JobsSearchParams, canViewFinancials: boolean): JobsIndexFilters {
  const viewValue = first(query.view);
  const sortValue = first(query.sort);
  const pageValue = Number.parseInt(first(query.page) || "1", 10);
  return {
    view: operationalViews.some((view) => view.key === viewValue) ? viewValue as JobsOperationalView : "active",
    search: first(query.q).slice(0, 160),
    scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(first(query.date)) ? first(query.date) : "",
    assignedCrewId: first(query.crew).slice(0, 80),
    city: first(query.city).slice(0, 120),
    priority: ["normal", "urgent", "emergency"].includes(first(query.priority)) ? first(query.priority) : "",
    invoiceStatus: ["none", "unpaid", "draft", "sent", "partially_paid", "overdue", "paid"].includes(first(query.invoice)) ? first(query.invoice) : "",
    sort: sortOptions.some((sort) => sort.key === sortValue) && (sortValue !== "value" || canViewFinancials) ? sortValue as JobsIndexSort : "action",
    page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1,
    pageSize,
  };
}

function buildJobsHref(current: JobsSearchParams, updates: Record<string, string | number | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) params.set(key, normalized);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  if (!("page" in updates)) params.delete("page");
  const query = params.toString();
  return query ? `/admin/jobs?${query}` : "/admin/jobs";
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function hasMoreFilters(filters: JobsIndexFilters) {
  return Boolean(filters.scheduledDate || filters.assignedCrewId || filters.city || filters.priority || filters.invoiceStatus);
}

function viewLabel(view: JobsOperationalView) {
  return operationalViews.find((item) => item.key === view)?.label ?? "Active";
}

function operationalLabel(state: JobOperationsIndexRow["operational_state"]) {
  return { to_be_scheduled: "To be scheduled", scheduled: "Scheduled", in_progress: "In progress", work_complete: "Work complete", invoiced: "Invoiced", paid: "Paid", needs_attention: "Needs attention", cancelled: "Cancelled" }[state];
}

function formatAddress(job: JobOperationsIndexRow) {
  return [job.street, job.city, job.state, job.postal_code].filter(Boolean).join(", ") || "Service address missing";
}

function scheduleLabel(job: JobOperationsIndexRow) {
  if (!job.appointment_starts_at) return "Unscheduled";
  const startsAt = new Date(job.appointment_starts_at);
  const date = easternDateString(startsAt);
  const today = easternDateString(new Date());
  const tomorrow = easternDateString(new Date(Date.now() + 86_400_000));
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(startsAt);
  if (date === today) return `Today · ${time}`;
  if (date === tomorrow) return `Tomorrow · ${time}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(startsAt);
}

function easternDateString(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function jobWarnings(job: JobOperationsIndexRow) {
  const warnings: string[] = [];
  if (job.operational_state === "to_be_scheduled" && job.job_status === "accepted") warnings.push("Needs scheduling");
  if (["scheduled", "in_progress"].includes(job.operational_state) && !job.assigned_crew_user_id) warnings.push("No crew assigned");
  if (job.appointment_starts_at && new Date(job.appointment_starts_at) <= new Date() && job.job_status !== "in_progress" && job.appointment_status !== "in_progress") warnings.push("Start time passed");
  if (job.approved_unbilled_change_order_count > 0) warnings.push(`${job.approved_unbilled_change_order_count} approved ${job.approved_unbilled_change_order_count === 1 ? "addition" : "additions"} not billed`);
  if (job.invoice_status === "overdue") warnings.push("Invoice overdue");
  if (job.failed_communication_count > 0) warnings.push("Communication failed");
  if (job.has_cancelled_appointment && !job.appointment_id && ["accepted", "scheduled", "in_progress"].includes(job.job_status)) warnings.push("Cancelled appointment");
  if (job.priority === "urgent") warnings.push("Urgent");
  if (job.priority === "emergency") warnings.push("Emergency");
  return warnings;
}

function invoiceSummary(job: JobOperationsIndexRow, canViewFinancials: boolean) {
  if (job.invoice_status === "paid") return "Paid";
  if (job.invoice_status === "partially_paid") return canViewFinancials && job.invoice_balance_due_cents !== null ? `${money(job.invoice_balance_due_cents)} remaining` : "Partially paid";
  if (job.invoice_status === "draft") return "Draft";
  if (job.invoice_status === "overdue") return canViewFinancials && job.invoice_balance_due_cents !== null ? `Overdue · ${money(job.invoice_balance_due_cents)} due` : "Overdue";
  if (job.invoice_status === "sent") return canViewFinancials && job.invoice_balance_due_cents !== null ? `Sent · ${money(job.invoice_balance_due_cents)} due` : "Sent";
  return title(job.invoice_status ?? "invoice");
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
