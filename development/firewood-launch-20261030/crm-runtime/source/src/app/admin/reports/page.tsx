import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import {
  LaborCostRateForm,
  ReportingSettingsForm,
} from "@/components/reporting-input-forms";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getReportData, getReportingSettings } from "@/lib/data/reports";
import {
  formatRange,
  metricDefinitions,
  percentChange,
  reportViews,
  resolveReportFilters,
  type ReportFilters,
} from "@/lib/reporting/definitions";
import {
  reportParams,
  exactReportFilters,
  reportTables,
  viewTables,
  type Column,
  type ReportCell,
  type ReportDataset,
} from "@/lib/reporting/model";
import {
  reportPresentation,
  type Metric,
  type Breakdown,
} from "@/lib/reporting/presentation";
import type { ReportingSettings } from "@/lib/types/database";

type Query = Record<string, string | string[] | undefined>;
type Loaded = Awaited<ReturnType<typeof getReportData>>;
const single = (v: Query[string]) => (Array.isArray(v) ? v[0] : v);
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams,
    context = await getAuthenticatedPlatformContext("/admin/reports");
  if (!context.configured)
    return <SetupRequired title="Configure Supabase before opening reports" />;
  const settings = await getReportingSettings(),
    filters = resolveReportFilters(query, settings.data.business_timezone);
  let data: Loaded | null = null,
    error = settings.error;
  if (!error)
    try {
      const pages: Record<string, number> = {},
        versions: Record<string, string> = {};
      for (const k of Object.keys(reportTables)) {
        const page = Number(single(query["page_" + k]));
        if (Number.isSafeInteger(page) && page >= 1 && page <= 10000000)
          pages[k] = page;
        const version = single(query["version_" + k]);
        if (version && /^[a-f0-9]{32}$/.test(version)) versions[k] = version;
      }
      data = await getReportData(filters, context.roles, context.user.id, {
        pages,
        versions,
      });
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "Reports could not load. Refresh before using the totals.";
    }
  const presentation = data ? reportPresentation(data, filters.view) : null;
  return (
    <PlatformFrame
      active="reports"
      roles={context.roles}
      userEmail={context.user.email}
    >
      <div className="shell app-content reports-page report-verified">
        <section className="page-heading reports-heading">
          <div>
            <h1>
              Reports: {reportViews.find(([key]) => key === filters.view)?.[1]}
            </h1>
            <p>
              Business reporting with clear date bases and complete filtered
              totals.
            </p>
          </div>
          {data && !data.restricted ? (
            <Link
              className="secondary-action"
              href={"/admin/reports/export?" + reportParams(filters)}
            >
              Export current view
            </Link>
          ) : null}
        </section>
        <Filters filters={filters} data={data} />
        <nav className="report-tabs" aria-label="Report sections">
          {reportViews.map(([key, label]) => (
            <Link
              key={key}
              aria-current={filters.view === key ? "page" : undefined}
              href={"/admin/reports?" + reportParams(filters, key)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="report-range">
          <strong>Selected period:</strong> {formatRange(filters)}
        </p>
        {error ? (
          <section className="data-warning" role="alert">
            <h2>Report unavailable</h2>
            <p>{error}</p>
            <Link href={"/admin/reports?" + reportParams(filters)}>
              Refresh the report
            </Link>
          </section>
        ) : null}
        {data?.restricted ? (
          <section className="empty-state">
            <h2>Personal sales scope</h2>
            <p>
              Estimator reporting covers quotes assigned to your account.
              Company operations, cash, labor costs and margin require financial
              reporting access.
            </p>
            <Link href={"/admin/reports?" + reportParams(filters, "quotes")}>
              Open my quote report
            </Link>
          </section>
        ) : null}
        {data && !data.restricted && presentation ? (
          <>
            <p className="report-read-status">
              Totals cover all matching records. Details are paged. Refreshed{" "}
              {date(data.generatedAt, data.timezone)}.
              {data.scope === "own" ? " Your assigned quotes only." : ""}
            </p>
            <p className="report-basis">{basis(filters.view)}</p>
            <dl className="report-facts">
              {presentation.metrics.map((m) => (
                <Fact key={m.label} metric={m} />
              ))}
            </dl>
            {filters.view === "profitability" ? (
              <p className="report-inline-note">
                This is an operational estimate from recorded inputs. Unentered
                costs cannot be detected. Jobs needing input review are excluded
                from profit and weighted margin totals; no labor, overhead or
                capacity is invented.
              </p>
            ) : null}
            <section className="report-two-column">
              {presentation.breakdowns.map((b) => (
                <BreakdownPanel
                  key={b.kind + b.group + b.title}
                  breakdown={b}
                  data={data!}
                />
              ))}
            </section>
            {viewTables[filters.view]
              .filter((k) => data!.datasets[k])
              .map((kind, index) => (
                <Detail
                  key={kind}
                  dataset={data!.datasets[kind]}
                  filters={filters}
                  query={query}
                  data={data!}
                  open={index === 0 || Boolean(query["page_" + kind])}
                />
              ))}
            {filters.view === "profitability" && data.canViewFinancials ? (
              <details className="report-admin-details">
                <summary>Add a historical labor cost rate</summary>
                <LaborCostRateForm employees={data.employees} />
              </details>
            ) : null}
            {filters.view === "pipeline" && data.canManageSettings ? (
              <details className="report-admin-details">
                <summary>Reporting settings</summary>
                <ReportingSettingsForm
                  settings={data.settings as ReportingSettings}
                />
              </details>
            ) : null}
            <p className="report-inline-note">
              CSV exports include summaries and every detail row from one
              database snapshot, up to 10,000 rows across the selected report.
              Larger exports require narrower work filters or a focused tab.
            </p>
          </>
        ) : null}
        <details className="report-definitions">
          <summary>Metric definitions and date bases</summary>
          <dl>
            {Object.entries(metricDefinitions).map(([key, text]) => (
              <div key={key}>
                <dt>{title(key)}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </PlatformFrame>
  );
}
function Filters({
  filters: f,
  data,
}: {
  filters: ReportFilters;
  data: Loaded | null;
}) {
  return (
    <form className="report-filter-panel" method="get">
      <input type="hidden" name="view" value={f.view} />
      <div className="report-filter-heading">
        <div>
          <strong>Report filters</strong>
          <span>
            Choose Custom to set start and end dates. Filters stay in the URL.
          </span>
        </div>
      </div>
      <label>
        Date range
        <select name="range" defaultValue={f.preset}>
          {[
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
            ["quarter", "This quarter"],
            ["year", "This year"],
            ["last_7", "Last 7 days"],
            ["last_30", "Last 30 days"],
            ["last_90", "Last 90 days"],
            ["previous", "Previous month"],
            ["custom", "Custom"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start
        <input name="start" type="date" defaultValue={f.startDate} />
      </label>
      <label>
        End
        <input name="end" type="date" defaultValue={f.endDate} />
      </label>
      <div className="report-filter-actions">
        <button type="submit">Apply filters</button>
        <Link
          className="secondary-action"
          href={"/admin/reports?view=" + f.view}
        >
          Clear
        </Link>
      </div>
      {exactReportFilters(f, data?.options).length ? (
        <div
          className="report-exact-filters"
          aria-label="Active record filters"
        >
          {exactReportFilters(f, data?.options).map((filter) => {
            const p = reportParams(f);
            p.delete(filter.key);
            return (
              <p key={filter.key}>
                <strong>{filter.label}:</strong> {filter.value}
                <Link
                  href={"/admin/reports?" + p}
                  aria-label={
                    "Remove " + filter.label.toLowerCase() + " filter"
                  }
                >
                  Remove
                </Link>
              </p>
            );
          })}
        </div>
      ) : null}
      <details
        className="report-work-filters"
        open={Boolean(
          f.partyQuery ||
            f.employeeQuery ||
            f.leadSourceId ||
            f.serviceCategoryId ||
            f.status,
        )}
      >
        <summary>Filter by account, employee, service or status</summary>
        <div className="report-work-filter-fields">
          <label>
            Customer or organization
            <input
              name="party"
              defaultValue={f.partyQuery}
              placeholder="Search account name"
              maxLength={200}
            />
          </label>
          {f.customerId ? (
            <input type="hidden" name="customer" value={f.customerId} />
          ) : null}
          {f.organizationId ? (
            <input type="hidden" name="organization" value={f.organizationId} />
          ) : null}
          <label>
            Lead source
            <select name="source" defaultValue={f.leadSourceId}>
              <option value="">All sources</option>
              {data?.options.sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service
            <select name="service" defaultValue={f.serviceCategoryId}>
              <option value="">All services</option>
              {data?.options.services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Employee name
            <input
              name="employee_name"
              defaultValue={f.employeeQuery}
              placeholder="Search employee name"
              maxLength={200}
            />
          </label>
          {f.employeeId ? (
            <input type="hidden" name="employee" value={f.employeeId} />
          ) : null}
          <label>
            Record status
            <input
              name="status"
              defaultValue={f.status}
              placeholder="All statuses"
              maxLength={80}
            />
          </label>
        </div>
      </details>
    </form>
  );
}
function Fact({ metric: m }: { metric: Metric }) {
  const change =
    m.value !== null && m.previous != null
      ? percentChange(m.value, m.previous)
      : null;
  return (
    <div>
      <dt>{m.label}</dt>
      <dd>{format(m.value, m.format)}</dd>
      {change != null ? (
        <small>
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}% vs equal prior period
        </small>
      ) : null}
    </div>
  );
}
function BreakdownPanel({
  breakdown: b,
  data,
}: {
  breakdown: Breakdown;
  data: Loaded;
}) {
  const groups = data.datasets[b.kind]?.groups[b.group],
    items = groups?.items ?? [];
  return (
    <section className="report-panel">
      <header>
        <div>
          <h2>{b.title}</h2>
          <p>
            {groups && groups.totalGroups > 15
              ? "Top 15 groups; all remaining groups are combined below."
              : "Full filtered totals, independent of the detail page."}
          </p>
        </div>
      </header>
      {items.length ? (
        <dl className="report-breakdown">
          {items.map((g) => {
            const value = b.rate
              ? g.stats.eligible > 0
                ? (g.stats.approved / g.stats.eligible) * 100
                : null
              : b.metric
                ? (g.stats[b.metric] ?? 0)
                : g.count;
            return (
              <div key={g.id}>
                <dt>{title(g.label)}</dt>
                <dd>
                  {format(value, b.rate ? "percent" : b.format)}
                  {b.rate ? <small>{g.count} quotes</small> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="report-empty">No matching records.</p>
      )}
    </section>
  );
}
function Detail({
  dataset: d,
  filters,
  query,
  data,
  open,
}: {
  dataset: ReportDataset;
  filters: ReportFilters;
  query: Query;
  data: Loaded;
  open: boolean;
}) {
  const def = reportTables[d.key];
  if (!def) return null;
  function href(page: number) {
    const p = reportParams(filters);
    for (const kind of Object.keys(data.datasets)) {
      const v = single(query["page_" + kind]);
      if (v) p.set("page_" + kind, v);
      p.set("version_" + kind, data.datasets[kind].version);
    }
    p.set("page_" + d.key, String(page));
    return "/admin/reports?" + p + "#report-" + d.key;
  }
  return (
    <details className="report-detail" id={"report-" + d.key} open={open}>
      <summary>
        {def.title}
        <span>{d.total.toLocaleString()} records</span>
      </summary>
      <p className="report-inline-note">{def.basis}</p>
      {d.total ? (
        <>
          <p className="report-page-count">
            Showing {((d.page - 1) * d.pageSize + 1).toLocaleString()}–
            {Math.min(d.total, d.page * d.pageSize).toLocaleString()} of{" "}
            {d.total.toLocaleString()}. Scroll the table for all columns.
          </p>
          <div
            className="report-table-scroll"
            role="region"
            aria-label={def.title}
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                {def.title}. {def.basis}
              </caption>
              <thead>
                <tr>
                  {def.columns.map((c) => (
                    <th scope="col" key={c.key}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((row) => (
                  <tr key={row.id}>
                    {def.columns.map((c) => (
                      <td key={c.key}>
                        {c.link &&
                        typeof row.href === "string" &&
                        row.href.startsWith("/admin/") ? (
                          <Link href={row.href}>
                            {cell(row[c.key], c, data.timezone)}
                          </Link>
                        ) : (
                          cell(row[c.key], c, data.timezone)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.pages > 1 ? (
            <nav className="list-pagination" aria-label={def.title + " pages"}>
              {d.page > 1 ? (
                <Link className="secondary-action" href={href(d.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {d.page.toLocaleString()} of {d.pages.toLocaleString()}
              </span>
              {d.page < d.pages ? (
                <Link className="secondary-action" href={href(d.page + 1)}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <p className="report-empty">
          No matching records. Try a different date range or clear the work
          filters.
        </p>
      )}
    </details>
  );
}
function format(v: number | null | undefined, f?: Metric["format"]) {
  if (v == null) return "Unavailable";
  if (f === "money")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(v / 100);
  if (f === "percent") return v.toFixed(1) + "%";
  if (f === "hours") return v.toFixed(2) + "h";
  if (f === "days") return v.toFixed(1) + " days";
  return v.toLocaleString("en-US");
}
function cell(v: ReportCell | undefined, c: Column, zone: string) {
  if (v == null)
    return c.format && ["money", "percent", "hours"].includes(c.format)
      ? "Unavailable"
      : "Not entered";
  if (c.format === "date") return date(String(v), zone);
  if (c.format === "title") return title(String(v));
  if (c.format && typeof v === "number") return format(v, c.format);
  return typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
}
function date(v: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
}
function title(v: string) {
  return v
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function basis(view: string) {
  if (view === "profitability")
    return "Completion cohort: whole-job history, across all dates. Recorded costs are estimates; billed value is adjusted for known refunds and lost payment principal.";
  if (view === "quotes")
    return "Quote cohort: quotes created in the period, with their current outcomes. Draft and cancelled quotes are excluded from approval-rate denominators.";
  if (view === "revenue")
    return "Activity and current state: invoice creation and payment receipt dates define the period. Receivables and later payment adjustments reflect the current state.";
  if (view === "quality")
    return "Current correction queue across all dates. No automatic changes.";
  if (view === "scheduling")
    return "Events starting in the period, with current unscheduled work shown separately. Capacity utilization is unavailable until availability is configured.";
  return "Each section states its date basis. Current backlog, stock, assets and receivables are snapshots independent of the selected period. Record-status filters apply to each record’s own status; matching a service selects whole documents or jobs.";
}
