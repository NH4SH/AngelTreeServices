import type { PlatformRoleName } from "@/lib/auth/roles";

const crewBypassRoles: PlatformRoleName[] = ["owner", "admin", "estimator"];

export function canViewAllCrewJobs(roles: PlatformRoleName[]) {
  return roles.some((role) => crewBypassRoles.includes(role));
}

export function canAccessAssignedCrewJob({
  assignedCrewUserId,
  roles,
  userId,
}: {
  assignedCrewUserId: string | null;
  roles: PlatformRoleName[];
  userId: string;
}) {
  return canViewAllCrewJobs(roles) || assignedCrewUserId === userId;
}
