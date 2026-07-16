import { createClient } from "@/lib/supabase/server";
import type { AppointmentWithRelations, DataResult, InvoiceWithRelations, Job, JobDetail, JobPhoto, JobWithRelations, Note, QuoteWithRelations } from "@/lib/types/database";

export async function getJobs(): Promise<DataResult<JobWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as JobWithRelations[], error: null };
}

export async function getCompletedJobsForMarketing(): Promise<DataResult<JobDetail[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), job_photos(*)",
    )
    .in("status", ["completed", "ready_to_invoice", "invoiced", "paid"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as JobDetail[], error: null };
}

export async function getJobsByCustomerId(customerId: string): Promise<DataResult<JobWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as JobWithRelations[], error: null };
}

export async function getJobDetail(jobId: string): Promise<DataResult<JobDetail | null>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)",
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { data: null, error: jobError?.message ?? "Job not found or no access." };
  }

  const [notes, photos, quotes, invoices, appointments] = await Promise.all([
    supabase
      .from("notes")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotes")
      .select("*, jobs:jobs!quotes_job_id_fkey(id, status, service_type), customers(id, display_name, phone, email), quote_line_items(*)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select(
        "*, jobs(id, status, service_type, requested_scope), customers(id, display_name, phone, email), invoice_line_items(*), payments(*)",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select(
        "*, jobs(id, status, service_type, requested_scope), service_locations(id, label, street, city, state, postal_code)",
      )
      .eq("job_id", jobId)
      .order("starts_at", { ascending: true }),
  ]);

  const firstError =
    notes.error?.message ??
    photos.error?.message ??
    quotes.error?.message ??
    invoices.error?.message ??
    appointments.error?.message ??
    null;

  return {
    data: {
      ...(job as JobWithRelations),
      notes: (notes.data ?? []) as Note[],
      job_photos: (photos.data ?? []) as JobPhoto[],
      quotes: (quotes.data ?? []) as QuoteWithRelations[],
      invoices: (invoices.data ?? []) as InvoiceWithRelations[],
      appointments: (appointments.data ?? []) as AppointmentWithRelations[],
    },
    error: firstError,
  };
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
  const supabase = await createClient();

  if (!supabase) {
    return {
      lanes: {
        newLeads: [],
        estimatesToSchedule: [],
        approvedWorkToSchedule: [],
        completedWorkToInvoice: [],
        todaysJobs: [],
      },
      error: "Supabase is not configured.",
    };
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const commonSelect =
    "*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)";

  const [newLeads, estimatesToSchedule, approvedWorkToSchedule, completedWorkToInvoice, todaysJobs] = await Promise.all([
    supabase
      .from("jobs")
      .select(commonSelect)
      .eq("status", "new_lead")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .eq("status", "estimate_scheduled")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .in("status", ["completed", "ready_to_invoice"])
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .gte("scheduled_start_at", start.toISOString())
      .lt("scheduled_start_at", end.toISOString())
      .order("scheduled_start_at", { ascending: true })
      .limit(12),
  ]);

  return {
    lanes: {
      newLeads: (newLeads.data ?? []) as JobWithRelations[],
      estimatesToSchedule: (estimatesToSchedule.data ?? []) as JobWithRelations[],
      approvedWorkToSchedule: (approvedWorkToSchedule.data ?? []) as JobWithRelations[],
      completedWorkToInvoice: (completedWorkToInvoice.data ?? []) as JobWithRelations[],
      todaysJobs: (todaysJobs.data ?? []) as JobWithRelations[],
    },
    error:
      newLeads.error?.message ??
      estimatesToSchedule.error?.message ??
      approvedWorkToSchedule.error?.message ??
      completedWorkToInvoice.error?.message ??
      todaysJobs.error?.message ??
      null,
  };
}
