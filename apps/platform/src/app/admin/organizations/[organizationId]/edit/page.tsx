import Link from "next/link";
import { Building2 } from "lucide-react";
import { EditOrganizationForm } from "../../OrganizationForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getOrganizationDetail } from "@/lib/data/organizations";

type OrganizationEditPageProps = {
  params: Promise<{
    organizationId: string;
  }>;
};

export default async function OrganizationEditPage({ params }: OrganizationEditPageProps) {
  const { organizationId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/organizations/${organizationId}/edit`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before editing organization details" />;
  }

  const detail = await getOrganizationDetail(organizationId);

  return (
    <PlatformFrame active="organizations" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href={`/admin/organizations/${organizationId}`}>
          Back to organization
        </Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {!detail.data ? (
          <section className="empty-state">
            <h2>Organization not found or no access</h2>
            <p>This record is unavailable to the current account.</p>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="surface-label">
                  <Building2 aria-hidden="true" size={18} />
                  Edit organization
                </p>
                <h1>{detail.data.organization.name}</h1>
                <p>Update billing and account information without changing linked customers, jobs, quotes, invoices, or documents.</p>
              </div>
            </section>
            <section className="form-panel edit-record-panel">
              <h2>Organization information</h2>
              <EditOrganizationForm organization={detail.data.organization} />
            </section>
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
