import type { JobStatus } from "@/lib/types/database";

export type LeadEstimatePrefill = {
  accessNotes: string;
  assignedUserId: string;
  calendarNotes: string;
  city: string;
  contactName: string;
  email: string;
  eventId: string | null;
  eventTitle: string;
  existingStartsAt: string;
  internalNotes: string;
  leadJobId: string;
  leadSource: string;
  organizationName: string;
  partyType: "customer" | "organization";
  phone: string;
  postalCode: string;
  preferredContactMethod: string;
  preferredTiming: string;
  requestedScope: string;
  serviceNotes: string;
  serviceType: string;
  state: string;
  status: JobStatus;
  street: string;
  submittedAt: string;
};

export type LeadEstimateSourceRecord = {
  id: string;
  status: JobStatus;
  service_type: string | null;
  requested_scope: string | null;
  internal_notes: string | null;
  preferred_contact_method: string | null;
  preferred_appointment_timing: string | null;
  source_detail: string | null;
  submitted_at: string;
  customers?: {
    display_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  organizations?: {
    name: string;
    billing_email: string | null;
    billing_phone: string | null;
  } | null;
  onsite_contact?: {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  property_contact?: {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  service_locations?: {
    street: string;
    city: string;
    state: string;
    postal_code: string | null;
    access_notes: string | null;
    service_notes: string | null;
  } | null;
  lead_sources?: { name: string } | null;
  lead_estimate?: {
    id: string;
    title: string;
    starts_at: string;
    calendar_notes: string | null;
    schedule_event_assignments?: { user_id: string }[];
  }[] | null;
};

export function buildLeadEstimatePrefill(record: LeadEstimateSourceRecord): LeadEstimatePrefill {
  const customer = record.customers ?? null;
  const organization = record.organizations ?? null;
  const organizationContact = record.onsite_contact ?? record.property_contact ?? null;
  const event = record.lead_estimate?.[0] ?? null;
  const contactName = customer?.display_name
    || organizationContact?.full_name
    || organization?.name
    || "Website lead";
  const phone = customer?.phone
    || organizationContact?.phone
    || organization?.billing_phone
    || "";
  const email = customer?.email
    || organizationContact?.email
    || organization?.billing_email
    || "";
  const location = record.service_locations;

  return {
    accessNotes: location?.access_notes ?? "",
    assignedUserId: event?.schedule_event_assignments?.[0]?.user_id ?? "",
    calendarNotes: event?.calendar_notes ?? buildCalendarNotes({
      accessNotes: location?.access_notes,
      preferredTiming: record.preferred_appointment_timing,
      serviceNotes: location?.service_notes,
    }),
    city: location?.city ?? "",
    contactName,
    email,
    eventId: event?.id ?? null,
    eventTitle: event?.title ?? `Estimate - ${organization?.name || contactName}`,
    existingStartsAt: event?.starts_at ?? "",
    internalNotes: record.internal_notes ?? "",
    leadJobId: record.id,
    leadSource: record.lead_sources?.name || record.source_detail || "Website",
    organizationName: organization?.name ?? "",
    partyType: organization ? "organization" : "customer",
    phone,
    postalCode: location?.postal_code ?? "",
    preferredContactMethod: record.preferred_contact_method ?? "",
    preferredTiming: record.preferred_appointment_timing ?? "",
    requestedScope: record.requested_scope ?? "",
    serviceNotes: location?.service_notes ?? "",
    serviceType: record.service_type ?? "other",
    state: location?.state ?? "VA",
    status: record.status,
    street: location?.street ?? "",
    submittedAt: record.submitted_at,
  };
}

export function defaultEstimateStart(existingStartsAt: string, drawerDefault: string) {
  return existingStartsAt ? toLocalDateTime(existingStartsAt) : drawerDefault;
}

export function isLeadEstimateSchedulable(status: JobStatus) {
  return status === "new_lead" || status === "estimate_scheduled";
}

function buildCalendarNotes({
  accessNotes,
  preferredTiming,
  serviceNotes,
}: {
  accessNotes?: string | null;
  preferredTiming?: string | null;
  serviceNotes?: string | null;
}) {
  return [
    preferredTiming ? `Customer preferred timing: ${preferredTiming}` : "",
    accessNotes ? `Access: ${accessNotes}` : "",
    serviceNotes ? `Property notes: ${serviceNotes}` : "",
  ].filter(Boolean).join("\n");
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
