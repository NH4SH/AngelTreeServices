import Link from "next/link";
import { Pencil } from "lucide-react";
import { EquipmentAssetForm } from "../../EquipmentForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEquipmentAsset } from "@/lib/data/equipment";

export default async function EquipmentEditPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/equipment/${assetId}/edit`);
  if (!context.configured) return <SetupRequired title="Configure Supabase before editing equipment" />;
  const detail = await getEquipmentAsset(assetId);
  const canSeeCosts = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const costResult = canSeeCosts ? await context.supabase.from("equipment_asset_costs").select("purchase_price_cents").eq("asset_id", assetId).maybeSingle() : { data: null, error: null };
  return <PlatformFrame active="equipment" roles={context.roles} userEmail={context.user.email}><div className="shell app-content"><Link className="crew-back-link" href={`/admin/equipment/${assetId}`}>Back to equipment record</Link>{detail.error ? <section className="data-warning"><strong>Database notice</strong><p>{detail.error}</p></section> : null}{detail.data ? <><section className="page-heading"><p className="surface-label"><Pencil size={17} />Edit equipment</p><h1>{detail.data.name}</h1><p>Changes update this asset without replacing its assignment, reading, maintenance, inspection, repair, or document history.</p></section><section className="form-panel equipment-edit-panel"><EquipmentAssetForm asset={detail.data} canSeeCosts={canSeeCosts} purchasePriceCents={costResult.data?.purchase_price_cents ?? null} /></section></> : <section className="empty-state"><h2>Equipment not found</h2><p>This record is unavailable.</p></section>}</div></PlatformFrame>;
}
