import { createClient } from "@/lib/supabase/server";
import type { DataResult, InvoiceDetail, InvoiceWithRelations, JobWithRelations, Note } from "@/lib/types/database";

export async function getInvoices(): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as InvoiceWithRelations[], error: null };
}

export async function getUnpaidInvoices(): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
    )
    .in("status", ["sent", "partially_paid", "overdue"])
    .order("created_at", { ascending: false })
    .limit(12);

  return {
    data: (data ?? []) as InvoiceWithRelations[],
    error: error?.message ?? null,
  };
}

export async function getInvoicesByCustomerId(customerId: string): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), invoice_line_items(*), payments(*)",
    )
    .eq("customer_id", customerId)
    .is("organization_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
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
      "*, jobs(*, customers(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)), customers(id, display_name, phone, email), organizations(id, name, billing_email, billing_phone, billing_address), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(id, full_name, email, phone, is_active), accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(id, full_name, email, phone, is_active), invoice_line_items(*), payments(*)",
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { data: null, error: invoiceError?.message ?? "Invoice not found or no access." };
  }

  const jobId = (invoice as InvoiceWithRelations).job_id;
  const { data: notes, error: notesError } = await supabase
    .from("notes")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  return {
    data: {
      ...(invoice as InvoiceWithRelations),
      jobs: (invoice as { jobs?: JobWithRelations | null }).jobs ?? null,
      notes: (notes ?? []) as Note[],
    },
    error: notesError?.message ?? null,
  };
}
