"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import type {
  AppointmentStatus,
  AppointmentType,
  JobStatus,
  ScheduleEventStatus,
  ScheduleEventType,
} from "@/lib/types/database";

export type AppointmentActionState = {
  status: "idle" | "success" | "error";
  message: string;
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

  if (!jobId || !startsAt) {
    return { status: "error", message: "Job and start time are required." };
  }

  if (!appointmentTypes.includes(appointmentType)) {
    return { status: "error", message: "That appointment type is not available here." };
  }

  if (endsAt && endsAt <= startsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }

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

  revalidateSchedulePaths(jobId);
  return { status: "success", message: "Appointment saved." };
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
    return { status: "error", message: error.message };
  }

  if (!data) {
    return { status: "error", message: "Appointment not found or no access." };
  }

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
  const calendarNotes = String(formData.get("calendar_notes") ?? "").trim().slice(0, 1000) || null;

  if (!appointmentId || !jobId || !startsAt) {
    return { status: "error", message: "Appointment, job, and start time are required." };
  }

  if (endsAt && endsAt <= startsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }

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
    return { status: "error", message: error.message };
  }

  if (!data) {
    return { status: "error", message: "Appointment not found or no access." };
  }

  revalidateSchedulePaths(jobId);
  return { status: "success", message: "Appointment details updated." };
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

  revalidateSchedulePaths(event.job_id ?? undefined);
  return { status: "success", message: "Schedule event saved." };
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
    return { status: "error", message: error.message };
  }

  if (!data) {
    return { status: "error", message: "Schedule event not found or no access." };
  }

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

  if (!eventId || !title || !normalizedStartsAt) {
    return { status: "error", message: "Event, title, and start time are required." };
  }

  if (!scheduleEventTypes.includes(eventType) || !scheduleStatuses.includes(status)) {
    return { status: "error", message: "Choose a valid event type and status." };
  }

  if (normalizedEndsAt && normalizedEndsAt <= normalizedStartsAt) {
    return { status: "error", message: "End time must be after the start time." };
  }

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
    return { status: "error", message: error.message };
  }

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

  revalidateSchedulePaths(data.job_id ?? undefined);
  return { status: "success", message: "Schedule event updated." };
}

function getOptionalString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
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
