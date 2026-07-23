"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { CustomerStatus, CustomerType } from "@/lib/types/database";

export type CustomerActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialError = "Unable to save customer. Check Supabase configuration and RLS policies.";
const customerTypes: CustomerType[] = ["residential", "commercial", "property_manager", "hoa"];
const customerStatuses: CustomerStatus[] = ["active", "inactive", "archived"];
const newServiceLocationPrimaryValue = "__new_service_location";

type ServiceLocationInput = {
  id: string;
  label: string | null;
  street: string;
  city: string;
  state: string;
  postalCode: string | null;
  accessNotes: string | null;
  gateCode: string | null;
  serviceNotes: string | null;
  remove: boolean;
};

type NewServiceLocationInput = Omit<ServiceLocationInput, "id" | "remove"> & {
  hasAnyValue: boolean;
};

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
  const serviceLocations = getServiceLocationInputs(formData);
  const newServiceLocation = getNewServiceLocationInput(formData);
  let primaryServiceLocationId = cleanText(formData, "primary_service_location_id", 120);
  const retainedLocationCount = serviceLocations.filter((location) => !location.remove).length;

  if (primaryServiceLocationId === newServiceLocationPrimaryValue && !newServiceLocation.hasAnyValue) {
    primaryServiceLocationId = "";
  }

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

  for (const location of serviceLocations) {
    if (!location.remove && (!location.street || !location.city)) {
      return { status: "error", message: "Street and city are required for every saved service location." };
    }
  }

  if (newServiceLocation.hasAnyValue && (!newServiceLocation.street || !newServiceLocation.city)) {
    return { status: "error", message: "Street and city are required when adding a service location." };
  }

  if (!primaryServiceLocationId && retainedLocationCount === 1 && !newServiceLocation.hasAnyValue) {
    primaryServiceLocationId = serviceLocations.find((location) => !location.remove)?.id ?? "";
  }

  if (!primaryServiceLocationId && retainedLocationCount === 0 && newServiceLocation.hasAnyValue) {
    primaryServiceLocationId = newServiceLocationPrimaryValue;
  }

  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from("customers")
    .select("id, organization_id")
    .eq("id", customerId)
    .single();

  if (existingCustomerError || !existingCustomer) {
    return { status: "error", message: existingCustomerError?.message ?? "Customer not found or no access." };
  }

  const existingLocationIds = serviceLocations.map((location) => location.id);
  if (existingLocationIds.length > 0) {
    const { data: existingLocations, error: locationLookupError } = await supabase
      .from("service_locations")
      .select("id, customer_id")
      .in("id", existingLocationIds);

    if (locationLookupError) {
      return { status: "error", message: safeStaffMessage(locationLookupError.message) };
    }

    const ownedLocationIds = new Set((existingLocations ?? []).filter((location) => location.customer_id === customerId).map((location) => location.id));
    const hasForeignLocation = existingLocationIds.some((id) => !ownedLocationIds.has(id));
    if (hasForeignLocation) {
      return { status: "error", message: "One service location does not belong to this customer." };
    }
  }

  for (const location of serviceLocations) {
    if (!location.remove) {
      continue;
    }

    const removalCheck = await canRemoveServiceLocation(supabase, location.id);
    if (!removalCheck.ok) {
      return { status: "error", message: safeStaffMessage(removalCheck.message) };
    }
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
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  for (const location of serviceLocations) {
    if (location.remove) {
      const { error: removeError } = await supabase
        .from("service_locations")
        .delete()
        .eq("id", location.id)
        .eq("customer_id", customerId);

      if (removeError) {
        return { status: "error", message: `Customer saved, but a service location could not be removed: ${removeError.message}` };
      }
      continue;
    }

    const { error: locationError } = await supabase
      .from("service_locations")
      .update({
        label: getServiceLocationLabel(location.label, location.id, primaryServiceLocationId),
        street: location.street,
        city: location.city,
        state: location.state || "VA",
        postal_code: location.postalCode,
        access_notes: location.accessNotes,
        gate_code: location.gateCode,
        service_notes: location.serviceNotes,
        organization_id: organizationId,
      })
      .eq("id", location.id)
      .eq("customer_id", customerId);

    if (locationError) {
      return { status: "error", message: `Customer saved, but a service location could not be updated: ${locationError.message}` };
    }
  }

  if (newServiceLocation.hasAnyValue) {
    const { error: newLocationError } = await supabase.from("service_locations").insert({
      customer_id: customerId,
      organization_id: organizationId,
      label: primaryServiceLocationId === newServiceLocationPrimaryValue
        ? (newServiceLocation.label || "Primary service location")
        : newServiceLocation.label,
      street: newServiceLocation.street,
      city: newServiceLocation.city,
      state: newServiceLocation.state || "VA",
      postal_code: newServiceLocation.postalCode,
      access_notes: newServiceLocation.accessNotes,
      gate_code: newServiceLocation.gateCode,
      service_notes: newServiceLocation.serviceNotes,
    });

    if (newLocationError) {
      return { status: "error", message: `Customer saved, but the new service location could not be added: ${newLocationError.message}` };
    }
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
  revalidatePath("/admin/organizations");
  if (existingCustomer.organization_id) {
    revalidatePath(`/admin/organizations/${existingCustomer.organization_id}`);
  }
  if (organizationId) {
    revalidatePath(`/admin/organizations/${organizationId}`);
  }
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
    return { status: "error", message: safeStaffMessage(error.message) };
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

function getServiceLocationInputs(formData: FormData): ServiceLocationInput[] {
  const ids = formData.getAll("service_location_id");
  const labels = formData.getAll("service_location_label");
  const streets = formData.getAll("service_location_street");
  const cities = formData.getAll("service_location_city");
  const states = formData.getAll("service_location_state");
  const postalCodes = formData.getAll("service_location_postal_code");
  const accessNotes = formData.getAll("service_location_access_notes");
  const gateCodes = formData.getAll("service_location_gate_code");
  const serviceNotes = formData.getAll("service_location_service_notes");
  const removeIds = new Set(formData.getAll("remove_service_location").map((value) => String(value)));

  return ids
    .map((idValue, index) => ({
      id: String(idValue ?? "").trim(),
      label: arrayOptionalText(labels, index, 120),
      street: arrayText(streets, index, 180),
      city: arrayText(cities, index, 100),
      state: arrayText(states, index, 30) || "VA",
      postalCode: arrayOptionalText(postalCodes, index, 20),
      accessNotes: arrayOptionalText(accessNotes, index, 600),
      gateCode: arrayOptionalText(gateCodes, index, 80),
      serviceNotes: arrayOptionalText(serviceNotes, index, 600),
      remove: removeIds.has(String(idValue ?? "").trim()),
    }))
    .filter((location) => location.id);
}

function getNewServiceLocationInput(formData: FormData): NewServiceLocationInput {
  const location = {
    label: optionalText(formData, "new_service_location_label", 120),
    street: cleanText(formData, "new_service_location_street", 180),
    city: cleanText(formData, "new_service_location_city", 100),
    state: cleanText(formData, "new_service_location_state", 30) || "VA",
    postalCode: optionalText(formData, "new_service_location_postal_code", 20),
    accessNotes: optionalText(formData, "new_service_location_access_notes", 600),
    gateCode: optionalText(formData, "new_service_location_gate_code", 80),
    serviceNotes: optionalText(formData, "new_service_location_service_notes", 600),
  };

  return {
    ...location,
    hasAnyValue: Object.values(location).some((value) => Boolean(value && value !== "VA")),
  };
}

function arrayText(values: FormDataEntryValue[], index: number, max: number) {
  return String(values[index] ?? "").trim().slice(0, max);
}

function arrayOptionalText(values: FormDataEntryValue[], index: number, max: number) {
  return arrayText(values, index, max) || null;
}

function getServiceLocationLabel(label: string | null, locationId: string, primaryServiceLocationId: string) {
  if (locationId === primaryServiceLocationId) {
    return label || "Primary service location";
  }

  return label === "Primary service location" ? "Service location" : label;
}

async function canRemoveServiceLocation(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  serviceLocationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const checks = [
    { table: "jobs", label: "job or work order" },
    { table: "quotes", label: "quote" },
    { table: "appointments", label: "appointment" },
    { table: "schedule_events", label: "schedule event" },
  ] as const;

  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select("id")
      .eq("service_location_id", serviceLocationId)
      .limit(1);

    if (error) {
      return { ok: false, message: `Could not check linked ${check.label} records before removing this service location: ${error.message}` };
    }

    if ((data ?? []).length > 0) {
      return {
        ok: false,
        message: `This service location is linked to a ${check.label}. Keep it and update the address instead of removing it.`,
      };
    }
  }

  return { ok: true };
}
