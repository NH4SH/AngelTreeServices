"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { OrganizationType } from "@/lib/types/database";
import { recordActivity } from "@/lib/activity-log";

export type OrganizationActionState = { status: "idle" | "success" | "error"; message: string };
const allowedTypes: OrganizationType[] = ["property_manager", "hoa", "commercial", "nonprofit", "church", "municipality", "general_contractor", "apartment_community", "real_estate", "other"];

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
  const { data: organization, error } = await supabase.from("organizations").insert({
    name, organization_type: organizationType, billing_email: optional(formData, "billing_email", 180),
    billing_phone: optional(formData, "billing_phone", 40), billing_address: optional(formData, "billing_address", 240),
    notes: optional(formData, "notes", 1000),
    payment_terms: optional(formData, "payment_terms", 160),
    status: ["active", "inactive", "archived"].includes(text(formData, "status", 20)) ? text(formData, "status", 20) : "active",
    tax_exempt: formData.get("tax_exempt") === "on",
    tax_reference: optional(formData, "tax_reference", 160),
  }).select("id").single();
  if (error || !organization) return { status: "error", message: safeStaffMessage(error?.message ?? "Organization was not created.") };
  await recordActivity(supabase, {
    actionCategory: "customers",
    actorUserId: await getUserId(supabase),
    destinationPath: `/admin/organizations/${organization.id}`,
    eventType: "organization_created",
    organizationId: organization.id,
    recordLabel: name,
    summary: `${name} was added as an organization.`,
    subjectId: organization.id,
    subjectType: "organization",
  });
  revalidatePath("/admin/organizations"); revalidatePath("/admin");
  return { status: "success", message: "Organization saved." };
}

export async function updateOrganization(_state: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const supabase = await getClient();
  if (!supabase) return { status: "error", message: "Sign in before editing organization records." };

  const organizationId = text(formData, "organization_id", 80);
  const name = text(formData, "name", 160);
  const organizationType = text(formData, "organization_type", 30) as OrganizationType;
  const billingEmail = normalizeEmail(formData.get("billing_email"));

  if (!organizationId || !name || !allowedTypes.includes(organizationType)) {
    return { status: "error", message: "Organization name and type are required." };
  }

  if (billingEmail && !isValidEmail(billingEmail)) {
    return { status: "error", message: "Enter a valid billing email address or leave email blank." };
  }

  const existing = await supabase
    .from("organizations")
    .select("name, organization_type, billing_email, billing_phone, billing_address, status")
    .eq("id", organizationId)
    .single();
  if (existing.error || !existing.data) {
    return { status: "error", message: safeStaffMessage(existing.error?.message ?? "Organization not found.") };
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      organization_type: organizationType,
      billing_email: billingEmail,
      billing_phone: optional(formData, "billing_phone", 40),
      billing_address: optional(formData, "billing_address", 240),
      notes: optional(formData, "notes", 1000),
      payment_terms: optional(formData, "payment_terms", 160),
      status: ["active", "inactive", "archived"].includes(text(formData, "status", 20)) ? text(formData, "status", 20) : "active",
      tax_exempt: formData.get("tax_exempt") === "on",
      tax_reference: optional(formData, "tax_reference", 160),
    })
    .eq("id", organizationId);

  if (error) return { status: "error", message: safeStaffMessage(error.message) };
  await recordActivity(supabase, {
    actionCategory: "customers",
    actorUserId: await getUserId(supabase),
    changes: {
      billing_address: { before: existing.data.billing_address, after: optional(formData, "billing_address", 240) },
      billing_email: { before: existing.data.billing_email, after: billingEmail },
      billing_phone: { before: existing.data.billing_phone, after: optional(formData, "billing_phone", 40) },
      name: { before: existing.data.name, after: name },
      organization_type: { before: existing.data.organization_type, after: organizationType },
      status: { before: existing.data.status, after: text(formData, "status", 20) || "active" },
    },
    destinationPath: `/admin/organizations/${organizationId}`,
    eventType: "organization_updated",
    organizationId,
    recordLabel: name,
    summary: `${name}'s organization record was updated.`,
    subjectId: organizationId,
    subjectType: "organization",
  });

  revalidatePath("/admin/organizations");
  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath(`/admin/organizations/${organizationId}/edit`);
  revalidatePath("/admin/customers");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/invoices");
  redirect(`/admin/organizations/${organizationId}?updated=1`);
}

export async function createOrganizationContact(_state: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const supabase = await getClient();
  if (!supabase) return { status: "error", message: "Sign in before adding contacts." };
  const organizationId = text(formData, "organization_id", 60);
  const fullName = text(formData, "full_name", 160);
  const email = normalizeEmail(formData.get("email"));
  if (!organizationId || !fullName) return { status: "error", message: "Organization and contact name are required." };
  if (email && !isValidEmail(email)) return { status: "error", message: "Enter a valid contact email or leave it blank." };
  const serviceLocationId = optional(formData, "service_location_id", 80);
  if (serviceLocationId) {
    const { data: location, error: locationError } = await supabase.from("service_locations").select("id").eq("id", serviceLocationId).eq("organization_id", organizationId).maybeSingle();
    if (locationError || !location) return { status: "error", message: locationError?.message ?? "The selected property does not belong to this organization." };
  }
  const { data: contact, error } = await supabase.from("organization_contacts").insert({
    organization_id: organizationId, full_name: fullName, email,
    phone: optional(formData, "phone", 40), role_title: optional(formData, "role_title", 120),
    receives_invoices: formData.get("receives_invoices") === "on", receives_job_updates: formData.get("receives_job_updates") === "on",
    contact_roles: formData.getAll("contact_roles").map(String).filter((role) => allowedContactRoles.includes(role)),
    preferred_contact_method: optional(formData, "preferred_contact_method", 20),
    service_location_id: serviceLocationId,
    notes: optional(formData, "contact_notes", 1000),
  }).select("id").single();
  if (error || !contact) return { status: "error", message: safeStaffMessage(error?.message ?? "Organization contact was not created.") };
  await recordActivity(supabase, { actionCategory: "customers", actorUserId: await getUserId(supabase), destinationPath: `/admin/organizations/${organizationId}`, eventType: "organization_contact_created", organizationId, recordLabel: fullName, summary: `${fullName} was added as an organization contact.`, subjectId: contact.id, subjectType: "organization_contact" });
  revalidatePath(`/admin/organizations/${organizationId}`);
  return { status: "success", message: "Organization contact saved." };
}

export async function createOrganizationProperty(_state: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const supabase = await getClient();
  if (!supabase) return { status: "error", message: "Sign in before adding properties." };
  const organizationId = text(formData, "organization_id", 60); const customerId = text(formData, "customer_id", 60);
  const street = text(formData, "street", 180); const city = text(formData, "city", 100);
  if (!organizationId || !street || !city) return { status: "error", message: "Organization, street, and city are required." };
  const { data: location, error } = await supabase.from("service_locations").insert({
    organization_id: organizationId, customer_id: customerId || null, label: optional(formData, "label", 120),
    street, city, state: text(formData, "state", 30) || "VA", postal_code: optional(formData, "postal_code", 20),
    service_notes: optional(formData, "service_notes", 600),
  }).select("id").single();
  if (error || !location) return { status: "error", message: safeStaffMessage(error?.message ?? "Property was not created.") };
  await recordActivity(supabase, { actionCategory: "customers", actorUserId: await getUserId(supabase), destinationPath: `/admin/organizations/${organizationId}`, eventType: "service_location_created", organizationId, recordLabel: street, summary: `${street}, ${city} was added as a service location.`, subjectId: location.id, subjectType: "service_location" });
  revalidatePath(`/admin/organizations/${organizationId}`); revalidatePath("/admin/jobs");
  return { status: "success", message: "Organization property saved." };
}

function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function normalizeEmail(value: FormDataEntryValue | null) { return String(value ?? "").trim().toLowerCase() || null; }
function isValidEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
const allowedContactRoles = ["primary", "billing", "property_manager", "onsite", "approval_authority", "board_representative", "accounts_payable", "maintenance", "emergency", "other"];

async function getUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
