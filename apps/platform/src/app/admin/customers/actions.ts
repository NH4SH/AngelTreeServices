"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStatus, CustomerType } from "@/lib/types/database";

export type CustomerActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialError = "Unable to save customer. Check Supabase configuration and RLS policies.";
const customerTypes: CustomerType[] = ["residential", "commercial", "property_manager", "hoa"];
const customerStatuses: CustomerStatus[] = ["active", "inactive", "archived"];

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
      console.error("Customer created, but initial note could not be saved.", error);
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
      console.error("Customer created, but initial service location could not be saved.", error);
    }
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customer.id}`);
  revalidatePath("/admin/jobs");
  redirect(`/admin/customers/${customer.id}?created=1`);
}

export async function updateCustomer(
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
    return { status: "error", message: "Sign in before editing CRM records." };
  }

  const customerId = cleanText(formData, "customer_id", 80);
  const displayName = cleanText(formData, "display_name", 180);
  const primaryContactName = optionalText(formData, "primary_contact_name", 180);
  const phone = optionalText(formData, "phone", 40);
  const email = normalizeEmail(formData.get("email"));
  const billingAddress = optionalText(formData, "billing_address", 280);
  const organizationId = optionalText(formData, "organization_id", 80);
  const customerType = cleanText(formData, "customer_type", 40) as CustomerType;
  const status = cleanText(formData, "status", 40) as CustomerStatus;
  const note = optionalText(formData, "notes", 1200);

  if (!customerId || !displayName) {
    return { status: "error", message: "Customer name is required." };
  }

  if (!customerTypes.includes(customerType)) {
    return { status: "error", message: "Choose a valid customer type." };
  }

  if (!customerStatuses.includes(status)) {
    return { status: "error", message: "Choose a valid customer status." };
  }

  if (email && !isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address or leave email blank." };
  }

  const { error } = await supabase
    .from("customers")
    .update({
      display_name: displayName,
      primary_contact_name: primaryContactName,
      phone,
      email,
      billing_address: billingAddress,
      organization_id: organizationId,
      customer_type: customerType,
      status,
    })
    .eq("id", customerId);

  if (error) {
    return { status: "error", message: error.message };
  }

  if (note) {
    const { error: noteError } = await supabase.from("notes").insert({
      customer_id: customerId,
      author_user_id: user.id,
      visibility: "internal",
      body: note,
    });

    if (noteError) {
      console.error("Customer saved, but the edit note could not be added.", noteError);
    }
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/edit`);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/invoices");
  redirect(`/admin/customers/${customerId}?updated=1`);
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

function cleanText(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optionalText(formData: FormData, key: string, max: number) {
  return cleanText(formData, key, max) || null;
}

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase() || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
