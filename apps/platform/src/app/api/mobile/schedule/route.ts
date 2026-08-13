import { apiError, apiSuccess } from "@/lib/api/responses";
import {
  buildMobileSchedulePayload,
  mobileScheduleScopes,
  type MobileScheduleScope,
} from "@/lib/api/mobile-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getScheduleCalendarDataForClient } from "@/lib/data/schedule";
import { parseScheduleDateTime, shiftScheduleDateKey } from "@/lib/schedule/event-form";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumInclusiveRangeDays = 7;

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") ?? "";
  const endDate = url.searchParams.get("end") ?? startDate;
  const scope = (url.searchParams.get("scope") ?? "mine") as MobileScheduleScope;

  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    return apiError("invalid_date_range", "Use start and end dates in YYYY-MM-DD format.", 400);
  }

  if (!mobileScheduleScopes.includes(scope)) {
    return apiError("invalid_schedule_scope", "Use scope=mine or scope=team.", 400);
  }

  const rangeDays = getInclusiveRangeDays(startDate, endDate);
  if (rangeDays < 1 || rangeDays > maximumInclusiveRangeDays) {
    return apiError("invalid_date_range", "Schedule requests may include one through seven days.", 400);
  }

  const canViewTeamSchedule = auth.context.roles.includes("owner") || auth.context.roles.includes("admin");
  if (scope === "team" && !canViewTeamSchedule) {
    return apiError("team_schedule_forbidden", "Only an owner or admin may view the team schedule.", 403);
  }

  const { data: employee, error: employeeError } = await auth.context.supabase
    .from("employee_records")
    .select("id")
    .eq("auth_user_id", auth.context.user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (employeeError) {
    return apiError("employee_identity_unavailable", "Employee access could not be verified.", 503);
  }

  if (scope === "mine" && !employee) {
    return apiError("employee_access_required", "A linked employee record is required for My Schedule.", 403);
  }

  const start = parseScheduleDateTime(`${startDate}T00:00`);
  const endExclusiveDate = shiftScheduleDateKey(endDate, 1);
  const endExclusive = parseScheduleDateTime(`${endExclusiveDate}T00:00`);

  if (!start || !endExclusive) {
    return apiError("invalid_date_range", "The Eastern schedule window could not be calculated.", 400);
  }

  const result = await getScheduleCalendarDataForClient(auth.context.supabase, {
    startsAtOrAfter: start.toISOString(),
    startsBefore: endExclusive.toISOString(),
  });

  if (result.error) {
    return apiError("mobile_schedule_unavailable", "The schedule could not be loaded.", 503);
  }

  return apiSuccess(buildMobileSchedulePayload({
    data: result.data,
    endDate,
    identity: {
      authUserId: auth.context.user.id,
      employeeId: employee?.id ?? null,
    },
    scope,
    startDate,
  }));
}

function getInclusiveRangeDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}
