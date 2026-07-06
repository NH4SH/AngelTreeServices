import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations, AssignableUser, DataResult } from "@/lib/types/database";

export type AppointmentFilters = {
  appointmentType?: AppointmentType | "all";
  status?: AppointmentStatus | "all";
  startsAtOrAfter?: string;
  startsBefore?: string;
};

export async function getAppointments(filters: AppointmentFilters = {}): Promise<DataResult<AppointmentWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  let query = supabase
    .from("appointments")
    .select(
      "*, jobs(id, status, service_type, requested_scope), service_locations(id, label, street, city, state, postal_code), profiles(id, full_name, email)",
    )
    .order("starts_at", { ascending: true });

  if (filters.appointmentType && filters.appointmentType !== "all") {
    query = query.eq("appointment_type", filters.appointmentType);
  }

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.startsAtOrAfter) {
    query = query.gte("starts_at", filters.startsAtOrAfter);
  }

  if (filters.startsBefore) {
    query = query.lt("starts_at", filters.startsBefore);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as AppointmentWithRelations[], error: null };
}

export async function getAssignableUsers(): Promise<DataResult<AssignableUser[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as AssignableUser[], error: null };
}

export async function getFollowUpsDue() {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const appointments = await getAppointments({
    appointmentType: "follow_up",
    startsBefore: todayEnd.toISOString(),
  });

  if (appointments.error) {
    return { data: [], error: appointments.error };
  }

  return {
    data: appointments.data.filter(
      (appointment) =>
        appointment.status !== "completed" &&
        appointment.status !== "cancelled",
    ),
    error: null,
  };
}
