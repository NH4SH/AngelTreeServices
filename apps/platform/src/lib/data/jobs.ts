import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { AppointmentWithRelations, ChangeOrderWithRelations, DataResult, InvoiceWithRelations, Job, JobDetail, JobOperationsIndexRow, JobPhoto, JobWithRelations, Note, QuoteWithRelations, ScheduleEventWithRelations, ScheduleJobOption } from "@/lib/types/database";

export type JobsOperationalView = "active" | "to_be_scheduled" | "scheduled" | "in_progress" | "billing" | "completed" | "needs_attention" | "all";
export type JobsIndexSort = "action" | "scheduled" | "updated" | "customer" | "value";

export type JobsIndexFilters = {
  archived: boolean;
  view: JobsOperationalView;
  search?: string;
  scheduledDate?: string;
  assignedCrewId?: string;
  city?: string;
  priority?: string;
  invoiceStatus?: string;
  sort: JobsIndexSort;
  page: number;
  pageSize: number;
};

const activeJobStatuses = ["accepted", "scheduled", "in_progress", "returned_for_correction", "completed_pending_review", "ready_to_invoice", "completed"];

export async function getJobsOperationsPage(filters: JobsIndexFilters): Promise<{
  data: JobOperationsIndexRow[];
  count: number;
  error: string | null;
}> {
  const supabase = await createClient();
  if (!supabase) return { data: [], count: 0, error: "Supabase is not configured." };

  let query = supabase.from("job_operations_search_index").select("*", { count: "exact" });
  query = applyJobsIndexFilters(query, filters, true);

  if (filters.sort === "scheduled") {
    query = query.order("appointment_starts_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false });
  } else if (filters.sort === "updated") {
    query = query.order("updated_at", { ascending: false });
  } else if (filters.sort === "customer") {
    query = query.order("contracting_party_name", { ascending: true }).order("updated_at", { ascending: false });
  } else if (filters.sort === "value") {
    query = query.order("quote_total_cents", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
  } else {
    query = query.order("action_rank", { ascending: true }).order("appointment_starts_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false });
  }

  const from = (filters.page - 1) * filters.pageSize;
  const { data, error, count } = await query.range(from, from + filters.pageSize - 1);
  return {
    data: (data ?? []) as JobOperationsIndexRow[],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

export async function getJobsIndexMetrics(filters: JobsIndexFilters) {
  const supabase = await createClient();
  if (!supabase) return { data: { toBeScheduled: 0, today: 0, inProgress: 0, awaitingInvoice: 0, unpaidInvoices: 0 }, error: "Supabase is not configured." };

  const metricQuery = () => applyJobsIndexFilters(
    supabase.from("job_operations_search_index").select("id", { count: "exact", head: true }),
    filters,
    false,
  );
  const [toBeScheduled, today, inProgress, awaitingInvoice, unpaidInvoices] = await Promise.all([
    metricQuery().eq("job_status", "accepted").eq("operational_state", "to_be_scheduled"),
    metricQuery().in("job_status", activeJobStatuses).eq("is_today", true),
    metricQuery().in("job_status", activeJobStatuses).eq("operational_state", "in_progress"),
    metricQuery().eq("awaiting_invoice", true),
    metricQuery().in("invoice_status", ["draft", "sent", "partially_paid", "overdue"]),
  ]);

  return {
    data: {
      toBeScheduled: toBeScheduled.count ?? 0,
      today: today.count ?? 0,
      inProgress: inProgress.count ?? 0,
      awaitingInvoice: awaitingInvoice.count ?? 0,
      unpaidInvoices: unpaidInvoices.count ?? 0,
    },
    error: toBeScheduled.error?.message ?? today.error?.message ?? inProgress.error?.message ?? awaitingInvoice.error?.message ?? unpaidInvoices.error?.message ?? null,
  };
}

export async function getJobsIndexCities(): Promise<DataResult<string[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("service_locations").select("city").is("archived_at", null).not("city", "is", null).order("city").limit(1000);
  return {
    data: [...new Set((data ?? []).map((item) => item.city?.trim()).filter((city): city is string => Boolean(city)))],
    error: error?.message ?? null,
  };
}

function applyJobsIndexFilters(query: any, filters: JobsIndexFilters, includeView: boolean) {
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (includeView) {
    if (filters.view === "active") query = query.in("job_status", activeJobStatuses).neq("operational_state", "paid").neq("operational_state", "cancelled");
    if (filters.view === "to_be_scheduled") query = query.eq("job_status", "accepted").eq("operational_state", "to_be_scheduled");
    if (filters.view === "scheduled") query = query.in("job_status", ["accepted", "scheduled"]).eq("operational_state", "scheduled");
    if (filters.view === "in_progress") query = query.in("job_status", activeJobStatuses).eq("operational_state", "in_progress");
    if (filters.view === "billing") query = query.eq("is_billing", true);
    if (filters.view === "completed") query = query.in("operational_state", ["work_complete", "invoiced", "paid"]);
    if (filters.view === "needs_attention") query = query.eq("needs_attention", true);
  }

  const search = filters.search?.trim().replaceAll("%", "\\%").replaceAll("_", "\\_");
  if (search) {
    const digits = search.replaceAll(/[^0-9]/g, "");
    query = query.ilike("expanded_search_text", `%${digits.length >= 4 ? digits : search}%`);
  }
  if (filters.assignedCrewId === "unassigned") query = query.is("assigned_crew_user_id", null);
  else if (filters.assignedCrewId) query = query.eq("assigned_crew_user_id", filters.assignedCrewId);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.invoiceStatus === "none") query = query.is("invoice_id", null);
  else if (filters.invoiceStatus === "unpaid") query = query.in("invoice_status", ["draft", "sent", "partially_paid", "overdue"]);
  else if (filters.invoiceStatus) query = query.eq("invoice_status", filters.invoiceStatus);
  if (filters.scheduledDate) query = query.eq("appointment_local_date", filters.scheduledDate);
  return query;
}

export async function getJobs(): Promise<DataResult<JobWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), assigned_crew:profiles!jobs_assigned_crew_user_id_fkey(id, full_name, email)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
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
      "*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), job_photos(*)",
    )
    .is("archived_at", null)
    .in("status", ["completed", "ready_to_invoice", "invoiced", "paid"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
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
      "*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), assigned_crew:profiles!jobs_assigned_crew_user_id_fkey(id, full_name, email)",
    )
    .is("archived_at", null)
    .eq("customer_id", customerId)
    .is("organization_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
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
      "*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), assigned_crew:profiles!jobs_assigned_crew_user_id_fkey(id, full_name, email)",
    )
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { data: null, error: jobError ? safeStaffMessage(jobError.message, "Job not found or no access.") : "Job not found or no access." };
  }

  const [notes, photos, quotes, invoices, appointments, scheduleEvents, equipmentAssignments, changeOrders] = await Promise.all([
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
      .select("*, jobs:jobs!quotes_job_id_fkey(id, status, service_type), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), quote_line_items(*)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select(
        "*, jobs(id, status, service_type, requested_scope), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), invoice_line_items(*), payments(*)",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select(
        "*, jobs(id, status, service_type, requested_scope), service_locations(id, label, street, city, state, postal_code), profiles:profiles!appointments_assigned_user_id_fkey(id, full_name, email)",
      )
      .eq("job_id", jobId)
      .order("starts_at", { ascending: true }),
    supabase
      .from("schedule_events")
      .select("*, service_locations(id, label, street, city, state, postal_code), schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email))")
      .eq("job_id", jobId)
      .eq("event_type", "job")
      .order("starts_at", { ascending: true }),
    supabase
      .from("equipment_assignments")
      .select("*, equipment_assets(id, asset_number, name, status, category), profiles:profiles!equipment_assignments_assigned_user_id_fkey(id, full_name, email), created_by_profile:profiles!equipment_assignments_created_by_user_id_fkey(id, full_name, email), schedule_events(id, title, starts_at, ends_at)")
      .eq("job_id", jobId)
      .order("starts_at", { ascending: false }),
    supabase
      .from("change_orders")
      .select("*, change_order_line_items(*), invoices(id, invoice_number, status)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);

  const firstError =
    notes.error?.message ??
    photos.error?.message ??
    quotes.error?.message ??
    invoices.error?.message ??
    appointments.error?.message ??
    scheduleEvents.error?.message ??
    equipmentAssignments.error?.message ??
    changeOrders.error?.message ??
    null;

  return {
    data: {
      ...(job as JobWithRelations),
      notes: (notes.data ?? []) as Note[],
      job_photos: (photos.data ?? []) as JobPhoto[],
      quotes: (quotes.data ?? []) as QuoteWithRelations[],
      invoices: (invoices.data ?? []) as InvoiceWithRelations[],
      appointments: (appointments.data ?? []) as AppointmentWithRelations[],
      schedule_events: (scheduleEvents.data ?? []) as ScheduleEventWithRelations[],
      equipment_assignments: equipmentAssignments.data ?? [],
      change_orders: (changeOrders.data ?? []) as ChangeOrderWithRelations[],
    },
    error: firstError,
  };
}

export async function getJobOptions(): Promise<DataResult<Pick<Job, "id" | "status" | "service_type" | "customer_id" | "organization_id" | "service_location_id">[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, service_type, customer_id, organization_id, service_location_id")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return {
    data: (data ?? []) as Pick<Job, "id" | "status" | "service_type" | "customer_id" | "organization_id" | "service_location_id">[],
    error: null,
  };
}

export async function getScheduleJobOptions(): Promise<DataResult<ScheduleJobOption[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, status, service_type, customer_id, organization_id, service_location_id, requested_scope, customers:customers!jobs_customer_id_fkey(id, display_name), organizations:organizations!jobs_organization_id_fkey(id, name), service_locations:service_locations!jobs_service_location_id_fkey(id, label, street, city, state, postal_code), schedule_events:schedule_events!schedule_events_job_id_fkey(*, schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email)))",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return {
    data: (data ?? []) as unknown as ScheduleJobOption[],
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
    "*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)";

  const [newLeads, estimatesToSchedule, approvedWorkToSchedule, completedWorkToInvoice, todaysJobs] = await Promise.all([
    supabase
      .from("jobs")
      .select(commonSelect)
      .is("archived_at", null)
      .eq("status", "new_lead")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .is("archived_at", null)
      .eq("status", "estimate_scheduled")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .is("archived_at", null)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .is("archived_at", null)
      .in("status", ["completed", "ready_to_invoice"])
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("jobs")
      .select(commonSelect)
      .is("archived_at", null)
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
