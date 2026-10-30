import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { TimeClockPermission } from "@/lib/types/database";

export function canReviewTimeClock(roles: PlatformRoleName[]) {
  return hasAllowedRole(roles, platformRoleGroups.timeClockReview);
}

export function isTimeClockRoleEligible(roles: PlatformRoleName[]) {
  return hasAllowedRole(roles, platformRoleGroups.timeClockEligible);
}

export function canUseTimeClock({
  permission,
  roles,
}: {
  permission: Pick<TimeClockPermission, "is_enabled"> | null;
  roles: PlatformRoleName[];
}) {
  return isTimeClockRoleEligible(roles) && Boolean(permission?.is_enabled);
}

export async function getTimeClockPermissionForUser(
  userId: string,
  providedSupabase?: NonNullable<Awaited<ReturnType<typeof createClient>>>,
) {
  const supabase = providedSupabase ?? await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("time_clock_permissions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: (data ?? null) as TimeClockPermission | null,
    error: null,
  };
}
