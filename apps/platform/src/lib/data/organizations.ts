import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  DataResult,
  InvoiceWithRelations,
  JobWithRelations,
  Organization,
  OrganizationContact,
  OrganizationDetail,
  QuoteWithRelations,
  ServiceLocation,
} from "@/lib/types/database";

export async function getOrganizations(): Promise<DataResult<Organization[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const { data, error } = await supabase.from("organizations").select("*").order("name");
  return error ? { data: [], error: error.message } : { data: (data ?? []) as Organization[], error: null };
}

export async function getOrganizationDetail(organizationId: string): Promise<DataResult<OrganizationDetail | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };

  const { data: organization, error: organizationError } = await supabase
    .from("organizations").select("*").eq("id", organizationId).single();
  if (organizationError || !organization) return { data: null, error: organizationError?.message ?? "Organization not found or no access." };

  const [contacts, customers, locations] = await Promise.all([
    supabase.from("organization_contacts").select("*").eq("organization_id", organizationId).order("full_name"),
    supabase.from("customers").select("*").eq("organization_id", organizationId).order("display_name"),
    supabase.from("service_locations").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
  ]);
  const customerIds = (customers.data ?? []).map((customer) => customer.id);
  const [jobs, quotes, invoices] = customerIds.length
    ? await Promise.all([
        supabase.from("jobs").select("*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)").in("customer_id", customerIds).order("created_at", { ascending: false }),
        supabase.from("quotes").select("*, customers(id, display_name, phone, email), quote_line_items(*)").in("customer_id", customerIds).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*, customers(id, display_name, phone, email), invoice_line_items(*), payments(*)").in("customer_id", customerIds).order("created_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const firstError = contacts.error?.message ?? customers.error?.message ?? locations.error?.message ?? jobs.error?.message ?? quotes.error?.message ?? invoices.error?.message ?? null;

  return {
    data: {
      organization: organization as Organization,
      contacts: (contacts.data ?? []) as OrganizationContact[],
      customers: (customers.data ?? []) as Customer[],
      serviceLocations: (locations.data ?? []) as ServiceLocation[],
      jobs: (jobs.data ?? []) as JobWithRelations[],
      quotes: (quotes.data ?? []) as QuoteWithRelations[],
      invoices: (invoices.data ?? []) as InvoiceWithRelations[],
    },
    error: firstError,
  };
}

export async function getOrganizationDashboardSummary() {
  const organizations = await getOrganizations();
  if (organizations.error) return { data: [], error: organizations.error };
  if (organizations.data.length === 0) return { data: [], error: null };

  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const { data: customers, error: customersError } = await supabase
    .from("customers")
    .select("*")
    .not("organization_id", "is", null);

  if (customersError) {
    return { data: [], error: customersError.message };
  }

  const customerIds = (customers ?? []).map((customer) => customer.id);
  if (customerIds.length === 0) return { data: [], error: null };

  const [jobs, quotes, invoices] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)")
      .in("customer_id", customerIds),
    supabase
      .from("quotes")
      .select("*, customers(id, display_name, phone, email), quote_line_items(*)")
      .in("customer_id", customerIds),
    supabase
      .from("invoices")
      .select("*, customers(id, display_name, phone, email), invoice_line_items(*), payments(*)")
      .in("customer_id", customerIds),
  ]);

  const firstError = jobs.error?.message ?? quotes.error?.message ?? invoices.error?.message ?? null;
  if (firstError) {
    return { data: [], error: firstError };
  }

  const customerToOrganization = new Map(
    ((customers ?? []) as Customer[]).map((customer) => [customer.id, customer.organization_id]),
  );

  const details = organizations.data.map((organization) => ({
    organization,
    contacts: [],
    customers: ((customers ?? []) as Customer[]).filter((customer) => customer.organization_id === organization.id),
    serviceLocations: [],
    jobs: ((jobs.data ?? []) as JobWithRelations[]).filter((job) => customerToOrganization.get(job.customer_id) === organization.id),
    quotes: ((quotes.data ?? []) as QuoteWithRelations[]).filter((quote) => customerToOrganization.get(quote.customer_id) === organization.id),
    invoices: ((invoices.data ?? []) as InvoiceWithRelations[]).filter((invoice) => customerToOrganization.get(invoice.customer_id) === organization.id),
  }));

  return {
    data: details,
    error: null,
  };
}
