import Link from "next/link";
import { FilePlus2, Plus, ShieldCheck } from "lucide-react";
import { ChangeOrderEditor } from "@/components/change-order-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getChangeOrderFormOptions, getChangeOrders } from "@/lib/data/change-orders";
import { getMaterialCatalogOptions } from "@/lib/data/materials";
import { getServiceCategories } from "@/lib/data/reports";

type Props = { searchParams: Promise<{ new?: string; jobId?: string; closeoutId?: string }> };

export default async function ChangeOrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/change-orders");
  if (!context.configured) return <SetupRequired title="Configure Supabase before managing change orders" />;
  const [orders, options, materials, categories] = await Promise.all([
    getChangeOrders(), getChangeOrderFormOptions(), getMaterialCatalogOptions(), getServiceCategories(),
  ]);
  const canViewCosts = hasAllowedRole(context.roles, platformRoleGroups.financialReporting);
  return (
    <PlatformFrame active="change-orders" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <section className="page-heading commerce-heading"><div><p className="surface-label"><FilePlus2 size={18} /> Scope control</p><h1>Work additions</h1><p>Additional lines stay attached to their original work orders while approval and billing remain traceable.</p></div><Link className="primary-action" href="/admin/jobs"><Plus size={18} /> Choose work order</Link></section>
        {[orders.error, options.error, materials.error, categories.error].filter(Boolean).map((message) => <section className="data-warning" key={message}><strong>Database notice</strong><p>{message}</p></section>)}
        <section className="commerce-summary-strip" aria-label="Change order summary">
          <Summary label="Needs office review" value={orders.data.filter((order) => ["draft", "pending_internal_review"].includes(order.status)).length} />
          <Summary label="Awaiting customer" value={orders.data.filter((order) => ["ready_to_send", "sent", "change_requested"].includes(order.status)).length} />
          <Summary label="Approved additions" value={orders.data.filter((order) => order.status === "approved").length} />
          <Summary label="Unbilled approved" value={orders.data.filter((order) => order.status === "approved" && !order.invoice_id).length} />
        </section>
        {orders.data.length ? <section className="change-order-list">{orders.data.map((order) => <article className="change-order-list-row" key={order.id}><div><span className={`status-pill change-order-status ${order.status}`}>{order.status.replaceAll("_", " ")}</span><Link href={`/admin/change-orders/${order.id}`}>{order.change_order_number}</Link><strong>{order.title}</strong><span>{order.organizations?.name ?? order.customers?.display_name ?? "Unknown account"} - {order.service_locations?.label || order.service_locations?.street || "No service location"}</span></div><div><small>Additional amount</small><strong>{money(order.total_cents)}</strong><span>{order.invoice_id ? "Billed" : order.status === "approved" ? "Ready for billing" : "Not billable yet"}</span></div><Link className="secondary-action" href={`/admin/change-orders/${order.id}`}>Review addition</Link></article>)}</section> : <section className="empty-state"><ShieldCheck size={26} /><h2>No work additions yet</h2><p>Open a work order and add a line from its Scope of work section.</p></section>}
        {params.new === "1" ? <section className="change-order-create-panel"><div className="change-order-create-heading"><Link className="crew-back-link" href="/admin/change-orders">Close editor</Link></div><ChangeOrderEditor canViewCosts={canViewCosts} contacts={options.contacts} defaultJobId={params.jobId} jobs={options.jobs} materials={materials.data} serviceCategories={categories.data} sourceCloseoutId={params.closeoutId} /></section> : null}
      </div>
    </PlatformFrame>
  );
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="commerce-summary-chip"><span>{label}</span><strong>{value}</strong></div>; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
