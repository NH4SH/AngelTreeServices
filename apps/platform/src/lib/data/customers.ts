import { createClient } from "@/lib/supabase/server";
import { getInvoicesByCustomerId } from "@/lib/data/invoices";
import { getJobsByCustomerId } from "@/lib/data/jobs";
import { getQuotesByCustomerId } from "@/lib/data/quotes";
import type { Customer, CustomerDetail, CustomerWithLocations, DataResult, Note, ServiceLocation } from "@/lib/types/database";

export async function getCustomers(): Promise<DataResult<CustomerWithLocations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*, service_locations(id, label, street, city, state, postal_code), notes(id, customer_id, body, created_at)")
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "notes", ascending: false })
    .limit(1, { foreignTable: "notes" });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CustomerWithLocations[], error: null };
}

export async function getCustomerOptions(): Promise<DataResult<Pick<Customer, "id" | "display_name">[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, display_name")
    .order("display_name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Pick<Customer, "id" | "display_name">[], error: null };
}

export async function getServiceLocations(): Promise<DataResult<ServiceLocation[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("service_locations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as ServiceLocation[], error: null };
}

export async function getCustomerNotes(customerIds: string[]): Promise<DataResult<Note[]>> {
  if (customerIds.length === 0) {
    return { data: [], error: null };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Note[], error: null };
}

export async function getCustomerDetail(customerId: string): Promise<DataResult<CustomerDetail | null>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    return { data: null, error: customerError?.message ?? "Customer not found or no access." };
  }

  const [locations, notes, jobs, quotes, invoices] = await Promise.all([
    supabase
      .from("service_locations")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("notes")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    getJobsByCustomerId(customerId),
    getQuotesByCustomerId(customerId),
    getInvoicesByCustomerId(customerId),
  ]);

  const firstError =
    locations.error?.message ??
    notes.error?.message ??
    jobs.error ??
    quotes.error ??
    invoices.error ??
    null;

  return {
    data: {
      customer: customer as Customer,
      serviceLocations: (locations.data ?? []) as ServiceLocation[],
      notes: (notes.data ?? []) as Note[],
      jobs: jobs.data,
      quotes: quotes.data,
      invoices: invoices.data,
    },
    error: firstError,
  };
}
