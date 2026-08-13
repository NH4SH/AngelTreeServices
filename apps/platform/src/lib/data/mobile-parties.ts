import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformRoleName } from "@/lib/auth/roles";
import {
  cleanMobileSearchTerm,
  mergeMobilePartyResults,
  toMobileServiceLocation,
  type MobilePartyDetail,
  type MobilePartyKind,
  type MobilePartySearchResult,
  type MobilePartyWorkSummary,
  type MobileRecordSummary,
} from "@/lib/api/mobile-field-contract";

const resultLimit = 25;
const officeRecordRoles: PlatformRoleName[] = ["owner", "admin", "payroll_admin", "estimator"];

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

  return mergeMobilePartyResults(direct, byLocation, resultLimit);
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

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}
