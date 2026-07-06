import {
  hasAllowedRole,
  platformRoleGroups,
  type PlatformRoleName,
} from "@/lib/auth/roles";

export function canViewAllCrewJobs(roles: PlatformRoleName[]) {
  return hasAllowedRole(roles, platformRoleGroups.internalStaff);
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
