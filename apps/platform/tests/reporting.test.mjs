import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveReportFilters,
  reportUtcBounds,
} from "../src/lib/reporting/definitions.ts";
import {
  validateBusinessReport,
  reportFilterArguments,
  reportParams,
  exactReportFilters,
} from "../src/lib/reporting/model.ts";
import { reportPresentation } from "../src/lib/reporting/presentation.ts";
import { businessReportCsvRows } from "../src/lib/reporting/export.ts";
import { serializeCsv } from "../src/lib/security/csv.ts";
const dataset = (key, stats = {}, rows = []) => ({
  key,
  total: rows.length,
  page: 1,
  pageSize: 50,
  pages: 1,
  version: "a".repeat(32),
  stats,
  groups: {},
  medianAmount: null,
  rows,
});
const report = (datasets = {}) => ({
  restricted: false,
  scope: "company",
  generatedAt: "2026-10-16T12:00:00Z",
  timezone: "America/New_York",
  allTotalsComplete: true,
  datasets,
  previous: {},
  settings: {},
  options: {},
});
test("exact record filters show names and removing one preserves other dimensions", () => {
  const f = resolveReportFilters(
    {
      customer: "customer-id",
      organization: "org-id",
      employee: "user-id",
      source: "source-id",
      range: "custom",
      start: "2026-10-01",
      end: "2026-10-31",
    },
    "America/New_York",
  );
  const visible = exactReportFilters(f, {
    exactFilters: {
      customer: "Willow",
      organization: "Willow HOA",
      employee: "Crew lead",
    },
  });
  assert.deepEqual(
    visible.map((x) => x.value),
    ["Willow", "Willow HOA", "Crew lead"],
  );
  const p = reportParams(f);
  p.delete(visible[0].key);
  assert.equal(p.has("customer"), false);
  assert.equal(p.get("organization"), "org-id");
  assert.equal(p.get("source"), "source-id");
  assert.equal(p.get("end"), "2026-10-31");
});
test("a successful acknowledgment with a missing financial dataset cannot become zero totals", () => {
  assert.throws(
    () =>
      validateBusinessReport(
        report({ invoices: dataset("invoices") }),
        "revenue",
      ),
    /datasets/,
  );
  assert.doesNotThrow(() =>
    validateBusinessReport(report({ quotes: dataset("quotes") }), "quotes"),
  );
});
test("business-day bounds include 23/25-hour DST days, leap days and reversed custom ranges", () => {
  for (const [day, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
    ["2028-02-29", 24],
  ]) {
    const b = reportUtcBounds(day, day, "America/New_York");
    assert.equal(
      (Date.parse(b.endExclusive) - Date.parse(b.start)) / 3600000,
      hours,
    );
  }
  const f = resolveReportFilters(
    { range: "custom", start: "2026-10-31", end: "2026-10-01" },
    "America/New_York",
  );
  assert.equal(f.startDate, "2026-10-01");
  assert.equal(f.endDate, "2026-10-31");
  assert.equal(f.previousEndDate, "2026-09-30");
  assert.equal(f.previousStartDate, "2026-08-31");
  assert.notEqual(
    resolveReportFilters(
      { range: "custom", start: "2026-02-30" },
      "America/New_York",
    ).startDate,
    "2026-02-30",
  );
});
test("all dimensions and explicit dates survive report/tab/export links", () => {
  const f = resolveReportFilters(
    {
      range: "custom",
      start: "2026-10-01",
      end: "2026-10-16",
      customer: "c",
      organization: "o",
      source: "s",
      service: "v",
      employee: "e",
      employee_name: "Crew",
      party: "Willow",
      status: "sent",
    },
    "America/New_York",
  );
  assert.deepEqual(reportFilterArguments(f), {
    customer: "c",
    organization: "o",
    source: "s",
    service: "v",
    employee: "e",
    employee_name: "Crew",
    party: "Willow",
    status: "sent",
  });
  const p = reportParams(f, "quotes");
  assert.equal(p.get("view"), "quotes");
  for (const [k, v] of Object.entries(reportFilterArguments(f)))
    assert.equal(p.get(k), v);
});
test("large complete totals do not depend on the visible detail page", () => {
  const q = dataset(
    "quotes",
    { quotedCents: 100500, eligible: 1005, approved: 5, approvedCents: 500 },
    [{ id: "only-visible" }],
  );
  q.total = 1005;
  q.pageSize = 1;
  q.pages = 1005;
  const r = validateBusinessReport(report({ quotes: q }));
  assert.equal(
    reportPresentation(r, "quotes").metrics.find(
      (m) => m.label === "Quotes created",
    ).value,
    1005,
  );
  assert.equal(
    reportPresentation(r, "quotes").metrics.find(
      (m) => m.label === "Quoted value",
    ).value,
    100500,
  );
});
test("profitability is weighted over complete-input jobs and never averages row percentages", () => {
  const r = report({
    profitability: dataset("profitability", {
      complete: 2,
      profitCents: 2000,
      completeRevenueCents: 10000,
      revenueCents: 99999,
    }),
  });
  r.datasets.profitability.total = 3;
  const p = reportPresentation(r, "profitability").metrics;
  assert.equal(
    p.find((m) => m.label === "Weighted margin — complete inputs only").value,
    20,
  );
  assert.equal(p.find((m) => m.label === "Jobs needing input review").value, 1);
});
test("empty and all-warning cohorts show unavailable profit and rates rather than false zero profit", () => {
  for (const total of [0, 5]) {
    const r = report({
      profitability: dataset("profitability", {
        complete: 0,
        profitCents: 0,
        completeRevenueCents: 0,
      }),
    });
    r.datasets.profitability.total = total;
    const p = reportPresentation(r, "profitability").metrics;
    assert.equal(
      p.find((m) => m.label === "Estimated profit — complete inputs only")
        .value,
      null,
    );
    assert.equal(
      p.find((m) => m.label === "Weighted margin — complete inputs only").value,
      null,
    );
  }
  assert.equal(
    reportPresentation(
      report({ quotes: dataset("quotes") }),
      "quotes",
    ).metrics.find((m) => m.label === "Approval rate").value,
    null,
  );
});
test("missing/partial acknowledgments, excess rows and foreign scope cannot become valid reports", () => {
  for (const bad of [
    null,
    { ...report(), allTotalsComplete: false },
    report({ quotes: { ...dataset("quotes"), total: 5 } }),
    report({ quotes: { ...dataset("quotes"), page: 0 } }),
    { ...report({ invoices: dataset("invoices") }), scope: "own" },
  ])
    assert.throws(() => validateBusinessReport(bad));
});
test("CSV requires an explicit complete one-snapshot export and rejects a partial page", () => {
  const r = report({
    quotes: dataset("quotes", {}, [
      { id: "q", number: "Q1", quotedCents: 12345 },
    ]),
  });
  assert.throws(() => businessReportCsvRows("quotes", r));
  r.exportComplete = true;
  r.datasets.quotes.pageSize = 10000;
  assert.doesNotThrow(() => validateBusinessReport(r));
  const rows = businessReportCsvRows("quotes", r);
  assert.deepEqual(rows.at(-1), ["Export complete", 1]);
  assert.ok(rows.some((x) => x.includes(12345)));
  r.datasets.quotes.total = 1005;
  assert.throws(() => businessReportCsvRows("quotes", r));
});
test("CSV keeps typed cents/zero values and neutralizes formula-like source text", () => {
  const r = report({
    quotes: dataset("quotes", {}, [
      {
        id: "q",
        number: '=WEBSERVICE("invalid")',
        party: "+SUM(1,1)",
        quotedCents: 0,
      },
    ]),
  });
  r.exportComplete = true;
  const csv = serializeCsv(businessReportCsvRows("quotes", r));
  assert.ok(csv.includes("'=WEBSERVICE"));
  assert.ok(csv.includes("'+SUM"));
  assert.ok(csv.includes("Quote value (cents)"));
  assert.equal(csv.includes("https://"), false);
});
