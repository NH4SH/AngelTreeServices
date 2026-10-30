import { privateFileLinks } from "@/lib/files/private-file-links";
import "server-only";
import { withDeadline } from "@/lib/runtime/deadline";
import {
  validateBusinessReport,
  reportFilterArguments,
  type BusinessReport,
} from "@/lib/reporting/model";

import {
  getUserRoles,
  hasAllowedRole,
  platformRoleGroups,
  type PlatformRoleName,
} from "@/lib/auth/roles";
import { netSuccessfulPaymentPrincipal } from "@/lib/payments/payment-accounting";
import {
  resolveReportFilters,
  type ReportFilters,
} from "@/lib/reporting/definitions";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { ReportingSettings, ServiceCategory } from "@/lib/types/database";

type Relation<T> = T | T[] | null;
type NamedRelation = {
  id: string;
  display_name?: string;
  full_name?: string;
  email?: string;
  name?: string;
};
type LeadSourceRelation = { id: string; name: string };
type ServiceCategoryRelation = { id: string; label: string };

export type ReportQuote = {
  id: string;
  quote_number: string | null;
  customer_id: string | null;
  organization_id: string | null;
  estimator_user_id: string | null;
  status: string;
  total_cents: number;
  created_at: string;
  sent_at: string | null;
  approved_at: string | null;
  expires_at: string | null;
  customers: Relation<
    NamedRelation & {
      lead_source_id?: string | null;
      lead_sources?: Relation<LeadSourceRelation>;
    }
  >;
  organizations: Relation<NamedRelation>;
  profiles: Relation<NamedRelation>;
  service_locations: Relation<{
    id: string;
    city: string;
    state: string;
    postal_code: string | null;
  }>;
  quote_line_items: {
    id: string;
    total_cents: number;
    service_category_id: string | null;
    service_categories: Relation<ServiceCategoryRelation>;
  }[];
  jobs: Relation<{ id: string }>;
};

export type ReportInvoice = {
  id: string;
  invoice_number: string | null;
  customer_id: string | null;
  organization_id: string | null;
  job_id: string;
  quote_id: string | null;
  status: string;
  total_cents: number;
  balance_due_cents: number;
  created_at: string;
  due_at: string | null;
  paid_at: string | null;
  customers: Relation<
    NamedRelation & {
      lead_source_id?: string | null;
      lead_sources?: Relation<LeadSourceRelation>;
    }
  >;
  organizations: Relation<NamedRelation>;
  jobs: Relation<{
    id: string;
    assigned_crew_user_id: string | null;
    service_location_id: string;
    service_locations: Relation<{
      id: string;
      city: string;
      state: string;
      postal_code: string | null;
    }>;
  }>;
  invoice_line_items: {
    id: string;
    total_cents: number;
    service_category_id: string | null;
    service_categories: Relation<ServiceCategoryRelation>;
  }[];
  payments: ReportPayment[];
};

export type ReportPayment = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  refunded_principal_cents: number;
  disputed_principal_cents: number;
  dispute_status: string | null;
  payment_method: string | null;
  provider: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};
export type ReportJob = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  service_location_id: string;
  assigned_crew_user_id: string | null;
  lead_source_id: string | null;
  status: string;
  priority: string;
  service_type: string | null;
  created_at: string;
  updated_at: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  completed_at: string | null;
  customers: Relation<NamedRelation & { status?: string }>;
  organizations: Relation<NamedRelation>;
  lead_sources: Relation<LeadSourceRelation>;
  profiles: Relation<NamedRelation>;
  service_locations: Relation<{
    id: string;
    city: string;
    state: string;
    postal_code: string | null;
  }>;
  job_closeouts: {
    id: string;
    status: string;
    has_scope_exception: boolean;
    has_incident: boolean;
  }[];
};
export type ReportTimeEntry = {
  id: string;
  user_id: string;
  job_id: string | null;
  entry_type: string;
  status: string;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  profiles: Relation<NamedRelation>;
  jobs: Relation<{ id: string; assigned_crew_user_id: string | null }>;
  time_entry_approvals: { approval_status: string; approved_at: string }[];
};
export type ReportScheduleEvent = {
  id: string;
  title: string;
  event_type: string;
  status: string;
  job_id: string | null;
  starts_at: string;
  ends_at: string | null;
  schedule_event_assignments: { user_id: string }[];
};
export type ReportJobCost = {
  id: string;
  job_id: string;
  category: string;
  description: string;
  vendor_name: string | null;
  amount_cents: number;
  incurred_on: string;
  review_status: string;
  receipt_storage_path: string | null;
};
export type ReportLaborRate = {
  id: string;
  employee_id: string;
  hourly_cost_cents: number;
  burden_percent: number | null;
  effective_from: string;
  effective_to: string | null;
  employee_records: Relation<{
    id: string;
    auth_user_id: string | null;
    preferred_name: string | null;
    legal_name: string | null;
  }>;
};
export type ReportEquipmentUsage = {
  id: string;
  job_id: string;
  asset_id: string;
  usage_date: string;
  usage_hours: number | null;
  usage_days: number | null;
  calculated_cost_cents: number;
  equipment_assets: Relation<{
    id: string;
    name: string;
    asset_number: string;
    category: string;
  }>;
};

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
  completeness:
    | "complete"
    | "missing_time"
    | "missing_labor_rate"
    | "missing_revenue";
};

export type ReportData = {
  settings: ReportingSettings;
  canViewFinancials: boolean;
  quotes: ReportQuote[];
  invoices: ReportInvoice[];
  arInvoices: ReportInvoice[];
  payments: ReportPayment[];
  jobs: ReportJob[];
  timeEntries: ReportTimeEntry[];
  scheduleEvents: ReportScheduleEvent[];
  customers: any[];
  organizations: any[];
  contractingPartyReviewItems: {
    id: string;
    record_type: string;
    record_id: string;
    issue_type: string;
    details: Record<string, unknown>;
    status: string;
    created_at: string;
  }[];
  leadSources: LeadSourceRelation[];
  serviceCategories: ServiceCategory[];
  jobCosts: ReportJobCost[];
  laborRates: ReportLaborRate[];
  equipmentUsage: ReportEquipmentUsage[];
  maintenance: any[];
  equipmentProblems: any[];
  inspections: any[];
  assets: any[];
  materials: any[];
  inventoryTransactions: any[];
  inventoryBalances: any[];
  disposalRecords: any[];
  productionBatches: any[];
  materialDeliveries: any[];
  employees: {
    id: string;
    auth_user_id: string | null;
    preferred_name: string | null;
    legal_name: string | null;
    is_active: boolean;
  }[];
  canManageSettings: boolean;
  salesScope: "company" | "own";
  comparisonAvailable: boolean;
  previous: {
    quotedCents: number;
    approvedCents: number;
    invoicedCents: number;
    collectedCents: number;
    leads: number;
    completedJobs: number;
  };
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
  if (!supabase)
    return { data: defaultSettings, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("reporting_settings")
    .select("*")
    .eq("singleton_key", true)
    .maybeSingle();
  return {
    data: (data as ReportingSettings | null) ?? defaultSettings,
    error:
      error || !data
        ? "Reporting settings could not load. Refresh before using the totals."
        : null,
  };
}

export async function getServiceCategories() {
  const supabase = await createClient();
  if (!supabase)
    return {
      data: [] as ServiceCategory[],
      error: "Supabase is not configured.",
    };
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("label");
  return {
    data: (data ?? []) as ServiceCategory[],
    error: error?.message ?? null,
  };
}

export async function getLeadSources() {
  const supabase = await createClient();
  if (!supabase)
    return {
      data: [] as LeadSourceRelation[],
      error: "Supabase is not configured.",
    };
  const { data, error } = await supabase
    .from("lead_sources")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return {
    data: (data ?? []) as LeadSourceRelation[],
    error: error?.message ?? null,
  };
}

export async function getReportData(
  filters: ReportFilters,
  _roles?: PlatformRoleName[],
  _userId?: string,
  options: {
    pages?: Record<string, number>;
    versions?: Record<string, string>;
    pageSize?: number;
    dashboard?: boolean;
    export?: boolean;
  } = {},
): Promise<
  BusinessReport & {
    canViewFinancials: boolean;
    canManageSettings: boolean;
    employees: ReportData["employees"];
  }
> {
  const db = await createClient();
  if (!db) throw Error("Reports are unavailable. Check the local connection.");
  const user = (await db.auth.getUser()).data.user;
  const roles = user ? await getUserRoles(db, user.id) : [];
  if (!user || !hasAllowedRole(roles, platformRoleGroups.reporting))
    throw Error("Reporting access could not be verified. Sign in again.");
  const result = await withDeadline(
    (signal) =>
      db
        .rpc("get_business_report", {
          p_view: options.dashboard ? "dashboard" : filters.view,
          p_start: filters.startDate,
          p_end: filters.endDate,
          p_filters: reportFilterArguments(filters),
          p_pages: options.pages ?? {},
          p_versions: options.versions ?? {},
          p_page_size: options.pageSize ?? 50,
          p_export: options.export ?? false,
        })
        .abortSignal(signal),
    options.export ? 22000 : 12000,
  );
  if (result.error)
    throw Error(
      result.error.code === "54000" && options.export
        ? "Export is limited to 10,000 detail rows. Choose a focused report or narrower work filters."
        : (result.error.code === "PT409" || result.error.code === "40001")
          ? "Report records changed. Refresh the report before continuing."
          : "The complete report could not load. Refresh before using its totals.",
    );
  const report = validateBusinessReport(
    result.data,
    options.dashboard ? "dashboard" : filters.view,
  );
  const financial =
    report.scope === "company" &&
    hasAllowedRole(roles, platformRoleGroups.financialReporting);
  let employees: ReportData["employees"] = [];
  if (
    financial &&
    filters.view === "profitability" &&
    !options.dashboard &&
    !options.export
  ) {
    const directory = await withDeadline(
      (signal) =>
        db.rpc("get_employee_operational_directory").abortSignal(signal),
      5000,
    );
    if (directory.error)
      throw Error("Employee choices could not load. Refresh the report.");
    employees = directory.data?.employees ?? [];
  }
  return {
    ...report,
    canViewFinancials: financial,
    canManageSettings: roles.some((r) => r === "owner" || r === "admin"),
    employees,
  };
}

export async function getJobCostEntries(jobId: string) {
  const supabase = await createClient();
  if (!supabase)
    return {
      data: [] as (ReportJobCost & { receipt_signed_url?: string | null })[],
      error: "Supabase is not configured.",
    };
  const { data, error } = await supabase
    .from("job_cost_entries")
    .select(
      "id, job_id, category, description, vendor_name, amount_cents, incurred_on, review_status, receipt_storage_path",
    )
    .eq("job_id", jobId)
    .is("archived_at", null)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { data: [], error: safeStaffMessage(error.message) };
  const rows = (data ?? []) as ReportJobCost[];
  const paths = rows
    .map((row) => row.receipt_storage_path)
    .filter((path): path is string => Boolean(path));
  if (!paths.length) return { data: rows, error: null };
  const signed = await privateFileLinks(supabase, "job_cost", rows.map(row => ({ id: row.id, storage_path: row.receipt_storage_path })));
  const urls = new Map(
    (signed.data ?? []).map((file) => [file.path, file.signedUrl]),
  );
  return {
    data: rows.map((row) => ({
      ...row,
      receipt_signed_url: row.receipt_storage_path
        ? (urls.get(row.receipt_storage_path) ?? null)
        : null,
    })),
    error: signed.error?.message ?? null,
  };
}

export async function getDashboardReportingSummary(
  _canViewFinancials: boolean,
) {
  const empty = {
    approvedQuoteCents: 0,
    quoteApprovalRate: null as number | null,
    invoicedCents: 0,
    collectedCents: 0,
    outstandingCents: 0,
    overdueCents: 0,
  };
  try {
    const settings = await getReportingSettings();
    if (settings.error) throw Error("Reporting settings unavailable");
    const filters = resolveReportFilters(
      { range: "month" },
      settings.data.business_timezone,
    );
    const r = await getReportData(filters, undefined, undefined, {
      dashboard: true,
      pageSize: 1,
    });
    if (
      !r.summary ||
      !Object.values(r.summary).every(
        (n) =>
          n === null ||
          (typeof n === "number" &&
            Number.isFinite(n) &&
            Math.abs(n) <= Number.MAX_SAFE_INTEGER),
      )
    )
      throw Error("Invalid dashboard totals");
    return { data: r.summary, error: null };
  } catch {
    return {
      data: empty,
      error:
        "Complete reporting totals are unavailable. Open Reports and refresh before using them.",
    };
  }
}

export function relation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function successfulPaymentTotal(invoice: ReportInvoice) {
  return invoice.payments
    .filter((payment) => payment.status === "succeeded")
    .reduce((sum, payment) => sum + netPaymentPrincipal(payment), 0);
}

const netPaymentPrincipal = netSuccessfulPaymentPrincipal;
