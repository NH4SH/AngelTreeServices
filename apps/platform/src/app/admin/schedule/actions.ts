"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEmployeeEligibilityWarnings } from "@/lib/data/employees";
import { cancelPendingCommunications, syncAutomatedCommunications } from "@/lib/communications/queue";
import { safeStaffMessage } from "@/lib/security/errors";
import type {
  AppointmentStatus,
  AppointmentType,
  JobStatus,
  ScheduleEventStatus,
  ScheduleEventType,
} from "@/lib/types/database";

export type AppointmentActionState = {
  status: "idle" | "success" | "error" | "warning";
  message: string;
  jobId?: string;
};

const appointmentTypes: AppointmentType[] = ["estimate", "job", "follow_up", "maintenance"];
const scheduleEventTypes: ScheduleEventType[] = [
  "estimate",
  "job",
  "follow_up",
  "maintenance",
  "pto",
  "unavailable",
  "internal",
  "emergency",
  "other",
];
const scheduleStatuses: ScheduleEventStatus[] = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

export async function createScheduleCustomerJob(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in before creating a scheduled job." };
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { status: "error", message: "Only authorized office staff can create scheduled jobs." };
  }

  let customerId = getOptionalString(formData, "customer_id");
  let serviceLocationId = getOptionalString(formData, "service_location_id");
  let createdCustomerId: string | null = null;
  const newCustomerName = getOptionalString(formData, "new_customer_name");

  if (newCustomerName) {
    const phone = getOptionalString(formData, "new_customer_phone");
    const email = getOptionalString(formData, "new_customer_email")?.toLowerCase() ?? null;
    const street = getOptionalString(formData, "new_customer_street");
    const city = getOptionalString(formData, "new_customer_city");
    const state = (getOptionalString(formData, "new_customer_state") ?? "VA").toUpperCase();
    const postalCode = getOptionalString(formData, "new_customer_postal_code");
    if ((!phone && !email) || !street || !city || state.length !== 2) {
      return { status: "error", message: "Enter a phone or email and a complete service address for the new customer." };
    }

    const duplicateResults = await Promise.all([
      email ? supabase.from("customers").select("id, display_name").ilike("email", email).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      phone ? supabase.from("customers").select("id, display_name").eq("phone", phone).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const duplicate = duplicateResults.find((result) => result.data)?.data as { id: string; display_name: string } | null | undefined;
    if (duplicate) return { status: "error", message: `${duplicate.display_name} already uses that contact information. Select the existing customer instead.` };

    const { data: customer, error: customerError } = await supabase.from("customers").insert({
      display_name: newCustomerName,
      phone,
      email,
      billing_address: [street, city, state, postalCode].filter(Boolean).join(", "),
      customer_type: "residential",
      status: "active",
    }).select("id").single();
    if (customerError || !customer) return { status: "error", message: customerError?.message ?? "Could not create the customer." };
    createdCustomerId = customer.id;
    customerId = customer.id;

    const { data: location, error: locationError } = await supabase.from("service_locations").insert({
      customer_id: customer.id,
      organization_id: null,
      label: "Primary service location",
      street,
      city,
      state,
      postal_code: postalCode,
    }).select("id").single();
    if (locationError || !location) {
      await supabase.from("customers").delete().eq("id", customer.id);
      return { status: "error", message: locationError?.message ?? "Could not create the service location." };
    }
    serviceLocationId = location.id;
  }

  if (!customerId || !serviceLocationId) return { status: "error", message: "Choose a customer and one of their properties." };
  const { data: location, error: locationError } = await supabase.from("service_locations").select("id, customer_id, organization_id").eq("id", serviceLocationId).single();
  if (locationError || !location || location.customer_id !== customerId || location.organization_id) {
    if (createdCustomerId) await supabase.from("customers").delete().eq("id", createdCustomerId);
    return { status: "error", message: "Choose a property belonging to the selected customer." };
  }

  const requestedScope = getOptionalString(formData, "requested_scope");
  const serviceType = getOptionalString(formData, "service_type") ?? "other";
  if (!requestedScope) return { status: "error", message: "Describe the work before continuing to scheduling." };
  const { data: job, error: jobError } = await supabase.from("jobs").insert({
    customer_id: customerId,
    organization_id: null,
    service_location_id: serviceLocationId,
    service_type: serviceType,
    requested_scope: requestedScope,
    status: "accepted",
    priority: "normal",
  }).select("id").single();
  if (jobError || !job) {
    if (createdCustomerId) await supabase.from("customers").delete().eq("id", createdCustomerId);
    return { status: "error", message: jobError?.message ?? "Could not create the work order." };
  }

  await recordActivity(supabase, { actorUserId: user.id, eventType: "work_order_created_from_schedule", subjectId: job.id, subjectType: "job" });
  revalidateSchedulePaths(job.id);
  if (customerId) revalidatePath(`/admin/customers/${customerId}`);
  return { status: "success", message: "Job created. Loading the scheduler...", jobId: job.id };
}

export async function createAppointment(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const jobId = String(formData.get("job_id") ?? "");
  const appointmentType = String(formData.get("appointment_type") ?? "estimate") as AppointmentType;
  const startsAt = parseDateTime(formData.get("starts_at"));
  const endsAt = parseDateTime(formData.get("ends_at"), true);
  const assignedUserId = getOptionalString(formData, "assigned_user_id");
  const calendarNotes = String(formData.get("calendar_notes") ?? "").trim().slice(0, 1000) || null;
  const eligibilityOverrideReason = getOptionalString(formData, "eligibility_override_reason");

  if (!jobId || !startsAt) {
    return { status: "error", message: "Job and start time are required." };
  }

  if (!appointmentTypes.includes(appointmentType)) {
    return { status: "error", message: "That appointment type is not available here." };
  }

  if (endsAt && endsAt <= startsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }

  const eligibility = await checkAssignmentEligibility(supabase, user.id, assignedUserId ? [assignedUserId] : [], appointmentType, eligibilityOverrideReason);
  if (eligibility.blocked) return { status: "warning", message: eligibility.message };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, service_location_id, status")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find selected job." };
  }

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      job_id: jobId,
      service_location_id: job.service_location_id,
      appointment_type: appointmentType,
      assigned_user_id: assignedUserId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      calendar_notes: calendarNotes,
    })
    .select("id")
    .single();

  if (error || !appointment) {
    return { status: "error", message: error?.message ?? "Could not save the appointment." };
  }
  if (eligibility.warningCount) await recordActivity(supabase, { actorUserId: user.id, eventType: eligibilityOverrideReason ? "employee_qualification_override" : "employee_qualification_warning", metadata: { assigned_user_ids: assignedUserId ?? "", reason: eligibilityOverrideReason, warning_count: eligibility.warningCount }, subjectId: appointment.id, subjectType: "appointment" });

  const nextJobStatus = getScheduledJobStatus(job.status as JobStatus, appointmentType);
  if (nextJobStatus) {
    const { error: statusError } = await supabase.from("jobs").update({ status: nextJobStatus }).eq("id", jobId);
    if (statusError) {
      return { status: "error", message: `Appointment saved, but the job status could not be updated: ${statusError.message}` };
    }

    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: nextJobStatus === "scheduled" ? "work_order_scheduled" : "estimate_scheduled",
      metadata: { appointment_id: appointment.id },
      subjectId: jobId,
      subjectType: "job",
    });
  }

  await syncScheduleCommunications();
  revalidateSchedulePaths(jobId);
  return eligibility.warningCount
    ? { status: "warning", message: `Appointment saved with a qualification warning. ${eligibility.message}` }
    : { status: "success", message: "Appointment saved." };
}

export async function updateAppointmentStatus(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating appointments." };
  }

  const appointmentId = String(formData.get("appointment_id") ?? "");
  const jobId = String(formData.get("job_id") ?? "");
  const nextStatus = String(formData.get("next_status") ?? "") as AppointmentStatus;
  const allowedStatuses: AppointmentStatus[] = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"];

  if (!appointmentId || !jobId || !allowedStatuses.includes(nextStatus)) {
    return { status: "error", message: "Choose a valid appointment status." };
  }

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: nextStatus })
    .eq("id", appointmentId)
    .eq("job_id", jobId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  if (!data) {
    return { status: "error", message: "Appointment not found or no access." };
  }

  if (["completed", "cancelled", "no_show"].includes(nextStatus)) {
    await cancelPendingCommunications(supabase, { appointmentId }, `Appointment marked ${nextStatus.replaceAll("_", " ")}.`);
  }
  await syncScheduleCommunications();

  revalidateSchedulePaths(jobId);
  return { status: "success", message: `Appointment marked ${nextStatus.replace("_", " ")}.` };
}

export async function updateAppointmentStatusFromForm(formData: FormData) {
  await updateAppointmentStatus({ status: "idle", message: "" }, formData);
}

export async function updateAppointmentDetails(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before editing appointments." };
  }

  const appointmentId = String(formData.get("appointment_id") ?? "");
  const jobId = String(formData.get("job_id") ?? "");
  const startsAt = parseDateTime(formData.get("starts_at"));
  const endsAt = parseDateTime(formData.get("ends_at"), true);
  const assignedUserId = getOptionalString(formData, "assigned_user_id");
  const appointmentType = String(formData.get("appointment_type") ?? "job") as AppointmentType;
  const calendarNotes = String(formData.get("calendar_notes") ?? "").trim().slice(0, 1000) || null;
  const eligibilityOverrideReason = getOptionalString(formData, "eligibility_override_reason");

  if (!appointmentId || !jobId || !startsAt) {
    return { status: "error", message: "Appointment, job, and start time are required." };
  }

  if (endsAt && endsAt <= startsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }
  const eligibility = await checkAssignmentEligibility(
    supabase,
    user.id,
    assignedUserId ? [assignedUserId] : [],
    appointmentTypes.includes(appointmentType) ? appointmentType : "job",
    eligibilityOverrideReason,
  );
  if (eligibility.blocked) return { status: "warning", message: eligibility.message };

  const { data, error } = await supabase
    .from("appointments")
    .update({
      assigned_user_id: assignedUserId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      calendar_notes: calendarNotes,
    })
    .eq("id", appointmentId)
    .eq("job_id", jobId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  if (!data) {
    return { status: "error", message: "Appointment not found or no access." };
  }

  if (eligibility.warningCount) {
    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: eligibilityOverrideReason ? "employee_qualification_override" : "employee_qualification_warning",
      metadata: {
        assigned_user_ids: assignedUserId ?? "",
        reason: eligibilityOverrideReason,
        warning_count: eligibility.warningCount,
      },
      subjectId: appointmentId,
      subjectType: "appointment",
    });
  }

  await syncScheduleCommunications();

  revalidateSchedulePaths(jobId);
  return eligibility.warningCount
    ? { status: "warning", message: `Appointment updated with a qualification warning. ${eligibility.message}` }
    : { status: "success", message: "Appointment details updated." };
}

export async function createScheduleEvent(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding schedule events." };
  }

  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const eventType = String(formData.get("event_type") ?? "job") as ScheduleEventType;
  const status = String(formData.get("status") ?? "scheduled") as ScheduleEventStatus;
  const jobId = getOptionalString(formData, "job_id");
  const allDay = formData.get("all_day") === "1";
  const startsAt = parseDateTime(formData.get("starts_at"));
  const endsAt = parseDateTime(formData.get("ends_at"), true);
  const normalizedStartsAt = normalizeScheduleStart(startsAt, allDay);
  const normalizedEndsAt = normalizeScheduleEnd(startsAt, endsAt, allDay);
  const locationLabel = String(formData.get("location_label") ?? "").trim().slice(0, 240) || null;
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const calendarNotes = String(formData.get("calendar_notes") ?? "").trim().slice(0, 1000) || null;
  const assignedUserIds = Array.from(
    new Set(
      formData
        .getAll("assigned_user_ids")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
  const eligibilityOverrideReason = getOptionalString(formData, "eligibility_override_reason");

  if (!title || !normalizedStartsAt) {
    return { status: "error", message: "Title and start time are required." };
  }

  if (!scheduleEventTypes.includes(eventType)) {
    return { status: "error", message: "Choose a supported schedule event type." };
  }

  if (!scheduleStatuses.includes(status)) {
    return { status: "error", message: "Choose a supported schedule status." };
  }

  if (normalizedEndsAt && normalizedEndsAt <= normalizedStartsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }
  const eligibility = await checkAssignmentEligibility(supabase, user.id, assignedUserIds, eventType, eligibilityOverrideReason);
  if (eligibility.blocked) return { status: "warning", message: eligibility.message };

  const jobContext = jobId ? await getJobScheduleContext(supabase, jobId) : null;

  if (jobId && !jobContext) {
    return { status: "error", message: "Selected job was not found or is not available." };
  }

  const resolvedLocationLabel =
    locationLabel ||
    formatLocationLabel(
      jobContext?.service_location?.street,
      jobContext?.service_location?.city,
      jobContext?.service_location?.state,
    );

  const { data: event, error } = await supabase
    .from("schedule_events")
    .insert({
      title,
      description,
      event_type: eventType,
      status,
      job_id: jobContext?.id ?? null,
      service_location_id: jobContext?.service_location_id ?? null,
      starts_at: normalizedStartsAt.toISOString(),
      ends_at: normalizedEndsAt?.toISOString() ?? null,
      all_day: allDay,
      location_label: resolvedLocationLabel,
      calendar_notes: calendarNotes,
      created_by_user_id: user.id,
    })
    .select("id, job_id")
    .single();

  if (error || !event) {
    return { status: "error", message: error?.message ?? "Could not create the schedule event." };
  }
  if (eligibility.warningCount) await recordActivity(supabase, { actorUserId: user.id, eventType: eligibilityOverrideReason ? "employee_qualification_override" : "employee_qualification_warning", metadata: { assigned_user_ids: assignedUserIds.join(","), reason: eligibilityOverrideReason, warning_count: eligibility.warningCount }, subjectId: event.id, subjectType: "schedule_event" });

  if (assignedUserIds.length > 0) {
    const { error: assignmentError } = await supabase.from("schedule_event_assignments").insert(
      assignedUserIds.map((assignedUserId) => ({
        event_id: event.id,
        user_id: assignedUserId,
      })),
    );

    if (assignmentError) {
      await supabase.from("schedule_events").delete().eq("id", event.id);
      return { status: "error", message: `Event could not be assigned: ${assignmentError.message}` };
    }
  }

  const nextJobStatus = jobContext ? getScheduledJobStatus(jobContext.status as JobStatus, toAppointmentType(eventType)) : null;
  if (jobContext && nextJobStatus) {
    const { error: statusError } = await supabase.from("jobs").update({ status: nextJobStatus }).eq("id", jobContext.id);
    if (statusError) {
      return {
        status: "error",
        message: `Event saved, but the linked job status could not be updated: ${statusError.message}`,
      };
    }

    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: nextJobStatus === "scheduled" ? "work_order_scheduled" : "estimate_scheduled",
      metadata: { schedule_event_id: event.id },
      subjectId: jobContext.id,
      subjectType: "job",
    });
  }

  await syncScheduleCommunications();
  revalidateSchedulePaths(event.job_id ?? undefined);
  return eligibility.warningCount
    ? { status: "warning", message: `Schedule event saved with a qualification warning. ${eligibility.message}` }
    : { status: "success", message: "Schedule event saved." };
}

export async function updateScheduleEventStatus(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating schedule events." };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() as ScheduleEventStatus;

  if (!eventId || !scheduleStatuses.includes(nextStatus)) {
    return { status: "error", message: "Choose a valid schedule status." };
  }

  const { data, error } = await supabase
    .from("schedule_events")
    .update({ status: nextStatus })
    .eq("id", eventId)
    .select("id, job_id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  if (!data) {
    return { status: "error", message: "Schedule event not found or no access." };
  }

  if (["completed", "cancelled", "no_show"].includes(nextStatus)) {
    await cancelPendingCommunications(supabase, { scheduleEventId: eventId }, `Schedule event marked ${nextStatus.replaceAll("_", " ")}.`);
  }
  await syncScheduleCommunications();

  revalidateSchedulePaths(data.job_id ?? undefined);
  return { status: "success", message: `Event marked ${nextStatus.replace("_", " ")}.` };
}

export async function updateScheduleEventStatusFromForm(formData: FormData) {
  await updateScheduleEventStatus({ status: "idle", message: "" }, formData);
}

export async function updateScheduleEventDetails(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before editing schedule events." };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const eventType = String(formData.get("event_type") ?? "job").trim() as ScheduleEventType;
  const status = String(formData.get("status") ?? "scheduled").trim() as ScheduleEventStatus;
  const jobId = getOptionalString(formData, "job_id");
  const allDay = formData.get("all_day") === "1";
  const startsAt = parseDateTime(formData.get("starts_at"));
  const endsAt = parseDateTime(formData.get("ends_at"), true);
  const normalizedStartsAt = normalizeScheduleStart(startsAt, allDay);
  const normalizedEndsAt = normalizeScheduleEnd(startsAt, endsAt, allDay);
  const locationLabel = String(formData.get("location_label") ?? "").trim().slice(0, 240) || null;
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const calendarNotes = String(formData.get("calendar_notes") ?? "").trim().slice(0, 1000) || null;
  const assignedUserIds = Array.from(
    new Set(
      formData
        .getAll("assigned_user_ids")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
  const eligibilityOverrideReason = getOptionalString(formData, "eligibility_override_reason");

  if (!eventId || !title || !normalizedStartsAt) {
    return { status: "error", message: "Event, title, and start time are required." };
  }

  if (!scheduleEventTypes.includes(eventType) || !scheduleStatuses.includes(status)) {
    return { status: "error", message: "Choose a valid event type and status." };
  }

  if (normalizedEndsAt && normalizedEndsAt <= normalizedStartsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }
  const eligibility = await checkAssignmentEligibility(supabase, user.id, assignedUserIds, eventType, eligibilityOverrideReason);
  if (eligibility.blocked) return { status: "warning", message: eligibility.message };

  const jobContext = jobId ? await getJobScheduleContext(supabase, jobId) : null;

  if (jobId && !jobContext) {
    return { status: "error", message: "Selected job was not found or is not available." };
  }

  const resolvedLocationLabel =
    locationLabel ||
    formatLocationLabel(
      jobContext?.service_location?.street,
      jobContext?.service_location?.city,
      jobContext?.service_location?.state,
    );

  const { data, error } = await supabase
    .from("schedule_events")
    .update({
      title,
      description,
      event_type: eventType,
      status,
      job_id: jobContext?.id ?? null,
      service_location_id: jobContext?.service_location_id ?? null,
      starts_at: normalizedStartsAt.toISOString(),
      ends_at: normalizedEndsAt?.toISOString() ?? null,
      all_day: allDay,
      location_label: resolvedLocationLabel,
      calendar_notes: calendarNotes,
    })
    .eq("id", eventId)
    .select("id, job_id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }
  if (eligibility.warningCount) await recordActivity(supabase, { actorUserId: user.id, eventType: eligibilityOverrideReason ? "employee_qualification_override" : "employee_qualification_warning", metadata: { assigned_user_ids: assignedUserIds.join(","), reason: eligibilityOverrideReason, warning_count: eligibility.warningCount }, subjectId: eventId, subjectType: "schedule_event" });

  if (!data) {
    return { status: "error", message: "Schedule event not found or no access." };
  }

  const { error: deleteAssignmentsError } = await supabase
    .from("schedule_event_assignments")
    .delete()
    .eq("event_id", eventId);

  if (deleteAssignmentsError) {
    return { status: "error", message: `Event updated, but assignments could not be refreshed: ${deleteAssignmentsError.message}` };
  }

  if (assignedUserIds.length > 0) {
    const { error: assignmentError } = await supabase.from("schedule_event_assignments").insert(
      assignedUserIds.map((assignedUserId) => ({
        event_id: eventId,
        user_id: assignedUserId,
      })),
    );

    if (assignmentError) {
      return { status: "error", message: `Event updated, but assignments could not be saved: ${assignmentError.message}` };
    }
  }

  await syncScheduleCommunications();

  revalidateSchedulePaths(data.job_id ?? undefined);
  return eligibility.warningCount
    ? { status: "warning", message: `Schedule event updated with a qualification warning. ${eligibility.message}` }
    : { status: "success", message: "Schedule event updated." };
}

function getOptionalString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

async function checkAssignmentEligibility(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  actorUserId: string,
  assignedUserIds: string[],
  assignmentRole: string,
  overrideReason: string | null,
) {
  const warnings = await getEmployeeEligibilityWarnings(assignedUserIds, { type: "job_assignment_role", value: assignmentRole });
  if (!warnings.length) return { blocked: false, message: "", warningCount: 0 };
  const blockingWarnings = warnings.filter((warning) => warning.requiresOverride);
  const summary = warnings.map((warning) => warning.message).join(" ");
  if (!blockingWarnings.length) return { blocked: false, message: summary, warningCount: warnings.length };
  const roles = await getCurrentUserRolesFromClient(supabase, actorUserId);
  const canOverride = hasAllowedRole(roles, platformRoleGroups.accessApproval);
  if (!overrideReason || !canOverride) return { blocked: true, message: `${summary} Owner/admin can proceed only after entering an override reason.`, warningCount: warnings.length };
  return { blocked: false, message: summary, warningCount: warnings.length };
}

async function syncScheduleCommunications() {
  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);
}

function parseDateTime(value: FormDataEntryValue | null, optional = false) {
  const text = String(value ?? "").trim();
  if (!text && optional) {
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeScheduleStart(date: Date | null, allDay: boolean) {
  if (!date) {
    return null;
  }

  if (!allDay) {
    return date;
  }

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function normalizeScheduleEnd(start: Date | null, end: Date | null, allDay: boolean) {
  if (!allDay) {
    return end;
  }

  if (end) {
    const normalized = new Date(end);
    normalized.setHours(23, 59, 0, 0);
    return normalized;
  }

  if (!start) {
    return null;
  }

  const normalized = new Date(start);
  normalized.setHours(23, 59, 0, 0);
  return normalized;
}

function getScheduledJobStatus(currentStatus: JobStatus, appointmentType: AppointmentType): JobStatus | null {
  if (appointmentType === "estimate" && currentStatus === "new_lead") {
    return "estimate_scheduled";
  }

  if (appointmentType === "job" && currentStatus === "accepted") {
    return "scheduled";
  }

  return null;
}

async function getJobScheduleContext(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  jobId: string,
) {
  const { data } = await supabase
    .from("jobs")
    .select("id, status, service_location_id, service_locations(street, city, state)")
    .eq("id", jobId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const serviceLocation = Array.isArray(data.service_locations)
    ? (data.service_locations[0] ?? null)
    : (data.service_locations ?? null);

  return {
    ...data,
    service_location: serviceLocation,
  };
}

function toAppointmentType(eventType: ScheduleEventType): AppointmentType {
  if (eventType === "estimate" || eventType === "job" || eventType === "follow_up" || eventType === "maintenance") {
    return eventType;
  }

  return "other";
}

function formatLocationLabel(street?: string | null, city?: string | null, state?: string | null) {
  return [street, city, state].filter(Boolean).join(", ") || null;
}

function revalidateSchedulePaths(jobId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/jobs");
  if (jobId) {
    revalidatePath(`/admin/jobs/${jobId}`);
  }
}
