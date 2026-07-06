import { createClient } from "@/lib/supabase/server";

export const platformRoleNames = [
  "owner",
  "admin",
  "estimator",
  "crew",
  "customer",
  "property_manager",
] as const;

export type PlatformRoleName = (typeof platformRoleNames)[number];

type RoleRow = {
  roles: { name: string } | { name: string }[] | null;
};

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

  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

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

export async function hasAnyRole(allowedRoles: PlatformRoleName[]) {
  const roles = await getCurrentUserRoles();
  return roles.some((role) => allowedRoles.includes(role));
}
