import { apiError, apiSuccess } from "@/lib/api/responses";
import { getCrewApiContext } from "@/lib/auth/apiContext";

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const { roles, supabase, user } = auth.context;
  const [profileResult, employeeResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("employee_records")
      .select("id, auth_user_id, preferred_name, legal_name, contact_email, contact_phone, job_title, crew_name, employment_status, is_active, archived_at")
      .eq("auth_user_id", user.id)
      .is("archived_at", null)
      .maybeSingle(),
  ]);

  if (profileResult.error || !profileResult.data || profileResult.data.status !== "active") {
    return apiError("platform_access_required", "This account does not have active platform access.", 403);
  }

  if (employeeResult.error) {
    return apiError("employee_identity_unavailable", "Employee access could not be verified.", 503);
  }

  const employee = employeeResult.data;
  const isCrewOnly = roles.includes("crew")
    && !roles.some((role) => ["owner", "admin", "payroll_admin", "estimator"].includes(role));

  if (isCrewOnly && (!employee || !employee.is_active || employee.employment_status === "inactive" || employee.employment_status === "separated")) {
    return apiError("employee_access_required", "Your employee record is not active for field access.", 403);
  }

  return apiSuccess({
    user: {
      id: user.id,
      email: profileResult.data.email ?? user.email ?? null,
      displayName: profileResult.data.full_name ?? employee?.preferred_name ?? employee?.legal_name ?? null,
    },
    employee: employee
      ? {
          id: employee.id,
          displayName: employee.preferred_name ?? employee.legal_name ?? "Employee",
          email: employee.contact_email,
          phone: employee.contact_phone,
          jobTitle: employee.job_title,
          crewName: employee.crew_name,
          employmentStatus: employee.employment_status,
          isActive: employee.is_active,
        }
      : null,
    roles,
    capabilities: {
      canViewTeamSchedule: roles.includes("owner") || roles.includes("admin"),
      canViewSchedule: roles.some((role) => ["owner", "admin", "payroll_admin", "estimator", "crew"].includes(role)),
    },
  });
}
