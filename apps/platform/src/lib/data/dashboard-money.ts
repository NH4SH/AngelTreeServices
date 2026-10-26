import "server-only";
import { getPlatformReadContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getReportingSettings } from "@/lib/data/reports";
import { resolveReportFilters } from "@/lib/reporting/definitions";
import { validateBusinessReport, type BusinessReport } from "@/lib/reporting/model";
import { withDeadline } from "@/lib/runtime/deadline";
import { cashBuckets, reconcileCashSeries, type CashPoint, type DashboardPeriod } from "@/lib/dashboard/cash-series";

type Summary = NonNullable<BusinessReport["summary"]>;
type Sales = Pick<Summary, "approvedQuoteCents" | "quoteApprovalRate">;
export type DashboardMoney = {
  start: string; end: string; timezone: string; generatedAt: string;
} & ({ kind: "financial"; summary: Summary; points: CashPoint[]; seriesError: string | null }
  | { kind: "sales"; summary: Sales }
  | { kind: "unavailable"; error: string });

function summaryOf(report: BusinessReport): Summary {
  const s = report.summary;
  if (report.restricted || !s || ![s.approvedQuoteCents, s.invoicedCents, s.collectedCents, s.outstandingCents, s.overdueCents].every(n => Number.isSafeInteger(n) && n >= 0)
    || !(s.quoteApprovalRate === null || (Number.isFinite(s.quoteApprovalRate) && s.quoteApprovalRate >= 0 && s.quoteApprovalRate <= 100))) throw Error("Incomplete dashboard totals.");
  return s;
}

/** One bounded caller-RLS aggregate request; never cache financial data across requests. */
export async function getDashboardMoney(period: DashboardPeriod, context?: Awaited<ReturnType<typeof getPlatformReadContext>>, parent?: AbortSignal): Promise<DashboardMoney> {
  let dates = { start: "", end: "", timezone: "", generatedAt: "" };
  try {
    return await withDeadline(async signal => {
      const { supabase: db, user, roles } = context ?? await getPlatformReadContext();
      if (!db) throw Error("Unavailable");
      if (!user || !hasAllowedRole(roles, platformRoleGroups.reporting)) throw Error("Unavailable");
      const settings = await getReportingSettings();
      if (settings.error) throw Error("Unavailable");
      const filters = resolveReportFilters({ range: period }, settings.data.business_timezone);
      dates = { start: filters.startDate, end: filters.endDate, timezone: filters.timezone, generatedAt: "" };
      const result = await db.rpc("get_dashboard_money_reports", { p_start: dates.start, p_end: dates.end }).abortSignal(signal);
      if (result.error || !result.data || !Array.isArray(result.data.cash)) throw Error("Unavailable");
      const report = validateBusinessReport(result.data.report, "dashboard");
      if (report.timezone !== filters.timezone) throw Error("Reporting timezone changed.");
      const canViewFinancials = hasAllowedRole(roles, platformRoleGroups.financialReporting);
      if (!canViewFinancials && report.scope !== "own") throw Error("Reporting scope changed.");
      const summary = summaryOf(report);
      dates.generatedAt = report.generatedAt;
      if (report.scope !== "company" || !canViewFinancials) {
        // Do not serialize financial fields, even if a caller has a stale role hint.
        return { ...dates, kind: "sales", summary: { approvedQuoteCents: summary.approvedQuoteCents, quoteApprovalRate: summary.quoteApprovalRate } };
      }
      const buckets = cashBuckets(dates.start, dates.end);
      if (result.data.cash.length !== buckets.length) throw Error("Incomplete cash series.");
      const amounts = result.data.cash.map((part: { scope: string; timezone: string; start: string; end: string; collectedCents: number }, index: number) => {
        if (!part || part.scope !== "company" || part.timezone !== report.timezone || part.start !== buckets[index].start || part.end !== buckets[index].end || !Number.isSafeInteger(part.collectedCents) || part.collectedCents < 0) throw Error("Reporting scope or completeness changed.");
        return part.collectedCents;
      });
      try {
        return { ...dates, kind: "financial", summary, points: reconcileCashSeries(buckets, amounts, summary.collectedCents), seriesError: null };
      } catch {
        return { ...dates, kind: "financial", summary, points: [], seriesError: "Cash records changed while the timeline loaded. Refresh to try again; the summary above is a separate complete read." };
      }
    }, 12000, parent);
  } catch {
    return { ...dates, kind: "unavailable", error: "Financial totals could not be confirmed. Open Reports or refresh to try again." };
  }
}
