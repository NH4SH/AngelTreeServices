import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAdminSearchPage } from "@/lib/data/admin-search";
import type {
  CommunicationSettings,
  CommunicationStatus,
  CustomerCommunication,
  DataResult,
  JobStatus,
} from "@/lib/types/database";

export type CommunicationFilters = {
  appointmentId?: string;
  customerId?: string;
  invoiceId?: string;
  jobId?: string;
  limit?: number;
  organizationId?: string;
  quoteId?: string;
  scheduleEventId?: string;
  statuses?: CommunicationStatus[];
};

export type WebsiteLeadInboxItem = {
  address: string;
  assignedStaff: string | null;
  currentStatus: JobStatus;
  customerName: string;
  duplicateOfJobId: string | null;
  email: string | null;
  jobId: string;
  lastCommunication: string | null;
  nextAction: string | null;
  notificationStatus: "pending" | "sent" | "failed" | "skipped";
  phone: string | null;
  serviceRequested: string | null;
  sourceBadge: string;
  submittedAt: string;
};

export async function getCustomerCommunications(
  filters: CommunicationFilters = {},
): Promise<DataResult<CustomerCommunication[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  let query = supabase
    .from("customer_communications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 20);

  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);
  if (filters.quoteId) query = query.eq("quote_id", filters.quoteId);
  if (filters.invoiceId) query = query.eq("invoice_id", filters.invoiceId);
  if (filters.jobId) query = query.eq("job_id", filters.jobId);
  if (filters.scheduleEventId) query = query.eq("schedule_event_id", filters.scheduleEventId);
  if (filters.appointmentId) query = query.eq("appointment_id", filters.appointmentId);
  if (filters.statuses?.length) query = query.in("status", filters.statuses);

  const { data, error } = await query;
  return {
    data: (data ?? []) as CustomerCommunication[],
    error: error?.message ?? null,
  };
}

export async function getCommunicationSettings(): Promise<DataResult<CommunicationSettings | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("communication_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  return {
    data: (data as CommunicationSettings | null) ?? null,
    error: error?.message ?? null,
  };
}

export async function getCommunicationRecipientOptions({
  customerId,
  organizationId,
}: {
  customerId: string | null;
  organizationId: string | null;
}): Promise<DataResult<{
  email: string;
  label: string;
  source: "customer" | "organization";
}[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const [customerResult, organizationResult] = await Promise.all([
    customerId
      ? supabase.from("customers").select("email").eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    organizationId
      ? supabase.from("organizations").select("name, billing_email").eq("id", organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const error = customerResult.error ?? organizationResult.error;
  if (error) return { data: [], error: error.message };

  const customer = customerResult.data;
  const organization = organizationResult.data;
  const options = [];
  if (customer?.email) options.push({ email: customer.email, label: "Customer", source: "customer" as const });
  if (organization?.billing_email) {
    options.push({
      email: organization.billing_email,
      label: organization.name || "Organization billing",
      source: "organization" as const,
    });
  }
  return { data: options, error: null };
}

export async function getCommunicationDashboardSummary() {
  const supabase = await createClient();
  const empty = {
    dueToday: [] as CustomerCommunication[],
    failed: [] as CustomerCommunication[],
    overdueInvoiceCount: 0,
    quotesAwaitingResponseCount: 0,
    scheduled: [] as CustomerCommunication[],
  };
  if (!supabase) return { data: empty, error: "Supabase is not configured." };

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);

  const [dueToday, scheduled, failed, quotes, invoices] = await Promise.all([
    supabase
      .from("customer_communications")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", tomorrow.toISOString())
      .order("scheduled_for")
      .limit(8),
    supabase
      .from("customer_communications")
      .select("*")
      .eq("status", "pending")
      .gt("scheduled_for", tomorrow.toISOString())
      .order("scheduled_for")
      .limit(8),
    supabase
      .from("customer_communications")
      .select("*")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase.from("quotes").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "sent"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .in("status", ["sent", "partially_paid", "overdue"])
      .lt("due_at", now.toISOString())
      .gt("balance_due_cents", 0),
  ]);
  const error = dueToday.error?.message
    ?? scheduled.error?.message
    ?? failed.error?.message
    ?? quotes.error?.message
    ?? invoices.error?.message
    ?? null;

  return {
    data: {
      dueToday: (dueToday.data ?? []) as CustomerCommunication[],
      failed: (failed.data ?? []) as CustomerCommunication[],
      overdueInvoiceCount: invoices.count ?? 0,
      quotesAwaitingResponseCount: quotes.count ?? 0,
      scheduled: (scheduled.data ?? []) as CustomerCommunication[],
    },
    error,
  };
}

export async function getWebsiteLeadInbox(filters: { limit?: number; page?: number; query?: string } = {}): Promise<DataResult<WebsiteLeadInboxItem[]> & { count: number }> {
  const supabase = await createClient();
  if (!supabase) return { data: [], count: 0, error: "Supabase is not configured." };
  const index = await getAdminSearchPage({ page: filters.page, pageSize: filters.limit ?? 24, query: filters.query, recordType: "job", sourceType: "website" });
  if (!index.ids.length) return { data: [], count: index.count, error: index.error };

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select(
      "id, status, submitted_at, created_at, service_type, duplicate_of_job_id, notification_status, customers:customers!jobs_customer_id_fkey(display_name, phone, email), organizations(name, billing_phone, billing_email), service_locations(street, city, state, postal_code), profiles:profiles!jobs_assigned_crew_user_id_fkey(full_name, email)",
    )
    .in("id", index.ids)
    .order("submitted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 24);

  if (jobsError) {
    return { data: [], count: index.count, error: jobsError.message };
  }

  const jobIds = (jobs ?? []).map((job) => job.id);
  if (!jobIds.length) {
    return { data: [], count: index.count, error: null };
  }

  const { data: communications, error: communicationsError } = await supabase
    .from("customer_communications")
    .select("job_id, communication_type, status, recipient_email, scheduled_for, sent_at, created_at")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });

  if (communicationsError) {
    return { data: [], count: index.count, error: communicationsError.message };
  }

  const communicationMap = new Map<string, CustomerCommunication[]>();
  (communications ?? []).forEach((item) => {
    const jobId = item.job_id;
    if (!jobId) return;

    const existing = communicationMap.get(jobId) ?? [];
    existing.push(item as CustomerCommunication);
    communicationMap.set(jobId, existing);
  });

  return {
    data: (jobs ?? []).map((job: any) => {
      const rows = communicationMap.get(job.id) ?? [];
      const pending = rows
        .filter((row) => row.status === "pending")
        .sort((left, right) => new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime())[0] ?? null;
      const latest = rows[0] ?? null;
      const serviceLocation = job.service_locations;
      const customer = job.customers;
      const organization = job.organizations;
      const assignedProfile = job.profiles;

      return {
        address: [serviceLocation?.street, serviceLocation?.city, serviceLocation?.state, serviceLocation?.postal_code]
          .filter(Boolean)
          .join(", "),
        assignedStaff: assignedProfile?.full_name || assignedProfile?.email || null,
        currentStatus: job.status as JobStatus,
        customerName: organization?.name || customer?.display_name || "Website lead",
        duplicateOfJobId: job.duplicate_of_job_id ?? null,
        email: customer?.email || organization?.billing_email || latest?.recipient_email || null,
        jobId: job.id,
        lastCommunication: latest ? summarizeCommunication(latest) : null,
        nextAction: pending ? `Pending ${pending.communication_type.replaceAll("_", " ")} · ${formatDateTime(pending.scheduled_for)}` : defaultNextAction(job.status as JobStatus),
        notificationStatus: (job.notification_status ?? "pending") as WebsiteLeadInboxItem["notificationStatus"],
        phone: customer?.phone || organization?.billing_phone || null,
        serviceRequested: job.service_type ? job.service_type.replaceAll("_", " ") : null,
        sourceBadge: "Website",
        submittedAt: job.submitted_at || job.created_at,
      };
    }),
    count: index.count,
    error: index.error,
  };
}

function summarizeCommunication(item: CustomerCommunication) {
  const when = item.sent_at ?? item.scheduled_for;
  return `${item.communication_type.replaceAll("_", " ")} · ${item.status} · ${formatDateTime(when)}`;
}

function defaultNextAction(status: JobStatus) {
  switch (status) {
    case "new_lead":
      return "Call or email this lead";
    case "estimate_scheduled":
      return "Confirm estimate appointment";
    case "quoted":
      return "Send or follow up on the quote";
    case "accepted":
      return "Schedule approved work";
    case "lost":
    case "cancelled":
      return "Closed";
    default:
      return "Review lead status";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
