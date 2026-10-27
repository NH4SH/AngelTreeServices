import Link from "next/link";
import { FilePlus2, Plus, ShieldCheck } from "lucide-react";
import { ChangeOrderEditor } from "@/components/change-order-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { ListPagination } from "@/components/list-pagination";
import { changeOrderListSize, changeOrderPage, getChangeOrdersPage, getChangeOrderSummary, getChangeOrderCreationSeed } from "@/lib/data/change-order-loading";
import { getMaterialCatalogOptions } from "@/lib/data/materials";
import { getServiceCategories } from "@/lib/data/reports";
import "./loading.css";

type Props = { searchParams: Promise<{ new?: string; jobId?: string; closeoutId?: string; page?: string }> };

export default async function ChangeOrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/change-orders");
  if (!context.configured) return <SetupRequired title="Configure Supabase before managing change orders" />;
  const creating = params.new === "1", page = changeOrderPage(params.page);
  const [orders, summary, seed, materials, categories] = await Promise.all([
    creating ? { data: [], count: 0, error: null } : getChangeOrdersPage(page),
    creating ? { data: [], error: null } : getChangeOrderSummary(),
    creating ? getChangeOrderCreationSeed(params.jobId) : { data: undefined, error: null },
    creating ? getMaterialCatalogOptions() : { data: [], error: null },
    creating ? getServiceCategories() : { data: [], error: null },
  ]);
  const canViewCosts = hasAllowedRole(context.roles, platformRoleGroups.financialReporting);
  return (
    <PlatformFrame active="change-orders" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <section className="page-heading commerce-heading"><div><p className="surface-label"><FilePlus2 size={18} /> Scope control</p><h1>Work additions</h1><p>Additional lines stay attached to their original work orders while approval and billing remain traceable.</p></div><Link className="primary-action" href="/admin/jobs"><Plus size={18} /> Choose work order</Link></section>
        {[orders.error, summary.error, seed.error, materials.error, categories.error].filter(Boolean).map((message) => <section className="data-warning" role="status" key={message}><strong>Database notice</strong><p>{message}</p></section>)}
        {!creating ? <><section className="commerce-summary-strip" aria-label="Change order summary">
          <Summary label="Needs office review" value={summary.data[0]} />
          <Summary label="Awaiting customer" value={summary.data[1]} />
          <Summary label="Approved additions" value={summary.data[2]} />
          <Summary label="Unbilled approved" value={summary.data[3]} />
        </section>
        {orders.data.length ? <section className="change-order-list">{orders.data.map((order) => <article className="change-order-list-row" key={order.id}><div><span className={`status-pill change-order-status ${order.status}`}>{order.status.replaceAll("_", " ")}</span><Link href={`/admin/change-orders/${order.id}`}>{order.change_order_number}</Link><strong>{order.title}</strong><span>{order.organizations?.name ?? order.customers?.display_name ?? "Unknown account"} - {order.service_locations?.label || order.service_locations?.street || "No service location"}</span></div><div><small>Additional amount</small><strong>{money(order.total_cents)}</strong><span>{order.invoice_id ? "Billed" : order.status === "approved" ? "Ready for billing" : "Not billable yet"}</span></div><Link className="secondary-action" href={`/admin/change-orders/${order.id}`}>Review addition</Link></article>)}</section> : orders.error ? <p>Reload this page to try loading work additions again.</p> : <section className="empty-state"><ShieldCheck size={26} /><h2>{page > 1 ? "No additions on this page" : "No work additions yet"}</h2><p>{page > 1 ? "Use Previous to return to earlier pages." : "Open a work order and add a line from its Scope of work section."}</p></section>}
        <ListPagination basePath="/admin/change-orders" page={page} pageSize={changeOrderListSize} count={orders.count} params={{}} /></> : null}
        {creating ? materials.error || categories.error ? <section className="empty-state"><h2>Editor unavailable</h2><p>Reload before editing; the available billing choices could not load completely.</p></section> : <section className="change-order-create-panel"><div className="change-order-create-heading"><Link className="crew-back-link" href="/admin/change-orders">Close editor</Link></div><ChangeOrderEditor key={`${context.user.id}:${params.jobId ?? ""}:${params.closeoutId ?? ""}`} creation={{ userId: context.user.id, seed: seed.data }} canViewCosts={canViewCosts} contacts={[]} defaultJobId={params.jobId} jobs={[]} materials={materials.data} serviceCategories={categories.data} sourceCloseoutId={params.closeoutId} /></section> : null}
      </div>
    </PlatformFrame>
  );
}

function Summary({ label, value }: { label: string; value: number | null | undefined }) { return <div className="commerce-summary-chip"><span>{label}</span><strong>{value ?? "—"}</strong></div>; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
