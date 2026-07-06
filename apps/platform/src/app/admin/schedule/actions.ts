"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus, AppointmentType, JobStatus } from "@/lib/types/database";

export type AppointmentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

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
  const allowedAppointmentTypes: AppointmentType[] = ["estimate", "job", "follow_up", "maintenance"];

  if (!jobId || !startsAt) {
    return { status: "error", message: "Job and start time are required." };
  }

  if (!allowedAppointmentTypes.includes(appointmentType)) {
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

  const { error } = await supabase.from("appointments").insert({
    job_id: jobId,
    service_location_id: job.service_location_id,
    appointment_type: appointmentType,
    assigned_user_id: assignedUserId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt?.toISOString() ?? null,
    calendar_notes: calendarNotes,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  const nextJobStatus = getScheduledJobStatus(job.status as JobStatus, appointmentType);
  if (nextJobStatus) {
    const { error: statusError } = await supabase.from("jobs").update({ status: nextJobStatus }).eq("id", jobId);
    if (statusError) {
      return { status: "error", message: `Appointment saved, but the job status could not be updated: ${statusError.message}` };
    }
  }

  revalidateAppointmentPaths(jobId);
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

  revalidateAppointmentPaths(jobId);
  return { status: "success", message: `Appointment marked ${nextStatus.replace("_", " ")}.` };
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

  revalidateAppointmentPaths(jobId);
  return { status: "success", message: "Appointment details updated." };
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

function getScheduledJobStatus(currentStatus: JobStatus, appointmentType: AppointmentType): JobStatus | null {
  if (appointmentType === "estimate" && currentStatus === "new_lead") {
    return "estimate_scheduled";
  }

  if (appointmentType === "job" && currentStatus === "accepted") {
    return "scheduled";
  }

  return null;
}

function revalidateAppointmentPaths(jobId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
}
