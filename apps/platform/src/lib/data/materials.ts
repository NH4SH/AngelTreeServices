import "server-only";

import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type MaterialRecord = {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  description: string | null;
  default_unit: string;
  stock_tracked: boolean;
  is_billable: boolean;
  default_price_cents: number | null;
  preferred_vendor_organization_id: string | null;
  reorder_threshold: number | null;
  notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryLocationRecord = {
  id: string;
  name: string;
  location_type: string;
  address: string | null;
  equipment_asset_id: string | null;
  notes: string | null;
  is_active: boolean;
};

export type StockBalanceRecord = {
  material_id: string;
  location_id: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  latest_transaction_at: string | null;
};

export type MaterialWorkspaceData = {
  materials: MaterialRecord[];
  locations: InventoryLocationRecord[];
  balances: StockBalanceRecord[];
  transactions: any[];
  reservations: any[];
  purchases: any[];
  disposalRecords: any[];
  loads: any[];
  deliveries: any[];
  productionBatches: any[];
  stockpileMeasurements: any[];
  jobs: any[];
  customers: any[];
  organizations: any[];
  equipment: any[];
  costs: any[];
  transactionCosts: any[];
  canViewCosts: boolean;
  error: string | null;
};

export async function getMaterialsWorkspace(roles: PlatformRoleName[]): Promise<MaterialWorkspaceData> {
  const supabase = await createClient();
  const empty: MaterialWorkspaceData = {
    materials: [], locations: [], balances: [], transactions: [], reservations: [], purchases: [],
    disposalRecords: [], loads: [], deliveries: [], productionBatches: [], stockpileMeasurements: [],
    jobs: [], customers: [], organizations: [], equipment: [], costs: [],
    transactionCosts: [], canViewCosts: false, error: "Supabase is not configured.",
  };
  if (!supabase) return empty;

  const canViewCosts = hasAllowedRole(roles, platformRoleGroups.financialReporting);
  const results = await Promise.all([
    supabase.from("material_catalog").select("*").is("archived_at", null).order("name"),
    supabase.from("inventory_locations").select("*").is("archived_at", null).order("name"),
    supabase.from("material_stock_balances").select("*").order("material_id"),
    supabase.from("inventory_transactions").select("*").order("occurred_at", { ascending: false }).limit(150),
    supabase.from("inventory_reservations").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("material_purchases").select("*").order("purchase_date", { ascending: false }).limit(60),
    supabase.from("disposal_records").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("material_loads").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("customer_deliveries").select("*").order("delivery_window_start", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("production_batches").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("stockpile_measurements").select("*").order("measured_at", { ascending: false }).limit(100),
    supabase.from("jobs").select("id, customer_id, service_location_id, service_type, status, scheduled_start_at, customers(display_name)").not("status", "in", "(paid,lost,cancelled)").order("updated_at", { ascending: false }).limit(200),
    supabase.from("customers").select("id, display_name, service_locations(id, label, street, city, state, postal_code)").eq("status", "active").order("display_name"),
    supabase.from("organizations").select("id, name, organization_type, billing_email, billing_phone").order("name"),
    supabase.from("equipment_assets").select("id, asset_number, name, category, status").eq("is_active", true).order("name"),
    canViewCosts
      ? supabase.from("material_cost_settings").select("*")
      : Promise.resolve({ data: [], error: null }),
    canViewCosts
      ? supabase.from("inventory_transaction_costs").select("*").order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = results.find((result) => result.error)?.error?.message ?? null;
  return {
    materials: (results[0].data ?? []) as MaterialRecord[],
    locations: (results[1].data ?? []) as InventoryLocationRecord[],
    balances: (results[2].data ?? []) as StockBalanceRecord[],
    transactions: results[3].data ?? [], reservations: results[4].data ?? [], purchases: results[5].data ?? [],
    disposalRecords: results[6].data ?? [], loads: results[7].data ?? [], deliveries: results[8].data ?? [],
    productionBatches: results[9].data ?? [], stockpileMeasurements: results[10].data ?? [],
    jobs: results[11].data ?? [], customers: results[12].data ?? [], organizations: results[13].data ?? [],
    equipment: results[14].data ?? [], costs: results[15].data ?? [], transactionCosts: results[16].data ?? [], canViewCosts, error: firstError,
  };
}

export async function getMaterialCatalogOptions() {
  const supabase = await createClient();
  if (!supabase) return { data: [] as MaterialRecord[], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("material_catalog").select("*").eq("is_active", true).is("archived_at", null).order("name");
  return { data: (data ?? []) as MaterialRecord[], error: error?.message ?? null };
}

export async function getMaterialsDashboardSummary() {
  const supabase = await createClient();
  if (!supabase) return { data: { items: [] as { href: string; title: string; meta: string }[] }, error: "Supabase is not configured." };
  const [materials, balances, disposals, deliveries] = await Promise.all([
    supabase.from("material_catalog").select("id, name, default_unit, reorder_threshold").eq("stock_tracked", true).eq("is_active", true).is("archived_at", null),
    supabase.from("material_stock_balances").select("material_id, available_quantity"),
    supabase.from("disposal_records").select("id, destination_name, fee_cents, receipt_storage_path").eq("status", "completed").gt("fee_cents", 0).is("receipt_storage_path", null).limit(8),
    supabase.from("customer_deliveries").select("id, delivery_window_start, status").not("status", "in", "(delivered,cancelled)").lte("delivery_window_start", new Date(Date.now() + 86400000).toISOString()).limit(8),
  ]);
  const lowStock = (materials.data ?? []).filter((material) => material.reorder_threshold != null && (balances.data ?? []).filter((balance) => balance.material_id === material.id).reduce((sum, balance) => sum + Number(balance.available_quantity), 0) <= Number(material.reorder_threshold));
  const items = [
    ...lowStock.slice(0, 6).map((material) => ({ href: "/admin/materials?view=catalog", title: `${material.name} is low`, meta: "At or below reorder threshold" })),
    ...(disposals.data ?? []).map((record) => ({ href: "/admin/materials?view=disposal", title: "Disposal receipt missing", meta: record.destination_name })),
    ...(deliveries.data ?? []).map(() => ({ href: "/admin/materials?view=deliveries", title: "Customer delivery due", meta: "Due within 24 hours or overdue" })),
  ];
  return { data: { items }, error: materials.error?.message ?? balances.error?.message ?? disposals.error?.message ?? deliveries.error?.message ?? null };
}

export async function getJobMaterials(jobId: string, roles: PlatformRoleName[], userId: string) {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  const isStaff = hasAllowedRole(roles, platformRoleGroups.internalStaff);

  const [jobResult, materials, locations, requirements, reservations, transactions, disposals] = await Promise.all([
    supabase.from("jobs").select("id, assigned_crew_user_id, status, debris_handling, debris_handling_notes").eq("id", jobId).single(),
    supabase.from("material_catalog").select("id, name, category, default_unit, stock_tracked, is_active").eq("is_active", true).is("archived_at", null).order("name"),
    supabase.from("inventory_locations").select("id, name, location_type").eq("is_active", true).is("archived_at", null).order("name"),
    supabase.from("job_material_requirements").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("inventory_reservations").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
    supabase.from("inventory_transactions").select("*").eq("job_id", jobId).order("occurred_at", { ascending: false }),
    supabase.from("disposal_records").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
  ]);
  const assigned = jobResult.data?.assigned_crew_user_id === userId;
  if (!isStaff && !assigned) return { data: null, error: "This work order is not assigned to your account." };
  const firstError = [jobResult, materials, locations, requirements, reservations, transactions, disposals].find((result) => result.error)?.error?.message ?? null;
  return {
    data: jobResult.data ? {
      job: jobResult.data,
      materials: materials.data ?? [], locations: locations.data ?? [], requirements: requirements.data ?? [],
      reservations: reservations.data ?? [], transactions: transactions.data ?? [], disposals: disposals.data ?? [],
    } : null,
    error: firstError,
  };
}
