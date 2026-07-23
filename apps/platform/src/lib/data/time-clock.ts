import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { PlatformRoleName } from "@/lib/auth/roles";
import type {
  AssignableUser,
  DataResult,
  PayrollWarning,
  ScheduleEventWithRelations,
  TimeClockPermission,
  TimeClockUserSummary,
  TimeEntryApproval,
  TimeEntryReviewStatus,
  TimeEntryWithRelations,
} from "@/lib/types/database";

type RoleNameRow = {
  roles: { name: string } | { name: string }[] | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_roles?: RoleNameRow[] | null;
};

type ProfileLabelRow = Pick<AssignableUser, "id" | "full_name" | "email">;

export const timeEntrySelect = `
  *,
  profiles(id, full_name, email),
  jobs(id, service_type, status, customers:customers!jobs_customer_id_fkey(display_name), organizations(name)),
  schedule_events(id, title, event_type, starts_at, ends_at),
  time_entry_adjustments(*),
  time_entry_approvals(*)
`;

export type TimeEntryFilters = {
  from?: string;
  jobId?: string;
  status?: string;
  to?: string;
  userId?: string;
};

export async function getTimeClockUsers(): Promise<DataResult<TimeClockUserSummary[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const [profilesResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, user_roles(roles(name))")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("time_clock_permissions")
      .select("*"),
  ]);

  if (profilesResult.error || permissionsResult.error) {
    return {
      data: [],
      error: profilesResult.error?.message ?? permissionsResult.error?.message ?? "Unable to load time clock users.",
    };
  }

  const permissionsByUserId = new Map(
    ((permissionsResult.data ?? []) as TimeClockPermission[]).map((permission) => [permission.user_id, permission]),
  );
  const creatorIds = [...new Set(
    ((permissionsResult.data ?? []) as TimeClockPermission[])
      .map((permission) => permission.created_by_user_id)
      .filter(Boolean),
  )] as string[];
  const activeEntriesResult = await supabase
    .from("time_entries")
    .select("id, user_id, entry_type, clock_in_at, jobs(customers:customers!jobs_customer_id_fkey(display_name), organizations(name)), schedule_events(title)")
    .eq("status", "active")
    .is("clock_out_at", null);
  const creatorProfiles = creatorIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", creatorIds)
    : { data: [], error: null };

  if (creatorProfiles.error || activeEntriesResult.error) {
    return {
      data: [],
      error: creatorProfiles.error?.message ?? activeEntriesResult.error?.message ?? "Unable to load time clock users.",
    };
  }

  const creatorsById = new Map(
    ((creatorProfiles.data ?? []) as ProfileLabelRow[]).map((profile) => [
      profile.id,
      profile.full_name || profile.email || "Admin",
    ]),
  );
  const activeEntriesByUserId = new Map(
    ((activeEntriesResult.data ?? []) as {
      id: string;
      user_id: string;
      entry_type: TimeClockUserSummary["active_timer_entry_type"];
      clock_in_at: string;
      jobs?: { customers?: { display_name?: string | null } | null; organizations?: { name?: string | null } | null } | null;
      schedule_events?: { title?: string | null } | null;
    }[]).map((entry) => [
      entry.user_id,
      {
        id: entry.id,
        entryType: entry.entry_type,
        startedAt: entry.clock_in_at,
        workLabel: entry.jobs?.organizations?.name || entry.jobs?.customers?.display_name || entry.schedule_events?.title || null,
      },
    ]),
  );

  return {
    data: ((profilesResult.data ?? []) as UserRow[])
      .map((user) => {
        const roleNames = (user.user_roles ?? [])
          .flatMap((row) => row.roles ?? [])
          .map((role) => role.name);
        const permission = permissionsByUserId.get(user.id) ?? null;
        const activeEntry = activeEntriesByUserId.get(user.id);
        const eligible = roleNames.some((role) =>
          ["owner", "admin", "payroll_admin", "estimator", "crew"].includes(role),
        );

        return {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role_names: roleNames,
          is_time_clock_role_eligible: eligible,
          time_clock_permission: permission,
          time_clock_permission_changed_at: permission?.updated_at ?? permission?.created_at ?? null,
          time_clock_permission_set_by_label: permission?.created_by_user_id
            ? (creatorsById.get(permission.created_by_user_id) ?? "Unknown reviewer")
            : null,
          active_timer_entry_id: activeEntry?.id ?? null,
          active_timer_entry_type: activeEntry?.entryType ?? null,
          active_timer_started_at: activeEntry?.startedAt ?? null,
          active_timer_work_label: activeEntry?.workLabel ?? null,
        };
      })
      .filter((user) =>
        user.is_time_clock_role_eligible,
      ),
    error: null,
  };
}

export async function getTimeEntries(filters: TimeEntryFilters = {}): Promise<DataResult<TimeEntryWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  let query = supabase.from("time_entries").select(timeEntrySelect).order("clock_in_at", { ascending: false });

  if (filters.userId) {
    query = query.eq("user_id", filters.userId);
  }

  if (filters.jobId) {
    query = query.eq("job_id", filters.jobId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.from) {
    query = query.gte("clock_in_at", filters.from);
  }

  if (filters.to) {
    query = query.lte("clock_in_at", filters.to);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return { data: (data ?? []) as TimeEntryWithRelations[], error: null };
}

export async function getActiveTimeEntryForUser(userId: string): Promise<DataResult<TimeEntryWithRelations | null>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("time_entries")
    .select(timeEntrySelect)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("clock_out_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: safeStaffMessage(error.message) };
  }

  return { data: (data ?? null) as TimeEntryWithRelations | null, error: null };
}

export async function getAssignedScheduleEventsForUser(
  userId: string,
  roles: PlatformRoleName[],
): Promise<DataResult<ScheduleEventWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  let query = supabase
    .from("schedule_events")
    .select(
      "*, jobs(id, customer_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email))",
    )
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .order("starts_at", { ascending: true });

  if (!roles.some((role) => ["owner", "admin", "payroll_admin", "estimator"].includes(role))) {
    query = query.eq("schedule_event_assignments.user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return { data: (data ?? []) as ScheduleEventWithRelations[], error: null };
}

export async function getTimeClockOverview(filters: TimeEntryFilters = {}) {
  const [entries, users] = await Promise.all([
    getTimeEntries(filters),
    getTimeClockUsers(),
  ]);

  const activeEntries = entries.data.filter((entry) => entry.status === "active" && !entry.clock_out_at);
  const entriesNeedingReview = entries.data.filter(
    (entry) => entry.status !== "active" && getLatestTimeEntryReviewStatus(entry) !== "approved",
  );
  const totalHours = entries.data.reduce((sum, entry) => sum + getTimeEntryHours(entry), 0);
  const warnings = buildTimeEntryWarnings(entries.data);

  return {
    data: {
      activeEntries,
      entries: entries.data,
      entriesNeedingReview,
      totalHours,
      users: users.data,
      warnings,
    },
    error: [entries.error, users.error].filter(Boolean).join(" | ") || null,
  };
}

export async function getTimeClockUserDetail(userId: string, filters: TimeEntryFilters = {}) {
  const [entries, users] = await Promise.all([
    getTimeEntries({ ...filters, userId }),
    getTimeClockUsers(),
  ]);
  const user = users.data.find((entry) => entry.id === userId) ?? null;
  const activeEntry = entries.data.find((entry) => entry.status === "active" && !entry.clock_out_at) ?? null;
  const totalHours = entries.data.reduce((sum, entry) => sum + getTimeEntryHours(entry), 0);
  const warnings = buildTimeEntryWarnings(entries.data);

  return {
    data: {
      activeEntry,
      entries: entries.data,
      totalHours,
      user,
      warnings,
    },
    error: [entries.error, users.error].filter(Boolean).join(" | ") || null,
  };
}

export function getTimeEntryHours(entry: Pick<TimeEntryWithRelations, "clock_in_at" | "clock_out_at" | "break_minutes">) {
  if (!entry.clock_out_at) {
    return 0;
  }

  const started = new Date(entry.clock_in_at).getTime();
  const ended = new Date(entry.clock_out_at).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
    return 0;
  }

  const minutes = Math.max(0, Math.round((ended - started) / 60000) - entry.break_minutes);
  return minutes / 60;
}

export function getOpenTimeEntryHours(
  entry: Pick<TimeEntryWithRelations, "clock_in_at" | "clock_out_at" | "break_minutes">,
) {
  const started = new Date(entry.clock_in_at).getTime();
  const ended = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : Date.now();

  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
    return 0;
  }

  const minutes = Math.max(0, Math.round((ended - started) / 60000) - entry.break_minutes);
  return minutes / 60;
}

export function getLatestTimeEntryReview(entry: Pick<TimeEntryWithRelations, "time_entry_approvals">) {
  const approvals = (entry.time_entry_approvals ?? [])
    .slice()
    .sort((left, right) => new Date(right.approved_at).getTime() - new Date(left.approved_at).getTime());

  return (approvals[0] ?? null) as TimeEntryApproval | null;
}

export function getLatestTimeEntryReviewStatus(entry: Pick<TimeEntryWithRelations, "time_entry_approvals">) {
  return (getLatestTimeEntryReview(entry)?.approval_status ?? "pending") as TimeEntryReviewStatus | "pending";
}

export function buildTimeEntryWarnings(entries: TimeEntryWithRelations[]) {
  const warnings: PayrollWarning[] = [];
  const byUser = new Map<string, TimeEntryWithRelations[]>();

  entries.forEach((entry) => {
    const employeeLabel = entry.profiles?.full_name || entry.profiles?.email || "Employee";
    const startedAt = new Date(entry.clock_in_at).getTime();
    const endedAt = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : null;
    const rawElapsedMilliseconds = endedAt && Number.isFinite(startedAt) && Number.isFinite(endedAt)
      ? endedAt - startedAt
      : null;
    const hours = getTimeEntryHours(entry);
    const openHours = entry.clock_out_at ? hours : getOpenTimeEntryHours(entry);

    if (entry.status === "active" && !entry.clock_out_at) {
      warnings.push({
        id: `${entry.id}-missing_clock_out`,
        kind: "missing_clock_out",
        title: `${employeeLabel} still has an open timer`,
        detail: `Clocked in ${openHours.toFixed(2)} hours ago and has not clocked out yet.`,
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (entry.status === "active" && !entry.clock_out_at && openHours > 12) {
      warnings.push({
        id: `${entry.id}-active_previous_day`,
        kind: "active_previous_day",
        title: `${employeeLabel} has an active timer over 12 hours`,
        detail: `${openHours.toFixed(2)} hours have elapsed on one active timer.`,
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (entry.clock_out_at && hours > 12) {
      warnings.push({
        id: `${entry.id}-long_shift`,
        kind: "long_shift",
        title: `${employeeLabel} has a shift longer than 12 hours`,
        detail: `${hours.toFixed(2)} hours recorded on one completed entry.`,
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (entry.entry_type === "job" && !entry.job_id && !entry.schedule_event_id) {
      warnings.push({
        id: `${entry.id}-missing_linked_work`,
        kind: "missing_linked_work",
        title: `${employeeLabel} has job time without linked work`,
        detail: "Job time should point to a job or a scheduled event before review.",
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (
      entry.clock_out_at &&
      (!Number.isFinite(startedAt) ||
        endedAt === null ||
        !Number.isFinite(endedAt) ||
        endedAt <= startedAt ||
        hours <= 0)
    ) {
      warnings.push({
        id: `${entry.id}-invalid_duration`,
        kind: "invalid_duration",
        title: `${employeeLabel} has an invalid duration`,
        detail: "Clock-out must be after clock-in and produce a positive duration.",
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    if (entry.clock_out_at && rawElapsedMilliseconds !== null && rawElapsedMilliseconds > 0 && rawElapsedMilliseconds < 60_000) {
      warnings.push({
        id: `${entry.id}-short_duration`,
        kind: "short_duration",
        title: `${employeeLabel} has a very short entry`,
        detail: "This entry is under 1 minute. It may be valid, but it should be checked before review.",
        user_id: entry.user_id,
        time_entry_id: entry.id,
      });
    }

    const group = byUser.get(entry.user_id) ?? [];
    group.push(entry);
    byUser.set(entry.user_id, group);
  });

  byUser.forEach((userEntries) => {
    const ordered = userEntries
      .slice()
      .sort((left, right) => new Date(left.clock_in_at).getTime() - new Date(right.clock_in_at).getTime());

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousEnd = previous.clock_out_at ? new Date(previous.clock_out_at).getTime() : null;
      const currentStart = new Date(current.clock_in_at).getTime();

      if (previousEnd && previousEnd > currentStart) {
        const employeeLabel = current.profiles?.full_name || current.profiles?.email || "Employee";
        warnings.push({
          id: `${previous.id}-${current.id}-overlap`,
          kind: "overlap",
          title: `${employeeLabel} has overlapping entries`,
          detail: "Two time entries overlap and need cleanup before payroll review.",
          user_id: current.user_id,
          time_entry_id: current.id,
        });
      }
    }
  });

  return warnings;
}
