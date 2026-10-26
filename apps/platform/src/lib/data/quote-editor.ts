import "server-only";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { Customer, DataResult, Organization, OrganizationContact, ServiceLocation } from "@/lib/types/database";

type CustomerOption = Pick<Customer, "id" | "display_name">;
type OrganizationOption = Pick<Organization, "id" | "name">;
type ContactOption = Pick<OrganizationContact, "id" | "organization_id" | "full_name" | "contact_roles" | "email">;
type LocationOption = Pick<ServiceLocation, "id" | "customer_id" | "organization_id" | "label" | "street" | "city" | "state" | "postal_code">;

/** Same caller-RLS choices and filters, only the fields the quote editor uses. */
export async function getQuoteEditorLookups() {
  const db = await createClient();
  const result = <T>(response: { data: unknown; error: { message: string } | null }): DataResult<T[]> => ({
    data: (response.data ?? []) as T[], error: response.error ? safeStaffMessage(response.error.message) : null,
  });
  if (!db) {
    const missing = { data: [], error: { message: "Supabase is not configured." } };
    return { customers: result<CustomerOption>(missing), organizations: result<OrganizationOption>(missing), organizationContacts: result<ContactOption>(missing), serviceLocations: result<LocationOption>(missing) };
  }
  const [customers, organizations, contacts, locations] = await Promise.all([
    db.from("customers").select("id, display_name").is("archived_at", null).order("display_name", { ascending: true }),
    db.from("organizations").select("id, name").is("archived_at", null).order("name"),
    db.from("organization_contacts").select("id, organization_id, full_name, contact_roles, email").eq("is_active", true).order("full_name"),
    db.from("service_locations").select("id, customer_id, organization_id, label, street, city, state, postal_code").is("archived_at", null).order("created_at", { ascending: false }),
  ]);
  return { customers: result<CustomerOption>(customers), organizations: result<OrganizationOption>(organizations), organizationContacts: result<ContactOption>(contacts), serviceLocations: result<LocationOption>(locations) };
}
