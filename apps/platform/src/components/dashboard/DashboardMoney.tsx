import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getDashboardMoney } from "@/lib/data/dashboard-money";
import { dashboardPeriods, cashCurrency, cashDate, type DashboardPeriod } from "@/lib/dashboard/cash-series";
import { DashboardCashChart } from "./DashboardCashChart";

export async function DashboardMoney({ period }: { period: DashboardPeriod }) {
  const result = await getDashboardMoney(period);
  const windowLabel = result.start ? `${cashDate(result.start)}–${cashDate(result.end)}` : "Selected period";
  const reportLink = `/admin/reports?view=${result.kind === "sales" ? "quotes" : "revenue"}&range=${period}`;
  return <section className="dashboard-money" aria-labelledby="dashboard-money-title">
    <div className="dashboard-section-heading"><h2 id="dashboard-money-title">{result.kind === "sales" ? "Your sales" : "Money overview"}</h2><Link href={reportLink}>Open reports <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    <nav className="dashboard-periods" aria-label="Reporting period">{dashboardPeriods.map(p => <Link key={p.value} href={`/admin?range=${p.value}`} title={p.title} aria-label={p.title} aria-current={period === p.value ? "page" : undefined} scroll={false}>{p.label}</Link>)}</nav>
    {result.kind === "unavailable" ? <div className="dashboard-money-unavailable" role="status"><h3>Totals unavailable</h3><p>{result.error}</p><Link href={`/admin?range=${period}`}>Refresh totals</Link></div> : <>
      <p className="dashboard-metric-label">{result.kind === "financial" ? "Cash collected" : "Approved quote value"}<span>{windowLabel}</span></p>
      <p className="dashboard-cash-number">{cashCurrency(result.kind === "financial" ? result.summary.collectedCents : result.summary.approvedQuoteCents)}</p>
      <p className="dashboard-metric-basis">{result.kind === "financial" ? "Retained payments · after refunds and lost disputes" : "Your approved work in this period"}</p>
      {result.kind === "financial" ? <>
        {result.seriesError ? <div className="dashboard-chart-unavailable" role="status">{result.seriesError}</div> : <DashboardCashChart points={result.points} />}
        <dl className="dashboard-money-ledger">
          <div><dt>Invoiced <span>{windowLabel}</span></dt><dd><Link href={reportLink}>{cashCurrency(result.summary.invoicedCents)}</Link></dd></div>
          <div><dt>Outstanding <span>All invoice dates</span></dt><dd><Link href="/admin/reports?view=revenue">{cashCurrency(result.summary.outstandingCents)}</Link></dd></div>
          <div><dt>Overdue <span>All invoice dates</span></dt><dd className={result.summary.overdueCents ? "dashboard-overdue" : ""}><Link href="/admin/reports?view=revenue">{cashCurrency(result.summary.overdueCents)}</Link></dd></div>
        </dl>
      </> : <p className="dashboard-sales-note">Company cash and invoice totals are available to financial reporting roles.</p>}
      <details className="dashboard-money-definition"><summary>What these numbers mean</summary><p>Cash is payment principal retained from receipts in this period; it excludes card surcharges and is not profit. Later refunds or lost disputes restate the original receipt period. Invoiced uses issued invoice creation dates and excludes drafts and voids. Outstanding and overdue are current balances across all dates. Dates use {result.timezone}.</p><p>Approved quotes: {cashCurrency(result.summary.approvedQuoteCents)}. Approval rate: {result.summary.quoteApprovalRate == null ? "No eligible quotes" : `${result.summary.quoteApprovalRate.toFixed(1)}%`}. {result.kind === "sales" ? "Your records only." : "Company scope."}</p><p>Refreshed {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: result.timezone }).format(new Date(result.generatedAt))}.</p></details>
    </>}
  </section>;
}

export function DashboardMoneyLoading() {
  return <section className="dashboard-money dashboard-money-loading" aria-label="Money overview" aria-busy="true"><h2>Money overview</h2><p role="status">Loading verified totals…</p><div className="dashboard-loading-line" /><div className="dashboard-loading-chart" /></section>;
}
