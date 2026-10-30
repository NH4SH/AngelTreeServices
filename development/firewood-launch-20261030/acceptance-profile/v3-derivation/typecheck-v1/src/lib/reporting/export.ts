import { reportTables, type BusinessReport } from "./model.ts";
import { reportPresentation } from "./presentation.ts";
import type { ReportView } from "./definitions";
import type { CsvCell } from "../security/csv";

// The export RPC builds every section in one statement/snapshot, after an exact
// combined row-count preflight. Never export only the visible detail page.
export function businessReportCsvRows(
  view: ReportView,
  report: BusinessReport,
): CsvCell[][] {
  if (
    report.restricted ||
    report.exportComplete !== true ||
    report.allTotalsComplete !== true
  )
    throw Error("Complete export could not be confirmed");
  const datasets = Object.values(report.datasets);
  if (
    datasets.reduce((n, d) => n + d.total, 0) > 10000 ||
    datasets.some((d) => d.page !== 1 || d.rows.length !== d.total)
  )
    throw Error("Incomplete export");
  const rows: CsvCell[][] = [
    ["Report", view],
    ["Scope", report.scope],
    ["Generated at", report.generatedAt],
    ["Business timezone", report.timezone],
    [
      "Read consistency",
      "One database statement; current state, not historical snapshots",
    ],
    [],
    ["Metric", "Value", "Unit"],
  ];
  for (const m of reportPresentation(report, view).metrics)
    rows.push([
      m.label,
      m.value,
      m.format === "money" ? "cents" : (m.format ?? "count"),
    ]);
  for (const d of datasets) {
    const def =
      reportTables[d.key] ??
      (d.key === "backlog"
        ? {
            ...reportTables.jobs,
            title: "Current work backlog",
            basis: "Current active work across all dates.",
          }
        : null);
    if (!def) throw Error("Unknown export section");
    rows.push(
      [],
      ["Section", def.title],
      ["Date basis", def.basis],
      ["Complete row count", d.total],
      def.columns.map(
        (c) => c.label + (c.format === "money" ? " (cents)" : ""),
      ),
    );
    for (const row of d.rows) rows.push(def.columns.map((c) => row[c.key]));
  }
  rows.push([], ["Export complete", datasets.reduce((n, d) => n + d.total, 0)]);
  return rows;
}
