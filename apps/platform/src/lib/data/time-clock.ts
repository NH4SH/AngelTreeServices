import { createClient } from "@/lib/supabase/server";
import type { PlatformRoleName } from "@/lib/auth/roles";
import type {
  DataResult,
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

type PermissionRow = TimeClockPermission | TimeClockPermission[] | null | undefined;

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_roles?: RoleNameRow[] | null;
  time_clock_permissions?: PermissionRow;
};

export const timeEntrySelect = `
  *,
  profiles(id, full_name, email),
  jobs(id, service_type, status, customers(display_name)),
  schedule_events(id, title, event_type, starts_at, ends_at),
  time_entry_adjustments(*),
  time_entry_approvals(*)
`;

export type TimeEntryFilters = {
  from?: string;
  jobId?: string;
  to?: string;
  userId?: string;
};

export async function getTimeClockUsers(): Promise<DataResult<TimeClockUserSummary[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, user_roles(roles(name)), time_clock_permissions(*)")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as UserRow[]).map((user) => ({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role_names: (user.user_roles ?? [])
        .flatMap((row) => row.roles ?? [])
        .map((role) => role.name),
      time_clock_permission: normalizePermission(user.time_clock_permissions),
    })),
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

  if (filters.from) {
    query = query.gte("clock_in_at", filters.from);
  }

  if (filters.to) {
    query = query.lte("clock_in_at", filters.to);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
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
    return { data: null, error: error.message };
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
      "*, jobs(id, customer_id, status, service_type, requested_scope, customers(id, display_name, phone, email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email))",
    )
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .order("starts_at", { ascending: true });

  if (!roles.some((role) => ["owner", "admin", "payroll_admin", "estimator"].includes(role))) {
    query = query.eq("schedule_event_assignments.user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
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

  return {
    data: {
      activeEntries,
      entries: entries.data,
      entriesNeedingReview,
      totalHours,
      users: users.data,
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

  return {
    data: {
      activeEntry,
      entries: entries.data,
      totalHours,
      user,
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

export function getLatestTimeEntryReview(entry: Pick<TimeEntryWithRelations, "time_entry_approvals">) {
  const approvals = (entry.time_entry_approvals ?? [])
    .slice()
    .sort((left, right) => new Date(right.approved_at).getTime() - new Date(left.approved_at).getTime());

  return (approvals[0] ?? null) as TimeEntryApproval | null;
}

export function getLatestTimeEntryReviewStatus(entry: Pick<TimeEntryWithRelations, "time_entry_approvals">) {
  return (getLatestTimeEntryReview(entry)?.approval_status ?? "pending") as TimeEntryReviewStatus | "pending";
}

function normalizePermission(permission: PermissionRow) {
  if (Array.isArray(permission)) {
    return (permission[0] ?? null) as TimeClockPermission | null;
  }

  return (permission ?? null) as TimeClockPermission | null;
}
