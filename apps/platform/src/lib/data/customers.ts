import { createClient } from "@/lib/supabase/server";
import type { Customer, CustomerWithLocations, DataResult, Note, ServiceLocation } from "@/lib/types/database";

export async function getCustomers(): Promise<DataResult<CustomerWithLocations[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*, service_locations(id, label, street, city, state, postal_code)")
    .order("created_at", { ascending: false });

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
