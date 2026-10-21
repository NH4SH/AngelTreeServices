import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getReportingSettings } from "@/lib/data/reports";
import { resolveReportFilters } from "@/lib/reporting/definitions";
import { validateBusinessReport, type BusinessReport } from "@/lib/reporting/model";
import { mapBounded, withDeadline } from "@/lib/runtime/deadline";
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

/** Authenticated aggregate RPC only. At most eight reads, three in flight, one deadline. */
export async function getDashboardMoney(period: DashboardPeriod): Promise<DashboardMoney> {
  let dates = { start: "", end: "", timezone: "", generatedAt: "" };
  try {
    return await withDeadline(async signal => {
      const db = await createClient();
      if (!db) throw Error("Unavailable");
      const user = (await db.auth.getUser()).data.user;
      const roles = user ? await getUserRoles(db, user.id) : [];
      if (!user || !hasAllowedRole(roles, platformRoleGroups.reporting)) throw Error("Unavailable");
      const settings = await getReportingSettings();
      if (settings.error) throw Error("Unavailable");
      const filters = resolveReportFilters({ range: period }, settings.data.business_timezone);
      dates = { start: filters.startDate, end: filters.endDate, timezone: filters.timezone, generatedAt: "" };
      const read = async (start: string, end: string) => {
        if (signal.aborted) throw Error("Cancelled");
        const result = await db.rpc("get_business_report", {
          p_view: "dashboard", p_start: start, p_end: end, p_filters: {},
          p_pages: {}, p_versions: {}, p_page_size: 1, p_export: false,
        }).abortSignal(signal);
        if (result.error) throw Error("Unavailable");
        return validateBusinessReport(result.data, "dashboard");
      };
      const report = await read(dates.start, dates.end);
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
      const parts = await mapBounded(buckets, 3, async bucket => {
        try { return await read(bucket.start, bucket.end); } catch { return null; }
      });
      // Finish every bounded read before returning; a changed access scope hides the whole panel.
      const amounts = parts.map(part => {
        if (!part || part.scope !== "company" || part.timezone !== report.timezone) throw Error("Reporting scope or completeness changed.");
        return summaryOf(part).collectedCents;
      });
      try {
        return { ...dates, kind: "financial", summary, points: reconcileCashSeries(buckets, amounts, summary.collectedCents), seriesError: null };
      } catch {
        return { ...dates, kind: "financial", summary, points: [], seriesError: "Cash records changed while the timeline loaded. Refresh to try again; the summary above is a separate complete read." };
      }
    }, 12000);
  } catch {
    return { ...dates, kind: "unavailable", error: "Financial totals could not be confirmed. Open Reports or refresh to try again." };
  }
}
