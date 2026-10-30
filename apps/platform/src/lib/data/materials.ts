import "server-only";

import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { materialCatalogPage, resolveMaterialsView, type MaterialsView, type MaterialCatalogFilters } from "@/lib/materials/workspace-view";

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
  materialLabels: Pick<MaterialRecord, "id" | "name" | "default_unit">[];
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
  catalogCount?: number;
  catalogCategories?: string[];
};

export async function getMaterialsWorkspace(roles: PlatformRoleName[], requestedView: MaterialsView = "overview", filters: MaterialCatalogFilters = {}): Promise<MaterialWorkspaceData> {
  const empty: MaterialWorkspaceData = {
    materials: [], materialLabels: [], locations: [], balances: [], transactions: [], reservations: [], purchases: [],
    disposalRecords: [], loads: [], deliveries: [], productionBatches: [], stockpileMeasurements: [],
    jobs: [], customers: [], organizations: [], equipment: [], costs: [], transactionCosts: [],
    canViewCosts: false, error: null,
  };
  const unavailable = "This materials view could not load completely. Reload before making changes.";
  try {
    const supabase = await createClient();
    if (!supabase) return { ...empty, error: "Supabase is not configured." };
    const view = resolveMaterialsView(requestedView), needs = (...views: MaterialsView[]) => views.includes(view);
    const canViewCosts = hasAllowedRole(roles, platformRoleGroups.financialReporting);
    type Dataset = Exclude<keyof MaterialWorkspaceData, "error" | "canViewCosts" | "catalogCount" | "catalogCategories">;
    type Reply = { data: unknown[] | null; error: { message: string } | null };
    const reads: Partial<Record<Dataset, PromiseLike<Reply>>> = {};
    // Every view uses material labels or choices. Read all unarchived choices in
    // stable pages; only the catalog's current page reaches its edit/list surface.
    if (needs("overview", "catalog")) reads.materials = (async () => {
      const rows: MaterialRecord[] = [], ids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const result = await supabase.from("material_catalog").select("*").is("archived_at", null).order("name").order("id").range(from, from + 999);
        if (result.error || !Array.isArray(result.data)) throw Error(unavailable);
        for (const row of result.data) { if (!row || typeof row.id !== "string" || ids.has(row.id)) throw Error(unavailable); ids.add(row.id); rows.push(row as MaterialRecord); }
        if (result.data.length < 1000) return { data: rows, error: null };
      }
    })();
    if (view !== "catalog") reads.locations = supabase.from("inventory_locations").select("*").is("archived_at", null).order("name");
    if (needs("overview", "catalog")) reads.balances = supabase.from("material_stock_balances").select("*").order("material_id");
    if (needs("overview", "movements")) reads.transactions = supabase.from("inventory_transactions").select("id, material_id, transaction_type, quantity, unit, source_location_id, destination_location_id, job_id, occurred_at, is_estimated").order("occurred_at", { ascending: false }).limit(view === "overview" ? 8 : 150);
    if (view === "reservations") reads.reservations = supabase.from("inventory_reservations").select("id, material_id, location_id, job_id, quantity, unit, status").order("created_at", { ascending: false }).limit(100);
    if (view === "purchases") reads.purchases = supabase.from("material_purchases").select(`id, vendor_name, vendor_organization_id, purchase_date, received_location_id${canViewCosts ? ", total_cents" : ""}`).order("purchase_date", { ascending: false }).limit(60);
    if (needs("overview", "disposal")) reads.disposalRecords = supabase.from("disposal_records").select("id, destination_name, destination_type, job_id, quantity, unit, is_estimated, status, fee_cents, receipt_storage_path").order("created_at", { ascending: false }).limit(100);
    if (needs("overview", "deliveries")) reads.deliveries = supabase.from("customer_deliveries").select("id, material_id, customer_id, organization_id, quantity, unit, status, delivery_window_start").order("delivery_window_start", { ascending: false, nullsFirst: false }).limit(100);
    if (view === "production") reads.productionBatches = supabase.from("production_batches").select("id, batch_number, product_material_id, status, color, estimated_output_quantity, output_unit").order("created_at", { ascending: false }).limit(60);
    if (needs("overview", "production")) reads.stockpileMeasurements = supabase.from("stockpile_measurements").select("id, material_id, location_id, measured_at, quantity, unit, measurement_method, is_estimated").order("measured_at", { ascending: false }).limit(100);
    if (canViewCosts && needs("overview", "movements")) reads.transactionCosts = supabase.from("inventory_transaction_costs").select("transaction_id, direct_cost_cents, costing_status").order("created_at", { ascending: false }).limit(500);
    const entries = Object.entries(reads) as [Dataset, PromiseLike<Reply>][];
    const results = await Promise.all(entries.map(async ([name, request]) => {
      const reply = await request;
      if (reply.error || !Array.isArray(reply.data)) throw Error(unavailable);
      return [name, reply.data] as const;
    }));
    const data = { ...empty, ...Object.fromEntries(results), canViewCosts } as MaterialWorkspaceData;
    const extra: Promise<void>[] = [];
    if (view === "catalog") {
      const catalog = materialCatalogPage(data.materials, filters);
      data.materials = catalog.data; data.catalogCount = catalog.count; data.catalogCategories = catalog.categories;
      if (canViewCosts && data.materials.length) extra.push((async () => {
        const costs = await supabase.from("material_cost_settings").select("material_id, internal_unit_cost_cents").in("material_id", data.materials.map(row => row.id));
        if (costs.error || !Array.isArray(costs.data)) throw Error(unavailable);
        data.costs = costs.data;
      })());
    }
    // Hydrate labels only for displayed history or the single open editor.
    // Browsing new vendor/customer choices happens through the paged lookup.
    const selectedMaterial = view === "catalog" ? data.materials.find(row => row.id === filters.edit) : undefined;
    const organizationIds = [...new Set((view === "catalog" ? [selectedMaterial?.preferred_vendor_organization_id]
      : view === "purchases" ? data.purchases.filter(row => !row.vendor_name).map(row => row.vendor_organization_id)
      : view === "deliveries" ? data.deliveries.map(row => row.organization_id) : []).filter((id): id is string => Boolean(id)))];
    const customerIds = view === "deliveries" ? [...new Set(data.deliveries.filter(row => !row.organization_id).map(row => row.customer_id).filter(Boolean))] : [];
    if (organizationIds.length) extra.push((async () => {
      const result = await supabase.from("organizations").select("id, name").in("id", organizationIds).is("archived_at", null).order("name").order("id");
      if (result.error || !Array.isArray(result.data)) throw Error(unavailable);
      data.organizations = result.data;
    })());
    if (customerIds.length) extra.push((async () => {
      const result = await supabase.from("customers").select("id, display_name").in("id", customerIds).is("archived_at", null).eq("status", "active").order("display_name").order("id");
      if (result.error || !Array.isArray(result.data)) throw Error(unavailable);
      data.customers = result.data;
    })());
    const materialIds = [...new Set((view === "movements" ? data.transactions : view === "reservations" ? data.reservations.filter(row => row.status === "active") : view === "deliveries" ? data.deliveries : []).map(row => row.material_id).filter(Boolean))];
    if (view === "production") for (const id of [...data.productionBatches.map(row => row.product_material_id), ...data.stockpileMeasurements.slice(0, 12).map(row => row.material_id)]) if (id && !materialIds.includes(id)) materialIds.push(id);
    if (materialIds.length) extra.push((async () => {
      const result = await supabase.from("material_catalog").select("id, name, default_unit").in("id", materialIds).is("archived_at", null).order("name").order("id");
      if (result.error || !Array.isArray(result.data)) throw Error(unavailable);
      data.materialLabels = result.data;
    })());
    const jobIds = [...new Set((needs("overview", "movements") ? data.transactions : view === "reservations" ? data.reservations.filter(row => row.status === "active") : view === "disposal" ? data.disposalRecords : []).map(row => row.job_id).filter(Boolean))];
    if (jobIds.length) extra.push((async () => {
      const result = await supabase.from("jobs").select("id, service_type, status, customers:customers!jobs_customer_id_fkey(display_name)").in("id", jobIds).is("archived_at", null).not("status", "in", "(paid,lost,cancelled)").order("updated_at", { ascending: false }).order("id");
      if (result.error || !Array.isArray(result.data)) throw Error(unavailable);
      data.jobs = result.data;
    })());
    await Promise.all(extra);
    return data;
  } catch { return { ...empty, error: unavailable }; }
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
