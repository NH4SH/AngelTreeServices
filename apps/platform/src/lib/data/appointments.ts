import { createClient } from "@/lib/supabase/server";
import type { AppointmentWithRelations, DataResult } from "@/lib/types/database";

export async function getAppointments(): Promise<DataResult<AppointmentWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, jobs(id, status, service_type, requested_scope), service_locations(id, label, street, city, state, postal_code)",
    )
    .order("starts_at", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as AppointmentWithRelations[], error: null };
}

export async function getFollowUpsDue() {
  const appointments = await getAppointments();

  if (appointments.error) {
    return { data: [], error: appointments.error };
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    data: appointments.data.filter(
      (appointment) => appointment.appointment_type === "follow_up" && appointment.starts_at.slice(0, 10) <= today,
    ),
    error: null,
  };
}
