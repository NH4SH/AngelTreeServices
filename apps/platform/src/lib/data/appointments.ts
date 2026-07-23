import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations, AssignableUser, DataResult } from "@/lib/types/database";

export type AppointmentFilters = {
  assignedUserId?: string | "all" | "unassigned";
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

  if (filters.assignedUserId === "unassigned") {
    query = query.is("assigned_user_id", null);
  } else if (filters.assignedUserId && filters.assignedUserId !== "all") {
    query = query.eq("assigned_user_id", filters.assignedUserId);
  }

  if (filters.startsAtOrAfter) {
    query = query.gte("starts_at", filters.startsAtOrAfter);
  }

  if (filters.startsBefore) {
    query = query.lt("starts_at", filters.startsBefore);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
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
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return { data: (data ?? []) as AssignableUser[], error: null };
}

export async function getFollowUpsDue() {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, jobs(id, status, service_type, requested_scope), service_locations(id, label, street, city, state, postal_code), profiles(id, full_name, email)",
    )
    .eq("appointment_type", "follow_up")
    .in("status", ["scheduled", "confirmed", "in_progress", "no_show"])
    .lt("starts_at", todayEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(12);

  return {
    data: (data ?? []) as AppointmentWithRelations[],
    error: error?.message ?? null,
  };
}
