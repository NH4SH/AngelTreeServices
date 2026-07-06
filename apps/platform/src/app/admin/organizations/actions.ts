"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationType } from "@/lib/types/database";

export type OrganizationActionState = { status: "idle" | "success" | "error"; message: string };
const allowedTypes: OrganizationType[] = ["property_manager", "hoa", "commercial", "other"];

async function getClient() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function createOrganization(_state: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const supabase = await getClient();
  if (!supabase) return { status: "error", message: "Sign in before adding organization records." };
  const name = text(formData, "name", 160);
  const organizationType = text(formData, "organization_type", 30) as OrganizationType;
  if (!name || !allowedTypes.includes(organizationType)) return { status: "error", message: "Organization name and type are required." };
  const { error } = await supabase.from("organizations").insert({
    name, organization_type: organizationType, billing_email: optional(formData, "billing_email", 180),
    billing_phone: optional(formData, "billing_phone", 40), billing_address: optional(formData, "billing_address", 240),
    notes: optional(formData, "notes", 1000),
  });
  if (error) return { status: "error", message: error.message };
  revalidatePath("/admin/organizations"); revalidatePath("/admin");
  return { status: "success", message: "Organization saved." };
}

export async function createOrganizationContact(_state: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const supabase = await getClient();
  if (!supabase) return { status: "error", message: "Sign in before adding contacts." };
  const organizationId = text(formData, "organization_id", 60);
  const fullName = text(formData, "full_name", 160);
  if (!organizationId || !fullName) return { status: "error", message: "Organization and contact name are required." };
  const { error } = await supabase.from("organization_contacts").insert({
    organization_id: organizationId, full_name: fullName, email: optional(formData, "email", 180),
    phone: optional(formData, "phone", 40), role_title: optional(formData, "role_title", 120),
    receives_invoices: formData.get("receives_invoices") === "on", receives_job_updates: formData.get("receives_job_updates") === "on",
  });
  if (error) return { status: "error", message: error.message };
  revalidatePath(`/admin/organizations/${organizationId}`);
  return { status: "success", message: "Organization contact saved." };
}

export async function createOrganizationProperty(_state: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const supabase = await getClient();
  if (!supabase) return { status: "error", message: "Sign in before adding properties." };
  const organizationId = text(formData, "organization_id", 60); const customerId = text(formData, "customer_id", 60);
  const street = text(formData, "street", 180); const city = text(formData, "city", 100);
  if (!organizationId || !customerId || !street || !city) return { status: "error", message: "Linked customer, street, and city are required." };
  const { error } = await supabase.from("service_locations").insert({
    organization_id: organizationId, customer_id: customerId, label: optional(formData, "label", 120),
    street, city, state: text(formData, "state", 30) || "VA", postal_code: optional(formData, "postal_code", 20),
    service_notes: optional(formData, "service_notes", 600),
  });
  if (error) return { status: "error", message: error.message };
  revalidatePath(`/admin/organizations/${organizationId}`); revalidatePath("/admin/jobs");
  return { status: "success", message: "Organization property saved." };
}

function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
