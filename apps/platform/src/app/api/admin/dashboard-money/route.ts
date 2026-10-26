import { getPlatformReadContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { dashboardPeriods } from "@/lib/dashboard/cash-series";
import { getDashboardMoney } from "@/lib/data/dashboard-money";
import { privateNoStoreHeaders } from "@/lib/security/headers";

export const dynamic = "force-dynamic";
const headers = Object.fromEntries(privateNoStoreHeaders.map(({ key, value }) => [key, value]));
export async function GET(request: Request) {
  const period = dashboardPeriods.find(item => item.value === new URL(request.url).searchParams.get("range"))?.value;
  if (!period) return Response.json({ error: "Choose a reporting period." }, { status: 400, headers });
  const context = await getPlatformReadContext();
  if (!context.user) return Response.json({ error: "Sign in to view reports." }, { status: 401, headers });
  if (!hasAllowedRole(context.roles, platformRoleGroups.reporting)) return Response.json({ error: "Reporting access is required." }, { status: 403, headers });
  const result = await getDashboardMoney(period, context, request.signal);
  return Response.json(result, { status: result.kind === "unavailable" ? 503 : 200, headers });
}
