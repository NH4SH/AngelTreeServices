import type { ReportFilters, ReportView } from "./definitions";

export type ReportCell = string | number | boolean | null;
export type ReportRow = Record<string, ReportCell> & { id: string };
export type ReportGroup = {
  id: string;
  label: string;
  count: number;
  stats: Record<string, number>;
};
export type ReportDataset = {
  key: string;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  version: string;
  stats: Record<string, number>;
  medianAmount: number | null;
  groups: Record<
    string,
    {
      totalGroups: number;
      repeatGroups?: number;
      issuedGroups?: number;
      items: ReportGroup[];
    }
  >;
  rows: ReportRow[];
};
export type BusinessReport = {
  restricted: boolean;
  scope: "company" | "own";
  generatedAt: string;
  timezone: string;
  allTotalsComplete?: boolean;
  exportComplete?: boolean;
  datasets: Record<string, ReportDataset>;
  previous: Record<string, Omit<ReportDataset, "rows" | "groups">>;
  settings: Record<string, unknown>;
  summary?: {
    approvedQuoteCents: number;
    quoteApprovalRate: number | null;
    invoicedCents: number;
    collectedCents: number;
    outstandingCents: number;
    overdueCents: number;
  };
  options: {
    exactFilters?: {
      customer?: string | null;
      organization?: string | null;
      employee?: string | null;
    };
    sources?: { id: string; name: string }[];
    services?: { id: string; label: string }[];
  };
};

export function exactReportFilters(
  filters: ReportFilters,
  options?: BusinessReport["options"],
) {
  return [
    {
      key: "customer",
      label: "Customer",
      id: filters.customerId,
      value: options?.exactFilters?.customer || "Selected customer",
    },
    {
      key: "organization",
      label: "Organization",
      id: filters.organizationId,
      value: options?.exactFilters?.organization || "Selected organization",
    },
    {
      key: "employee",
      label: "Employee",
      id: filters.employeeId,
      value: options?.exactFilters?.employee || "Selected employee",
    },
  ].filter((filter) => filter.id);
}
export type Column = {
  key: string;
  label: string;
  format?: "money" | "date" | "hours" | "percent" | "title";
  link?: boolean;
};
const c = (
  key: string,
  label: string,
  format?: Column["format"],
  link = false,
): Column => ({ key, label, format, link });
export const reportTables: Record<
  string,
  { title: string; basis: string; columns: Column[] }
> = {
  quotes: {
    title: "Quote drilldown",
    basis:
      "Quotes created in the selected period; current outcomes of that cohort.",
    columns: [
      c("number", "Quote", undefined, true),
      c("party", "Account"),
      c("estimator", "Estimator"),
      c("status", "Status", "title"),
      c("quotedCents", "Quote value", "money"),
      c("createdAt", "Created", "date"),
      c("sentAt", "Sent", "date"),
      c("approvedAt", "Approved", "date"),
    ],
  },
  jobs: {
    title: "Work created in the period",
    basis:
      "Current status of work records created in the selected period. These stages are not a conversion funnel.",
    columns: [
      c("number", "Work", undefined, true),
      c("party", "Account"),
      c("status", "Status", "title"),
      c("createdAt", "Created", "date"),
      c("completedAt", "Completed", "date"),
    ],
  },
  completed: {
    title: "Completed work",
    basis:
      "Explicit completion date falls in the selected period, regardless of when the job was created.",
    columns: [
      c("number", "Work", undefined, true),
      c("party", "Account"),
      c("completedAt", "Completed", "date"),
    ],
  },
  invoices: {
    title: "Invoice drilldown",
    basis:
      "Invoices created in the selected period. Issued value excludes drafts and voids; archived issued invoices remain part of financial history.",
    columns: [
      c("number", "Invoice", undefined, true),
      c("party", "Account"),
      c("status", "Status", "title"),
      c("invoicedCents", "Document total", "money"),
      c("balanceCents", "Balance", "money"),
      c("createdAt", "Created", "date"),
      c("dueAt", "Due", "date"),
      c("paidAt", "Paid", "date"),
    ],
  },
  payments: {
    title: "Payment drilldown",
    basis:
      "Successful/refunded payments received in the period. Net retained principal reflects refunds and lost disputes known now, even when recorded later. Surcharges are excluded.",
    columns: [
      c("number", "Invoice", undefined, true),
      c("party", "Account"),
      c("method", "Method", "title"),
      c("paidAt", "Received", "date"),
      c("grossCents", "Principal received", "money"),
      c("adjustmentCents", "Refund / lost principal", "money"),
      c("collectedCents", "Net retained principal", "money"),
    ],
  },
  ar: {
    title: "Current accounts receivable",
    basis:
      "Current open issued balances across all invoice dates, independent of the period. Aging uses business-calendar dates; due today is current.",
    columns: [
      c("number", "Invoice", undefined, true),
      c("party", "Account"),
      c("dueAt", "Due", "date"),
      c("invoicedCents", "Invoice total", "money"),
      c("balanceCents", "Balance", "money"),
    ],
  },
  profitability: {
    title: "Whole-job estimated margin",
    basis:
      "Jobs completed in the selected period. All linked issued invoices, payment adjustments, approved time, effective rates, approved direct costs and equipment usage are included across all dates. Filters select whole jobs, not a share of their costs.",
    columns: [
      c("number", "Work", undefined, true),
      c("party", "Account"),
      c("completedAt", "Completed", "date"),
      c("invoiceCount", "Invoices"),
      c("billedCents", "Issued value", "money"),
      c("adjustmentCents", "Refund / lost principal", "money"),
      c("revenueCents", "Adjusted billed value", "money"),
      c("laborHours", "Approved hours", "hours"),
      c("laborCents", "Labor cost", "money"),
      c("directCents", "Direct cost", "money"),
      c("equipmentCents", "Equipment cost", "money"),
      c("profitCents", "Estimated profit", "money"),
      c("margin", "Margin", "percent"),
      c("issues", "Input review"),
    ],
  },
  rates: {
    title: "Historical labor cost rates",
    basis:
      "All dated rates; work uses its business start date. Overlapping rates require review. These costs remain restricted.",
    columns: [
      c("employee", "Employee", undefined, true),
      c("effectiveFrom", "Starts"),
      c("effectiveTo", "Ends"),
      c("hourlyCents", "Hourly cost", "money"),
      c("burden", "Burden", "percent"),
    ],
  },
  time: {
    title: "Time drilldown",
    basis:
      "Entries started in the period, with their full recorded duration after breaks. Latest review is used; voided entries are excluded. This is an entry cohort, not a split of overnight hours at the period boundary.",
    columns: [
      c("employee", "Employee", undefined, true),
      c("type", "Type", "title"),
      c("jobId", "Work ID"),
      c("clockIn", "Started", "date"),
      c("clockOut", "Ended", "date"),
      c("hours", "Recorded hours", "hours"),
      c("review", "Review", "title"),
    ],
  },
  schedule: {
    title: "Schedule drilldown",
    basis:
      "Events starting in the period. Scheduled hours exclude cancelled events; capacity utilization remains unavailable without availability records.",
    columns: [
      c("title", "Event", undefined, true),
      c("type", "Type", "title"),
      c("status", "Status", "title"),
      c("startsAt", "Starts", "date"),
      c("hours", "Event hours", "hours"),
    ],
  },
  customers: {
    title: "New individual customers",
    basis: "Unarchived individual customers created in the period.",
    columns: [
      c("party", "Customer", undefined, true),
      c("status", "Status", "title"),
      c("createdAt", "Created", "date"),
    ],
  },
  organizations: {
    title: "New organizations",
    basis: "Unarchived organizations created in the period.",
    columns: [
      c("party", "Organization", undefined, true),
      c("status", "Status", "title"),
      c("createdAt", "Created", "date"),
    ],
  },
  quote_lines: {
    title: "Quoted service lines",
    basis:
      "Explicit service classification on quotes created in the period. Line value precedes document-level tax/discount adjustments.",
    columns: [
      c("number", "Quote", undefined, true),
      c("party", "Account"),
      c("category", "Service"),
      c("lineCents", "Line value", "money"),
    ],
  },
  invoice_lines: {
    title: "Issued service lines",
    basis:
      "Explicit service classification on issued invoices created in the period. Line value is not the final invoice total or collected cash.",
    columns: [
      c("number", "Invoice", undefined, true),
      c("party", "Account"),
      c("category", "Service"),
      c("lineCents", "Line value", "money"),
    ],
  },
  assets: {
    title: "Current fleet",
    basis:
      "Company-wide unarchived fleet snapshot. Work/party/source filters do not allocate assets to jobs.",
    columns: [
      c("asset", "Asset", undefined, true),
      c("number", "Asset number"),
      c("category", "Category", "title"),
      c("status", "Status", "title"),
    ],
  },
  maintenance: {
    title: "Maintenance completed in the period",
    basis:
      "Completion date, not purchase date. Maintenance is not automatically allocated to job margin.",
    columns: [
      c("asset", "Asset", undefined, true),
      c("number", "Asset number"),
      c("type", "Type", "title"),
      c("status", "Status", "title"),
      c("costCents", "Recorded cost", "money"),
      c("date", "Completed", "date"),
    ],
  },
  problems: {
    title: "Equipment problems",
    basis: "Problem reports created in the period.",
    columns: [
      c("asset", "Asset", undefined, true),
      c("status", "Status", "title"),
      c("date", "Reported", "date"),
      c("detail", "Attention"),
    ],
  },
  inspections: {
    title: "Equipment inspections",
    basis: "Inspections performed in the period.",
    columns: [
      c("asset", "Asset", undefined, true),
      c("status", "Result", "title"),
      c("date", "Inspected", "date"),
    ],
  },
  movements: {
    title: "Material movement",
    basis:
      "Movement date. Quantities retain their entered units; counts do not imply an exact stock measure.",
    columns: [
      c("material", "Material", undefined, true),
      c("type", "Movement", "title"),
      c("quantity", "Quantity"),
      c("unit", "Unit"),
      c("estimated", "Estimated"),
      c("date", "Moved", "date"),
    ],
  },
  stock: {
    title: "Current stock by location",
    basis:
      "Company-wide current stock snapshot, independent of date and work filters. No conversion between units is inferred.",
    columns: [
      c("material", "Material", undefined, true),
      c("locationId", "Location ID"),
      c("onHand", "On hand"),
      c("reserved", "Reserved"),
      c("available", "Available"),
      c("unit", "Unit"),
      c("date", "Last movement", "date"),
    ],
  },
  disposal: {
    title: "Disposal records",
    basis:
      "Disposal records created in the period. Fees are separate from reviewed job cost entries.",
    columns: [
      c("destination", "Destination", undefined, true),
      c("type", "Type", "title"),
      c("quantity", "Quantity"),
      c("unit", "Unit"),
      c("estimated", "Estimated"),
      c("feeCents", "Fee", "money"),
      c("status", "Status", "title"),
    ],
  },
  production: {
    title: "Production yield",
    basis:
      "Batches created in the period. Entered output is estimated; unit costs are not inferred.",
    columns: [
      c("batch", "Batch", undefined, true),
      c("material", "Product"),
      c("status", "Status", "title"),
      c("quantity", "Output"),
      c("unit", "Unit"),
      c("directCents", "Recorded direct cost", "money"),
    ],
  },
  deliveries: {
    title: "Customer deliveries",
    basis: "Deliveries created in the period, with their current outcome.",
    columns: [
      c("material", "Material", undefined, true),
      c("quantity", "Quantity"),
      c("unit", "Unit"),
      c("status", "Status", "title"),
      c("date", "Delivered", "date"),
    ],
  },
  costs: {
    title: "Direct cost entries",
    basis:
      "Costs incurred in the period. Approved material/disposal totals use current unsuperseded costs only.",
    columns: [
      c("party", "Account", undefined, true),
      c("category", "Category", "title"),
      c("description", "Description"),
      c("costCents", "Cost", "money"),
      c("status", "Review", "title"),
      c("superseded", "Superseded"),
      c("incurredOn", "Incurred"),
    ],
  },
  quality: {
    title: "Current correction queue",
    basis:
      "Current data-quality items across all dates. No correction is applied automatically; legacy closed statuses without completion dates are explicit issues.",
    columns: [
      c("issue", "Issue", undefined, true),
      c("detail", "Review detail"),
      c("date", "Detected / source date", "date"),
    ],
  },
};
export const viewTables: Record<ReportView, string[]> = {
  executive: ["quotes"],
  pipeline: ["jobs", "quotes", "invoices"],
  quotes: ["quotes"],
  revenue: ["invoices", "payments", "ar"],
  profitability: ["profitability", "rates"],
  labor: ["time"],
  scheduling: ["schedule"],
  customers: ["customers", "organizations"],
  sources: ["jobs", "quotes", "invoices"],
  services: ["quote_lines", "invoice_lines"],
  fleet: ["assets", "maintenance", "problems", "inspections"],
  materials: [
    "movements",
    "stock",
    "disposal",
    "production",
    "deliveries",
    "costs",
  ],
  quality: ["quality"],
};
export const stat = (
  data: Pick<BusinessReport, "datasets">,
  kind: string,
  key: string,
) => data.datasets[kind]?.stats[key] ?? 0;
export const count = (data: Pick<BusinessReport, "datasets">, kind: string) =>
  data.datasets[kind]?.total ?? 0;
export const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

export function reportFilterArguments(f: ReportFilters) {
  return {
    customer: f.customerId,
    organization: f.organizationId,
    employee: f.employeeId,
    source: f.leadSourceId,
    service: f.serviceCategoryId,
    status: f.status,
    party: f.partyQuery,
    employee_name: f.employeeQuery,
  };
}
export function reportParams(f: ReportFilters, view: ReportView = f.view) {
  const p = new URLSearchParams({
    view,
    range: f.preset,
    start: f.startDate,
    end: f.endDate,
  });
  for (const [k, v] of Object.entries(reportFilterArguments(f)))
    if (v) p.set(k, v);
  return p;
}
export function validateBusinessReport(
  value: unknown,
  view?: ReportView | "dashboard",
): BusinessReport {
  const r = value as BusinessReport;
  if (
    !r ||
    typeof r !== "object" ||
    !["company", "own"].includes(r.scope) ||
    typeof r.restricted !== "boolean" ||
    !Number.isFinite(Date.parse(r.generatedAt)) ||
    !r.datasets ||
    !r.previous ||
    !r.options
  )
    throw Error("Invalid report acknowledgment");
  if (!r.restricted && r.allTotalsComplete !== true)
    throw Error("Report totals could not be confirmed");
  const expected: Record<ReportView | "dashboard", string[]> = {
    executive: [
      "quotes",
      "jobs",
      "completed",
      "invoices",
      "payments",
      "ar",
      "backlog",
    ],
    pipeline: ["jobs", "quotes", "invoices", "backlog"],
    quotes: ["quotes"],
    revenue: ["invoices", "payments", "ar"],
    profitability: ["profitability", "rates"],
    labor: ["time"],
    scheduling: ["schedule", "backlog"],
    customers: [
      "customers",
      "organizations",
      "completed",
      "jobs",
      "invoices",
      "ar",
    ],
    sources: ["jobs", "quotes", "invoices"],
    services: ["quote_lines", "invoice_lines"],
    fleet: ["assets", "maintenance", "problems", "inspections"],
    materials: [
      "movements",
      "stock",
      "disposal",
      "production",
      "deliveries",
      "costs",
    ],
    quality: ["quality"],
    dashboard: [],
  };
  if (view && !r.restricted) {
    const keys = expected[view].filter(
      (k) => r.scope === "company" || ["quotes", "quote_lines"].includes(k),
    );
    if (
      keys.length !== Object.keys(r.datasets).length ||
      keys.some((k) => !r.datasets[k])
    )
      throw Error("Report datasets could not be confirmed");
  }
  for (const [k, d] of Object.entries(r.datasets)) {
    if (
      d.key !== k ||
      ![d.total, d.page, d.pageSize, d.pages].every(Number.isSafeInteger) ||
      d.total < 0 ||
      d.page < 1 ||
      d.pageSize < 1 ||
      d.pageSize > (r.exportComplete ? 10000 : 100) ||
      d.pages !== Math.max(1, Math.ceil(d.total / d.pageSize)) ||
      d.page > d.pages ||
      !/^[a-f0-9]{32}$/.test(d.version) ||
      !Array.isArray(d.rows) ||
      d.rows.length !==
        Math.min(d.pageSize, Math.max(0, d.total - (d.page - 1) * d.pageSize))
    )
      throw Error("Incomplete report page");
    if (
      !d.stats ||
      !d.groups ||
      !Object.values(d.stats).every(
        (n) =>
          typeof n === "number" &&
          Number.isFinite(n) &&
          Math.abs(n) <= Number.MAX_SAFE_INTEGER,
      )
    )
      throw Error("Invalid report totals");
    const safeNumber = (n: unknown) =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      Math.abs(n) <= Number.MAX_SAFE_INTEGER;
    if (d.medianAmount !== null && !safeNumber(d.medianAmount))
      throw Error("Invalid report median");
    if (
      new Set(d.rows.map((row) => row.id)).size !== d.rows.length ||
      d.rows.some(
        (row) =>
          !row ||
          typeof row.id !== "string" ||
          !row.id ||
          Object.values(row).some(
            (v) =>
              v !== null &&
              typeof v !== "string" &&
              typeof v !== "boolean" &&
              !safeNumber(v),
          ),
      )
    )
      throw Error("Invalid report details");
    for (const group of Object.values(d.groups)) {
      if (
        !Number.isSafeInteger(group.totalGroups) ||
        group.totalGroups < 0 ||
        !Array.isArray(group.items) ||
        group.items.length > 16 ||
        group.items.some(
          (g) =>
            typeof g.id !== "string" ||
            typeof g.label !== "string" ||
            !Number.isSafeInteger(g.count) ||
            g.count < 1 ||
            !g.stats ||
            !Object.values(g.stats).every(safeNumber),
        ) ||
        group.items.reduce((sum, g) => sum + g.count, 0) !== d.total
      )
        throw Error("Incomplete report groups");
    }
  }
  if (
    r.scope === "own" &&
    Object.keys(r.datasets).some((k) => !["quotes", "quote_lines"].includes(k))
  )
    throw Error("Unexpected report scope");
  return r;
}
