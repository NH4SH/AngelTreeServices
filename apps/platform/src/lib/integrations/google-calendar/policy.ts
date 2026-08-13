import type { PlatformRoleName } from "@/lib/auth/roles";
import type { GoogleCalendarConnection, ScheduleSyncEvent } from "./types";

const activeStatuses = new Set(["scheduled", "confirmed", "in_progress"]);
const companySyncRoles = new Set<PlatformRoleName>(["owner", "admin"]);

export function canUseCompanyGoogleCalendarSync(roles: readonly PlatformRoleName[]) {
  return roles.some((role) => companySyncRoles.has(role));
}

export function isGoogleCalendarEventEligible(input: {
  connection: GoogleCalendarConnection;
  event: ScheduleSyncEvent | null;
  roles: readonly PlatformRoleName[];
  windowStart: Date;
  windowEnd: Date;
}) {
  const { connection, event, roles, windowEnd, windowStart } = input;
  if (!event || !connection.syncEnabled || !["active", "error"].includes(connection.status)) return false;
  if (!activeStatuses.has(event.status)) return false;
  if (event.eventType === "estimate" && !connection.syncEstimates) return false;
  if (event.eventType === "job" && !connection.syncJobs) return false;
  if (event.eventType !== "estimate" && event.eventType !== "job") return false;

  const startsAt = new Date(event.startsAt);
  if (!Number.isFinite(startsAt.getTime()) || startsAt < windowStart || startsAt >= windowEnd) return false;

  if (connection.syncCompanyAll && canUseCompanyGoogleCalendarSync(roles)) return true;

  return event.assignees.some((assignment) =>
    Boolean(
      (connection.employeeId && assignment.employeeId === connection.employeeId)
      || assignment.authUserId === connection.authUserId,
    ),
  );
}

