import "server-only";

import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import { netSuccessfulPaymentPrincipal } from "@/lib/payments/payment-accounting";
import { reportUtcBounds, resolveReportFilters, safeRate, type ReportFilters } from "@/lib/reporting/definitions";
import { createClient } from "@/lib/supabase/server";
import type { ReportingSettings, ServiceCategory } from "@/lib/types/database";

type Relation<T> = T | T[] | null;
type NamedRelation = { id: string; display_name?: string; full_name?: string; email?: string; name?: string };
type LeadSourceRelation = { id: string; name: string };
type ServiceCategoryRelation = { id: string; label: string };

export type ReportQuote = {
  id: string; quote_number: string | null; customer_id: string | null; organization_id: string | null; estimator_user_id: string | null; status: string;
  total_cents: number; created_at: string; sent_at: string | null; approved_at: string | null; expires_at: string | null;
  customers: Relation<NamedRelation & { lead_source_id?: string | null; lead_sources?: Relation<LeadSourceRelation> }>;
  organizations: Relation<NamedRelation>;
  profiles: Relation<NamedRelation>; service_locations: Relation<{ id: string; city: string; state: string; postal_code: string | null }>;
  quote_line_items: { id: string; total_cents: number; service_category_id: string | null; service_categories: Relation<ServiceCategoryRelation> }[];
  jobs: Relation<{ id: string }>;
};

export type ReportInvoice = {
  id: string; invoice_number: string | null; customer_id: string | null; organization_id: string | null; job_id: string; quote_id: string | null; status: string;
  total_cents: number; balance_due_cents: number; created_at: string; due_at: string | null; paid_at: string | null;
  customers: Relation<NamedRelation & { lead_source_id?: string | null; lead_sources?: Relation<LeadSourceRelation> }>;
  organizations: Relation<NamedRelation>;
  jobs: Relation<{ id: string; assigned_crew_user_id: string | null; service_location_id: string; service_locations: Relation<{ id: string; city: string; state: string; postal_code: string | null }> }>;
  invoice_line_items: { id: string; total_cents: number; service_category_id: string | null; service_categories: Relation<ServiceCategoryRelation> }[];
  payments: ReportPayment[];
};

export type ReportPayment = { id: string; invoice_id: string; amount_cents: number; refunded_principal_cents: number; disputed_principal_cents: number; dispute_status: string | null; payment_method: string | null; provider: string | null; status: string; paid_at: string | null; created_at: string };
export type ReportJob = {
  id: string; customer_id: string | null; organization_id: string | null; service_location_id: string; assigned_crew_user_id: string | null; lead_source_id: string | null;
  status: string; priority: string; service_type: string | null; created_at: string; updated_at: string; scheduled_start_at: string | null; scheduled_end_at: string | null; completed_at: string | null;
  customers: Relation<NamedRelation & { status?: string }>;
  organizations: Relation<NamedRelation>;
  lead_sources: Relation<LeadSourceRelation>; profiles: Relation<NamedRelation>;
  service_locations: Relation<{ id: string; city: string; state: string; postal_code: string | null }>;
  job_closeouts: { id: string; status: string; has_scope_exception: boolean; has_incident: boolean }[];
};
export type ReportTimeEntry = {
  id: string; user_id: string; job_id: string | null; entry_type: string; status: string; clock_in_at: string; clock_out_at: string | null; break_minutes: number;
  profiles: Relation<NamedRelation>; jobs: Relation<{ id: string; assigned_crew_user_id: string | null }>;
  time_entry_approvals: { approval_status: string; approved_at: string }[];
};
export type ReportScheduleEvent = { id: string; title: string; event_type: string; status: string; job_id: string | null; starts_at: string; ends_at: string | null; schedule_event_assignments: { user_id: string }[] };
export type ReportJobCost = { id: string; job_id: string; category: string; description: string; vendor_name: string | null; amount_cents: number; incurred_on: string; review_status: string; receipt_storage_path: string | null };
export type ReportLaborRate = { id: string; employee_id: string; hourly_cost_cents: number; burden_percent: number | null; effective_from: string; effective_to: string | null; employee_records: Relation<{ id: string; auth_user_id: string | null; preferred_name: string | null; legal_name: string | null }> };
export type ReportEquipmentUsage = { id: string; job_id: string; asset_id: string; usage_date: string; usage_hours: number | null; usage_days: number | null; calculated_cost_cents: number; equipment_assets: Relation<{ id: string; name: string; asset_number: string; category: string }> };

export type ProfitabilityRow = {
  job: ReportJob;
  invoice: ReportInvoice | null;
  revenueCents: number;
  laborHours: number;
  laborCostCents: number | null;
  directCostCents: number;
  equipmentCostCents: number;
  profitCents: number | null;
  marginPercent: number | null;
  completeness: "complete" | "missing_time" | "missing_labor_rate" | "missing_revenue";
};

export type ReportData = {
  settings: ReportingSettings;
  canViewFinancials: boolean;
  quotes: ReportQuote[]; invoices: ReportInvoice[]; arInvoices: ReportInvoice[]; payments: ReportPayment[]; jobs: ReportJob[];
  timeEntries: ReportTimeEntry[]; scheduleEvents: ReportScheduleEvent[]; customers: any[]; organizations: any[];
  contractingPartyReviewItems: { id: string; record_type: string; record_id: string; issue_type: string; details: Record<string, unknown>; status: string; created_at: string }[];
  leadSources: LeadSourceRelation[]; serviceCategories: ServiceCategory[];
  jobCosts: ReportJobCost[]; laborRates: ReportLaborRate[]; equipmentUsage: ReportEquipmentUsage[];
  maintenance: any[]; equipmentProblems: any[]; inspections: any[]; assets: any[];
  materials: any[]; inventoryTransactions: any[]; inventoryBalances: any[]; disposalRecords: any[]; productionBatches: any[]; materialDeliveries: any[];
  employees: { id: string; auth_user_id: string | null; preferred_name: string | null; legal_name: string | null; is_active: boolean }[];
  canManageSettings: boolean;
  salesScope: "company" | "own";
  comparisonAvailable: boolean;
  previous: { quotedCents: number; approvedCents: number; invoicedCents: number; collectedCents: number; leads: number; completedJobs: number };
  profitability: ProfitabilityRow[];
  warnings: string[];
};

const defaultSettings: ReportingSettings = {
  singleton_key: true,
  business_timezone: "America/New_York",
  draft_quote_stale_days: 3,
  sent_quote_stale_days: 7,
  lead_stale_business_days: 1,
  default_labor_burden_percent: null,
  blended_labor_cost_cents: null,
  updated_by_user_id: null,
  created_at: "",
  updated_at: "",
};

export async function getReportingSettings() {
  const supabase = await createClient();
  if (!supabase) return { data: defaultSettings, error: "Supabase is not configured." };
  const { data, error } = await supabase.from("reporting_settings").select("*").eq("singleton_key", true).maybeSingle();
  return { data: (data as ReportingSettings | null) ?? defaultSettings, error: error?.message ?? null };
}

export async function getServiceCategories() {
  const supabase = await createClient();
  if (!supabase) return { data: [] as ServiceCategory[], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order").order("label");
  return { data: (data ?? []) as ServiceCategory[], error: error?.message ?? null };
}

export async function getLeadSources() {
  const supabase = await createClient();
  if (!supabase) return { data: [] as LeadSourceRelation[], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("lead_sources").select("id, name").eq("is_active", true).order("name");
  return { data: (data ?? []) as LeadSourceRelation[], error: error?.message ?? null };
}

export async function getReportData(filters: ReportFilters, roles: PlatformRoleName[], userId: string): Promise<ReportData> {
  const canReport = hasAllowedRole(roles, platformRoleGroups.reporting);
  if (!canReport) throw new Error("This account does not have reporting access.");
  const canViewFinancials = hasAllowedRole(roles, platformRoleGroups.financialReporting);
  const canManageSettings = roles.some((role) => role === "owner" || role === "admin");
  const estimatorOnly = roles.includes("estimator") && !roles.some((role) => ["owner", "admin", "payroll_admin"].includes(role));
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const current = reportUtcBounds(filters.startDate, filters.endDate, filters.timezone);
  const previous = reportUtcBounds(filters.previousStartDate, filters.previousEndDate, filters.timezone);
  const warnings: string[] = [];

  let quoteQuery = supabase.from("quotes").select("id, quote_number, customer_id, organization_id, estimator_user_id, status, total_cents, created_at, sent_at, approved_at, expires_at, customers:customers!quotes_customer_id_fkey(id, display_name, lead_source_id, lead_sources(id, name)), organizations(id, name), profiles:profiles!quotes_estimator_user_id_fkey(id, full_name, email), service_locations(id, city, state, postal_code), quote_line_items(id, total_cents, service_category_id, service_categories(id, label)), jobs:jobs!quotes_job_id_fkey(id)").is("archived_at", null).gte("created_at", current.start).lt("created_at", current.endExclusive).order("created_at", { ascending: false }).limit(5000);
  if (estimatorOnly) quoteQuery = quoteQuery.eq("estimator_user_id", userId);
  if (filters.customerId) quoteQuery = quoteQuery.eq("customer_id", filters.customerId);
  if (filters.status) quoteQuery = quoteQuery.eq("status", filters.status);
  if (filters.employeeId) quoteQuery = quoteQuery.eq("estimator_user_id", filters.employeeId);

  let jobQuery = supabase.from("jobs").select("id, customer_id, organization_id, service_location_id, assigned_crew_user_id, lead_source_id, status, priority, service_type, created_at, updated_at, scheduled_start_at, scheduled_end_at, completed_at, customers:customers!jobs_customer_id_fkey(id, display_name, status), organizations(id, name), lead_sources(id, name), profiles:profiles!jobs_assigned_crew_user_id_fkey(id, full_name, email), service_locations(id, city, state, postal_code), job_closeouts(id, status, has_scope_exception, has_incident)").is("archived_at", null).gte("created_at", current.start).lt("created_at", current.endExclusive).order("created_at", { ascending: false }).limit(5000);
  if (filters.customerId) jobQuery = jobQuery.eq("customer_id", filters.customerId);
  if (filters.leadSourceId) jobQuery = jobQuery.eq("lead_source_id", filters.leadSourceId);
  if (filters.employeeId) jobQuery = jobQuery.eq("assigned_crew_user_id", filters.employeeId);
  if (filters.status) jobQuery = jobQuery.eq("status", filters.status);

  const invoiceQuery = canViewFinancials
    ? supabase.from("invoices").select("id, invoice_number, customer_id, organization_id, job_id, quote_id, status, total_cents, balance_due_cents, created_at, due_at, paid_at, customers:customers!invoices_customer_id_fkey(id, display_name, lead_source_id, lead_sources(id, name)), organizations(id, name), jobs(id, assigned_crew_user_id, service_location_id, service_locations(id, city, state, postal_code)), invoice_line_items(id, total_cents, service_category_id, service_categories(id, label)), payments(id, invoice_id, amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status, payment_method, provider, status, paid_at, created_at)").is("archived_at", null).gte("created_at", current.start).lt("created_at", current.endExclusive).order("created_at", { ascending: false }).limit(5000)
    : Promise.resolve({ data: [], error: null });
  const paymentQuery = canViewFinancials
    ? supabase.from("payments").select("id, invoice_id, amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status, payment_method, provider, status, paid_at, created_at").eq("status", "succeeded").gte("paid_at", current.start).lt("paid_at", current.endExclusive).order("paid_at", { ascending: false }).limit(5000)
    : Promise.resolve({ data: [], error: null });
  const timeQuery = canViewFinancials
    ? supabase.from("time_entries").select("id, user_id, job_id, entry_type, status, clock_in_at, clock_out_at, break_minutes, profiles(id, full_name, email), jobs(id, assigned_crew_user_id), time_entry_approvals(approval_status, approved_at)").gte("clock_in_at", current.start).lt("clock_in_at", current.endExclusive).order("clock_in_at", { ascending: false }).limit(5000)
    : Promise.resolve({ data: [], error: null });
  const scheduleQuery = supabase.from("schedule_events").select("id, title, event_type, status, job_id, starts_at, ends_at, schedule_event_assignments(user_id)").gte("starts_at", current.start).lt("starts_at", current.endExclusive).order("starts_at").limit(5000);

  let previousQuoteQuery = supabase.from("quotes").select("id, estimator_user_id, status, total_cents, sent_at, approved_at").is("archived_at", null).gte("created_at", previous.start).lt("created_at", previous.endExclusive).limit(5000);
  if (estimatorOnly) previousQuoteQuery = previousQuoteQuery.eq("estimator_user_id", userId);

  const [settingsResult, quotesResult, jobsResult, invoicesResult, arInvoicesResult, paymentsResult, timeResult, scheduleResult, customersResult, organizationsResult, ownershipReviewResult, sourcesResult, categoriesResult, costsResult, ratesResult, usageResult, maintenanceResult, problemsResult, inspectionsResult, assetsResult, employeesResult, materialsResult, inventoryTransactionsResult, inventoryBalancesResult, disposalResult, productionResult, materialDeliveriesResult, previousQuotes, previousJobs, previousInvoices, previousPayments] = await Promise.all([
    supabase.from("reporting_settings").select("*").eq("singleton_key", true).maybeSingle(),
    quoteQuery,
    jobQuery,
    invoiceQuery,
    canViewFinancials ? supabase.from("invoices").select("id, invoice_number, customer_id, organization_id, job_id, quote_id, status, total_cents, balance_due_cents, created_at, due_at, paid_at, customers:customers!invoices_customer_id_fkey(id, display_name, lead_source_id, lead_sources(id, name)), organizations(id, name), jobs(id, assigned_crew_user_id, service_location_id, service_locations(id, city, state, postal_code)), invoice_line_items(id, total_cents, service_category_id, service_categories(id, label)), payments(id, invoice_id, amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status, payment_method, provider, status, paid_at, created_at)").is("archived_at", null).gt("balance_due_cents", 0).not("status", "in", "(paid,void)").order("due_at", { ascending: true, nullsFirst: false }).limit(5000) : Promise.resolve({ data: [], error: null }),
    paymentQuery,
    timeQuery,
    scheduleQuery,
    supabase.from("customers").select("id, display_name, status, organization_id, lead_source_id, created_at, lead_sources(id, name), service_locations(id, city, state, postal_code)").is("archived_at", null).gte("created_at", current.start).lt("created_at", current.endExclusive).order("created_at", { ascending: false }).limit(5000),
    supabase.from("organizations").select("id, name, status, created_at").is("archived_at", null).gte("created_at", current.start).lt("created_at", current.endExclusive).order("created_at", { ascending: false }).limit(5000),
    supabase.from("contracting_party_review_items").select("id, record_type, record_id, issue_type, details, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(1000),
    supabase.from("lead_sources").select("id, name").eq("is_active", true).order("name"),
    supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
    canViewFinancials ? supabase.from("job_cost_entries").select("id, job_id, category, description, vendor_name, amount_cents, incurred_on, review_status, receipt_storage_path").is("archived_at", null).gte("incurred_on", filters.startDate).lte("incurred_on", filters.endDate).limit(5000) : Promise.resolve({ data: [], error: null }),
    canViewFinancials ? supabase.from("employee_labor_cost_rates").select("id, employee_id, hourly_cost_cents, burden_percent, effective_from, effective_to, employee_records(id, auth_user_id, preferred_name, legal_name)").order("effective_from", { ascending: false }).limit(5000) : Promise.resolve({ data: [], error: null }),
    canViewFinancials ? supabase.from("job_equipment_usage").select("id, job_id, asset_id, usage_date, usage_hours, usage_days, calculated_cost_cents, equipment_assets(id, name, asset_number, category)").gte("usage_date", filters.startDate).lte("usage_date", filters.endDate).limit(5000) : Promise.resolve({ data: [], error: null }),
    supabase.from("equipment_maintenance_records").select("id, asset_id, status, maintenance_type, title, cost_cents, completed_at, equipment_assets(id, name, asset_number, category)").gte("completed_at", current.start).lt("completed_at", current.endExclusive).limit(5000),
    supabase.from("equipment_problem_reports").select("id, asset_id, job_id, status, severity, equipment_stopped, created_at, equipment_assets(id, name, asset_number, category)").gte("created_at", current.start).lt("created_at", current.endExclusive).limit(5000),
    supabase.from("equipment_inspections").select("id, asset_id, job_id, overall_result, inspected_at, equipment_assets(id, name, asset_number, category)").gte("inspected_at", current.start).lt("inspected_at", current.endExclusive).limit(5000),
    supabase.from("equipment_assets").select("id, name, asset_number, category, status, is_active, updated_at").is("archived_at", null).limit(1000),
    canViewFinancials ? supabase.from("employee_records").select("id, auth_user_id, preferred_name, legal_name, is_active").is("archived_at", null).order("preferred_name").limit(1000) : Promise.resolve({ data: [], error: null }),
    supabase.from("material_catalog").select("id, name, category, default_unit, stock_tracked, reorder_threshold").eq("is_active", true).is("archived_at", null).order("name"),
    supabase.from("inventory_transactions").select("id, material_id, transaction_type, quantity, unit, job_id, source_location_id, destination_location_id, is_estimated, occurred_at").gte("occurred_at", current.start).lt("occurred_at", current.endExclusive).order("occurred_at", { ascending: false }).limit(5000),
    supabase.from("material_stock_balances").select("material_id, location_id, on_hand_quantity, reserved_quantity, available_quantity, latest_transaction_at").limit(5000),
    supabase.from("disposal_records").select("id, job_id, material_id, destination_type, destination_name, quantity, unit, is_estimated, fee_cents, status, created_at").gte("created_at", current.start).lt("created_at", current.endExclusive).limit(5000),
    supabase.from("production_batches").select("id, batch_number, product_material_id, status, estimated_output_quantity, output_unit, direct_cost_cents, cost_per_unit_cents, created_at").gte("created_at", current.start).lt("created_at", current.endExclusive).limit(5000),
    supabase.from("customer_deliveries").select("id, material_id, job_id, quantity, unit, status, delivered_at, created_at").gte("created_at", current.start).lt("created_at", current.endExclusive).limit(5000),
    previousQuoteQuery,
    supabase.from("jobs").select("id, status, completed_at").is("archived_at", null).gte("created_at", previous.start).lt("created_at", previous.endExclusive).limit(5000),
    canViewFinancials ? supabase.from("invoices").select("id, status, total_cents").is("archived_at", null).gte("created_at", previous.start).lt("created_at", previous.endExclusive).limit(5000) : Promise.resolve({ data: [], error: null }),
    canViewFinancials ? supabase.from("payments").select("id, amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status, status, paid_at").eq("status", "succeeded").gte("paid_at", previous.start).lt("paid_at", previous.endExclusive).limit(5000) : Promise.resolve({ data: [], error: null }),
  ]);

  const results = [settingsResult, quotesResult, jobsResult, invoicesResult, arInvoicesResult, paymentsResult, timeResult, scheduleResult, customersResult, organizationsResult, ownershipReviewResult, sourcesResult, categoriesResult, costsResult, ratesResult, usageResult, maintenanceResult, problemsResult, inspectionsResult, assetsResult, employeesResult, materialsResult, inventoryTransactionsResult, inventoryBalancesResult, disposalResult, productionResult, materialDeliveriesResult];
  results.forEach((result) => { if (result.error) warnings.push(result.error.message); });

  const settings = (settingsResult.data as ReportingSettings | null) ?? defaultSettings;
  let quotes = (quotesResult.data ?? []) as unknown as ReportQuote[];
  let jobs = (jobsResult.data ?? []) as unknown as ReportJob[];
  let invoices = (invoicesResult.data ?? []) as unknown as ReportInvoice[];
  let arInvoices = (arInvoicesResult.data ?? []) as unknown as ReportInvoice[];
  let payments = (paymentsResult.data ?? []) as unknown as ReportPayment[];
  let timeEntries = (timeResult.data ?? []) as unknown as ReportTimeEntry[];
  let scheduleEvents = (scheduleResult.data ?? []) as unknown as ReportScheduleEvent[];
  let customers = customersResult.data ?? [];
  let maintenance = maintenanceResult.data ?? [];
  let equipmentProblems = problemsResult.data ?? [];
  let inspections = inspectionsResult.data ?? [];
  let assets = assetsResult.data ?? [];

  if (estimatorOnly) {
    const customerIds = new Set(quotes.map((quote) => quote.customer_id));
    jobs = [];
    scheduleEvents = [];
    customers = customers.filter((customer) => customerIds.has(customer.id));
    maintenance = [];
    equipmentProblems = [];
    inspections = [];
    assets = [];
  }

  if (filters.leadSourceId) quotes = quotes.filter((quote) => relation(quote.customers)?.lead_source_id === filters.leadSourceId);
  if (filters.leadSourceId) invoices = invoices.filter((invoice) => relation(invoice.customers)?.lead_source_id === filters.leadSourceId);
  if (filters.leadSourceId) arInvoices = arInvoices.filter((invoice) => relation(invoice.customers)?.lead_source_id === filters.leadSourceId);
  if (filters.serviceCategoryId) {
    quotes = quotes.filter((quote) => quote.quote_line_items.some((item) => item.service_category_id === filters.serviceCategoryId));
    invoices = invoices.filter((invoice) => invoice.invoice_line_items.some((item) => item.service_category_id === filters.serviceCategoryId));
    arInvoices = arInvoices.filter((invoice) => invoice.invoice_line_items.some((item) => item.service_category_id === filters.serviceCategoryId));
  }
  if (filters.customerId) invoices = invoices.filter((invoice) => invoice.customer_id === filters.customerId);
  if (filters.customerId) arInvoices = arInvoices.filter((invoice) => invoice.customer_id === filters.customerId);
  if (filters.status) invoices = invoices.filter((invoice) => invoice.status === filters.status);
  if (filters.status) arInvoices = arInvoices.filter((invoice) => invoice.status === filters.status);
  if (filters.customerId || filters.leadSourceId || filters.serviceCategoryId || filters.status) {
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
    payments = payments.filter((payment) => invoiceIds.has(payment.invoice_id));
  }
  if (filters.employeeId) {
    timeEntries = timeEntries.filter((entry) => entry.user_id === filters.employeeId);
    scheduleEvents = scheduleEvents.filter((event) => event.schedule_event_assignments.some((assignment) => assignment.user_id === filters.employeeId));
  }

  const laborRates = (ratesResult.data ?? []) as unknown as ReportLaborRate[];
  const jobCosts = (costsResult.data ?? []) as unknown as ReportJobCost[];
  const equipmentUsage = (usageResult.data ?? []) as unknown as ReportEquipmentUsage[];
  const profitability = canViewFinancials ? buildProfitability(jobs, invoices, timeEntries, jobCosts, laborRates, equipmentUsage, settings) : [];
  const priorQuotes = (previousQuotes.data ?? []) as { status: string; total_cents: number; sent_at: string | null; approved_at: string | null }[];
  const priorJobs = (estimatorOnly ? [] : previousJobs.data ?? []) as { status: string; completed_at: string | null }[];
  const priorInvoices = (previousInvoices.data ?? []) as { status: string; total_cents: number }[];
  const priorPayments = (previousPayments.data ?? []) as Pick<
    ReportPayment,
    "amount_cents" | "refunded_principal_cents" | "disputed_principal_cents" | "dispute_status"
  >[];

  return {
    settings,
    canViewFinancials,
    quotes,
    invoices,
    arInvoices,
    payments,
    jobs,
    timeEntries,
    scheduleEvents,
    customers,
    organizations: organizationsResult.data ?? [],
    contractingPartyReviewItems: ownershipReviewResult.data ?? [],
    leadSources: (sourcesResult.data ?? []) as LeadSourceRelation[],
    serviceCategories: (categoriesResult.data ?? []) as ServiceCategory[],
    jobCosts,
    laborRates,
    equipmentUsage,
    maintenance,
    equipmentProblems,
    inspections,
    assets,
    materials: materialsResult.data ?? [],
    inventoryTransactions: inventoryTransactionsResult.data ?? [],
    inventoryBalances: inventoryBalancesResult.data ?? [],
    disposalRecords: disposalResult.data ?? [],
    productionBatches: productionResult.data ?? [],
    materialDeliveries: materialDeliveriesResult.data ?? [],
    employees: employeesResult.data ?? [],
    canManageSettings,
    salesScope: estimatorOnly ? "own" : "company",
    comparisonAvailable: !filters.customerId && !filters.employeeId && !filters.leadSourceId && !filters.serviceCategoryId && !filters.status,
    previous: {
      quotedCents: priorQuotes.reduce((sum, quote) => sum + quote.total_cents, 0),
      approvedCents: priorQuotes.filter((quote) => quote.status === "approved" || quote.approved_at).reduce((sum, quote) => sum + quote.total_cents, 0),
      invoicedCents: priorInvoices.filter((invoice) => invoice.status !== "void").reduce((sum, invoice) => sum + invoice.total_cents, 0),
      collectedCents: priorPayments.reduce((sum, payment) => sum + netPaymentPrincipal(payment), 0),
      leads: priorJobs.filter((job) => ["new_lead", "estimate_scheduled"].includes(job.status)).length,
      completedJobs: priorJobs.filter((job) => Boolean(job.completed_at) || ["completed", "ready_to_invoice", "invoiced", "paid"].includes(job.status)).length,
    },
    profitability,
    warnings: [...new Set(warnings)],
  };
}

export async function getJobCostEntries(jobId: string) {
  const supabase = await createClient();
  if (!supabase) return { data: [] as (ReportJobCost & { receipt_signed_url?: string | null })[], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("job_cost_entries").select("id, job_id, category, description, vendor_name, amount_cents, incurred_on, review_status, receipt_storage_path").eq("job_id", jobId).is("archived_at", null).order("incurred_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as ReportJobCost[];
  const paths = rows.map((row) => row.receipt_storage_path).filter((path): path is string => Boolean(path));
  if (!paths.length) return { data: rows, error: null };
  const signed = await supabase.storage.from("job-cost-receipts").createSignedUrls(paths, 1800);
  const urls = new Map((signed.data ?? []).map((file) => [file.path, file.signedUrl]));
  return { data: rows.map((row) => ({ ...row, receipt_signed_url: row.receipt_storage_path ? urls.get(row.receipt_storage_path) ?? null : null })), error: signed.error?.message ?? null };
}

export async function getDashboardReportingSummary(canViewFinancials: boolean) {
  const supabase = await createClient();
  const empty = { approvedQuoteCents: 0, quoteApprovalRate: null as number | null, invoicedCents: 0, collectedCents: 0, outstandingCents: 0, overdueCents: 0 };
  if (!supabase) return { data: empty, error: "Supabase is not configured." };
  const settings = await getReportingSettings();
  const filters = resolveReportFilters({ range: "month" }, settings.data.business_timezone);
  const bounds = reportUtcBounds(filters.startDate, filters.endDate, filters.timezone);
  const [quotes, invoices, payments, outstanding] = await Promise.all([
    supabase.from("quotes").select("status, total_cents, approved_at").is("archived_at", null).gte("created_at", bounds.start).lt("created_at", bounds.endExclusive).limit(5000),
    canViewFinancials ? supabase.from("invoices").select("status, total_cents").is("archived_at", null).gte("created_at", bounds.start).lt("created_at", bounds.endExclusive).limit(5000) : Promise.resolve({ data: [], error: null }),
    canViewFinancials ? supabase.from("payments").select("amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status").eq("status", "succeeded").gte("paid_at", bounds.start).lt("paid_at", bounds.endExclusive).limit(5000) : Promise.resolve({ data: [], error: null }),
    canViewFinancials ? supabase.from("invoices").select("status, balance_due_cents, due_at").is("archived_at", null).gt("balance_due_cents", 0).not("status", "in", "(paid,void)").limit(5000) : Promise.resolve({ data: [], error: null }),
  ]);
  const quoteRows = quotes.data ?? []; const eligible = quoteRows.filter((quote) => !["draft", "cancelled"].includes(quote.status)); const approved = eligible.filter((quote) => quote.status === "approved" || quote.approved_at);
  const openRows = outstanding.data ?? []; const now = Date.now();
  return { data: { approvedQuoteCents: approved.reduce((sumValue, quote) => sumValue + quote.total_cents, 0), quoteApprovalRate: safeRate(approved.length, eligible.length), invoicedCents: (invoices.data ?? []).filter((invoice) => invoice.status !== "void").reduce((sumValue, invoice) => sumValue + invoice.total_cents, 0), collectedCents: (payments.data ?? []).reduce((sumValue, payment) => sumValue + netPaymentPrincipal(payment), 0), outstandingCents: openRows.reduce((sumValue, invoice) => sumValue + invoice.balance_due_cents, 0), overdueCents: openRows.filter((invoice) => invoice.due_at && new Date(invoice.due_at).getTime() < now).reduce((sumValue, invoice) => sumValue + invoice.balance_due_cents, 0) }, error: settings.error ?? quotes.error?.message ?? invoices.error?.message ?? payments.error?.message ?? outstanding.error?.message ?? null };
}

export function relation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function successfulPaymentTotal(invoice: ReportInvoice) {
  return invoice.payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + netPaymentPrincipal(payment), 0);
}

const netPaymentPrincipal = netSuccessfulPaymentPrincipal;

function buildProfitability(
  jobs: ReportJob[], invoices: ReportInvoice[], entries: ReportTimeEntry[], costs: ReportJobCost[], rates: ReportLaborRate[], usage: ReportEquipmentUsage[], settings: ReportingSettings,
): ProfitabilityRow[] {
  const employeeByAuth = new Map<string, string>();
  rates.forEach((rate) => {
    const employee = relation(rate.employee_records);
    if (employee?.auth_user_id) employeeByAuth.set(employee.auth_user_id, rate.employee_id);
  });

  return jobs.filter((job) => Boolean(job.completed_at) || ["completed", "ready_to_invoice", "invoiced", "paid"].includes(job.status)).map((job) => {
    const invoice = invoices.find((candidate) => candidate.job_id === job.id && candidate.status !== "void") ?? null;
    const approvedEntries = entries.filter((entry) => entry.job_id === job.id && entry.clock_out_at && latestApproval(entry) === "approved");
    const laborHours = approvedEntries.reduce((sum, entry) => sum + durationHours(entry), 0);
    let missingRate = false;
    let laborCostCents = 0;
    for (const entry of approvedEntries) {
      const employeeId = employeeByAuth.get(entry.user_id);
      const date = entry.clock_in_at.slice(0, 10);
      const rate = employeeId ? rates.find((candidate) => candidate.employee_id === employeeId && candidate.effective_from <= date && (!candidate.effective_to || candidate.effective_to >= date)) : null;
      const baseRate = rate?.hourly_cost_cents ?? settings.blended_labor_cost_cents;
      if (baseRate == null) { missingRate = true; continue; }
      const burden = rate?.burden_percent ?? settings.default_labor_burden_percent ?? 0;
      laborCostCents += Math.round(durationHours(entry) * baseRate * (1 + burden / 100));
    }
    const directCostCents = costs.filter((cost) => cost.job_id === job.id && cost.review_status === "approved").reduce((sum, cost) => sum + cost.amount_cents, 0);
    const equipmentCostCents = usage.filter((item) => item.job_id === job.id).reduce((sum, item) => sum + item.calculated_cost_cents, 0);
    const revenueCents = invoice?.total_cents ?? 0;
    const completeness: ProfitabilityRow["completeness"] = !invoice ? "missing_revenue" : approvedEntries.length === 0 ? "missing_time" : missingRate ? "missing_labor_rate" : "complete";
    const profitCents = completeness === "complete" ? revenueCents - laborCostCents - directCostCents - equipmentCostCents : null;
    return { job, invoice, revenueCents, laborHours, laborCostCents: missingRate ? null : laborCostCents, directCostCents, equipmentCostCents, profitCents, marginPercent: profitCents == null ? null : safeRate(profitCents, revenueCents), completeness };
  });
}

function latestApproval(entry: ReportTimeEntry) {
  return [...entry.time_entry_approvals].sort((a, b) => b.approved_at.localeCompare(a.approved_at))[0]?.approval_status ?? null;
}

function durationHours(entry: ReportTimeEntry) {
  if (!entry.clock_out_at) return 0;
  return Math.max(0, (new Date(entry.clock_out_at).getTime() - new Date(entry.clock_in_at).getTime()) / 3_600_000 - entry.break_minutes / 60);
}
