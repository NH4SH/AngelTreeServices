import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformRoleName } from "@/lib/auth/roles";
import {
  cleanMobileSearchTerm,
  mergeMobilePartyResults,
  mergeMobilePartyDirectoryRows,
  toMobileServiceLocation,
  type MobilePartyCreateInput,
  type MobilePartyDirectoryPage,
  type MobilePartyDirectorySourceRow,
  type MobilePartyDetail,
  type MobilePartyKind,
  type MobilePartySearchResult,
  type MobilePartyWorkSummary,
  type MobileRecordSummary,
} from "@/lib/api/mobile-field-contract";

const resultLimit = 25;
const officeRecordRoles: PlatformRoleName[] = ["owner", "admin", "payroll_admin", "estimator"];

type DirectoryCursor = { customerOffset: number; organizationOffset: number };

export async function listMobileParties(
  supabase: SupabaseClient<any, "public", any>,
  { cursor, limit }: { cursor: string | null; limit: number },
): Promise<MobilePartyDirectoryPage> {
  const offsets = decodeDirectoryCursor(cursor);
  const [customers, organizations] = await Promise.all([
    supabase
      .from("customers")
      .select("id, display_name, primary_contact_name, email, phone, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offsets.customerOffset, offsets.customerOffset + limit),
    supabase
      .from("organizations")
      .select("id, name, billing_email, billing_phone, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offsets.organizationOffset, offsets.organizationOffset + limit),
  ]);

  const firstError = customers.error ?? organizations.error;
  if (firstError) throw firstError;

  const customerRows = (customers.data ?? []).map((customer): MobilePartyDirectorySourceRow => ({
    ...mapCustomerSearchResult(customer, null),
    updatedAt: customer.updated_at,
  }));
  const organizationRows = (organizations.data ?? []).map((organization): MobilePartyDirectorySourceRow => ({
    ...mapOrganizationSearchResult(organization, null),
    updatedAt: organization.updated_at,
  }));
  const merged = mergeMobilePartyDirectoryRows(customerRows, organizationRows, limit);
  const customerIDs = merged.rows.filter((row) => row.kind === "customer").map((row) => row.id);
  const organizationIDs = merged.rows.filter((row) => row.kind === "organization").map((row) => row.id);
  const addressByParty = await loadPartyAddresses(supabase, customerIDs, organizationIDs);
  const results = merged.rows.map(({ updatedAt: _updatedAt, ...row }) => ({
    ...row,
    address: addressByParty.get(`${row.kind}:${row.id}`) ?? null,
  }));

  return {
    results,
    nextCursor: merged.hasMore ? encodeDirectoryCursor({
      customerOffset: offsets.customerOffset + merged.consumedCustomers,
      organizationOffset: offsets.organizationOffset + merged.consumedOrganizations,
    }) : null,
  };
}

export async function createMobileParty(
  supabase: SupabaseClient<any, "public", any>,
  input: MobilePartyCreateInput,
): Promise<MobilePartySearchResult> {
  if (input.kind === "customer") {
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        display_name: input.name,
        primary_contact_name: input.contactName || input.name,
        email: input.email,
        phone: input.phone,
        customer_type: "residential",
      })
      .select("id, display_name, primary_contact_name, email, phone")
      .single();
    if (error || !customer) throw error ?? new Error("Customer was not created.");

    if (input.serviceLocation) {
      const { error: locationError } = await supabase.from("service_locations").insert({
        customer_id: customer.id,
        label: "Primary service location",
        street: input.serviceLocation.street,
        city: input.serviceLocation.city,
        state: input.serviceLocation.state,
        postal_code: input.serviceLocation.postalCode,
      });
      if (locationError) {
        await supabase.from("customers").delete().eq("id", customer.id);
        throw locationError;
      }
    }

    return mapCustomerSearchResult(customer, input.serviceLocation ? formatLocation(input.serviceLocation) : null);
  }

  const { data: organization, error } = await supabase
    .from("organizations")
    .insert({
      name: input.name,
      organization_type: input.organizationType,
      billing_email: input.email,
      billing_phone: input.phone,
      status: "active",
    })
    .select("id, name, billing_email, billing_phone")
    .single();
  if (error || !organization) throw error ?? new Error("Organization was not created.");

  let locationID: string | null = null;
  if (input.serviceLocation) {
    const { data: location, error: locationError } = await supabase
      .from("service_locations")
      .insert({
        organization_id: organization.id,
        label: "Primary service location",
        street: input.serviceLocation.street,
        city: input.serviceLocation.city,
        state: input.serviceLocation.state,
        postal_code: input.serviceLocation.postalCode,
      })
      .select("id")
      .single();
    if (locationError || !location) {
      await supabase.from("organizations").delete().eq("id", organization.id);
      throw locationError ?? new Error("Organization property was not created.");
    }
    locationID = location.id;
  }

  if (input.contactName) {
    const { error: contactError } = await supabase.from("organization_contacts").insert({
      organization_id: organization.id,
      service_location_id: locationID,
      full_name: input.contactName,
      email: input.email,
      phone: input.phone,
      contact_roles: ["primary"],
      preferred_contact_method: input.email ? "email" : input.phone ? "phone" : null,
      receives_invoices: false,
      receives_job_updates: true,
    });
    if (contactError) {
      if (locationID) await supabase.from("service_locations").delete().eq("id", locationID);
      await supabase.from("organizations").delete().eq("id", organization.id);
      throw contactError;
    }
  }

  return {
    ...mapOrganizationSearchResult(
      organization,
      input.serviceLocation ? formatLocation(input.serviceLocation) : null,
    ),
    contactName: input.contactName,
  };
}

export async function searchMobileParties(
  supabase: SupabaseClient<any, "public", any>,
  rawQuery: string | null,
) {
  const query = cleanMobileSearchTerm(rawQuery);
  if (query.length < 2) return [];

  const pattern = `%${query}%`;
  const [customers, organizations, matchingLocations] = await Promise.all([
    supabase
      .from("customers")
      .select("id, display_name, primary_contact_name, email, phone")
      .is("archived_at", null)
      .or(`display_name.ilike.${pattern},primary_contact_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("display_name")
      .limit(resultLimit),
    supabase
      .from("organizations")
      .select("id, name, billing_email, billing_phone")
      .is("archived_at", null)
      .or(`name.ilike.${pattern},billing_email.ilike.${pattern},billing_phone.ilike.${pattern}`)
      .order("name")
      .limit(resultLimit),
    supabase
      .from("service_locations")
      .select("id, customer_id, organization_id, label, street, city, state, postal_code")
      .is("archived_at", null)
      .or(`street.ilike.${pattern},city.ilike.${pattern},postal_code.ilike.${pattern},label.ilike.${pattern}`)
      .limit(resultLimit),
  ]);

  const firstError = customers.error ?? organizations.error ?? matchingLocations.error;
  if (firstError) throw firstError;

  const locationRows = matchingLocations.data ?? [];
  const customerIDs = unique(locationRows.map((location) => location.customer_id));
  const organizationIDs = unique(locationRows.map((location) => location.organization_id));
  const [locationCustomers, locationOrganizations] = await Promise.all([
    customerIDs.length
      ? supabase.from("customers").select("id, display_name, primary_contact_name, email, phone").in("id", customerIDs)
      : Promise.resolve({ data: [], error: null }),
    organizationIDs.length
      ? supabase.from("organizations").select("id, name, billing_email, billing_phone").in("id", organizationIDs)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = locationCustomers.error ?? locationOrganizations.error;
  if (relatedError) throw relatedError;

  const addressByParty = new Map<string, string>();
  locationRows.forEach((location) => {
    const mapped = toMobileServiceLocation(location);
    if (location.organization_id) addressByParty.set(`organization:${location.organization_id}`, mapped.fullAddress);
    if (location.customer_id) addressByParty.set(`customer:${location.customer_id}`, mapped.fullAddress);
  });

  const direct = [
    ...(customers.data ?? []).map((customer) => mapCustomerSearchResult(customer, null)),
    ...(organizations.data ?? []).map((organization) => mapOrganizationSearchResult(organization, null)),
  ];
  const byLocation = [
    ...(locationCustomers.data ?? []).map((customer) => mapCustomerSearchResult(
      customer,
      addressByParty.get(`customer:${customer.id}`) ?? null,
    )),
    ...(locationOrganizations.data ?? []).map((organization) => mapOrganizationSearchResult(
      organization,
      addressByParty.get(`organization:${organization.id}`) ?? null,
    )),
  ];

  const merged = mergeMobilePartyResults(direct, byLocation, resultLimit);
  const addresses = await loadPartyAddresses(
    supabase,
    merged.filter((party) => party.kind === "customer").map((party) => party.id),
    merged.filter((party) => party.kind === "organization").map((party) => party.id),
  );
  return merged.map((party) => ({
    ...party,
    address: party.address ?? addresses.get(`${party.kind}:${party.id}`) ?? null,
  }));
}

export async function getMobilePartyDetail({
  id,
  kind,
  roles,
  supabase,
}: {
  id: string;
  kind: MobilePartyKind;
  roles: PlatformRoleName[];
  supabase: SupabaseClient<any, "public", any>;
}): Promise<MobilePartyDetail | null> {
  const partyColumn = kind === "customer" ? "customer_id" : "organization_id";
  const partyRequest = kind === "customer"
    ? supabase
        .from("customers")
        .select("id, display_name, primary_contact_name, email, phone, status")
        .eq("id", id)
        .is("archived_at", null)
        .maybeSingle()
    : supabase
        .from("organizations")
        .select("id, name, billing_email, billing_phone, status")
        .eq("id", id)
        .is("archived_at", null)
        .maybeSingle();

  const includeOfficeRecords = roles.some((role) => officeRecordRoles.includes(role));
  const [party, locations, contacts, jobs, proposals, invoices] = await Promise.all([
    partyRequest,
    supabase
      .from("service_locations")
      .select("id, label, street, city, state, postal_code, access_notes, gate_code, service_notes")
      .eq(partyColumn, id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    kind === "organization"
      ? supabase
          .from("organization_contacts")
          .select("id, full_name, role_title, email, phone")
          .eq("organization_id", id)
          .eq("is_active", true)
          .order("full_name")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("jobs")
      .select("id, status, service_type, priority, requested_scope, scheduled_start_at, scheduled_end_at, completed_at, service_location_id, service_locations(id, label, street, city, state, postal_code, access_notes, gate_code, service_notes)")
      .eq(partyColumn, id)
      .is("archived_at", null)
      .order("scheduled_start_at", { ascending: false, nullsFirst: false })
      .limit(30),
    includeOfficeRecords
      ? supabase
          .from("quotes")
          .select("id, quote_number, status, sent_at, created_at")
          .eq(partyColumn, id)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    includeOfficeRecords
      ? supabase
          .from("invoices")
          .select("id, invoice_number, status, due_at, created_at")
          .eq(partyColumn, id)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = party.error ?? locations.error ?? contacts.error ?? jobs.error ?? proposals.error ?? invoices.error;
  if (firstError) throw firstError;
  if (!party.data) return null;

  const record = party.data as any;
  const identity = kind === "customer"
    ? {
        id: record.id,
        name: record.display_name,
        contactName: clean(record.primary_contact_name),
        email: clean(record.email),
        phone: clean(record.phone),
        status: record.status,
      }
    : {
        id: record.id,
        name: record.name,
        contactName: clean(contacts.data?.[0]?.full_name),
        email: clean(record.billing_email),
        phone: clean(record.billing_phone),
        status: record.status,
      };

  return {
    ...identity,
    kind,
    serviceLocations: (locations.data ?? []).map(toMobileServiceLocation),
    contacts: (contacts.data ?? []).map((contact) => ({
      id: contact.id,
      name: contact.full_name,
      role: clean(contact.role_title),
      email: clean(contact.email),
      phone: clean(contact.phone),
    })),
    jobs: (jobs.data ?? []).map(mapWorkSummary),
    proposals: (proposals.data ?? []).map((proposal): MobileRecordSummary => ({
      id: proposal.id,
      number: clean(proposal.quote_number),
      status: proposal.status,
      date: proposal.sent_at ?? proposal.created_at,
    })),
    invoices: (invoices.data ?? []).map((invoice): MobileRecordSummary => ({
      id: invoice.id,
      number: clean(invoice.invoice_number),
      status: invoice.status,
      date: invoice.due_at ?? invoice.created_at,
    })),
  };
}

function mapCustomerSearchResult(customer: any, address: string | null): MobilePartySearchResult {
  return {
    id: customer.id,
    kind: "customer",
    name: customer.display_name,
    contactName: clean(customer.primary_contact_name),
    email: clean(customer.email),
    phone: clean(customer.phone),
    address,
  };
}

function mapOrganizationSearchResult(organization: any, address: string | null): MobilePartySearchResult {
  return {
    id: organization.id,
    kind: "organization",
    name: organization.name,
    contactName: null,
    email: clean(organization.billing_email),
    phone: clean(organization.billing_phone),
    address,
  };
}

function mapWorkSummary(job: any): MobilePartyWorkSummary {
  const location = Array.isArray(job.service_locations) ? job.service_locations[0] : job.service_locations;
  return {
    id: job.id,
    status: job.status,
    serviceType: clean(job.service_type),
    priority: job.priority,
    scope: clean(job.requested_scope),
    scheduledStartAt: job.scheduled_start_at,
    scheduledEndAt: job.scheduled_end_at,
    completedAt: job.completed_at,
    serviceLocationId: job.service_location_id,
    serviceLocation: location ? toMobileServiceLocation(location) : null,
  };
}

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function loadPartyAddresses(
  supabase: SupabaseClient<any, "public", any>,
  customerIDs: string[],
  organizationIDs: string[],
) {
  const [customerLocations, organizationLocations] = await Promise.all([
    customerIDs.length
      ? supabase
          .from("service_locations")
          .select("customer_id, label, street, city, state, postal_code, updated_at")
          .in("customer_id", customerIDs)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    organizationIDs.length
      ? supabase
          .from("service_locations")
          .select("organization_id, label, street, city, state, postal_code, updated_at")
          .in("organization_id", organizationIDs)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const firstError = customerLocations.error ?? organizationLocations.error;
  if (firstError) throw firstError;

  const addressByParty = new Map<string, string>();
  for (const location of customerLocations.data ?? []) {
    if (!location.customer_id) continue;
    const key = `customer:${location.customer_id}`;
    if (location.label === "Primary service location" || !addressByParty.has(key)) {
      addressByParty.set(key, toMobileServiceLocation(location as any).fullAddress);
    }
  }
  for (const location of organizationLocations.data ?? []) {
    if (!location.organization_id) continue;
    const key = `organization:${location.organization_id}`;
    if (location.label === "Primary service location" || !addressByParty.has(key)) {
      addressByParty.set(key, toMobileServiceLocation(location as any).fullAddress);
    }
  }
  return addressByParty;
}

function decodeDirectoryCursor(cursor: string | null): DirectoryCursor {
  if (!cursor) return { customerOffset: 0, organizationOffset: 0 };
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<DirectoryCursor>;
    const customerOffset = Number.isInteger(parsed.customerOffset) ? parsed.customerOffset! : -1;
    const organizationOffset = Number.isInteger(parsed.organizationOffset) ? parsed.organizationOffset! : -1;
    if (customerOffset < 0 || organizationOffset < 0 || customerOffset > 1_000_000 || organizationOffset > 1_000_000) {
      throw new Error("Invalid cursor offsets.");
    }
    return { customerOffset, organizationOffset };
  } catch {
    throw new Error("Invalid customer directory cursor.");
  }
}

function encodeDirectoryCursor(cursor: DirectoryCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function formatLocation(location: NonNullable<MobilePartyCreateInput["serviceLocation"]>) {
  const locality = [location.city, location.state].filter(Boolean).join(", ");
  return [location.street, [locality, location.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}
