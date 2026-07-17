import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign, Clock3, Download, Filter, Leaf, Minus, ReceiptText, TrendingUp, UsersRound } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { LaborCostRateForm, ReportingSettingsForm } from "@/components/reporting-input-forms";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getReportData, getReportingSettings, relation, successfulPaymentTotal, type ReportData, type ReportInvoice, type ReportJob, type ReportQuote } from "@/lib/data/reports";
import { formatRange, median, metricDefinitions, percentChange, reportViews, resolveReportFilters, safeRate, type ReportFilters, type ReportView } from "@/lib/reporting/definitions";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportsPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/reports");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening reports" />;

  const settingsResult = await getReportingSettings();
  const filters = resolveReportFilters(query, settingsResult.data.business_timezone);
  let report: ReportData | null = null;
  let loadError = settingsResult.error;
  try {
    report = await getReportData(filters, context.roles, context.user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Reports could not be loaded.";
  }

  return (
    <PlatformFrame active="reports" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content reports-page">
        <section className="page-heading reports-heading">
          <div><p className="surface-label"><BarChart3 size={17} />Business reporting</p><h1>Reports</h1><p>Sales, operations, cash, and estimated job performance from CRM records.</p></div>
          {report?.canViewFinancials ? <Link className="secondary-action" href={exportHref(filters)}><Download size={17} />Export current view</Link> : null}
        </section>

        <ReportFiltersForm filters={filters} report={report} />
        <nav className="report-tabs" aria-label="Report sections">
          {reportViews.map(([key, label]) => <Link aria-current={filters.view === key ? "page" : undefined} href={viewHref(filters, key)} key={key}>{label}</Link>)}
        </nav>
        <p className="report-range"><Clock3 size={16} /><strong>Active range:</strong> {formatRange(filters)}</p>

        {loadError ? <DataWarning message={loadError} /> : null}
        {report?.warnings.map((warning) => <DataWarning key={warning} message={warning} />)}
        {report ? <ReportContent data={report} filters={filters} /> : null}

        <details className="report-definitions">
          <summary>Metric definitions</summary>
          <dl>{Object.entries(metricDefinitions).map(([key, definition]) => <div key={key}><dt>{title(key)}</dt><dd>{definition}</dd></div>)}</dl>
        </details>
      </div>
    </PlatformFrame>
  );
}

function ReportFiltersForm({ filters, report }: { filters: ReportFilters; report: ReportData | null }) {
  return (
    <form className="report-filter-panel" method="get">
      <input name="view" type="hidden" value={filters.view} />
      <div className="report-filter-heading"><Filter size={18} /><div><strong>Report filters</strong><span>Filters stay in the URL for sharing and export.</span></div></div>
      <label>Date range<select defaultValue={filters.preset} name="range"><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="last_7">Last 7 days</option><option value="last_30">Last 30 days</option><option value="last_90">Last 90 days</option><option value="previous">Previous month</option><option value="custom">Custom</option></select></label>
      <label>Start<input defaultValue={filters.startDate} name="start" type="date" /></label>
      <label>End<input defaultValue={filters.endDate} name="end" type="date" /></label>
      <label>Lead source<select defaultValue={filters.leadSourceId} name="source"><option value="">All sources</option>{report?.leadSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      <label>Service<select defaultValue={filters.serviceCategoryId} name="service"><option value="">All services</option>{report?.serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label>Customer<select defaultValue={filters.customerId} name="customer"><option value="">All customers</option>{report?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display_name}</option>)}</select></label>
      <label>Employee<select defaultValue={filters.employeeId} name="employee"><option value="">All employees</option>{report?.employees.filter((employee) => employee.auth_user_id).map((employee) => <option key={employee.id} value={employee.auth_user_id!}>{employee.preferred_name || employee.legal_name || "Employee"}</option>)}</select></label>
      <label>Status<input defaultValue={filters.status} name="status" placeholder="All statuses" /></label>
      <div className="report-filter-actions"><button type="submit">Apply filters</button><Link className="secondary-action" href={`/admin/reports?view=${filters.view}`}>Clear</Link></div>
    </form>
  );
}

function ReportContent({ data, filters }: { data: ReportData; filters: ReportFilters }) {
  if (data.salesScope === "own" && !["executive", "quotes", "sources", "services"].includes(filters.view)) {
    return <section className="empty-state"><UsersRound size={30} /><h2>Personal sales scope</h2><p>Estimator reporting is limited to quotes assigned to your account. Company operations, labor, fleet, accounts receivable, and profitability remain restricted.</p></section>;
  }
  if (["revenue", "profitability"].includes(filters.view) && !data.canViewFinancials) {
    return <RestrictedReport />;
  }
  switch (filters.view) {
    case "pipeline": return <PipelineReport data={data} />;
    case "quotes": return <QuoteReport data={data} />;
    case "revenue": return <RevenueReport data={data} />;
    case "profitability": return <ProfitabilityReport data={data} />;
    case "labor": return <LaborReport data={data} />;
    case "scheduling": return <SchedulingReport data={data} />;
    case "customers": return <CustomerReport data={data} />;
    case "sources": return <LeadSourceReport data={data} />;
    case "services": return <ServiceReport data={data} />;
    case "fleet": return <FleetReport data={data} />;
    case "quality": return <DataQualityReport data={data} />;
    default: return <ExecutiveReport data={data} />;
  }
}

function ExecutiveReport({ data }: { data: ReportData }) {
  const eligible = eligibleQuotes(data.quotes);
  const approved = data.quotes.filter(isApprovedQuote);
  const invoices = data.invoices.filter((invoice) => invoice.status !== "void");
  const collected = sum(data.payments, "amount_cents");
  const completed = data.jobs.filter(isCompletedJob);
  const cards = [
    { label: "New leads", value: String(data.jobs.filter((job) => ["new_lead", "estimate_scheduled"].includes(job.status)).length), previous: data.comparisonAvailable ? data.previous.leads : null, current: data.jobs.filter((job) => ["new_lead", "estimate_scheduled"].includes(job.status)).length, href: "/admin/jobs" },
    { label: "Quote approval rate", value: formatPercent(safeRate(approved.length, eligible.length)), previous: null, current: null, href: viewHrefSimple("quotes") },
    { label: "Approved quote value", value: money(sum(approved, "total_cents")), previous: data.comparisonAvailable ? data.previous.approvedCents : null, current: sum(approved, "total_cents"), href: viewHrefSimple("quotes") },
    { label: "Invoiced", value: data.canViewFinancials ? money(sum(invoices, "total_cents")) : "Restricted", previous: data.comparisonAvailable ? data.previous.invoicedCents : null, current: sum(invoices, "total_cents"), href: viewHrefSimple("revenue") },
    { label: "Collected", value: data.canViewFinancials ? money(collected) : "Restricted", previous: data.comparisonAvailable ? data.previous.collectedCents : null, current: collected, href: viewHrefSimple("revenue") },
    { label: "Outstanding", value: data.canViewFinancials ? money(sum(data.arInvoices, "balance_due_cents")) : "Restricted", previous: null, current: null, href: viewHrefSimple("revenue") },
    { label: "Jobs completed", value: String(completed.length), previous: data.comparisonAvailable ? data.previous.completedJobs : null, current: completed.length, href: "/admin/jobs" },
    { label: "Awaiting invoice", value: String(data.jobs.filter((job) => ["completed", "ready_to_invoice"].includes(job.status)).length), previous: null, current: null, href: "/admin/jobs" },
  ];
  const monthly = monthlySeries(data.invoices.filter((invoice) => invoice.status !== "void"), "created_at", "total_cents");
  return <><section className="report-metric-grid">{cards.map((card) => <MetricCard {...card} key={card.label} />)}</section><section className="report-two-column"><ReportPanel title="Invoiced trend" note="Invoice totals, not collected cash."><BarList rows={monthly.map((row) => ({ label: row.label, value: row.value, display: money(row.value) }))} /></ReportPanel><ReportPanel title="Current attention" note="Operational records requiring follow-through."><AttentionList rows={attentionRows(data)} /></ReportPanel></section><ReportTable title="Recent source records" columns={["Record", "Customer", "Status", "Value", "Created"]} rows={data.quotes.slice(0, 30).map(quoteRow)} /></>;
}

function PipelineReport({ data }: { data: ReportData }) {
  const stages = [
    { label: "Lead", records: data.jobs.filter((job) => job.status === "new_lead"), value: 0 },
    { label: "Estimate scheduled", records: data.jobs.filter((job) => job.status === "estimate_scheduled"), value: 0 },
    { label: "Quote draft", records: data.quotes.filter((quote) => quote.status === "draft"), value: sum(data.quotes.filter((quote) => quote.status === "draft"), "total_cents") },
    { label: "Quote sent", records: data.quotes.filter((quote) => ["sent", "change_requested"].includes(quote.status)), value: sum(data.quotes.filter((quote) => ["sent", "change_requested"].includes(quote.status)), "total_cents") },
    { label: "Approved", records: data.quotes.filter(isApprovedQuote), value: sum(data.quotes.filter(isApprovedQuote), "total_cents") },
    { label: "Scheduled", records: data.jobs.filter((job) => job.status === "scheduled"), value: 0 },
    { label: "Completed", records: data.jobs.filter(isCompletedJob), value: 0 },
    { label: "Invoiced", records: data.invoices.filter((invoice) => invoice.status !== "void"), value: sum(data.invoices.filter((invoice) => invoice.status !== "void"), "total_cents") },
    { label: "Paid", records: data.invoices.filter((invoice) => invoice.status === "paid"), value: sum(data.invoices.filter((invoice) => invoice.status === "paid"), "total_cents") },
  ];
  return <><ReportPanel title="Pipeline funnel" note="Counts reflect records in the active date range; values appear where a priced record exists."><div className="pipeline-funnel">{stages.map((stage, index) => <article key={stage.label}><span>{index + 1}</span><div><strong>{stage.label}</strong><small>{stage.value ? money(stage.value) : "Operational stage"} · avg age {averageAge(stage.records)} · {index === 0 ? "entry" : `${formatPercent(safeRate(stage.records.length, stages[index - 1].records.length))} from prior`}</small></div><b>{stage.records.length}</b></article>)}</div></ReportPanel><ReportPanel title="Stalled work" note="Thresholds come from reporting settings."><AttentionList rows={stalledRows(data)} /></ReportPanel>{data.canManageSettings ? <ReportingSettingsForm settings={data.settings} /> : null}</>;
}

function QuoteReport({ data }: { data: ReportData }) {
  const eligible = eligibleQuotes(data.quotes); const approved = eligible.filter(isApprovedQuote); const declined = eligible.filter((quote) => quote.status === "declined");
  const values = data.quotes.map((quote) => quote.total_cents);
  const metrics = [{ label: "Quotes", value: String(data.quotes.length) }, { label: "Quoted value", value: money(sum(data.quotes, "total_cents")) }, { label: "Average", value: money(values.length ? sum(data.quotes, "total_cents") / values.length : 0) }, { label: "Median", value: median(values) == null ? "No data" : money(median(values) ?? 0) }, { label: "Approval rate", value: formatPercent(safeRate(approved.length, eligible.length)) }, { label: "Decline rate", value: formatPercent(safeRate(declined.length, eligible.length)) }, { label: "Average create to send", value: averageElapsed(data.quotes.filter((quote) => quote.sent_at), "created_at", "sent_at") }, { label: "Average send to approval", value: averageElapsed(approved.filter((quote) => quote.sent_at && quote.approved_at), "sent_at", "approved_at") }];
  const estimatorValues = groupValue(approved, (quote) => relation(quote.profiles)?.full_name || relation(quote.profiles)?.email || "Not assigned", (quote) => quote.total_cents);
  return <><section className="report-metric-grid compact">{metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}</section><section className="report-two-column"><ReportPanel title="Quote status" note="Drafts are excluded from approval and decline rates."><BarList rows={groupCount(data.quotes, (quote) => title(quote.status)).map((row) => ({ ...row, display: String(row.value) }))} /></ReportPanel><ReportPanel title="Approved value by estimator" note="Quotes without an estimator remain explicit in Data Quality."><BarList rows={estimatorValues.map((row) => ({ ...row, display: money(row.value) }))} /></ReportPanel></section><ReportTable title="Quote drilldown" columns={["Quote", "Customer", "Estimator", "Status", "Total", "Sent / age"]} rows={data.quotes.map(quoteRow)} /></>;
}

function RevenueReport({ data }: { data: ReportData }) {
  const activeInvoices = data.invoices.filter((invoice) => invoice.status !== "void"); const collected = sum(data.payments, "amount_cents"); const open = data.arInvoices; const overdue = open.filter((invoice) => daysOverdue(invoice) > 0); const refunded = data.invoices.flatMap((invoice) => invoice.payments).filter((payment) => payment.status === "refunded").reduce((total, payment) => total + payment.amount_cents, 0);
  const aging = arAging(open);
  return <><section className="report-metric-grid"><MetricCard label="Invoiced" value={money(sum(activeInvoices, "total_cents"))} /><MetricCard label="Collected" value={money(collected)} /><MetricCard label="Outstanding" value={money(sum(open, "balance_due_cents"))} /><MetricCard label="Overdue" value={money(sum(overdue, "balance_due_cents"))} /><MetricCard label="Refunded records" value={money(refunded)} /><MetricCard label="Average invoice" value={money(activeInvoices.length ? sum(activeInvoices, "total_cents") / activeInvoices.length : 0)} /><MetricCard label="Average days to payment" value={averageDaysToPayment(activeInvoices)} /></section><section className="report-two-column"><ReportPanel title="Accounts receivable aging" note="This as-of queue includes older unpaid invoices. Paid, void, and zero-balance invoices are excluded."><BarList rows={aging.map((row) => ({ label: row.label, value: row.amount, display: `${money(row.amount)} · ${row.count}` }))} /></ReportPanel><ReportPanel title="Payment methods" note="Successful payment rows only."><BarList rows={groupValue(data.payments, (payment) => title(payment.payment_method || payment.provider || "Other"), (payment) => payment.amount_cents).map((row) => ({ ...row, display: money(row.value) }))} /></ReportPanel></section><ReportTable title="Accounts receivable" columns={["Invoice", "Customer", "Due", "Total", "Payments", "Balance"]} rows={open.sort((a, b) => daysOverdue(b) - daysOverdue(a)).map(invoiceRow)} /></>;
}

function ProfitabilityReport({ data }: { data: ReportData }) {
  const complete = data.profitability.filter((row) => row.profitCents != null); const revenue = complete.reduce((sumValue, row) => sumValue + row.revenueCents, 0); const profit = complete.reduce((sumValue, row) => sumValue + (row.profitCents ?? 0), 0);
  return <><section className="report-callout"><TrendingUp size={22} /><div><strong>Estimated profitability</strong><p>This is an operational estimate, not formal accounting. Jobs without approved time, effective labor cost, or invoice revenue remain incomplete.</p></div></section><section className="report-metric-grid compact"><MetricCard label="Complete estimates" value={`${complete.length} of ${data.profitability.length}`} /><MetricCard label="Estimated gross profit" value={complete.length ? money(profit) : "Unavailable"} /><MetricCard label="Estimated gross margin" value={complete.length ? formatPercent(safeRate(profit, revenue)) : "Unavailable"} /><MetricCard label="Missing cost inputs" value={String(data.profitability.length - complete.length)} /></section><ReportTable title="Job profitability" columns={["Job", "Customer", "Revenue", "Labor", "Direct / equipment", "Estimated margin"]} rows={data.profitability.map((row) => [<Link href={`/admin/jobs/${row.job.id}`} key="job">{row.job.service_type ? title(row.job.service_type) : "Work order"}</Link>, relation(row.job.customers)?.display_name ?? "Unknown", money(row.revenueCents), row.laborCostCents == null ? completenessLabel(row.completeness) : `${money(row.laborCostCents)} · ${row.laborHours.toFixed(1)}h`, `${money(row.directCostCents)} / ${money(row.equipmentCostCents)}`, row.marginPercent == null ? completenessLabel(row.completeness) : formatPercent(row.marginPercent)])} /><section className="report-two-column"><LaborCostRateForm employees={data.employees} /><ReportTable title="Historical labor rates" columns={["Employee", "Effective", "End", "Hourly cost", "Burden"]} rows={data.laborRates.map((rate) => { const employee = relation(rate.employee_records); return [employee?.preferred_name || employee?.legal_name || "Employee", rate.effective_from, rate.effective_to || "Current", money(rate.hourly_cost_cents), rate.burden_percent == null ? "Default" : `${rate.burden_percent}%`]; })} /></section></>;
}

function LaborReport({ data }: { data: ReportData }) {
  const approved = data.timeEntries.filter((entry) => latestApproval(entry) === "approved"); const byEmployee = groupValue(approved, (entry) => relation(entry.profiles)?.full_name || relation(entry.profiles)?.email || "Unknown employee", durationHours);
  const jobHours = approved.filter((entry) => entry.job_id); const nonJob = approved.filter((entry) => !entry.job_id);
  return <><section className="report-metric-grid compact"><MetricCard label="Approved hours" value={`${approved.reduce((sumValue, entry) => sumValue + durationHours(entry), 0).toFixed(1)}h`} /><MetricCard label="Job hours" value={`${jobHours.reduce((sumValue, entry) => sumValue + durationHours(entry), 0).toFixed(1)}h`} /><MetricCard label="Non-job hours" value={`${nonJob.reduce((sumValue, entry) => sumValue + durationHours(entry), 0).toFixed(1)}h`} /><MetricCard label="Unapproved entries" value={String(data.timeEntries.length - approved.length)} /></section><ReportPanel title="Approved hours by employee" note="Corrected entry values are used. This report is not an automatic performance rating."><BarList rows={byEmployee.map((row) => ({ ...row, display: `${row.value.toFixed(1)}h` }))} /></ReportPanel><ReportTable title="Time drilldown" columns={["Employee", "Type", "Job", "Clock in", "Hours", "Review"]} rows={data.timeEntries.map((entry) => [relation(entry.profiles)?.full_name || relation(entry.profiles)?.email || "Unknown", title(entry.time_type), entry.job_id ? <Link href={`/admin/jobs/${entry.job_id}`} key="job">Open job</Link> : "Not linked", formatDate(entry.clock_in_at), entry.clock_out_at ? `${durationHours(entry).toFixed(2)}h` : "Active", title(latestApproval(entry) || "unreviewed")])} /></>;
}

function SchedulingReport({ data }: { data: ReportData }) {
  const scheduledHours = data.scheduleEvents.reduce((total, event) => total + eventHours(event), 0); const completed = data.scheduleEvents.filter((event) => event.status === "completed"); const cancelled = data.scheduleEvents.filter((event) => event.status === "cancelled");
  return <><section className="report-metric-grid compact"><MetricCard label="Scheduled events" value={String(data.scheduleEvents.length)} /><MetricCard label="Scheduled hours" value={`${scheduledHours.toFixed(1)}h`} /><MetricCard label="Completed" value={String(completed.length)} /><MetricCard label="Cancelled" value={String(cancelled.length)} /><MetricCard label="Approved work unscheduled" value={String(data.jobs.filter((job) => job.status === "accepted" && !job.scheduled_start_at).length)} /><MetricCard label="Capacity utilization" value="Unavailable" /></section><p className="report-inline-note">Capacity remains unavailable until employee availability is explicitly configured. Scheduled hours and recorded time stay separate.</p><ReportPanel title="Events by type" note="Selected period."><BarList rows={groupCount(data.scheduleEvents, (event) => title(event.event_type)).map((row) => ({ ...row, display: String(row.value) }))} /></ReportPanel><ReportTable title="Schedule drilldown" columns={["Event", "Type", "Status", "Starts", "Hours", "Job"]} rows={data.scheduleEvents.map((event) => [event.title, title(event.event_type), title(event.status), formatDate(event.starts_at), `${eventHours(event).toFixed(1)}h`, event.job_id ? <Link href={`/admin/jobs/${event.job_id}`} key="job">Open job</Link> : "No job"])} /></>;
}

function CustomerReport({ data }: { data: ReportData }) {
  const revenueByCustomer = new Map<string, number>(); data.invoices.filter((invoice) => invoice.status !== "void").forEach((invoice) => revenueByCustomer.set(invoice.customer_id, (revenueByCustomer.get(invoice.customer_id) ?? 0) + invoice.total_cents));
  const rows = [...revenueByCustomer.entries()].map(([customerId, value]) => ({ customerId, label: relation(data.invoices.find((invoice) => invoice.customer_id === customerId)?.customers ?? null)?.display_name ?? "Unknown", value })).sort((a, b) => b.value - a.value);
  const repeat = groupCount(data.jobs.filter(isCompletedJob), (job) => job.customer_id).filter((row) => row.value > 1).length;
  const areas = groupCount(data.jobs, (job) => { const location = relation(job.service_locations); return location ? `${location.city}, ${location.state}${location.postal_code ? ` ${location.postal_code}` : ""}` : "Location not recorded"; });
  return <><section className="report-metric-grid compact"><MetricCard label="New customers" value={String(data.customers.length)} /><MetricCard label="Repeat customers" value={String(repeat)} /><MetricCard label="Customers invoiced" value={String(rows.length)} /><MetricCard label="Customers with balances" value={String(new Set(data.arInvoices.map((invoice) => invoice.customer_id)).size)} /></section><section className="report-two-column"><ReportPanel title="Top customers by invoiced value" note="Invoice value is not collected cash."><BarList rows={rows.slice(0, 15).map((row) => ({ label: row.label, value: row.value, display: money(row.value) }))} /></ReportPanel><ReportPanel title="Work by service area" note="Structured city, state, and ZIP only; no address inference or geocoding."><BarList rows={areas.map((row) => ({ ...row, display: `${row.value} jobs` }))} /></ReportPanel></section><ReportTable title="Customer drilldown" columns={["Customer", "Source", "Area", "Status", "Created"]} rows={data.customers.map((customer) => [<Link href={`/admin/customers/${customer.id}`} key="customer">{customer.display_name}</Link>, relation(customer.lead_sources)?.name ?? "Not recorded", relation(customer.service_locations)?.city ?? "Not recorded", title(customer.status), formatDate(customer.created_at)])} /></>;
}

function LeadSourceReport({ data }: { data: ReportData }) {
  const rows = data.leadSources.map((source) => { const jobs = data.jobs.filter((job) => job.lead_source_id === source.id); const quotes = data.quotes.filter((quote) => relation(quote.customers)?.lead_source_id === source.id); const approved = quotes.filter(isApprovedQuote); const invoices = data.invoices.filter((invoice) => relation(invoice.customers)?.lead_source_id === source.id && invoice.status !== "void"); return { source, jobs: jobs.length, quotes: quotes.length, approved: sum(approved, "total_cents"), invoiced: sum(invoices, "total_cents"), rate: safeRate(approved.length, eligibleQuotes(quotes).length) }; });
  return <><ReportPanel title="Leads by source" note="Unknown remains explicit; no source is inferred from notes."><BarList rows={[...rows.map((row) => ({ label: row.source.name, value: row.jobs, display: String(row.jobs) })), { label: "Not recorded", value: data.jobs.filter((job) => !job.lead_source_id).length, display: String(data.jobs.filter((job) => !job.lead_source_id).length) }]} /></ReportPanel><ReportTable title="Source performance" columns={["Source", "Leads", "Quotes", "Approval rate", "Approved value", "Invoiced"]} rows={rows.map((row) => [row.source.name, String(row.jobs), String(row.quotes), formatPercent(row.rate), money(row.approved), data.canViewFinancials ? money(row.invoiced) : "Restricted"])} /></>;
}

function ServiceReport({ data }: { data: ReportData }) {
  const rows = data.serviceCategories.map((category) => { const quoteLines = data.quotes.flatMap((quote) => quote.quote_line_items).filter((line) => line.service_category_id === category.id); const invoiceLines = data.invoices.flatMap((invoice) => invoice.invoice_line_items).filter((line) => line.service_category_id === category.id); return { label: category.label, quoted: sum(quoteLines, "total_cents"), invoiced: sum(invoiceLines, "total_cents"), lines: quoteLines.length + invoiceLines.length }; });
  const uncategorized = data.quotes.flatMap((quote) => quote.quote_line_items).filter((line) => !line.service_category_id).length + data.invoices.flatMap((invoice) => invoice.invoice_line_items).filter((line) => !line.service_category_id).length;
  return <><section className="report-metric-grid compact"><MetricCard label="Service categories" value={String(data.serviceCategories.length)} /><MetricCard label="Uncategorized lines" value={String(uncategorized)} /><MetricCard label="Categorized quoted value" value={money(rows.reduce((total, row) => total + row.quoted, 0))} /><MetricCard label="Categorized invoiced value" value={data.canViewFinancials ? money(rows.reduce((total, row) => total + row.invoiced, 0)) : "Restricted"} /></section><ReportPanel title="Invoiced value by service" note="Only explicitly categorized line items are included."><BarList rows={rows.map((row) => ({ label: row.label, value: row.invoiced, display: data.canViewFinancials ? money(row.invoiced) : `${row.lines} lines` }))} /></ReportPanel><ReportTable title="Service performance" columns={["Service", "Lines", "Quoted", "Invoiced", "Labor / margin", "Data"]} rows={rows.map((row) => [row.label, String(row.lines), money(row.quoted), data.canViewFinancials ? money(row.invoiced) : "Restricted", "Requires categorized job costs", row.lines ? "Categorized" : "No records"])} /></>;
}

function FleetReport({ data }: { data: ReportData }) {
  const costRows = groupValue(data.maintenance.filter((record) => record.status === "completed"), (record) => relation(record.equipment_assets)?.name || "Unknown asset", (record) => Number(record.cost_cents ?? 0));
  return <><section className="report-metric-grid compact"><MetricCard label="Active assets" value={String(data.assets.filter((asset) => asset.is_active).length)} /><MetricCard label="Out of service" value={String(data.assets.filter((asset) => ["out_of_service", "awaiting_parts", "repair_scheduled"].includes(asset.status)).length)} /><MetricCard label="Problem reports" value={String(data.equipmentProblems.length)} /><MetricCard label="Failed inspections" value={String(data.inspections.filter((inspection) => inspection.overall_result === "failed").length)} /><MetricCard label="Maintenance cost" value={data.canViewFinancials ? money(costRows.reduce((total, row) => total + row.value, 0)) : "Restricted"} /></section><ReportPanel title="Maintenance cost by asset" note="Completed maintenance records only; purchase price is not allocated to jobs."><BarList rows={costRows.map((row) => ({ ...row, display: data.canViewFinancials ? money(row.value) : "Restricted" }))} /></ReportPanel><ReportTable title="Fleet attention" columns={["Asset", "Type", "Status / result", "Date", "Job", "Details"]} rows={[...data.equipmentProblems.map((record) => [assetLink(record), "Problem", title(record.status), formatDate(record.created_at), record.job_id ? <Link href={`/admin/jobs/${record.job_id}`} key="job">Open job</Link> : "Not linked", record.equipment_stopped ? "Equipment stopped" : title(record.severity)]), ...data.inspections.filter((record) => record.overall_result !== "passed").map((record) => [assetLink(record), "Inspection", title(record.overall_result), formatDate(record.inspected_at), record.job_id ? <Link href={`/admin/jobs/${record.job_id}`} key="job">Open job</Link> : "Not linked", "Review inspection"])]} /></>;
}

function DataQualityReport({ data }: { data: ReportData }) {
  const checks = qualityChecks(data);
  return <><section className="report-callout quality"><AlertTriangle size={22} /><div><strong>Reporting accuracy queue</strong><p>These are correction opportunities only. No data is changed automatically.</p></div></section><section className="quality-grid">{checks.map((check) => <article key={check.label}><strong>{check.count}</strong><div><h3>{check.label}</h3><p>{check.note}</p></div><Link href={check.href}>Review</Link></article>)}</section></>;
}

function ReportPanel({ children, note, title: label }: { children: React.ReactNode; note: string; title: string }) { return <section className="report-panel"><header><div><h2>{label}</h2><p>{note}</p></div></header>{children}</section>; }
function MetricCard({ current, href, label, previous, value }: { current?: number | null; href?: string; label: string; previous?: number | null; value: string }) { const change = current != null && previous != null ? percentChange(current, previous) : null; const content = <><span>{label}</span><strong>{value}</strong>{change == null ? <small><Minus size={14} />No reliable comparison</small> : <small className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(1)}% vs previous</small>}</>; return href ? <Link className="report-metric" href={href}>{content}</Link> : <article className="report-metric">{content}</article>; }
function BarList({ rows }: { rows: { label: string; value: number; display: string }[] }) { const max = Math.max(1, ...rows.map((row) => row.value)); return rows.length ? <div className="report-bars">{rows.map((row) => <div key={row.label}><div><span>{row.label}</span><strong>{row.display}</strong></div><progress aria-label={`${row.label}: ${row.display}`} max={max} value={row.value} /></div>)}</div> : <EmptyReport />; }
function AttentionList({ rows }: { rows: { label: string; detail: string; href: string; count: number }[] }) { return rows.length ? <div className="attention-list">{rows.map((row) => <Link href={row.href} key={row.label}><span><strong>{row.label}</strong><small>{row.detail}</small></span><b>{row.count}</b></Link>)}</div> : <EmptyReport />; }
function ReportTable({ columns, rows, title: label }: { columns: string[]; rows: React.ReactNode[][]; title: string }) { return <section className="report-table-panel"><header><h2>{label}</h2><span>{rows.length} records</span></header>{rows.length ? <div className="report-table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(0, 250).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <EmptyReport />}{rows.length > 250 ? <p className="report-inline-note">Showing the first 250 records. Use CSV export for the complete filtered dataset.</p> : null}</section>; }
function EmptyReport() { return <p className="report-empty">No records in this range.</p>; }
function RestrictedReport() { return <section className="empty-state"><CircleDollarSign size={30} /><h2>Financial report restricted</h2><p>Owner, admin, or payroll-capable access is required. Employee labor cost rates are never sent to unauthorized users.</p></section>; }
function DataWarning({ message }: { message: string }) { return <section className="data-warning" role="status"><strong>Reporting notice</strong><p>{message}</p></section>; }

function quoteRow(quote: ReportQuote): React.ReactNode[] { return [<Link href={`/admin/quotes/${quote.id}`} key="quote">{quote.quote_number || "Draft quote"}</Link>, relation(quote.customers)?.display_name ?? "Unknown", relation(quote.profiles)?.full_name || relation(quote.profiles)?.email || "Not assigned", title(quote.status), money(quote.total_cents), quote.sent_at ? formatDate(quote.sent_at) : `${ageDays(quote.created_at)} days old`]; }
function invoiceRow(invoice: ReportInvoice): React.ReactNode[] { return [<Link href={`/admin/invoices/${invoice.id}`} key="invoice">{invoice.invoice_number || "Draft invoice"}</Link>, relation(invoice.customers)?.display_name ?? "Unknown", invoice.due_at ? `${formatDate(invoice.due_at)}${daysOverdue(invoice) > 0 ? ` · ${daysOverdue(invoice)}d overdue` : ""}` : "Missing", money(invoice.total_cents), money(successfulPaymentTotal(invoice)), money(invoice.balance_due_cents)]; }
function assetLink(record: any) { const asset = relation(record.equipment_assets); return asset ? <Link href={`/admin/equipment/${asset.id}`} key="asset">{asset.name}</Link> : "Unknown asset"; }
function eligibleQuotes(quotes: ReportQuote[]) { return quotes.filter((quote) => !["draft", "cancelled"].includes(quote.status)); }
function isApprovedQuote(quote: ReportQuote) { return quote.status === "approved" || Boolean(quote.approved_at); }
function isCompletedJob(job: ReportJob) { return Boolean(job.completed_at) || ["completed", "ready_to_invoice", "invoiced", "paid"].includes(job.status); }
function isOpenInvoice(invoice: ReportInvoice) { return invoice.balance_due_cents > 0 && !["paid", "void"].includes(invoice.status); }
function sum<T>(rows: T[], key: keyof T) { return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0); }
function groupCount<T>(rows: T[], label: (row: T) => string) { const map = new Map<string, number>(); rows.forEach((row) => map.set(label(row), (map.get(label(row)) ?? 0) + 1)); return [...map].map(([rowLabel, value]) => ({ label: rowLabel, value })).sort((a, b) => b.value - a.value); }
function groupValue<T>(rows: T[], label: (row: T) => string, value: ((row: T) => number) | keyof T) { const map = new Map<string, number>(); rows.forEach((row) => { const amount = typeof value === "function" ? value(row) : Number(row[value] ?? 0); map.set(label(row), (map.get(label(row)) ?? 0) + amount); }); return [...map].map(([rowLabel, amount]) => ({ label: rowLabel, value: amount })).sort((a, b) => b.value - a.value); }
function monthlySeries<T>(rows: T[], dateKey: keyof T, valueKey: keyof T) { return groupValue(rows, (row) => String(row[dateKey]).slice(0, 7), valueKey).sort((a, b) => a.label.localeCompare(b.label)); }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
function formatPercent(value: number | null) { return value == null ? "Not available" : `${value.toFixed(1)}%`; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Not set"; }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function ageDays(value: string) { return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)); }
function averageAge(records: { created_at: string }[]) { return records.length ? `${(records.reduce((total, record) => total + ageDays(record.created_at), 0) / records.length).toFixed(1)}d` : "N/A"; }
function averageElapsed<T>(records: T[], startKey: keyof T, endKey: keyof T) { if (!records.length) return "Not available"; const days = records.reduce((total, record) => total + Math.max(0, (new Date(String(record[endKey])).getTime() - new Date(String(record[startKey])).getTime()) / 86_400_000), 0) / records.length; return `${days.toFixed(1)} days`; }
function daysOverdue(invoice: ReportInvoice) { return invoice.due_at ? Math.max(0, Math.floor((Date.now() - new Date(invoice.due_at).getTime()) / 86_400_000)) : 0; }
function latestApproval(entry: ReportData["timeEntries"][number]) { return [...entry.time_entry_approvals].sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0]?.approval_status ?? null; }
function durationHours(entry: ReportData["timeEntries"][number]) { return entry.clock_out_at ? Math.max(0, (new Date(entry.clock_out_at).getTime() - new Date(entry.clock_in_at).getTime()) / 3_600_000 - entry.break_minutes / 60) : 0; }
function eventHours(event: ReportData["scheduleEvents"][number]) { return event.ends_at ? Math.max(0, (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 3_600_000) : 0; }
function averageDaysToPayment(invoices: ReportInvoice[]) { const paid = invoices.filter((invoice) => invoice.paid_at); if (!paid.length) return "Not available"; return `${(paid.reduce((total, invoice) => total + Math.max(0, (new Date(invoice.paid_at!).getTime() - new Date(invoice.created_at).getTime()) / 86_400_000), 0) / paid.length).toFixed(1)} days`; }
function completenessLabel(value: string) { return ({ missing_time: "Incomplete · approved time missing", missing_labor_rate: "Incomplete · labor rate missing", missing_revenue: "Incomplete · invoice missing", complete: "Complete" } as Record<string, string>)[value] ?? "Incomplete"; }
function arAging(invoices: ReportInvoice[]) { const buckets = [{ label: "Current / not due", min: -Infinity, max: 0 }, { label: "1-30 days", min: 1, max: 30 }, { label: "31-60 days", min: 31, max: 60 }, { label: "61-90 days", min: 61, max: 90 }, { label: "More than 90 days", min: 91, max: Infinity }]; return buckets.map((bucket) => { const records = invoices.filter((invoice) => daysOverdue(invoice) >= bucket.min && daysOverdue(invoice) <= bucket.max); return { label: bucket.label, count: records.length, amount: sum(records, "balance_due_cents") }; }); }
function attentionRows(data: ReportData) { return [{ label: "Approved work unscheduled", detail: "Accepted work without a start date", href: "/admin/jobs", count: data.jobs.filter((job) => job.status === "accepted" && !job.scheduled_start_at).length }, { label: "Completed work awaiting invoice", detail: "Closeout complete, billing not started", href: "/admin/jobs", count: data.jobs.filter((job) => ["completed", "ready_to_invoice"].includes(job.status)).length }, { label: "Overdue invoices", detail: "Open balance past due", href: viewHrefSimple("revenue"), count: data.arInvoices.filter((invoice) => daysOverdue(invoice) > 0).length }, { label: "Data quality items", detail: "Missing classifications or links", href: viewHrefSimple("quality"), count: qualityChecks(data).reduce((total, check) => total + check.count, 0) }].filter((row) => row.count > 0); }
function stalledRows(data: ReportData) { return [{ label: "New leads", detail: `Older than ${data.settings.lead_stale_business_days} day(s)`, href: "/admin/jobs", count: data.jobs.filter((job) => job.status === "new_lead" && ageDays(job.created_at) > data.settings.lead_stale_business_days).length }, { label: "Draft quotes", detail: `Older than ${data.settings.draft_quote_stale_days} days`, href: "/admin/quotes", count: data.quotes.filter((quote) => quote.status === "draft" && ageDays(quote.created_at) > data.settings.draft_quote_stale_days).length }, { label: "Sent quotes", detail: `Awaiting response longer than ${data.settings.sent_quote_stale_days} days`, href: "/admin/quotes", count: data.quotes.filter((quote) => quote.status === "sent" && ageDays(quote.sent_at || quote.created_at) > data.settings.sent_quote_stale_days).length }, { label: "Approved unscheduled", detail: "Needs a work date", href: "/admin/jobs", count: data.jobs.filter((job) => job.status === "accepted" && !job.scheduled_start_at).length }, { label: "Completed without invoice", detail: "Ready for billing", href: "/admin/jobs", count: data.jobs.filter((job) => ["completed", "ready_to_invoice"].includes(job.status)).length }, { label: "Overdue invoices", detail: "Open balance past due", href: viewHrefSimple("revenue"), count: data.arInvoices.filter((invoice) => daysOverdue(invoice) > 0).length }].filter((row) => row.count > 0); }
function qualityChecks(data: ReportData) { return [{ label: "Leads without source", count: data.jobs.filter((job) => !job.lead_source_id).length, note: "Source reporting cannot attribute these leads.", href: "/admin/jobs" }, { label: "Quote lines without service", count: data.quotes.flatMap((quote) => quote.quote_line_items).filter((line) => !line.service_category_id).length, note: "These remain uncategorized; no text inference is used.", href: "/admin/quotes" }, { label: "Invoice lines without service", count: data.invoices.flatMap((invoice) => invoice.invoice_line_items).filter((line) => !line.service_category_id).length, note: "Service revenue cannot be categorized.", href: "/admin/invoices" }, { label: "Approved quotes without work order", count: data.quotes.filter((quote) => isApprovedQuote(quote) && !relation(quote.jobs)).length, note: "Approval did not produce a linked work order.", href: "/admin/quotes" }, { label: "Completed jobs without invoice", count: data.jobs.filter((job) => ["completed", "ready_to_invoice"].includes(job.status)).length, note: "Completed work has not entered billing.", href: "/admin/jobs" }, { label: "Time not linked to jobs", count: data.timeEntries.filter((entry) => entry.time_type === "job" && !entry.job_id).length, note: "Job labor cannot be allocated.", href: "/admin/time" }, { label: "Jobs without assigned crew", count: data.jobs.filter((job) => !job.assigned_crew_user_id && ["scheduled", "in_progress"].includes(job.status)).length, note: "Scheduled work has no primary crew assignment.", href: "/admin/jobs" }, { label: "Completed jobs without closeout", count: data.jobs.filter((job) => isCompletedJob(job) && !job.job_closeouts.length).length, note: "Closeout completeness cannot be measured.", href: "/admin/jobs/closeouts" }, { label: "Quotes without estimator", count: data.quotes.filter((quote) => !quote.estimator_user_id).length, note: "Estimator reporting is incomplete for historical records.", href: "/admin/quotes" }, { label: "Invoices without due date", count: data.invoices.filter((invoice) => !invoice.due_at && isOpenInvoice(invoice)).length, note: "Accounts-receivable aging cannot classify these accurately.", href: "/admin/invoices" }, { label: "Uncategorized direct costs", count: data.jobCosts.filter((cost) => cost.category === "other").length, note: "Review whether a more specific direct-cost category applies.", href: "/admin/jobs" }].filter((check) => check.count > 0); }
function viewHref(filters: ReportFilters, view: ReportView) { const params = new URLSearchParams({ view, range: filters.preset, start: filters.startDate, end: filters.endDate }); if (filters.leadSourceId) params.set("source", filters.leadSourceId); if (filters.serviceCategoryId) params.set("service", filters.serviceCategoryId); if (filters.customerId) params.set("customer", filters.customerId); if (filters.employeeId) params.set("employee", filters.employeeId); if (filters.status) params.set("status", filters.status); return `/admin/reports?${params}`; }
function viewHrefSimple(view: ReportView) { return `/admin/reports?view=${view}`; }
function exportHref(filters: ReportFilters) { return `/admin/reports/export?${new URLSearchParams({ view: filters.view, range: filters.preset, start: filters.startDate, end: filters.endDate, source: filters.leadSourceId, service: filters.serviceCategoryId, customer: filters.customerId, employee: filters.employeeId, status: filters.status })}`; }
