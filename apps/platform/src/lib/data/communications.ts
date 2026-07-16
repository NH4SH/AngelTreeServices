import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CommunicationSettings,
  CommunicationStatus,
  CustomerCommunication,
  DataResult,
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

export async function getCommunicationRecipientOptions(customerId: string): Promise<DataResult<{
  email: string;
  label: string;
  source: "customer" | "organization";
}[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("customers")
    .select("email, organizations(name, billing_email)")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) return { data: [], error: error?.message ?? "Customer not found." };

  const organization = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
  const options = [];
  if (data.email) options.push({ email: data.email, label: "Customer", source: "customer" as const });
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
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("status", "sent"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
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
