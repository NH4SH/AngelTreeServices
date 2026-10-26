import Link from "next/link";
import { ChangeOrderEditor } from "@/components/change-order-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getChangeOrderForEditing } from "@/lib/data/change-orders";
import { getMaterialCatalogOptions } from "@/lib/data/materials";
import { getServiceCategories } from "@/lib/data/reports";

export default async function EditChangeOrderPage({ params }: { params: Promise<{ changeOrderId: string }> }) {
  const { changeOrderId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/change-orders/${changeOrderId}/edit`);
  if (!context.configured) return <SetupRequired title="Configure Supabase before editing change orders" />;
  const [detail, materials, categories] = await Promise.all([getChangeOrderForEditing(changeOrderId), getMaterialCatalogOptions(), getServiceCategories()]);
  const errors = [detail.error, materials.error, categories.error].filter((error): error is string => Boolean(error));
  return <PlatformFrame active="change-orders" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content commerce-page">
      <Link className="crew-back-link" href={`/admin/change-orders/${changeOrderId}`}>Back to change order</Link>
      {errors.map(message => <section className="data-warning" key={message} role="status"><strong>Database notice</strong><p>{message}</p></section>)}
      {errors.length ? <section className="empty-state"><h1>Editor unavailable</h1><p>Some details could not load. Reload before editing.</p><Link className="primary-action" href={`/admin/change-orders/${changeOrderId}/edit`}>Reload editor</Link></section>
        : detail.data ? <ChangeOrderEditor canViewCosts={hasAllowedRole(context.roles, platformRoleGroups.financialReporting)} contacts={detail.contacts} jobs={detail.jobs} materials={materials.data} order={detail.data} serviceCategories={categories.data} />
        : <section className="empty-state"><h1>Change order unavailable</h1></section>}
    </div>
  </PlatformFrame>;
}
