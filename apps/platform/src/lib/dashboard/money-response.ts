import type { DashboardMoney } from "@/lib/data/dashboard-money";
import { cashBuckets, reconcileCashSeries } from "./cash-series";

/** Treat an incomplete/malformed response as unavailable, never as zero money. */
export function decodeDashboardMoney(input: unknown): DashboardMoney {
  if (!input || typeof input !== "object") throw Error("Incomplete money response");
  const value = input as Record<string, any>;
  if (!["financial", "sales"].includes(value.kind) || ![value.start, value.end, value.timezone, value.generatedAt].every(x => typeof x === "string" && x.length > 0) || !Number.isFinite(Date.parse(value.generatedAt))) throw Error("Incomplete money response");
  const s = value.summary, amount = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
  const buckets = cashBuckets(value.start, value.end);
  new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(new Date(value.generatedAt));
  if (!s || !amount(s.approvedQuoteCents) || !(s.quoteApprovalRate === null || typeof s.quoteApprovalRate === "number" && Number.isFinite(s.quoteApprovalRate) && s.quoteApprovalRate >= 0 && s.quoteApprovalRate <= 100)) throw Error("Incomplete money response");
  if (value.kind === "sales") return { start: value.start, end: value.end, timezone: value.timezone, generatedAt: value.generatedAt, kind: "sales", summary: { approvedQuoteCents: s.approvedQuoteCents, quoteApprovalRate: s.quoteApprovalRate } };
  if (![s.invoicedCents, s.collectedCents, s.outstandingCents, s.overdueCents].every(amount) || !Array.isArray(value.points) || !(value.seriesError === null || typeof value.seriesError === "string")) throw Error("Incomplete money response");
  if (value.seriesError === null) {
    const expected = reconcileCashSeries(buckets, value.points.map((p: any) => p?.cents), s.collectedCents);
    if (expected.some((p, i) => !value.points[i] || Object.entries(p).some(([key, item]) => value.points[i][key] !== item))) throw Error("Incomplete money response");
  } else if (value.points.length) throw Error("Unconfirmed money timeline");
  return value as DashboardMoney;
}
