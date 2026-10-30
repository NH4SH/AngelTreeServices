import Link from "next/link";
import { Building, MapPin } from "lucide-react";
import { ListPagination } from "@/components/list-pagination";
import { ListSearch } from "@/components/list-search";
import { PlatformFrame } from "@/components/PlatformFrame";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getServiceLocationsPage } from "@/lib/data/customers";

const pageSize = 25;

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ archived?: string; page?: string; q?: string }> }) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/properties");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening properties" />;

  const archived = params.archived === "1";
  const page = positivePage(params.page);
  const properties = await getServiceLocationsPage({ archived, page, pageSize, query: params.q });
  const canArchive = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);

  return (
    <PlatformFrame active="properties" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label"><MapPin aria-hidden="true" size={18} />Properties</p>
          <h1>Properties</h1>
          <p>Find service addresses and the customer or organization responsible for each location.</p>
        </section>

        <section className="list-toolbar" aria-label="Property search and views">
          <ListSearch initialValue={params.q} label="Search properties" placeholder="Search customer, street, city, ZIP code, or property ID" />
          <nav className="list-view-toggle" aria-label="Property record state">
            <Link aria-current={!archived ? "page" : undefined} href={params.q ? `/admin/properties?q=${encodeURIComponent(params.q)}` : "/admin/properties"}>Active</Link>
            <Link aria-current={archived ? "page" : undefined} href={`/admin/properties?archived=1${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}>Archived</Link>
          </nav>
        </section>

        {properties.error ? <section className="data-warning" role="status"><strong>Database notice</strong><p>{properties.error}</p></section> : null}
        {properties.data.length ? (
          <div className="record-list property-record-list">
            {properties.data.map((property) => {
              const ownerName = property.organizations?.name ?? property.customers?.display_name ?? "Owner not assigned";
              const ownerHref = property.organization_id ? `/admin/organizations/${property.organization_id}` : `/admin/customers/${property.customer_id}`;
              return (
                <article className="record-card" key={property.id}>
                  <div className="record-card-header">
                    <div><h2>{property.label || property.street}</h2><p>{[property.street, property.city, property.state, property.postal_code].filter(Boolean).join(", ")}</p></div>
                    <span className="status-pill">{archived ? "archived" : "active"}</span>
                  </div>
                  <div className="mini-list"><p><Building aria-hidden="true" size={15} />{ownerName}</p></div>
                  <div className="record-actions"><Link href={ownerHref}>Open {property.organization_id ? "organization" : "customer"}</Link></div>
                  {canArchive ? <RecordLifecyclePanel
                    canArchive
                    canPermanentlyDelete={false}
                    compact
                    listHref="/admin/properties"
                    preview={{ archivedAt: property.archived_at, blockers: ["Use archive for service locations so linked jobs and documents remain intact."], canPermanentDelete: false, counts: { service_location: 1 }, label: property.label || property.street, recordId: property.id, recordType: "service_location" }}
                  /> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <section className="empty-state"><h2>{params.q ? "No matching properties" : archived ? "No archived properties" : "No properties yet"}</h2><p>{params.q ? "Try another customer, street, city, or ZIP code." : "Service locations appear here after they are added to a customer or organization."}</p></section>
        )}
        <ListPagination basePath="/admin/properties" count={properties.count} page={page} pageSize={pageSize} params={{ archived: archived ? "1" : undefined, q: params.q }} />
      </div>
    </PlatformFrame>
  );
}

function positivePage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
