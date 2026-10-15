/** Presentation only. Missing or RLS-hidden permission data is never treated as disabled. */
export type EmployeeClockState = "enabled" | "disabled" | "unavailable" | "no_account";
export const employeeClockLabels: Record<EmployeeClockState, string> = {
  enabled: "Enabled", disabled: "Disabled", unavailable: "Unavailable", no_account: "No account",
};
export function employeeClockState(input: {
  authId: string | null; active: boolean; archived: boolean; employmentStatus: string;
  profileStatus: string | null | undefined; permission: boolean | null | undefined;
  eligibleRole: boolean | undefined;
}): EmployeeClockState {
  if (!input.authId) return "no_account";
  if (!input.active || input.archived || ["inactive", "separated"].includes(input.employmentStatus)) return "disabled";
  if (input.profileStatus && input.profileStatus !== "active") return "disabled";
  if (input.permission === false) return "disabled";
  if (input.profileStatus !== "active" || input.permission == null || input.eligibleRole === undefined) return "unavailable";
  return input.eligibleRole ? "enabled" : "disabled";
}

const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const statuses = ["applicant", "onboarding", "active", "seasonal", "leave", "inactive", "separated"];
function employment(state: Record<string, unknown>) {
  return typeof state.employment_status === "string" && statuses.includes(state.employment_status) ? title(state.employment_status) : "Not recorded";
}
function crm(state: Record<string, unknown>) {
  if (state.profile_status === null) return "No account";
  if (state.is_active === false || state.archived === true || state.archived_at || ["inactive", "separated"].includes(String(state.employment_status))) return "Disabled";
  if (state.profile_status === "disabled") return "Disabled";
  if (state.profile_status === "active" && state.is_active === true) return "Enabled";
  return "Not recorded";
}
function clock(state: Record<string, unknown>) {
  return state.time_clock_enabled === true ? "Enabled" : state.time_clock_enabled === false ? "Disabled" : "Not recorded";
}
/** Whitelist ordinary history details; never render arbitrary metadata or provider/session details. */
export function employeeActivityPresentation(event: Record<string, unknown>) {
  const metadata = object(event.metadata_json);
  const before = object(metadata.previous_state), after = object(metadata.resulting_state);
  const changes = Object.keys(before).length && Object.keys(after).length
    ? [["Employment status", employment], ["CRM access", crm], ["Time-clock permission", clock]].flatMap(([label, format]) => {
        const render = format as (state: Record<string, unknown>) => string;
        const from = render(before), to = render(after);
        return from === to ? [] : [{ label: label as string, before: from, after: to }];
      }) : [];
  const kind = text(event.event_type);
  return {
    title: kind === "employee_marked_inactive" ? "Employee deactivated" : kind === "employee_access_reactivated" ? "Employee access restored" : title(kind || "Employee activity"),
    actor: text(event.actorName) || text(event.actor_label) || (event.actor_user_id ? "Staff member (name unavailable)" : "System or earlier record"),
    reason: text(metadata.reason),
    changes,
    rolesRetained: metadata.resulting_state && after.roles_retained === true,
  };
}
