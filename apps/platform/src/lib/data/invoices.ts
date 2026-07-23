import { createClient } from "@/lib/supabase/server";
import { countAdminSearchRecords, getAdminSearchPage } from "@/lib/data/admin-search";
import { safeStaffMessage } from "@/lib/security/errors";
import type { DataResult, InvoiceDetail, InvoiceWithRelations, JobWithRelations, Note } from "@/lib/types/database";

export async function getInvoices(): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return { data: (data ?? []) as InvoiceWithRelations[], error: null };
}

export async function getInvoicesPage(filters: { archived: boolean; page: number; pageSize: number; query?: string; statuses?: string[] }) {
  const index = await getAdminSearchPage({ ...filters, recordType: "invoice" });
  if (!index.ids.length) return { data: [] as InvoiceWithRelations[], count: index.count, error: index.error };
  const supabase = await createClient();
  if (!supabase) return { data: [] as InvoiceWithRelations[], count: 0, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("invoices")
    .select("*, jobs(id, status, service_type, requested_scope), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)")
    .in("id", index.ids);
  return { data: orderByIds((data ?? []) as InvoiceWithRelations[], index.ids), count: index.count, error: index.error ?? error?.message ?? null };
}

export async function getInvoiceStatusCounts(query?: string) {
  const statuses = ["draft", "sent", "partially_paid", "paid", "overdue", "void"];
  const results = await Promise.all(statuses.map(async (status) => [status, await countAdminSearchRecords({ query, recordType: "invoice", statuses: [status] })] as const));
  return {
    data: Object.fromEntries(results.map(([status, result]) => [status, result.count])) as Record<string, number>,
    error: results.find(([, result]) => result.error)?.[1].error ?? null,
  };
}

export async function getInvoiceOutstandingTotal(): Promise<{ data: number; error: string | null }> {
  const supabase = await createClient();
  if (!supabase) return { data: 0, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("invoices")
    .select("balance_due_cents")
    .is("archived_at", null)
    .not("status", "in", "(paid,void)");
  return { data: (data ?? []).reduce((total, invoice) => total + invoice.balance_due_cents, 0), error: error?.message ?? null };
}

export async function getUnpaidInvoices(): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
    )
    .is("archived_at", null)
    .in("status", ["sent", "partially_paid", "overdue"])
    .order("created_at", { ascending: false })
    .limit(12);

  return {
    data: (data ?? []) as InvoiceWithRelations[],
    error: error?.message ?? null,
  };
}

function orderByIds<T extends { id: string }>(records: T[], ids: string[]) {
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...records].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
}

export async function getInvoicesByCustomerId(customerId: string): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
    )
    .eq("customer_id", customerId)
    .is("organization_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: safeStaffMessage(error.message) };
  }

  return { data: (data ?? []) as InvoiceWithRelations[], error: null };
}

export async function getInvoiceDetail(invoiceId: string): Promise<DataResult<InvoiceDetail | null>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "*, jobs(*, customers:customers!jobs_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(id, full_name, email, phone, is_active), accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(id, full_name, email, phone, is_active), invoice_line_items(*), payments(*)",
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { data: null, error: invoiceError ? safeStaffMessage(invoiceError.message, "Invoice not found or no access.") : "Invoice not found or no access." };
  }

  const jobId = (invoice as InvoiceWithRelations).job_id;
  const notesResult = jobId
    ? await supabase
        .from("notes")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  return {
    data: {
      ...(invoice as InvoiceWithRelations),
      jobs: (invoice as { jobs?: JobWithRelations | null }).jobs ?? null,
      notes: (notesResult.data ?? []) as Note[],
    },
    error: notesResult.error?.message ?? null,
  };
}
