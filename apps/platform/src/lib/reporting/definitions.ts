export const reportViews = [
  ["executive", "Executive"],
  ["pipeline", "Pipeline"],
  ["quotes", "Quotes"],
  ["revenue", "Revenue & AR"],
  ["profitability", "Profitability"],
  ["labor", "Crew & labor"],
  ["scheduling", "Scheduling"],
  ["customers", "Customers"],
  ["sources", "Lead sources"],
  ["services", "Services"],
  ["fleet", "Fleet"],
  ["quality", "Data quality"],
] as const;

export type ReportView = (typeof reportViews)[number][0];
export type DatePreset = "today" | "week" | "month" | "quarter" | "year" | "last_7" | "last_30" | "last_90" | "previous" | "custom";

export type ReportFilters = {
  view: ReportView;
  preset: DatePreset;
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  timezone: string;
  customerId: string;
  employeeId: string;
  leadSourceId: string;
  serviceCategoryId: string;
  status: string;
};

export const metricDefinitions = {
  lead: "A work order in new_lead or estimate_scheduled, counted by its creation date.",
  sentQuote: "A quote with sent_at in the selected period or current sent workflow status.",
  eligibleQuote: "A quote that left draft status. Draft and cancelled quotes are excluded from approval-rate denominators.",
  approvedQuote: "A quote with approved status or approved_at timestamp.",
  quoteApprovalRate: "Approved eligible quotes divided by eligible quotes; drafts are excluded.",
  invoicedRevenue: "Non-void invoice totals by invoice creation date. This is not cash collected.",
  collectedRevenue: "Successful payment amounts by paid_at date. Invoice totals are not used as cash revenue.",
  outstandingBalance: "Remaining balance on non-paid, non-void invoices.",
  overdueBalance: "Outstanding balance on invoices whose due date is before today.",
  repeatCustomer: "A customer with more than one completed, invoiced, or paid job.",
  completedJob: "A job with completed_at or a completed/ready_to_invoice/invoiced/paid status.",
  estimatedGrossProfit: "Invoiced job revenue less approved direct costs, equipment usage cost, and labor cost when a valid rate exists.",
  estimatedGrossMargin: "Estimated gross profit divided by invoiced job revenue. Unavailable when required cost inputs are missing.",
  revenuePerLaborHour: "Invoiced job revenue divided by approved recorded job hours.",
  scheduleUtilization: "Scheduled event hours divided by recorded available capacity. Unavailable when capacity is not configured.",
  averageDaysToPayment: "Average elapsed days from invoice creation to paid_at for paid invoices.",
} as const;

export function parseReportView(value: string | undefined): ReportView {
  return reportViews.some(([key]) => key === value) ? value as ReportView : "executive";
}

export function parseDatePreset(value: string | undefined): DatePreset {
  return ["today", "week", "month", "quarter", "year", "last_7", "last_30", "last_90", "previous", "custom"].includes(value ?? "")
    ? value as DatePreset
    : "month";
}

export function resolveReportFilters(
  query: Record<string, string | string[] | undefined>,
  timezone: string,
): ReportFilters {
  const preset = parseDatePreset(single(query.range));
  const today = getBusinessDate(timezone);
  let startDate = today;
  let endDate = today;

  if (preset === "week") startDate = startOfWeek(today);
  if (preset === "month") startDate = `${today.slice(0, 7)}-01`;
  if (preset === "quarter") startDate = startOfQuarter(today);
  if (preset === "year") startDate = `${today.slice(0, 4)}-01-01`;
  if (preset === "last_7") startDate = addDays(today, -6);
  if (preset === "last_30") startDate = addDays(today, -29);
  if (preset === "last_90") startDate = addDays(today, -89);
  if (preset === "previous") {
    const thisMonthStart = `${today.slice(0, 7)}-01`;
    endDate = addDays(thisMonthStart, -1);
    startDate = `${endDate.slice(0, 7)}-01`;
  }
  if (preset === "custom") {
    startDate = validDate(single(query.start)) ?? today;
    endDate = validDate(single(query.end)) ?? startDate;
    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  }

  const periodDays = differenceInDays(startDate, endDate) + 1;
  const previousEndDate = addDays(startDate, -1);
  const previousStartDate = addDays(previousEndDate, -(periodDays - 1));

  return {
    view: parseReportView(single(query.view)),
    preset,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    timezone,
    customerId: single(query.customer) ?? "",
    employeeId: single(query.employee) ?? "",
    leadSourceId: single(query.source) ?? "",
    serviceCategoryId: single(query.service) ?? "",
    status: single(query.status) ?? "",
  };
}

export function reportUtcBounds(startDate: string, endDate: string, timezone: string) {
  return {
    start: zonedDateTimeToUtc(startDate, "00:00:00", timezone).toISOString(),
    endExclusive: zonedDateTimeToUtc(addDays(endDate, 1), "00:00:00", timezone).toISOString(),
  };
}

export function formatRange(filters: Pick<ReportFilters, "startDate" | "endDate" | "timezone">) {
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const start = format.format(new Date(`${filters.startDate}T12:00:00Z`));
  const end = format.format(new Date(`${filters.endDate}T12:00:00Z`));
  return `${start} - ${end} (${filters.timezone})`;
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getBusinessDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function startOfWeek(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function startOfQuarter(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(quarterMonth).padStart(2, "0")}-01`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function differenceInDays(start: string, end: string) {
  return Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000);
}

function zonedDateTimeToUtc(date: string, time: string, timezone: string) {
  const intended = Date.parse(`${date}T${time}Z`);
  let guess = intended;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second));
    guess += intended - represented;
  }
  return new Date(guess);
}
