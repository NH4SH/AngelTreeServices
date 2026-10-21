export const dashboardPeriods = [
  { value: "month", label: "MTD", title: "Month to date" },
  { value: "last_7", label: "7D", title: "Last 7 days" },
  { value: "last_30", label: "30D", title: "Last 30 days" },
  { value: "last_90", label: "90D", title: "Last 90 days" },
  { value: "year", label: "YTD", title: "Year to date" },
] as const;
export type DashboardPeriod = typeof dashboardPeriods[number]["value"];
export type CashBucket = { start: string; end: string };
export type CashPoint = CashBucket & { cents: number; cumulativeCents: number };

export function dashboardPeriod(value: string | string[] | undefined): DashboardPeriod {
  return dashboardPeriods.find(p => p.value === value)?.value ?? "month";
}

const dayMs = 86_400_000;
function calendarDay(value: string) {
  const day = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value) throw Error("Invalid reporting date.");
  return day;
}

/** Partition business-calendar dates, not elapsed local hours; DST cannot overlap a bucket. */
export function cashBuckets(start: string, end: string): CashBucket[] {
  const first = calendarDay(start), last = calendarDay(end);
  const days = (last - first) / dayMs + 1;
  if (days < 1 || days > 366) throw Error("Invalid dashboard reporting period.");
  const count = Math.min(7, days);
  const key = (offset: number) => new Date(first + offset * dayMs).toISOString().slice(0, 10);
  return Array.from({ length: count }, (_, i) => ({
    start: key(Math.floor(i * days / count)),
    end: key(Math.floor((i + 1) * days / count) - 1),
  }));
}

/** Reject partial/mixed reads rather than graphing a plausible but incorrect total. */
export function reconcileCashSeries(buckets: CashBucket[], amounts: number[], total: number): CashPoint[] {
  if (!Number.isSafeInteger(total) || total < 0 || buckets.length !== amounts.length || !buckets.length) throw Error("Incomplete cash series.");
  let sum = 0;
  const points = buckets.map((bucket, i) => {
    const cents = amounts[i];
    if (!Number.isSafeInteger(cents) || cents < 0) throw Error("Invalid cash amount.");
    sum += cents;
    if (!Number.isSafeInteger(sum)) throw Error("Cash series exceeds safe precision.");
    return { ...bucket, cents, cumulativeCents: sum };
  });
  if (sum !== total) throw Error("Cash records changed during the read. Refresh the chart.");
  return points;
}

export function cashDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
export function cashCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
