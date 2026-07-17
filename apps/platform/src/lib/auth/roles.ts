import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const platformRoleNames = [
  "owner",
  "admin",
  "payroll_admin",
  "estimator",
  "crew",
  "customer",
  "property_manager",
] as const;

export type PlatformRoleName = (typeof platformRoleNames)[number];

export const platformRoleGroups = {
  accessApproval: ["owner", "admin"],
  internalStaff: ["owner", "admin", "payroll_admin", "estimator"],
  crewApp: ["owner", "admin", "payroll_admin", "estimator", "crew"],
  customerPortal: ["owner", "admin", "customer"],
  organizationPortal: ["owner", "admin", "property_manager"],
  timeClockReview: ["owner", "admin", "payroll_admin"],
  timeClockEligible: ["owner", "admin", "payroll_admin", "estimator", "crew"],
  reporting: ["owner", "admin", "payroll_admin", "estimator"],
  financialReporting: ["owner", "admin", "payroll_admin"],
} as const satisfies Record<string, readonly PlatformRoleName[]>;

type RoleRow = {
  roles: { name: string } | { name: string }[] | null;
};

export async function getUserRoles(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
): Promise<PlatformRoleName[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);

  if (error || !data) {
    return [];
  }

  return ((data as RoleRow[]) ?? [])
    .flatMap((row) => row.roles ?? [])
    .map((role) => role.name)
    .filter((role): role is PlatformRoleName =>
      platformRoleNames.includes(role as PlatformRoleName),
    );
}

export async function getCurrentUserRoles(): Promise<PlatformRoleName[]> {
  const supabase = await createClient();

  if (!supabase) {
    return [];
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  return getUserRoles(supabase, user.id);
}

export async function getCurrentUserRolesFromClient(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
) {
  return getUserRoles(supabase, userId);
}

export function hasAllowedRole(
  roles: readonly PlatformRoleName[],
  allowedRoles: readonly PlatformRoleName[],
) {
  return roles.some((role) => allowedRoles.includes(role));
}

export async function hasAnyRole(allowedRoles: readonly PlatformRoleName[]) {
  const roles = await getCurrentUserRoles();
  return hasAllowedRole(roles, allowedRoles);
}
