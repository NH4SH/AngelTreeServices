"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CustomerType } from "@/lib/types/database";

export type CustomerActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialError = "Unable to save customer. Check Supabase configuration and RLS policies.";

export async function createCustomer(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const customerType = String(formData.get("customer_type") ?? "residential") as CustomerType;
  const notes = String(formData.get("notes") ?? "").trim();
  const street = String(formData.get("street") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "VA").trim() || "VA";
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;

  if (!displayName) {
    return { status: "error", message: "Customer name is required." };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      display_name: displayName,
      primary_contact_name: displayName,
      phone,
      email,
      customer_type: customerType,
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    return { status: "error", message: customerError?.message ?? initialError };
  }

  if (notes) {
    const { error } = await supabase.from("notes").insert({
      customer_id: customer.id,
      author_user_id: user.id,
      visibility: "internal",
      body: notes,
    });

    if (error) {
      return { status: "error", message: `Customer saved, but note failed: ${error.message}` };
    }
  }

  if (street && city) {
    const { error } = await supabase.from("service_locations").insert({
      customer_id: customer.id,
      label: "Primary service location",
      street,
      city,
      state,
      postal_code: postalCode,
    });

    if (error) {
      return { status: "error", message: `Customer saved, but service location failed: ${error.message}` };
    }
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin/jobs");
  return { status: "success", message: "Customer saved." };
}

export async function createServiceLocation(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const customerId = String(formData.get("customer_id") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;
  const street = String(formData.get("street") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "VA").trim() || "VA";
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;
  const serviceNotes = String(formData.get("service_notes") ?? "").trim() || null;

  if (!customerId || !street || !city) {
    return { status: "error", message: "Customer, street, and city are required." };
  }

  const { error } = await supabase.from("service_locations").insert({
    customer_id: customerId,
    label,
    street,
    city,
    state,
    postal_code: postalCode,
    service_notes: serviceNotes,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin/jobs");
  return { status: "success", message: "Service location saved." };
}
