import { count, stat, ratio, type BusinessReport } from "./model.ts";
import type { ReportView } from "./definitions";
export type Metric = {
  label: string;
  value: number | null;
  format?: "money" | "percent" | "hours" | "days";
  previous?: number | null;
};
export type Breakdown = {
  kind: string;
  group: string;
  title: string;
  metric?: string;
  format?: Metric["format"];
  rate?: boolean;
};
export function reportPresentation(r: BusinessReport, view: ReportView) {
  const s = (k: string, v: string) => stat(r, k, v),
    n = (k: string) => count(r, k);
  const m = (
    label: string,
    value: number | null,
    format?: Metric["format"],
    previous?: number | null,
  ): Metric => ({ label, value, format, previous });
  const prior = (kind: string, key?: string) =>
    key
      ? (r.previous[kind]?.stats[key] ?? null)
      : (r.previous[kind]?.total ?? null);
  const rate = ratio(s("quotes", "approved"), s("quotes", "eligible"));
  let metrics: Metric[] = [],
    breakdowns: Breakdown[] = [];
  const quoteMetrics = [
    m("Quotes created", n("quotes")),
    m("Quoted value", s("quotes", "quotedCents"), "money"),
    m("Approval rate", rate, "percent"),
    m("Approved quote value", s("quotes", "approvedCents"), "money"),
  ];
  switch (view) {
    case "executive":
      metrics = [
        ...quoteMetrics.map((x) =>
          x.label === "Approved quote value"
            ? { ...x, previous: prior("quotes", "approvedCents") }
            : x,
        ),
      ];
      if (r.scope === "company")
        metrics.unshift(
          m("Work records created", n("jobs"), undefined, prior("jobs")),
          m(
            "New leads in work cohort",
            s("jobs", "newLeads"),
            undefined,
            prior("jobs", "newLeads"),
          ),
          m("Jobs completed", n("completed"), undefined, prior("completed")),
        );
      if (r.scope === "company")
        metrics.push(
          m(
            "Issued invoice value",
            s("invoices", "invoicedCents"),
            "money",
            prior("invoices", "invoicedCents"),
          ),
          m(
            "Net retained payments",
            s("payments", "collectedCents"),
            "money",
            prior("payments", "collectedCents"),
          ),
          m("Current outstanding", s("ar", "balanceCents"), "money"),
          m("Current overdue", s("ar", "overdueCents"), "money"),
          m("Approved work unscheduled", s("backlog", "unscheduled")),
          m(
            "Completed without issued invoice",
            s("backlog", "awaitingInvoice"),
          ),
        );
      breakdowns = [
        {
          kind: "invoices",
          group: "month",
          title: "Issued invoice value by business month",
          metric: "invoicedCents",
          format: "money",
        },
      ];
      break;
    case "pipeline":
      metrics = [
        m("Work records created", n("jobs")),
        ...quoteMetrics,
        m("Issued invoice value", s("invoices", "invoicedCents"), "money"),
        m("Approved work unscheduled now", s("backlog", "unscheduled")),
        m(
          "Completed without issued invoice now",
          s("backlog", "awaitingInvoice"),
        ),
        m("Stale leads in current backlog", s("backlog", "staleLead")),
        m("Stale draft quotes in period", s("quotes", "staleDraft")),
        m("Stale sent quotes in period", s("quotes", "staleSent")),
        m(
          "Average work age in period",
          n("jobs") ? s("jobs", "ageDays") / n("jobs") : null,
          "days",
        ),
        m(
          "Average quote age in period",
          n("quotes") ? s("quotes", "ageDays") / n("quotes") : null,
          "days",
        ),
      ];
      breakdowns = [
        {
          kind: "jobs",
          group: "status",
          title: "Current status of work created in the period",
        },
        {
          kind: "quotes",
          group: "status",
          title: "Current status of quotes created in the period",
        },
        {
          kind: "invoices",
          group: "status",
          title: "Current status of invoices created in the period",
        },
      ];
      break;
    case "quotes":
      metrics = [
        ...quoteMetrics,
        m(
          "Average quote",
          n("quotes") ? s("quotes", "quotedCents") / n("quotes") : null,
          "money",
        ),
        m("Median quote", r.datasets.quotes?.medianAmount ?? null, "money"),
        m(
          "Decline rate",
          ratio(s("quotes", "declined"), s("quotes", "eligible")),
          "percent",
        ),
        m(
          "Average create to send",
          s("quotes", "sent")
            ? s("quotes", "sendDays") / s("quotes", "sent")
            : null,
          "days",
        ),
        m(
          "Average send to approval",
          s("quotes", "approvalTimed")
            ? s("quotes", "approvalDays") / s("quotes", "approvalTimed")
            : null,
          "days",
        ),
      ];
      breakdowns = [
        { kind: "quotes", group: "status", title: "Quote outcomes" },
        {
          kind: "quotes",
          group: "estimator",
          title: "Approved value by estimator",
          metric: "approvedCents",
          format: "money",
        },
      ];
      break;
    case "revenue":
      metrics = [
        m("Issued invoice value", s("invoices", "invoicedCents"), "money"),
        m("Draft invoice value", s("invoices", "draftCents"), "money"),
        m("Payment principal received", s("payments", "grossCents"), "money"),
        m(
          "Refund / lost principal known now",
          s("payments", "adjustmentCents"),
          "money",
        ),
        m("Net retained payments", s("payments", "collectedCents"), "money"),
        m("Current outstanding", s("ar", "balanceCents"), "money"),
        m("Current overdue", s("ar", "overdueCents"), "money"),
        m(
          "Average issued invoice",
          s("invoices", "issued")
            ? s("invoices", "invoicedCents") / s("invoices", "issued")
            : null,
          "money",
        ),
        m(
          "Average invoice to paid",
          s("invoices", "paid")
            ? s("invoices", "paymentDays") / s("invoices", "paid")
            : null,
          "days",
        ),
      ];
      breakdowns = [
        {
          kind: "ar",
          group: "aging",
          title: "Current receivables aging",
          metric: "balanceCents",
          format: "money",
        },
        {
          kind: "payments",
          group: "method",
          title: "Net retained principal by payment method",
          metric: "collectedCents",
          format: "money",
        },
      ];
      break;
    case "profitability":
      metrics = [
        m("Jobs in completion cohort", n("profitability")),
        m("Recorded inputs complete", s("profitability", "complete")),
        m(
          "Jobs needing input review",
          n("profitability") - s("profitability", "complete"),
        ),
        m(
          "Estimated profit — complete inputs only",
          s("profitability", "complete")
            ? s("profitability", "profitCents")
            : null,
          "money",
        ),
        m(
          "Weighted margin — complete inputs only",
          s("profitability", "complete")
            ? ratio(
                s("profitability", "profitCents"),
                s("profitability", "completeRevenueCents"),
              )
            : null,
          "percent",
        ),
        m(
          "Adjusted billed value — all cohort jobs",
          s("profitability", "revenueCents"),
          "money",
        ),
      ];
      break;
    case "labor":
      metrics = [
        m("Approved recorded hours", s("time", "approvedHours"), "hours"),
        m("Approved job hours", s("time", "jobHours"), "hours"),
        m("Approved non-job hours", s("time", "nonJobHours"), "hours"),
        m("Entries needing review", s("time", "unapproved")),
      ];
      breakdowns = [
        {
          kind: "time",
          group: "employee",
          title: "Approved hours by employee",
          metric: "approvedHours",
          format: "hours",
        },
      ];
      break;
    case "scheduling":
      metrics = [
        m("Events starting in period", n("schedule")),
        m("Scheduled event hours", s("schedule", "scheduledHours"), "hours"),
        m("Completed events", s("schedule", "completed")),
        m("Cancelled events", s("schedule", "cancelled")),
        m("Approved work unscheduled now", s("backlog", "unscheduled")),
        m("Capacity utilization", null, "percent"),
      ];
      breakdowns = [
        { kind: "schedule", group: "type", title: "Events by type" },
      ];
      break;
    case "customers":
      metrics = [
        m("New individual customers", n("customers")),
        m("New organizations", n("organizations")),
        m(
          "Accounts with repeat completions in period",
          r.datasets.completed?.groups.party?.repeatGroups ?? 0,
        ),
        m(
          "Accounts with issued invoices in period",
          r.datasets.invoices?.groups.party?.issuedGroups ?? 0,
        ),
        m(
          "Accounts with current balances",
          r.datasets.ar?.groups.party?.totalGroups ?? 0,
        ),
      ];
      breakdowns = [
        {
          kind: "invoices",
          group: "party",
          title: "Invoice value by contracting account",
          metric: "invoicedCents",
          format: "money",
        },
        { kind: "jobs", group: "area", title: "Work created by service area" },
      ];
      break;
    case "sources":
      metrics = [...quoteMetrics];
      if (r.scope === "company")
        metrics.unshift(m("Work records created", n("jobs")));
      breakdowns = [
        {
          kind: "jobs",
          group: "source",
          title: "Work created by recorded lead source",
        },
        {
          kind: "quotes",
          group: "source",
          title: "Quote approval rate by recorded source",
          rate: true,
        },
        {
          kind: "quotes",
          group: "source",
          title: "Approved quote value by recorded source",
          metric: "approvedCents",
          format: "money",
        },
        {
          kind: "invoices",
          group: "source",
          title: "Issued invoice value by recorded source",
          metric: "invoicedCents",
          format: "money",
        },
      ];
      break;
    case "services":
      metrics = [
        m("Uncategorized quote lines", s("quote_lines", "uncategorized")),
        m(
          "Categorized quoted line value",
          s("quote_lines", "categorizedCents"),
          "money",
        ),
      ];
      if (r.scope === "company")
        metrics.push(
          m("Uncategorized invoice lines", s("invoice_lines", "uncategorized")),
          m(
            "Categorized issued line value",
            s("invoice_lines", "categorizedCents"),
            "money",
          ),
        );
      breakdowns = [
        {
          kind: "quote_lines",
          group: "category",
          title: "Quoted line value by service",
          metric: "quotedCents",
          format: "money",
        },
        {
          kind: "invoice_lines",
          group: "category",
          title: "Issued line value by service",
          metric: "invoicedCents",
          format: "money",
        },
      ];
      break;
    case "fleet":
      metrics = [
        m("Active assets", s("assets", "active")),
        m("Out of service", s("assets", "outOfService")),
        m("Problem reports in period", n("problems")),
        m("Failed inspections in period", s("inspections", "failed")),
        m("Completed maintenance cost", s("maintenance", "costCents"), "money"),
      ];
      breakdowns = [
        {
          kind: "maintenance",
          group: "asset",
          title: "Completed maintenance cost by asset",
          metric: "costCents",
          format: "money",
        },
      ];
      break;
    case "materials":
      metrics = [
        m("Receive entries", s("movements", "received")),
        m("Job-use entries", s("movements", "used")),
        m("Stock correction entries", s("movements", "corrections")),
        m("Disposal records created", n("disposal")),
        m("Deliveries created", n("deliveries")),
        m("Production batches created", n("production")),
        m(
          "Approved material cost incurred",
          s("costs", "materialCents"),
          "money",
        ),
        m(
          "Approved disposal cost incurred",
          s("costs", "disposalCents"),
          "money",
        ),
      ];
      break;
    case "quality":
      metrics = [m("Current correction items", n("quality"))];
      breakdowns = [
        {
          kind: "quality",
          group: "issue",
          title: "Items by correction needed",
        },
      ];
      break;
  }
  return { metrics, breakdowns: breakdowns.filter((b) => r.datasets[b.kind]) };
}
