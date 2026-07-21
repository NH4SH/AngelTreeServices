import { createClient } from "@/lib/supabase/server";
import { getAdminSearchPage } from "@/lib/data/admin-search";
import { getInvoicesByCustomerId } from "@/lib/data/invoices";
import { getJobsByCustomerId } from "@/lib/data/jobs";
import { getQuotesByCustomerId } from "@/lib/data/quotes";
import type { Customer, CustomerDetail, CustomerWithLocations, DataResult, Note, ScheduleCustomerOption, ServiceLocation } from "@/lib/types/database";

export async function getCustomers(): Promise<DataResult<CustomerWithLocations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*, service_locations(id, label, street, city, state, postal_code), notes(id, customer_id, body, created_at)")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "notes", ascending: false })
    .limit(1, { foreignTable: "notes" });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CustomerWithLocations[], error: null };
}

export async function getCustomersPage(filters: { archived: boolean; page: number; pageSize: number; query?: string }) {
  const index = await getAdminSearchPage({ ...filters, recordType: "customer" });
  if (!index.ids.length) return { data: [] as CustomerWithLocations[], count: index.count, error: index.error };
  const supabase = await createClient();
  if (!supabase) return { data: [] as CustomerWithLocations[], count: 0, error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("customers")
    .select("*, service_locations(id, label, street, city, state, postal_code), notes(id, customer_id, body, created_at)")
    .in("id", index.ids)
    .order("created_at", { foreignTable: "notes", ascending: false })
    .limit(1, { foreignTable: "notes" });
  return {
    data: orderByIds((data ?? []) as CustomerWithLocations[], index.ids),
    count: index.count,
    error: index.error ?? error?.message ?? null,
  };
}

export async function getCustomerOptions(): Promise<DataResult<Pick<Customer, "id" | "display_name" | "email" | "phone" | "billing_address">[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, display_name, email, phone, billing_address")
    .is("archived_at", null)
    .order("display_name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Pick<Customer, "id" | "display_name" | "email" | "phone" | "billing_address">[], error: null };
}

export async function getServiceLocations(): Promise<DataResult<ServiceLocation[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("service_locations")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as ServiceLocation[], error: null };
}

export async function getScheduleCustomerOptions(): Promise<DataResult<ScheduleCustomerOption[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("customers")
    .select("id, display_name, email, phone, billing_address, service_locations(id, label, street, city, state, postal_code)")
    .eq("status", "active")
    .is("archived_at", null)
    .order("display_name", { ascending: true });

  return { data: (data ?? []) as ScheduleCustomerOption[], error: error?.message ?? null };
}

export async function getServiceLocationsPage(filters: { archived: boolean; page: number; pageSize: number; query?: string }) {
  const index = await getAdminSearchPage({ ...filters, recordType: "service_location" });
  if (!index.ids.length) return { data: [] as (ServiceLocation & { customers?: { display_name: string } | null; organizations?: { name: string } | null })[], count: index.count, error: index.error };
  const supabase = await createClient();
  if (!supabase) return { data: [], count: 0, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("service_locations")
    .select("*, customers(display_name), organizations(name)")
    .in("id", index.ids);
  return { data: orderByIds(data ?? [], index.ids), count: index.count, error: index.error ?? error?.message ?? null };
}

function orderByIds<T extends { id: string }>(records: T[], ids: string[]) {
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...records].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
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
