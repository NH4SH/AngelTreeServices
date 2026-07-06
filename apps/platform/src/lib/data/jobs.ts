import { createClient } from "@/lib/supabase/server";
import type { DataResult, Job, JobWithRelations } from "@/lib/types/database";

export async function getJobs(): Promise<DataResult<JobWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as JobWithRelations[], error: null };
}

export async function getJobOptions(): Promise<DataResult<Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, service_type, customer_id, service_location_id")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []) as Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[],
    error: null,
  };
}

export async function getDashboardJobSummaries() {
  const jobs = await getJobs();

  if (jobs.error) {
    return {
      lanes: {
        newLeads: [],
        estimatesToSchedule: [],
        todaysJobs: [],
      },
      error: jobs.error,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    lanes: {
      newLeads: jobs.data.filter((job) => job.status === "new_lead"),
      estimatesToSchedule: jobs.data.filter((job) => job.status === "estimate_scheduled"),
      todaysJobs: jobs.data.filter((job) => job.scheduled_start_at?.startsWith(today)),
    },
    error: null,
  };
}
