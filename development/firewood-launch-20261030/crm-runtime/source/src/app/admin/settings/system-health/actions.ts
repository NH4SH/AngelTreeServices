"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";
import { runAllHealthChecks } from "@/lib/system-health/checks";
import { persistHealthRun } from "@/lib/system-health/store";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HealthActionState = { status: "idle" | "success" | "error"; message: string };

export async function runManualSystemHealthCheck(
  _previous: HealthActionState,
): Promise<HealthActionState> {
  const supabase = await createClient();
  if (!supabase) return failure("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("Sign in before running system checks.");
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return failure("Only owners and admins can run system checks.");
  }
  const rateLimit = await enforceSharedRateLimit({
    action: "system_health.manual_run",
    identifiers: [user.id],
    limit: 3,
    windowSeconds: 600,
  });
  if (!rateLimit.available) return failure("Health check rate limiting is unavailable.");
  if (!rateLimit.allowed) return failure(`Please wait ${rateLimit.retryAfterSeconds} seconds before running checks again.`);
  const privileged = getServiceRoleClient();
  if (!privileged) return failure("Privileged health checks are not configured.");
  const checks = await runAllHealthChecks();
  const stored = await persistHealthRun(privileged, checks, "manual");
  if (stored.error) return failure("Health results could not be recorded. Confirm the monitoring migration is applied.");
  await recordActivity(privileged, {
    actionCategory: "other",
    actorType: roles.includes("owner") ? "owner" : "admin",
    actorUserId: user.id,
    destinationPath: "/admin/settings/system-health",
    eventType: "system_health_manual_check",
    summary: `Ran ${stored.recorded} safe system health checks.`,
    subjectId: user.id,
    subjectType: "system_health",
  });
  revalidatePath("/admin/settings/system-health");
  const attention = checks.filter(({ result }) => result.status === "degraded" || result.status === "outage").length;
  return {
    status: "success",
    message: attention
      ? `Checks completed. ${attention} ${attention === 1 ? "component needs" : "components need"} attention.`
      : "Checks completed. No active failures were found.",
  };
}

function failure(message: string): HealthActionState {
  return { status: "error", message };
}
