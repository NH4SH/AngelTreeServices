import type {
  AppointmentWithRelations,
  CalendarEntry,
  ScheduleEventWithRelations,
} from "@/lib/types/database";
import type { ScheduleCalendarData } from "@/lib/data/schedule";

export const mobileApiVersion = "2026-08-12";
export const mobileScheduleScopes = ["mine", "team"] as const;

export type MobileScheduleScope = (typeof mobileScheduleScopes)[number];

export type MobileEmployeeIdentity = {
  authUserId: string;
  employeeId: string | null;
};

export type MobileScheduleParty = {
  id: string | null;
  kind: "customer" | "organization";
  name: string;
  email: string | null;
  phone: string | null;
};

export type MobileScheduleItem = {
  id: string;
  source: "appointment" | "schedule_event";
  title: string;
  eventType: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  jobId: string | null;
  serviceLocationId: string | null;
  party: MobileScheduleParty | null;
  location: {
    label: string | null;
    fullAddress: string | null;
    accessNotes: string | null;
    serviceNotes: string | null;
  } | null;
  assignees: {
    id: string;
    authUserId: string | null;
    name: string;
  }[];
  customerFacingScope: string | null;
  teamNotes: string | null;
  equipment: string[];
  materials: string[];
  workdayNumber: number | null;
  workdayCount: number | null;
};

export type MobileSchedulePayload = {
  generatedAt: string;
  range: {
    startDate: string;
    endDate: string;
  };
  scope: MobileScheduleScope;
  items: MobileScheduleItem[];
};

export function buildMobileSchedulePayload({
  data,
  endDate,
  identity,
  now = new Date(),
  scope,
  startDate,
}: {
  data: ScheduleCalendarData;
  endDate: string;
  identity: MobileEmployeeIdentity;
  now?: Date;
  scope: MobileScheduleScope;
  startDate: string;
}): MobileSchedulePayload {
  const scheduleEvents = new Map(data.scheduleEvents.map((event) => [event.id, event]));
  const appointments = new Map(data.appointments.map((appointment) => [appointment.id, appointment]));

  const items = data.entries
    .filter(isActiveMobileWorkSession)
    .filter((entry) => scope === "team" || isAssignedToIdentity(entry, identity))
    .map((entry) => entry.source === "schedule_event"
      ? mapScheduleEvent(entry, scheduleEvents.get(entry.id))
      : mapAppointment(entry, appointments.get(entry.id)))
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

  return {
    generatedAt: now.toISOString(),
    range: { startDate, endDate },
    scope,
    items,
  };
}

export function isAssignedToIdentity(
  entry: CalendarEntry,
  identity: MobileEmployeeIdentity,
) {
  return entry.assignees.some((assignee) => (
    (identity.employeeId && assignee.id === identity.employeeId)
    || assignee.auth_user_id === identity.authUserId
    || assignee.id === identity.authUserId
  ));
}

export function isActiveMobileWorkSession(entry: CalendarEntry) {
  return !(entry.event_type === "job" && entry.status === "cancelled");
}

function mapScheduleEvent(
  entry: CalendarEntry,
  event: ScheduleEventWithRelations | undefined,
): MobileScheduleItem {
  const party = event ? resolveScheduleEventParty(event) : fallbackParty(entry);
  const location = event?.service_locations;

  return {
    ...mapEntryBase(entry),
    party,
    location: buildLocation({
      accessNotes: location?.access_notes ?? entry.access_instructions ?? null,
      fullAddress: entry.full_address ?? null,
      label: location?.label ?? entry.location_label ?? null,
      serviceNotes: location?.service_notes ?? null,
    }),
    customerFacingScope: cleanText(event?.description ?? event?.jobs?.requested_scope ?? entry.subtitle),
    teamNotes: cleanText(event?.calendar_notes ?? entry.calendar_notes),
  };
}

function mapAppointment(
  entry: CalendarEntry,
  appointment: AppointmentWithRelations | undefined,
): MobileScheduleItem {
  const location = appointment?.service_locations;

  return {
    ...mapEntryBase(entry),
    party: appointment ? resolveAppointmentParty(appointment) : fallbackParty(entry),
    location: buildLocation({
      accessNotes: location?.access_notes ?? entry.access_instructions ?? null,
      fullAddress: entry.full_address ?? null,
      label: location?.label ?? entry.location_label ?? null,
      serviceNotes: location?.service_notes ?? null,
    }),
    customerFacingScope: cleanText(appointment?.jobs?.requested_scope ?? entry.subtitle),
    teamNotes: cleanText(appointment?.calendar_notes ?? entry.calendar_notes),
  };
}

function mapEntryBase(entry: CalendarEntry) {
  return {
    id: entry.id,
    source: entry.source,
    title: entry.title,
    eventType: entry.event_type,
    status: entry.status,
    startsAt: entry.starts_at,
    endsAt: entry.ends_at,
    allDay: entry.all_day,
    jobId: entry.job_id,
    serviceLocationId: entry.service_location_id,
    assignees: entry.assignees.map((assignee) => ({
      id: assignee.id,
      authUserId: assignee.auth_user_id ?? null,
      name: assignee.full_name || assignee.email || "Assigned employee",
    })),
    equipment: entry.equipment_details ?? [],
    materials: entry.material_details ?? [],
    workdayNumber: entry.workday_number ?? null,
    workdayCount: entry.workday_count ?? null,
  };
}

function resolveScheduleEventParty(event: ScheduleEventWithRelations): MobileScheduleParty | null {
  const organization = event.jobs?.organizations ?? event.source_organization;
  if (organization) {
    return {
      id: event.jobs?.organization_id ?? event.source_organization_id,
      kind: "organization",
      name: organization.name,
      email: event.source_contact?.email ?? organization.billing_email,
      phone: event.source_contact?.phone ?? organization.billing_phone,
    };
  }

  const customer = event.jobs?.customers ?? event.source_customer;
  if (!customer) return null;

  return {
    id: event.jobs?.customer_id ?? event.source_customer_id,
    kind: "customer",
    name: customer.display_name,
    email: customer.email,
    phone: customer.phone,
  };
}

function resolveAppointmentParty(appointment: AppointmentWithRelations): MobileScheduleParty | null {
  const organization = appointment.jobs?.organizations;
  if (organization) {
    return {
      id: appointment.jobs?.organization_id ?? null,
      kind: "organization",
      name: organization.name,
      email: organization.billing_email,
      phone: organization.billing_phone,
    };
  }

  const customer = appointment.jobs?.customers;
  if (!customer) return null;

  return {
    id: appointment.jobs?.customer_id ?? null,
    kind: "customer",
    name: customer.display_name,
    email: customer.email,
    phone: customer.phone,
  };
}

function fallbackParty(entry: CalendarEntry): MobileScheduleParty | null {
  if (!entry.customer_label) return null;
  return {
    id: null,
    kind: "customer",
    name: entry.customer_label,
    email: null,
    phone: entry.primary_phone ?? null,
  };
}

function buildLocation({
  accessNotes,
  fullAddress,
  label,
  serviceNotes,
}: {
  accessNotes: string | null;
  fullAddress: string | null;
  label: string | null;
  serviceNotes: string | null;
}) {
  if (![accessNotes, fullAddress, label, serviceNotes].some(cleanText)) return null;
  return {
    accessNotes: cleanText(accessNotes),
    fullAddress: cleanText(fullAddress),
    label: cleanText(label),
    serviceNotes: cleanText(serviceNotes),
  };
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}
