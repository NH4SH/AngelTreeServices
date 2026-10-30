import { NextRequest } from "next/server";
import {
  getUserRoles,
  hasAllowedRole,
  platformRoleGroups,
} from "@/lib/auth/roles";
import { getReportData, getReportingSettings } from "@/lib/data/reports";
import { resolveReportFilters, formatRange } from "@/lib/reporting/definitions";
import { businessReportCsvRows } from "@/lib/reporting/export";
import {
  exactReportFilters,
  reportFilterArguments,
} from "@/lib/reporting/model";
import { serializeCsv } from "@/lib/security/csv";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = {
    "cache-control": "private, no-store",
    "content-type": "text/plain; charset=utf-8",
  };
  const db = await createClient();
  if (!db)
    return new Response("Reports are unavailable.", { status: 503, headers });
  const user = (await db.auth.getUser()).data.user;
  if (!user) return new Response("Sign in required.", { status: 401, headers });
  const roles = await getUserRoles(db, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.reporting))
    return new Response("Reporting access required.", { status: 403, headers });
  try {
    const settings = await getReportingSettings();
    if (settings.error) throw Error("Reporting settings are unavailable.");
    const filters = resolveReportFilters(
      Object.fromEntries(request.nextUrl.searchParams),
      settings.data.business_timezone,
    );
    if (
      !hasAllowedRole(roles, platformRoleGroups.financialReporting) &&
      !["executive", "quotes", "sources", "services"].includes(filters.view)
    )
      return new Response("Company report export access required.", {
        status: 403,
        headers,
      });
    const report = await getReportData(filters, roles, user.id, {
      export: true,
    });
    const rows = businessReportCsvRows(filters.view, report);
    const exact = new Map(
      exactReportFilters(filters, report.options).map((f) => [f.key, f.value]),
    );
    rows.splice(
      1,
      0,
      ["Date range", formatRange(filters)],
      ...Object.entries(reportFilterArguments(filters))
        .filter(([, value]) => value)
        .map(([key, value]) => ["Filter: " + key, exact.get(key) ?? value]),
    );
    return new Response(serializeCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="angel-tree-${filters.view}-${filters.startDate}-${filters.endDate}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    const limit = e instanceof Error && e.message.includes("10,000");
    return new Response(
      limit
        ? e.message
        : "The complete report could not be exported. Refresh or narrow the filters and try again.",
      { status: limit ? 413 : 503, headers },
    );
  }
}
