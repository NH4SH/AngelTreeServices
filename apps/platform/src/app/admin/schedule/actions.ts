"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentType } from "@/lib/types/database";

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
  const startsAt = String(formData.get("starts_at") ?? "");
  const calendarNotes = String(formData.get("calendar_notes") ?? "").trim() || null;

  if (!jobId || !startsAt) {
    return { status: "error", message: "Job and start time are required." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, service_location_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find selected job." };
  }

  const { error } = await supabase.from("appointments").insert({
    job_id: jobId,
    service_location_id: job.service_location_id,
    appointment_type: appointmentType,
    starts_at: new Date(startsAt).toISOString(),
    calendar_notes: calendarNotes,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  return { status: "success", message: "Appointment saved." };
}
