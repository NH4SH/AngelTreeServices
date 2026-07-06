import { createClient } from "@/lib/supabase/server";
import type { DataResult, Payment } from "@/lib/types/database";

export async function getPayments(): Promise<DataResult<Payment[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Payment[], error: null };
}

export async function getPaymentsByInvoiceIds(invoiceIds: string[]): Promise<DataResult<Payment[]>> {
  if (invoiceIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Payment[], error: null };
}
