import { createClient } from "@/lib/supabase/server";
import type {
  AppointmentType,
  AppointmentWithRelations,
  AssignableUser,
  CalendarEntry,
  CrewDaySchedule,
  DataResult,
  ScheduleConflict,
  ScheduleDashboardSummary,
  ScheduleEventType,
  ScheduleEventWithRelations,
  ScheduleUser,
} from "@/lib/types/database";

type ScheduleAssignedFilter = string | "all" | "unassigned" | "crew";

type RoleNameRow = {
  roles: { name: string } | { name: string }[] | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_roles?: RoleNameRow[] | null;
};

export type ScheduleFilters = {
  assignedUserId?: ScheduleAssignedFilter;
  eventType?: AppointmentType | ScheduleEventType | "all";
  status?: string | "all";
  startsAtOrAfter?: string;
  startsBefore?: string;
};

export type ScheduleCalendarData = {
  appointments: AppointmentWithRelations[];
  conflicts: ScheduleConflict[];
  entries: CalendarEntry[];
  scheduleEvents: ScheduleEventWithRelations[];
  users: ScheduleUser[];
};

export type EstimateScheduleEventOption = {
  id: string;
  title: string;
  starts_at: string;
  service_location_id: string | null;
  customer_label: string | null;
  location_label: string | null;
};

const appointmentEventTypes = new Set<AppointmentType>(["estimate", "job", "follow_up", "maintenance", "other"]);

export async function getScheduleUsers(): Promise<DataResult<ScheduleUser[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, user_roles(roles(name))")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: mapScheduleUsers((data ?? []) as UserRow[]),
    error: null,
  };
}

export async function getEstimateScheduleEventOptions(): Promise<DataResult<EstimateScheduleEventOption[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("schedule_events")
    .select(
      "id, title, starts_at, service_location_id, location_label, jobs(customers:customers!jobs_customer_id_fkey(display_name), organizations(name)), service_locations(label, street, city, state)",
    )
    .eq("event_type", "estimate")
    .order("starts_at", { ascending: false })
    .limit(50);

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as {
      id: string;
      title: string;
      starts_at: string;
      service_location_id: string | null;
      location_label: string | null;
      jobs?: { customers?: { display_name?: string | null } | null; organizations?: { name?: string | null } | null } | null;
      service_locations?: { label?: string | null; street?: string | null; city?: string | null; state?: string | null } | null;
    }[]).map((event) => ({
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      service_location_id: event.service_location_id,
      customer_label: event.jobs?.organizations?.name ?? event.jobs?.customers?.display_name ?? null,
      location_label:
        event.location_label ||
        event.service_locations?.label ||
        formatLocation(event.service_locations?.street, event.service_locations?.city, event.service_locations?.state),
    })),
    error: null,
  };
}

export async function getScheduleCalendarData(filters: ScheduleFilters = {}): Promise<DataResult<ScheduleCalendarData>> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      data: { appointments: [], conflicts: [], entries: [], scheduleEvents: [], users: [] },
      error: "Supabase is not configured.",
    };
  }

  const usersResult = await getScheduleUsers();
  const users = usersResult.data;
  const crewUserIds = new Set(
    users.filter((user) => user.role_names.includes("crew")).map((user) => user.id),
  );

  let appointmentsQuery = supabase
    .from("appointments")
    .select(
      "*, jobs(id, customer_id, organization_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), profiles(id, full_name, email)",
    )
    .order("starts_at", { ascending: true });

  if (filters.eventType && filters.eventType !== "all") {
    if (appointmentEventTypes.has(filters.eventType as AppointmentType)) {
      appointmentsQuery = appointmentsQuery.eq("appointment_type", filters.eventType);
    } else {
      appointmentsQuery = appointmentsQuery.eq("appointment_type", "___none___");
    }
  }

  if (filters.status && filters.status !== "all") {
    appointmentsQuery = appointmentsQuery.eq("status", filters.status);
  }

  if (filters.assignedUserId === "unassigned") {
    appointmentsQuery = appointmentsQuery.is("assigned_user_id", null);
  } else if (
    filters.assignedUserId &&
    filters.assignedUserId !== "all" &&
    filters.assignedUserId !== "crew"
  ) {
    appointmentsQuery = appointmentsQuery.eq("assigned_user_id", filters.assignedUserId);
  }

  if (filters.startsAtOrAfter) {
    appointmentsQuery = appointmentsQuery.gte("starts_at", filters.startsAtOrAfter);
  }

  if (filters.startsBefore) {
    appointmentsQuery = appointmentsQuery.lt("starts_at", filters.startsBefore);
  }

  let eventsQuery = supabase
    .from("schedule_events")
    .select(
      "*, jobs(id, customer_id, organization_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email)), equipment_assignments(*, equipment_assets(id, asset_number, name, status, category))",
    )
    .order("starts_at", { ascending: true });

  if (filters.eventType && filters.eventType !== "all") {
    eventsQuery = eventsQuery.eq("event_type", filters.eventType);
  }

  if (filters.status && filters.status !== "all") {
    eventsQuery = eventsQuery.eq("status", filters.status);
  }

  if (filters.startsAtOrAfter) {
    eventsQuery = eventsQuery.gte("starts_at", filters.startsAtOrAfter);
  }

  if (filters.startsBefore) {
    eventsQuery = eventsQuery.lt("starts_at", filters.startsBefore);
  }

  const [appointmentsResult, eventsResult] = await Promise.all([appointmentsQuery, eventsQuery]);

  const migratedAppointmentIds = new Set(
    ((eventsResult.data ?? []) as ScheduleEventWithRelations[])
      .map((event) => event.source_appointment_id)
      .filter((id): id is string => Boolean(id)),
  );
  const appointmentData = ((appointmentsResult.data ?? []) as AppointmentWithRelations[]).filter((appointment) => {
    if (appointment.appointment_type === "job" && migratedAppointmentIds.has(appointment.id)) return false;
    if (filters.assignedUserId !== "crew") {
      return true;
    }

    return appointment.assigned_user_id ? crewUserIds.has(appointment.assigned_user_id) : false;
  });

  const scheduleEvents = ((eventsResult.data ?? []) as ScheduleEventWithRelations[]).filter((event) => {
    const assignedUserIds = (event.schedule_event_assignments ?? []).map((assignment) => assignment.user_id);

    if (filters.assignedUserId === "unassigned") {
      return assignedUserIds.length === 0;
    }

    if (!filters.assignedUserId || filters.assignedUserId === "all") {
      return true;
    }

    if (filters.assignedUserId === "crew") {
      return assignedUserIds.some((userId) => crewUserIds.has(userId));
    }

    return assignedUserIds.includes(filters.assignedUserId);
  });

  const entries = addWorkdaySequence([...scheduleEvents.map(toScheduleEventEntry), ...appointmentData.map(toAppointmentEntry)]
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()));
  const conflicts = detectScheduleConflicts(entries, users);

  const error = [
    usersResult.error,
    appointmentsResult.error?.message ?? null,
    eventsResult.error?.message ?? null,
  ].filter(Boolean).join(" | ") || null;

  return {
    data: {
      appointments: appointmentData,
      conflicts,
      entries,
      scheduleEvents,
      users,
    },
    error,
  };
}

function toScheduleEventEntry(event: ScheduleEventWithRelations): CalendarEntry {
  const assignees = (event.schedule_event_assignments ?? [])
    .map((assignment) => assignment.profiles)
    .filter(Boolean) as AssignableUser[];
  const locationLabel =
    event.location_label ||
    formatLocation(event.service_locations?.street, event.service_locations?.city, event.service_locations?.state);

  return {
    id: event.id,
    source: "schedule_event",
    title: event.title,
    subtitle: event.description || event.jobs?.requested_scope || event.calendar_notes || "Calendar event",
    event_type: event.event_type,
    status: event.status,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    all_day: event.all_day,
    location_label: locationLabel,
    calendar_notes: event.calendar_notes,
    job_id: event.job_id,
    service_location_id: event.service_location_id,
    assignees,
    customer_label: event.jobs?.organizations?.name ?? event.jobs?.customers?.display_name ?? null,
  };
}

function toAppointmentEntry(appointment: AppointmentWithRelations): CalendarEntry {
  const assignees = appointment.profiles ? [appointment.profiles] : [];

  return {
    id: appointment.id,
    source: "appointment",
    title: getAppointmentTitle(appointment),
    subtitle: appointment.jobs?.requested_scope || appointment.calendar_notes || "Legacy appointment",
    event_type: appointment.appointment_type,
    status: appointment.status,
    starts_at: appointment.starts_at,
    ends_at: appointment.ends_at,
    all_day: false,
    location_label: formatLocation(
      appointment.service_locations?.street,
      appointment.service_locations?.city,
      appointment.service_locations?.state,
    ),
    calendar_notes: appointment.calendar_notes,
    job_id: appointment.job_id,
    service_location_id: appointment.service_location_id,
    assignees,
    customer_label: appointment.jobs?.organizations?.name ?? appointment.jobs?.customers?.display_name ?? null,
  };
}

function addWorkdaySequence(entries: CalendarEntry[]) {
  const byJob = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    if (!entry.job_id || entry.event_type !== "job") continue;
    const group = byJob.get(entry.job_id) ?? [];
    group.push(entry);
    byJob.set(entry.job_id, group);
  }
  for (const group of byJob.values()) {
    group.sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
    group.forEach((entry, index) => {
      entry.workday_number = index + 1;
      entry.workday_count = group.length;
    });
  }
  return entries;
}

function getAppointmentTitle(appointment: AppointmentWithRelations) {
  if (appointment.jobs?.service_type) {
    return appointment.jobs.service_type.replaceAll("_", " ");
  }

  if (appointment.appointment_type === "follow_up") {
    return "Follow-up";
  }

  return "Legacy appointment";
}

function formatLocation(street?: string | null, city?: string | null, state?: string | null) {
  const label = [street, city, state].filter(Boolean).join(", ");
  return label || null;
}

export async function getScheduleDashboardSummary(): Promise<DataResult<ScheduleDashboardSummary>> {
  const supabase = await createClient();

  if (!supabase) {
    return {
      data: {
        conflicts: [],
        todaysCrewSchedules: [],
        unassignedEntries: [],
        upcomingEstimates: [],
      },
      error: "Supabase is not configured.",
    };
  }

  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const upcomingEnd = new Date(start);
  upcomingEnd.setDate(upcomingEnd.getDate() + 7);

  const [usersResult, todayAppointments, todayEvents, upcomingEstimateAppointments, upcomingEstimateEvents] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, user_roles(roles(name))")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("appointments")
      .select(
        "*, jobs(id, customer_id, organization_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), profiles(id, full_name, email)",
      )
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("schedule_events")
      .select(
        "*, jobs(id, customer_id, organization_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email)), equipment_assignments(*, equipment_assets(id, asset_number, name, status, category))",
      )
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("appointments")
      .select(
        "*, jobs(id, customer_id, organization_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), profiles(id, full_name, email)",
      )
      .eq("appointment_type", "estimate")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", upcomingEnd.toISOString())
      .order("starts_at", { ascending: true })
      .limit(8),
    supabase
      .from("schedule_events")
      .select(
        "*, jobs(id, customer_id, organization_id, status, service_type, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email)), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email)), equipment_assignments(*, equipment_assets(id, asset_number, name, status, category))",
      )
      .eq("event_type", "estimate")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", upcomingEnd.toISOString())
      .order("starts_at", { ascending: true })
      .limit(8),
  ]);

  const users = mapScheduleUsers((usersResult.data ?? []) as UserRow[]);
  const todayScheduleEvents = (todayEvents.data ?? []) as ScheduleEventWithRelations[];
  const migratedTodayAppointmentIds = new Set(
    todayScheduleEvents
      .map((event) => event.source_appointment_id)
      .filter((id): id is string => Boolean(id)),
  );
  const todaysEntries = [
    ...todayScheduleEvents.map(toScheduleEventEntry),
    ...((todayAppointments.data ?? []) as AppointmentWithRelations[])
      .filter((appointment) => !(
        appointment.appointment_type === "job"
        && migratedTodayAppointmentIds.has(appointment.id)
      ))
      .map(toAppointmentEntry),
  ];
  const sequencedTodayEntries = addWorkdaySequence(todaysEntries
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()));
  const upcomingEstimates = [
    ...((upcomingEstimateEvents.data ?? []) as ScheduleEventWithRelations[]).map(toScheduleEventEntry),
    ...((upcomingEstimateAppointments.data ?? []) as AppointmentWithRelations[]).map(toAppointmentEntry),
  ]
    .filter((entry) => entry.event_type === "estimate")
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    .slice(0, 8);
  const error = [
    usersResult.error?.message ?? null,
    todayAppointments.error?.message ?? null,
    todayEvents.error?.message ?? null,
    upcomingEstimateAppointments.error?.message ?? null,
    upcomingEstimateEvents.error?.message ?? null,
  ].filter(Boolean).join(" | ") || null;
  const todaysCrewSchedules = buildCrewDaySchedules(sequencedTodayEntries, users);
  const unassignedEntries = sequencedTodayEntries.filter((entry) => {
    return isCrewWorkEntry(entry) && entry.assignees.length === 0;
  });

  return {
    data: {
      conflicts: detectScheduleConflicts(sequencedTodayEntries, users),
      todaysCrewSchedules,
      unassignedEntries,
      upcomingEstimates,
    },
    error,
  };
}

function mapScheduleUsers(data: UserRow[]) {
  return data.map((user) => ({
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role_names: (user.user_roles ?? [])
      .flatMap((row) => row.roles ?? [])
      .map((role) => role.name),
  }));
}

function detectScheduleConflicts(entries: CalendarEntry[], users: ScheduleUser[]) {
  const conflicts: ScheduleConflict[] = [];
  const actionableEntries = entries.filter((entry) => !isClosedScheduleEntry(entry));

  actionableEntries.forEach((entry) => {
    if (!entry.ends_at && !entry.all_day) {
      conflicts.push({
        id: `missing-end-${entry.source}-${entry.id}`,
        kind: "missing_end_time",
        title: `${entry.title} needs an end time`,
        detail: "This event is missing an end time, so availability and overlap checks stay fuzzy.",
        href: buildEntryHref(entry),
      });
    }

    if (requiresAssignedEmployee(entry) && entry.assignees.length === 0) {
      conflicts.push({
        id: `unassigned-${entry.source}-${entry.id}`,
        kind: "unassigned_job",
        title: `${entry.title} has no assigned employee`,
        detail: `${entry.location_label || "No location yet"} still needs someone assigned before the day is locked in.`,
        href: buildEntryHref(entry),
      });
    }

    if (entry.event_type === "job" && !entry.job_id) {
      conflicts.push({
        id: `missing-job-${entry.source}-${entry.id}`,
        kind: "missing_linked_job",
        title: `${entry.title} is missing its linked job`,
        detail: "This calendar event should point back to a job record before it is dispatched.",
        href: buildEntryHref(entry),
      });
    }
  });

  users.forEach((user) => {
    const assignedEntries = actionableEntries
      .filter((entry) => entry.assignees.some((assignee) => assignee.id === user.id))
      .filter((entry) => Boolean(entry.ends_at) || entry.all_day)
      .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());

    for (let index = 0; index < assignedEntries.length - 1; index += 1) {
      const current = assignedEntries[index];
      const currentEnd = resolveEntryEnd(current)?.getTime();

      if (!currentEnd) {
        continue;
      }

      for (let nextIndex = index + 1; nextIndex < assignedEntries.length; nextIndex += 1) {
        const next = assignedEntries[nextIndex];
        const nextStart = new Date(next.starts_at).getTime();

        if (nextStart >= currentEnd) {
          break;
        }

        if (entriesOverlap(current, next)) {
          conflicts.push({
            id: `overlap-${user.id}-${current.id}-${next.id}`,
            kind: "overlap",
            title: `${user.full_name || user.email || "Team member"} is double-booked`,
            detail: `${current.title} overlaps with ${next.title}.`,
            href: buildEntryHref(next),
            user_label: user.full_name || user.email || "Team member",
          });
        }
      }
    }
  });

  return dedupeConflicts(conflicts);
}

function buildCrewDaySchedules(entries: CalendarEntry[], users: ScheduleUser[]): CrewDaySchedule[] {
  return users
    .filter((user) => user.role_names.includes("crew"))
    .map((user) => ({
      user,
      entries: entries
        .filter((entry) => entry.assignees.some((assignee) => assignee.id === user.id))
        .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()),
    }))
    .filter((group) => group.entries.length > 0);
}

function entriesOverlap(left: CalendarEntry, right: CalendarEntry) {
  const leftStart = new Date(left.starts_at).getTime();
  const leftEnd = resolveEntryEnd(left)?.getTime();
  const rightStart = new Date(right.starts_at).getTime();
  const rightEnd = resolveEntryEnd(right)?.getTime();

  if (!leftEnd || !rightEnd) {
    return false;
  }

  return leftStart < rightEnd && rightStart < leftEnd;
}

function resolveEntryEnd(entry: CalendarEntry) {
  if (entry.ends_at) {
    return new Date(entry.ends_at);
  }

  if (entry.all_day) {
    const end = new Date(entry.starts_at);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    return end;
  }

  return null;
}

function isCrewWorkEntry(entry: CalendarEntry) {
  return entry.event_type === "job" || entry.event_type === "emergency";
}

function requiresAssignedEmployee(entry: CalendarEntry) {
  return (
    entry.event_type === "estimate" ||
    entry.event_type === "job" ||
    entry.event_type === "follow_up" ||
    entry.event_type === "maintenance" ||
    entry.event_type === "emergency"
  );
}

function isClosedScheduleEntry(entry: CalendarEntry) {
  return entry.status === "completed" || entry.status === "cancelled";
}

function buildEntryHref(entry: CalendarEntry) {
  return entry.source === "schedule_event"
    ? `/admin/schedule?event=${entry.id}`
    : `/admin/schedule?appointment=${entry.id}`;
}

function dedupeConflicts(conflicts: ScheduleConflict[]) {
  const seen = new Set<string>();

  return conflicts.filter((conflict) => {
    if (seen.has(conflict.id)) {
      return false;
    }

    seen.add(conflict.id);
    return true;
  });
}
