import Link from "next/link";
import { AlertTriangle, Gauge, Plus, Search, ShieldAlert, Truck, Wrench } from "lucide-react";
import { EquipmentAssetForm } from "./EquipmentForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEquipmentAssets, getEquipmentDashboardSummary, getEquipmentFormOptions } from "@/lib/data/equipment";
import type { EquipmentAsset } from "@/lib/types/database";

type EquipmentPageProps = { searchParams: Promise<{ category?: string; status?: string; crew?: string; maintenance?: string; q?: string; new?: string; archived?: string }> };

export default async function EquipmentPage({ searchParams }: EquipmentPageProps) {
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/equipment");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening equipment" />;
  const [assetsResult, summaryResult, options] = await Promise.all([getEquipmentAssets(), getEquipmentDashboardSummary(), getEquipmentFormOptions()]);
  const dueAssetIds = new Set(summaryResult.data.dueMaintenance.map((item) => item.asset_id));
  const assets = assetsResult.data.filter((asset) => matches(asset, query, dueAssetIds));
  const summary = summaryResult.data;
  const canSeeCosts = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);

  return <PlatformFrame active="equipment" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content equipment-page">
      <section className="page-heading commerce-heading"><div><p className="surface-label"><Truck size={17} />Fleet operations</p><h1>Equipment</h1><p>Vehicles, tools, safety checks, assignments, repairs, and maintenance in one operational record.</p></div><Link className="primary-action" href="/admin/equipment?new=1"><Plus size={18} />Add equipment</Link></section>
      {query.archived ? <p className="form-message success">Equipment archived. Its history remains available in the database.</p> : null}
      {assetsResult.error ? <DataWarning message={assetsResult.error} /> : null}
      {summaryResult.error && !assetsResult.error ? <DataWarning message={summaryResult.error} /> : null}
      <section className="equipment-summary-grid" aria-label="Fleet attention summary">
        <SummaryCard href="/admin/equipment?status=out_of_service" icon={<ShieldAlert size={20} />} label="Out of service" tone="danger" value={summary.outOfService.length} />
        <SummaryCard href="/admin/equipment?status=maintenance_due" icon={<Wrench size={20} />} label="Maintenance due soon" tone="warning" value={summary.dueMaintenance.length} />
        <SummaryCard href="/admin/equipment?status=out_of_service" icon={<AlertTriangle size={20} />} label="Open problems" tone="warning" value={summary.openProblems.length} />
        <SummaryCard href="/admin/equipment" icon={<Gauge size={20} />} label="Active fleet" tone="success" value={assetsResult.data.length} />
      </section>
      <form className="equipment-filter-bar" method="get">
        <label className="equipment-search"><Search size={18} /><span className="sr-only">Search equipment</span><input defaultValue={query.q ?? ""} name="q" placeholder="Search name, asset number, serial, VIN, plate" /></label>
        <label><span>Status</span><select defaultValue={query.status ?? ""} name="status"><option value="">All statuses</option>{["available", "assigned", "in_use", "maintenance_due", "out_of_service", "awaiting_parts", "repair_scheduled", "retired"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
        <label><span>Category</span><select defaultValue={query.category ?? ""} name="category"><option value="">All categories</option>{Array.from(new Set(assetsResult.data.map((asset) => asset.category))).map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
        <label><span>Assigned employee</span><select defaultValue={query.crew ?? ""} name="crew"><option value="">All employees</option><option value="unassigned">Unassigned</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Employee"}</option>)}</select></label>
        <label><span>Maintenance</span><select defaultValue={query.maintenance ?? ""} name="maintenance"><option value="">Any maintenance state</option><option value="due">Due within 30 days</option></select></label>
        <button className="secondary-action" type="submit">Apply filters</button>
      </form>
      <div className="crm-layout"><section className="crm-main"><div className="record-list equipment-record-list">{assets.length ? assets.map((asset) => <EquipmentCard asset={asset} key={asset.id} />) : <section className="empty-state"><h2>No equipment matches</h2><p>Clear filters or add the first fleet record.</p></section>}</div></section><aside className="crm-side">{query.new === "1" ? <section className="form-panel"><h2>Add equipment</h2><p>Duplicate checks compare serial numbers, VINs, and plates before saving.</p><EquipmentAssetForm canSeeCosts={canSeeCosts} /></section> : <section className="notice-panel"><strong>Assignments are safety checked</strong><p>Out-of-service assets, overdue inspections, maintenance due, and overlapping reservations block assignment unless an owner/admin records a deliberate override.</p></section>}</aside></div>
    </div>
  </PlatformFrame>;
}

function EquipmentCard({ asset }: { asset: EquipmentAsset }) {
  const dueInspection = asset.next_inspection_due_at && new Date(asset.next_inspection_due_at) <= new Date();
  return <article className={`record-card equipment-card status-${asset.status}`}><div className="record-card-header"><div><p className="record-kicker">{asset.asset_number} · {title(asset.category)}</p><h2>{asset.name}</h2></div><span className={`equipment-status status-${asset.status}`}>{title(asset.status)}</span></div><p>{[asset.manufacturer, asset.model, asset.model_year].filter(Boolean).join(" ") || "Equipment details not entered"}</p><dl className="record-details"><div><dt>Location</dt><dd>{asset.location_label || "Not set"}</dd></div><div><dt>Reading</dt><dd>{asset.current_mileage != null ? `${asset.current_mileage.toLocaleString()} mi` : asset.current_hours != null ? `${asset.current_hours.toLocaleString()} hr` : "Not recorded"}</dd></div><div><dt>Inspection</dt><dd className={dueInspection ? "attention-text" : undefined}>{asset.next_inspection_due_at ? formatDate(asset.next_inspection_due_at) : "No due date"}</dd></div></dl><Link className="secondary-action" href={`/admin/equipment/${asset.id}`}>Open equipment record</Link></article>;
}

function SummaryCard({ href, icon, label, tone, value }: { href: string; icon: React.ReactNode; label: string; tone: string; value: number }) { return <Link className={`equipment-summary-card ${tone}`} href={href}><span>{icon}</span><strong>{value}</strong><small>{label}</small></Link>; }
function matches(asset: EquipmentAsset, query: { category?: string; status?: string; crew?: string; maintenance?: string; q?: string }, dueAssetIds: Set<string>) { const q = query.q?.trim().toLowerCase(); const crewMatches = !query.crew || (query.crew === "unassigned" ? !asset.assigned_employee_id : asset.assigned_employee_id === query.crew); return (!query.category || asset.category === query.category) && (!query.status || asset.status === query.status) && crewMatches && (!query.maintenance || (query.maintenance === "due" && dueAssetIds.has(asset.id))) && (!q || [asset.name, asset.asset_number, asset.manufacturer, asset.model, asset.serial_number, asset.vin, asset.license_plate].some((value) => value?.toLowerCase().includes(q))); }
function title(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function DataWarning({ message }: { message: string }) { return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>; }
