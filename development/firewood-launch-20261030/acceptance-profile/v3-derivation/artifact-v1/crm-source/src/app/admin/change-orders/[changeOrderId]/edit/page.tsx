import Link from "next/link";
import { ChangeOrderEditor } from "@/components/change-order-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getChangeOrderDetail, getChangeOrderFormOptions } from "@/lib/data/change-orders";
import { getMaterialCatalogOptions } from "@/lib/data/materials";
import { getServiceCategories } from "@/lib/data/reports";

export default async function EditChangeOrderPage({ params }: { params: Promise<{ changeOrderId: string }> }) {
  const { changeOrderId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/change-orders/${changeOrderId}/edit`);
  if (!context.configured) return <SetupRequired title="Configure Supabase before editing change orders" />;
  const [detail, options, materials, categories] = await Promise.all([getChangeOrderDetail(changeOrderId), getChangeOrderFormOptions(), getMaterialCatalogOptions(), getServiceCategories()]);
  return <PlatformFrame active="change-orders" roles={context.roles} userEmail={context.user.email}><div className="shell app-content commerce-page"><Link className="crew-back-link" href={`/admin/change-orders/${changeOrderId}`}>Back to change order</Link>{detail.error ? <section className="data-warning"><strong>Database notice</strong><p>{detail.error}</p></section> : null}{detail.data ? <ChangeOrderEditor canViewCosts={hasAllowedRole(context.roles, platformRoleGroups.financialReporting)} contacts={options.contacts} jobs={options.jobs} materials={materials.data} order={detail.data} serviceCategories={categories.data} /> : <section className="empty-state"><h1>Change order unavailable</h1></section>}</div></PlatformFrame>;
}
