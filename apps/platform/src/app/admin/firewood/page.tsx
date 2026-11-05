import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { ListPagination } from "@/components/list-pagination";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getInvoiceCreationLookups } from "@/lib/data/invoice-lookup-pages";
import { getServiceCategories } from "@/lib/data/reports";
import { AddInvoiceForm } from "@/app/admin/invoices/InvoiceForm";
import { firewoodProducts } from "@/lib/firewood/catalog";
import { readFirewoodInvoices, firewoodInvoicePageSize } from "@/lib/firewood/invoices";
import { formatBusinessDateTime } from "@/lib/business-time";

export default async function FirewoodPage({ searchParams }: { searchParams: Promise<{ new?: string; page?: string }> }) {
  const params = await searchParams, creating = params.new === "1";
  const context = await getAuthenticatedPlatformContext(creating ? "/admin/firewood?new=1" : "/admin/firewood");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening firewood sales" />;
  if (!hasAllowedRole(context.roles, platformRoleGroups.internalStaff)) notFound();
  const options = creating ? await Promise.all([getInvoiceCreationLookups(), getServiceCategories()]) : null;
  const invoices = creating ? null : await readFirewoodInvoices(context.supabase, params.page);
  return <PlatformFrame active="firewood" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content firewood-page">
      <section className="page-heading"><div><h1>{creating ? "New firewood invoice" : "Firewood"}</h1><p>{creating ? "Delivery is included. Adjust prices and quantities before saving a draft." : "Household firewood sales, delivery charges and invoice balances."}</p></div>
        {creating ? <Link className="secondary-action" href="/admin/firewood">Back to Firewood</Link> : <Link className="primary-action" href="/admin/firewood?new=1">New firewood invoice</Link>}
      </section>
      {options ? options.some(x => x.error) ? <p className="form-message error" role="alert">Customer and delivery details could not be loaded. Refresh before creating a firewood invoice.</p> : <AddInvoiceForm userId={context.user.id} returnTo="/admin/firewood" lookupSeeds={options[0].data} initialValues={options[0].values} serviceCategories={options[1].data} firewood /> : null}
      {invoices ? invoices.error ? <p className="form-message error" role="alert">{invoices.error}</p> : <>
        <p className="form-helper">Full cord {money(Number(firewoodProducts.full.price) * 100)} delivered · Half cord {money(Number(firewoodProducts.half.price) * 100)} delivered · Optional stacking {money(Number(firewoodProducts.stacking.price) * 100)} per delivery. These starting prices can be edited on each invoice.</p>
        {invoices.count ? <p className="inline-empty">{invoices.count.toLocaleString("en-US")} firewood invoices</p> : null}
        <ListPagination basePath="/admin/firewood" count={invoices.count ?? 0} page={invoices.page} pageSize={firewoodInvoicePageSize} params={{}} />
        {invoices.data.length ? <div className="record-list">{invoices.data.map(item => <article className="record-card" key={item.id}><div className="record-card-header"><div><h2><Link href={`/admin/invoices/${item.id}?returnTo=%2Fadmin%2Ffirewood`}>{item.invoice_number ?? "Draft invoice"}</Link></h2><p>{item.customers?.display_name ?? "Customer"} · {formatBusinessDateTime(new Date(item.created_at), { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="status-pill">{item.status.replaceAll("_", " ")}</span></div><p>{money(item.total_cents)} total · {money(item.balance_due_cents)} due</p></article>)}</div> : <p className="inline-empty">No firewood invoices yet. Create one using the current delivered prices.</p>}
        <ListPagination basePath="/admin/firewood" count={invoices.count ?? 0} page={invoices.page} pageSize={firewoodInvoicePageSize} params={{}} />
      </> : null}
      <p><Link href="/admin/invoices">All invoices</Link></p>
      {hasAllowedRole(context.roles, platformRoleGroups.accessApproval) ? <p><Link href="/admin/firewood/office">Website order approvals and cancellations</Link></p> : null}
    </div>
  </PlatformFrame>;
}
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
