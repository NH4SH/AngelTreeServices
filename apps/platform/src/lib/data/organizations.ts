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
  ChangeOrderWithRelations,
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
  const [jobs, quotes, invoices] = await Promise.all([
    supabase.from("jobs").select("*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("quotes").select("*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*, customers(id, display_name, phone, email), invoice_line_items(*), payments(*)").eq("organization_id", organizationId).order("created_at", { ascending: false }),
  ]);
  const changeOrders = await supabase.from("change_orders").select("*, change_order_line_items(*)").eq("organization_id", organizationId).order("created_at", { ascending: false });
  const firstError = contacts.error?.message ?? customers.error?.message ?? locations.error?.message ?? jobs.error?.message ?? quotes.error?.message ?? invoices.error?.message ?? changeOrders.error?.message ?? null;

  return {
    data: {
      organization: organization as Organization,
      contacts: (contacts.data ?? []) as OrganizationContact[],
      customers: (customers.data ?? []) as Customer[],
      serviceLocations: (locations.data ?? []) as ServiceLocation[],
      jobs: (jobs.data ?? []) as JobWithRelations[],
      quotes: (quotes.data ?? []) as QuoteWithRelations[],
      invoices: (invoices.data ?? []) as InvoiceWithRelations[],
      changeOrders: (changeOrders.data ?? []) as ChangeOrderWithRelations[],
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

  const [jobs, quotes, invoices, locations, changeOrders] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes)")
      .not("organization_id", "is", null),
    supabase
      .from("quotes")
      .select("*, customers(id, display_name, phone, email), service_locations(id, label, street, city, state, postal_code, access_notes, service_notes), quote_line_items(*)")
      .not("organization_id", "is", null),
    supabase
      .from("invoices")
      .select("*, customers(id, display_name, phone, email), invoice_line_items(*), payments(*)")
      .not("organization_id", "is", null),
    supabase.from("service_locations").select("*").not("organization_id", "is", null),
    supabase.from("change_orders").select("*, change_order_line_items(*)").not("organization_id", "is", null),
  ]);

  const firstError = jobs.error?.message ?? quotes.error?.message ?? invoices.error?.message ?? locations.error?.message ?? changeOrders.error?.message ?? null;
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
    serviceLocations: ((locations.data ?? []) as ServiceLocation[]).filter((location) => location.organization_id === organization.id),
    jobs: ((jobs.data ?? []) as JobWithRelations[]).filter((job) => job.organization_id === organization.id || customerToOrganization.get(job.customer_id) === organization.id),
    quotes: ((quotes.data ?? []) as QuoteWithRelations[]).filter((quote) => quote.organization_id === organization.id || customerToOrganization.get(quote.customer_id) === organization.id),
    invoices: ((invoices.data ?? []) as InvoiceWithRelations[]).filter((invoice) => invoice.organization_id === organization.id || customerToOrganization.get(invoice.customer_id) === organization.id),
    changeOrders: ((changeOrders.data ?? []) as ChangeOrderWithRelations[]).filter((order) => order.organization_id === organization.id),
  }));

  return {
    data: details,
    error: null,
  };
}
