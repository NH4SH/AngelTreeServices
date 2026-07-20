import "server-only";

import { netSuccessfulPaymentPrincipal } from "@/lib/payments/payment-accounting";

import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  AssignableUser,
  FollowUpTaskWithRelations,
  Organization,
  OrganizationContact,
  RecurringOccurrenceWithRelations,
  RecurringPlanWithRelations,
  ServiceCategory,
  ServiceLocation,
  ServiceRecommendationWithRelations,
} from "@/lib/types/database";

const taskSelect = `
  *,
  customers(id, display_name),
  organizations(id, name),
  service_locations(id, label, street, city),
  assigned_profile:profiles!follow_up_tasks_assigned_to_user_id_fkey(id, full_name, email)
`;

const planSelect = `
  *,
  customers(id, display_name, status),
  organizations(id, name, status),
  service_categories(id, label),
  recurring_plan_locations(
    *,
    service_locations(*),
    onsite_contact:organization_contacts!recurring_plan_locations_onsite_contact_id_fkey(id, full_name, email, phone, is_active)
  )
`;

const occurrenceSelect = `
  *,
  recurring_service_plans(id, plan_name, customer_id, organization_id, authorization_mode, state),
  service_locations(id, label, street, city, state, postal_code),
  renewal_quote:quotes!recurring_service_occurrences_renewal_quote_id_fkey(id, quote_number, status, total_cents),
  work_order:jobs!recurring_service_occurrences_work_order_id_fkey(id, status, service_type)
`;

const recommendationSelect = `
  *,
  customers(id, display_name),
  organizations(id, name),
  service_locations(id, label, street, city),
  service_categories(id, label)
`;

export async function getRecurringOperationsDashboard(
  canViewFinancials = false,
) {
  const supabase = await createClient();
  if (!supabase) return emptyDashboard("Supabase is not configured.");

  const [
    tasks,
    plans,
    occurrences,
    recommendations,
    settings,
    renewalQuotes,
    recurringInvoices,
  ] = await Promise.all([
    supabase
      .from("follow_up_tasks")
      .select(taskSelect)
      .order("due_at")
      .limit(200),
    supabase
      .from("recurring_service_plans")
      .select(planSelect)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("recurring_service_occurrences")
      .select(occurrenceSelect)
      .order("target_service_date")
      .limit(200),
    supabase
      .from("service_recommendations")
      .select(recommendationSelect)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("recurring_service_settings")
      .select("*")
      .eq("singleton_key", true)
      .maybeSingle(),
    supabase
      .from("quotes")
      .select("id, status, total_cents")
      .not("recurring_occurrence_id", "is", null)
      .limit(2000),
    canViewFinancials
      ? supabase
          .from("invoices")
          .select("id, status, total_cents, payments(amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status, status)")
          .not("recurring_occurrence_id", "is", null)
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const quoteRows = (renewalQuotes.data ?? []) as {
    status: string;
    total_cents: number;
  }[];
  const invoiceRows = (recurringInvoices.data ?? []) as {
    status: string;
    total_cents: number;
    payments?: { amount_cents: number; refunded_principal_cents: number; disputed_principal_cents: number; dispute_status: string | null; status: string }[] | null;
  }[];
  const decidedRenewals = quoteRows.filter((quote) =>
    ["approved", "declined"].includes(quote.status),
  );
  const approvedRenewals = quoteRows.filter(
    (quote) => quote.status === "approved",
  );

  return {
    tasks: (tasks.data ?? []) as FollowUpTaskWithRelations[],
    plans: (plans.data ?? []) as RecurringPlanWithRelations[],
    occurrences: (occurrences.data ?? []) as RecurringOccurrenceWithRelations[],
    recommendations: (recommendations.data ??
      []) as ServiceRecommendationWithRelations[],
    settings: settings.data,
    analytics: {
      approvedRenewalValueCents: approvedRenewals.reduce(
        (total, quote) => total + quote.total_cents,
        0,
      ),
      invoicedRecurringValueCents: invoiceRows
        .filter((invoice) => invoice.status !== "void")
        .reduce((total, invoice) => total + invoice.total_cents, 0),
      collectedRecurringValueCents: invoiceRows.reduce(
        (total, invoice) =>
          total +
          (invoice.payments ?? [])
            .filter((payment) => payment.status === "succeeded")
            .reduce(
              (paymentTotal, payment) => paymentTotal + netSuccessfulPaymentPrincipal(payment),
              0,
            ),
        0,
      ),
      renewalRate: decidedRenewals.length
        ? approvedRenewals.length / decidedRenewals.length
        : null,
    },
    error:
      tasks.error?.message ??
      plans.error?.message ??
      occurrences.error?.message ??
      recommendations.error?.message ??
      settings.error?.message ??
      renewalQuotes.error?.message ??
      recurringInvoices.error?.message ??
      null,
  };
}

export async function getRecurringPlanDetail(planId: string) {
  const supabase = await createClient();
  if (!supabase)
    return {
      plan: null,
      occurrences: [],
      tasks: [],
      error: "Supabase is not configured.",
    };
  const [plan, occurrences, tasks] = await Promise.all([
    supabase
      .from("recurring_service_plans")
      .select(planSelect)
      .eq("id", planId)
      .maybeSingle(),
    supabase
      .from("recurring_service_occurrences")
      .select(occurrenceSelect)
      .eq("recurring_plan_id", planId)
      .order("target_service_date", { ascending: false }),
    supabase
      .from("follow_up_tasks")
      .select(taskSelect)
      .eq("recurring_plan_id", planId)
      .order("due_at", { ascending: false }),
  ]);
  return {
    plan: plan.data as RecurringPlanWithRelations | null,
    occurrences: (occurrences.data ?? []) as RecurringOccurrenceWithRelations[],
    tasks: (tasks.data ?? []) as FollowUpTaskWithRelations[],
    error:
      plan.error?.message ??
      occurrences.error?.message ??
      tasks.error?.message ??
      null,
  };
}

export async function getRecurringFormOptions() {
  const supabase = await createClient();
  if (!supabase)
    return {
      customers: [],
      organizations: [],
      locations: [],
      contacts: [],
      categories: [],
      staff: [],
      error: "Supabase is not configured.",
    };
  const [customers, organizations, locations, contacts, categories, staff] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, display_name, organization_id, status")
        .eq("status", "active")
        .order("display_name"),
      supabase
        .from("organizations")
        .select("id, name, status, payment_terms")
        .eq("status", "active")
        .order("name"),
      supabase.from("service_locations").select("*").order("street"),
      supabase
        .from("organization_contacts")
        .select("*")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("service_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name"),
    ]);
  return {
    customers: (customers.data ?? []) as Pick<
      Customer,
      "id" | "display_name" | "organization_id" | "status"
    >[],
    organizations: (organizations.data ?? []) as Pick<
      Organization,
      "id" | "name" | "status" | "payment_terms"
    >[],
    locations: (locations.data ?? []) as ServiceLocation[],
    contacts: (contacts.data ?? []) as OrganizationContact[],
    categories: (categories.data ?? []) as ServiceCategory[],
    staff: (staff.data ?? []) as AssignableUser[],
    error:
      customers.error?.message ??
      organizations.error?.message ??
      locations.error?.message ??
      contacts.error?.message ??
      categories.error?.message ??
      staff.error?.message ??
      null,
  };
}

export async function getRecurringSummaryForCustomer(customerId: string) {
  return getRelatedSummary("customer_id", customerId);
}

export async function getRecurringSummaryForOrganization(
  organizationId: string,
) {
  return getRelatedSummary("organization_id", organizationId);
}

async function getRelatedSummary(
  column: "customer_id" | "organization_id",
  id: string,
) {
  const supabase = await createClient();
  if (!supabase)
    return {
      tasks: [],
      plans: [],
      recommendations: [],
      error: "Supabase is not configured.",
    };
  const [tasks, plans, recommendations] = await Promise.all([
    supabase
      .from("follow_up_tasks")
      .select(taskSelect)
      .eq(column, id)
      .order("due_at")
      .limit(20),
    supabase
      .from("recurring_service_plans")
      .select(planSelect)
      .eq(column, id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("service_recommendations")
      .select(recommendationSelect)
      .eq(column, id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return {
    tasks: (tasks.data ?? []) as FollowUpTaskWithRelations[],
    plans: (plans.data ?? []) as RecurringPlanWithRelations[],
    recommendations: (recommendations.data ??
      []) as ServiceRecommendationWithRelations[],
    error:
      tasks.error?.message ??
      plans.error?.message ??
      recommendations.error?.message ??
      null,
  };
}

function emptyDashboard(error: string) {
  return {
    tasks: [],
    plans: [],
    occurrences: [],
    recommendations: [],
    settings: null,
    analytics: {
      approvedRenewalValueCents: 0,
      invoicedRecurringValueCents: 0,
      collectedRecurringValueCents: 0,
      renewalRate: null,
    },
    error,
  };
}
