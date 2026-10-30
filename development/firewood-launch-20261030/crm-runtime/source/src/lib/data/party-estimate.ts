import "server-only";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import {
  chooseLocation,
  chooseOrganizationContact,
  type EstimateContactOption,
  type EstimateLocationOption,
  type PartyEstimatePrefill,
} from "@/lib/schedule/party-estimate";

type SourceKind = "customer" | "organization";

export async function getPartyEstimatePrefill(kind: SourceKind, sourceId: string) {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  if (!isUuid(sourceId)) return { data: null, error: `Choose a valid ${kind}.` };

  if (kind === "customer") {
    const [{ data: customer, error }, { data: locations }, { data: jobs }, { data: notes }] = await Promise.all([
      supabase.from("customers").select("id, display_name, primary_contact_name, email, phone, lead_sources(name)").eq("id", sourceId).is("archived_at", null).maybeSingle(),
      supabase.from("service_locations").select("id, label, street, city, state, postal_code, access_notes, service_notes").eq("customer_id", sourceId).is("archived_at", null).order("created_at"),
      supabase.from("jobs").select("service_type, requested_scope, service_location_id").eq("customer_id", sourceId).is("archived_at", null).in("status", ["new_lead", "estimate_scheduled"]).order("submitted_at", { ascending: false }).limit(1),
      supabase.from("notes").select("body").eq("customer_id", sourceId).eq("visibility", "customer_visible").order("created_at", { ascending: false }).limit(1),
    ]);
    if (error || !customer) return { data: null, error: safeStaffMessage(error?.message, "Customer not found or no access.") };

    const locationOptions = mapLocations(locations ?? []);
    const job = jobs?.[0] ?? null;
    const selected = locationOptions.find((location) => location.id === job?.service_location_id) ?? chooseLocation(locationOptions);
    return {
      data: {
        contactName: customer.primary_contact_name || customer.display_name,
        contactOptions: [],
        email: customer.email || "",
        eventTitle: `Estimate - ${customer.display_name}`,
        leadSource: relationName(customer.lead_sources) || "Existing customer",
        locationOptions,
        notes: notes?.[0]?.body || "",
        organizationId: "",
        partyLabel: customer.display_name,
        partyType: "customer",
        phone: customer.phone || "",
        requestedScope: job?.requested_scope || "",
        selectedContactId: "",
        selectedLocationId: selected?.id || "",
        serviceType: job?.service_type || "other",
        sourceCustomerId: customer.id,
        sourceRequestKey: randomUUID(),
      } satisfies PartyEstimatePrefill,
      error: null,
    };
  }

  const [{ data: organization, error }, { data: contacts }, { data: locations }, { data: jobs }] = await Promise.all([
    supabase.from("organizations").select("id, name, billing_email, billing_phone, notes").eq("id", sourceId).is("archived_at", null).maybeSingle(),
    supabase.from("organization_contacts").select("id, full_name, email, phone, contact_roles, is_active").eq("organization_id", sourceId).eq("is_active", true).order("full_name"),
    supabase.from("service_locations").select("id, label, street, city, state, postal_code, access_notes, service_notes").eq("organization_id", sourceId).is("archived_at", null).order("created_at"),
    supabase.from("jobs").select("service_type, requested_scope, service_location_id, onsite_contact_id, property_manager_contact_id").eq("organization_id", sourceId).is("archived_at", null).in("status", ["new_lead", "estimate_scheduled"]).order("submitted_at", { ascending: false }).limit(1),
  ]);
  if (error || !organization) return { data: null, error: safeStaffMessage(error?.message, "Organization not found or no access.") };

  const contactOptions: EstimateContactOption[] = (contacts ?? []).map((contact) => ({
    email: contact.email || "",
    id: contact.id,
    label: contact.full_name,
    phone: contact.phone || "",
  }));
  const job = jobs?.[0] ?? null;
  const selectedContact = (contacts ?? []).find((contact) => contact.id === (job?.onsite_contact_id || job?.property_manager_contact_id))
    ?? chooseOrganizationContact(contacts ?? []);
  const locationOptions = mapLocations(locations ?? []);
  const selectedLocation = locationOptions.find((location) => location.id === job?.service_location_id) ?? chooseLocation(locationOptions);

  return {
    data: {
      contactName: selectedContact?.full_name || organization.name,
      contactOptions,
      email: selectedContact?.email || organization.billing_email || "",
      eventTitle: `Estimate - ${organization.name}`,
      leadSource: "Existing organization",
      locationOptions,
      notes: organization.notes || "",
      organizationId: organization.id,
      partyLabel: organization.name,
      partyType: "organization",
      phone: selectedContact?.phone || organization.billing_phone || "",
      requestedScope: job?.requested_scope || "",
      selectedContactId: selectedContact?.id || "",
      selectedLocationId: selectedLocation?.id || "",
      serviceType: job?.service_type || "other",
      sourceCustomerId: "",
      sourceRequestKey: randomUUID(),
    } satisfies PartyEstimatePrefill,
    error: null,
  };
}

function mapLocations(locations: {
  id: string;
  label: string | null;
  street: string;
  city: string;
  state: string;
  postal_code: string | null;
  access_notes: string | null;
  service_notes: string | null;
}[]): EstimateLocationOption[] {
  return locations.map((location) => ({
    accessNotes: location.access_notes || "",
    city: location.city,
    id: location.id,
    label: location.label || [location.street, location.city].filter(Boolean).join(", "),
    postalCode: location.postal_code || "",
    serviceNotes: location.service_notes || "",
    state: location.state,
    street: location.street,
  }));
}

function relationName(value: { name?: string | null } | { name?: string | null }[] | null) {
  return Array.isArray(value) ? value[0]?.name || "" : value?.name || "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
