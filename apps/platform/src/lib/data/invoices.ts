import { createClient } from "@/lib/supabase/server";
import type { DataResult, InvoiceWithRelations } from "@/lib/types/database";

export async function getInvoices(): Promise<DataResult<InvoiceWithRelations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, status, service_type, requested_scope), customers(id, display_name, phone, email), invoice_line_items(*), payments(*)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as InvoiceWithRelations[], error: null };
}

export async function getUnpaidInvoices(): Promise<DataResult<InvoiceWithRelations[]>> {
  const invoices = await getInvoices();

  if (invoices.error) {
    return { data: [], error: invoices.error };
  }

  return {
    data: invoices.data.filter((invoice) =>
      ["sent", "partially_paid", "overdue"].includes(invoice.status),
    ),
    error: null,
  };
}
