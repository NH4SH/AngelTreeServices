import { NextRequest } from "next/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getReportData, getReportingSettings, relation, successfulPaymentTotal } from "@/lib/data/reports";
import { formatRange, resolveReportFilters } from "@/lib/reporting/definitions";
import { createClient } from "@/lib/supabase/server";
import { serializeCsv } from "@/lib/security/csv";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return new Response("Supabase is not configured.", { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in required.", { status: 401 });
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.reporting)) return new Response("Reporting access required.", { status: 403 });

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const settings = await getReportingSettings();
  const filters = resolveReportFilters(query, settings.data.business_timezone);
  const financialView = ["revenue", "profitability", "labor", "fleet"].includes(filters.view);
  if (financialView && !hasAllowedRole(roles, platformRoleGroups.financialReporting)) {
    return new Response("Financial export access required.", { status: 403 });
  }

  try {
    const data = await getReportData(filters, roles, user.id);
    const rows = exportRows(filters.view, data);
    const metadata = [
      ["Report", filters.view],
      ["Date range", formatRange(filters)],
      ["Generated at", new Date().toISOString()],
      [],
    ];
    const csv = serializeCsv([...metadata, ...rows]);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="angel-tree-${filters.view}-${filters.startDate}-${filters.endDate}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Report export failed", error);
    return new Response("The filtered report could not be exported.", { status: 500 });
  }
}

function exportRows(view: string, data: Awaited<ReturnType<typeof getReportData>>): Array<Array<string | number | null>> {
  if (view === "revenue") return [["Invoice", "Contracting party", "Status", "Invoice total cents", "Successful payments cents", "Balance due cents", "Created at", "Due at", "Paid at"], ...data.invoices.map((invoice) => [invoice.invoice_number, relation(invoice.organizations)?.name ?? relation(invoice.customers)?.display_name ?? "Unknown", invoice.status, invoice.total_cents, successfulPaymentTotal(invoice), invoice.balance_due_cents, invoice.created_at, invoice.due_at, invoice.paid_at])];
  if (view === "profitability") return [["Job ID", "Contracting party", "Revenue cents", "Approved labor hours", "Labor cost cents", "Approved direct cost cents", "Equipment cost cents", "Estimated gross profit cents", "Estimated margin percent", "Completeness"], ...data.profitability.map((row) => [row.job.id, relation(row.job.organizations)?.name ?? relation(row.job.customers)?.display_name ?? "Unknown", row.revenueCents, row.laborHours.toFixed(2), row.laborCostCents, row.directCostCents, row.equipmentCostCents, row.profitCents, row.marginPercent?.toFixed(3) ?? null, row.completeness])];
  if (view === "labor") return [["Employee", "Time type", "Job ID", "Clock in", "Clock out", "Break minutes", "Entry status", "Latest review"], ...data.timeEntries.map((entry) => [relation(entry.profiles)?.full_name || relation(entry.profiles)?.email || "Unknown", entry.entry_type, entry.job_id, entry.clock_in_at, entry.clock_out_at, entry.break_minutes, entry.status, [...entry.time_entry_approvals].sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0]?.approval_status ?? "unreviewed"])];
  if (view === "fleet") return [["Asset", "Asset number", "Maintenance type", "Status", "Cost cents", "Completed at"], ...data.maintenance.map((record) => [relation(record.equipment_assets)?.name ?? "Unknown", relation(record.equipment_assets)?.asset_number ?? null, record.maintenance_type, record.status, record.cost_cents ?? null, record.completed_at])];
  if (view === "sources") return [["Lead source", "Job ID", "Job status", "Created at"], ...data.jobs.map((job) => [relation(job.lead_sources)?.name ?? "Not recorded", job.id, job.status, job.created_at])];
  if (view === "services") return [["Document type", "Document ID", "Line ID", "Service category", "Amount cents"], ...data.quotes.flatMap((quote) => quote.quote_line_items.map((line) => ["quote", quote.id, line.id, relation(line.service_categories)?.label ?? "Uncategorized", line.total_cents])), ...data.invoices.flatMap((invoice) => invoice.invoice_line_items.map((line) => ["invoice", invoice.id, line.id, relation(line.service_categories)?.label ?? "Uncategorized", line.total_cents]))];
  return [["Quote", "Contracting party", "Estimator", "Status", "Total cents", "Created at", "Sent at", "Approved at"], ...data.quotes.map((quote) => [quote.quote_number, relation(quote.organizations)?.name ?? relation(quote.customers)?.display_name ?? "Unknown", relation(quote.profiles)?.full_name || relation(quote.profiles)?.email || "Not assigned", quote.status, quote.total_cents, quote.created_at, quote.sent_at, quote.approved_at])];
}
