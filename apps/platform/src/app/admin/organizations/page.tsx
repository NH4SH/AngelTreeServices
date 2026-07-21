import Link from "next/link";
import { Building2, Mail, Phone } from "lucide-react";
import { AddOrganizationForm } from "./OrganizationForms";
import { ListPagination } from "@/components/list-pagination";
import { ListSearch } from "@/components/list-search";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getOrganizationsPage } from "@/lib/data/organizations";

const pageSize = 25;

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ archived?: string; page?: string; q?: string }> }) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/organizations");
  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening organizations" />;
  }

  const archived = params.archived === "1";
  const page = positivePage(params.page);
  const organizations = await getOrganizationsPage({ archived, page, pageSize, query: params.q });

  return (
    <PlatformFrame active="organizations" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <Building2 size={18} />
            Organizations
          </p>
          <h1>Organizations</h1>
          <p>Manage property managers, HOAs, commercial accounts, contacts, and linked work.</p>
        </section>

        <section className="list-toolbar" aria-label="Organization search and views">
          <ListSearch initialValue={params.q} label="Search organizations" placeholder="Search organization, phone, email, address, or ID" />
          <nav className="list-view-toggle" aria-label="Organization record state">
            <Link aria-current={!archived ? "page" : undefined} href={params.q ? `/admin/organizations?q=${encodeURIComponent(params.q)}` : "/admin/organizations"}>Active</Link>
            <Link aria-current={archived ? "page" : undefined} href={`/admin/organizations?archived=1${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}>Archived</Link>
          </nav>
        </section>

        {organizations.error ? <Warning message={organizations.error} /> : null}

        <section className="crm-layout">
          <div className="crm-main">
            {organizations.data.length ? (
              <div className="record-list">
                {organizations.data.map((organization) => (
                  <article className="record-card" key={organization.id}>
                    <div className="record-card-header">
                      <div>
                        <h2>{organization.name}</h2>
                        <p>{organization.organization_type.replace("_", " ")}</p>
                      </div>
                    </div>
                    <div className="mini-list">
                      <p>
                        <Mail size={15} />
                        {organization.billing_email || "No billing email"}
                      </p>
                      <p>
                        <Phone size={15} />
                        {organization.billing_phone || "No billing phone"}
                      </p>
                    </div>
                    <div className="record-actions">
                      <Link href={`/admin/organizations/${organization.id}`}>Open organization</Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="empty-state">
                <h2>{params.q ? "No matching organizations" : archived ? "No archived organizations" : "No organizations yet"}</h2>
                <p>{params.q ? "Try another organization name, phone, email, or address." : archived ? "Archived organizations will appear here." : "Add a property manager, HOA, or commercial client when repeat-property work begins."}</p>
              </section>
            )}
          </div>

          {!archived ? <aside className="crm-side">
            <section className="form-panel">
              <h2>Add organization</h2>
              <p className="form-panel-copy">Use this for repeat-property clients, board-managed communities, and commercial relationships.</p>
              <AddOrganizationForm />
            </section>
          </aside> : null}
        </section>
        <ListPagination basePath="/admin/organizations" count={organizations.count} page={page} pageSize={pageSize} params={{ archived: archived ? "1" : undefined, q: params.q }} />
      </div>
    </PlatformFrame>
  );
}

function positivePage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function Warning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
