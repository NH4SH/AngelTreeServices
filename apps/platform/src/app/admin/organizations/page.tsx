import Link from "next/link";
import { Building2, Mail, Phone } from "lucide-react";
import { AddOrganizationForm } from "./OrganizationForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getOrganizations } from "@/lib/data/organizations";

export default async function OrganizationsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/organizations");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening organizations" />;
  const organizations = await getOrganizations();
  return <PlatformFrame active="organizations" roles={context.roles} userEmail={context.user.email}><div className="shell app-content"><section className="page-heading"><p className="surface-label"><Building2 size={18} />Organizations</p><h1>Keep property managers, HOAs, and repeat commercial clients organized.</h1><p>Organization records group contacts, linked customers, properties, jobs, quotes, and invoices without exposing them publicly.</p></section>{organizations.error ? <Warning message={organizations.error} /> : null}<section className="crm-layout"><div className="crm-main">{organizations.data.length ? <div className="record-list">{organizations.data.map((organization) => <article className="record-card" key={organization.id}><div className="record-card-header"><div><h2>{organization.name}</h2><p>{organization.organization_type.replace("_", " ")}</p></div></div><div className="mini-list"><p><Mail size={15} />{organization.billing_email || "No billing email"}</p><p><Phone size={15} />{organization.billing_phone || "No billing phone"}</p></div><div className="record-actions"><Link href={`/admin/organizations/${organization.id}`}>Open organization</Link></div></article>)}</div> : <section className="empty-state"><h2>No organizations yet</h2><p>Add a property manager, HOA, or commercial client when repeat-property work begins.</p></section>}</div><aside className="crm-side"><section className="form-panel"><h2>Add organization</h2><AddOrganizationForm /></section></aside></section></div></PlatformFrame>;
}
function Warning({ message }: { message: string }) { return <section className="data-warning"><strong>Database notice</strong><p>{message}</p></section>; }
