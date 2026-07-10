import Link from "next/link";
import { UsersRound } from "lucide-react";
import { EditCustomerForm } from "../../CustomerForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCustomerDetail } from "@/lib/data/customers";
import { getOrganizations } from "@/lib/data/organizations";

type CustomerEditPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

export default async function CustomerEditPage({ params }: CustomerEditPageProps) {
  const { customerId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/customers/${customerId}/edit`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before editing customer details" />;
  }

  const [detail, organizations] = await Promise.all([
    getCustomerDetail(customerId),
    getOrganizations(),
  ]);

  return (
    <PlatformFrame active="customers" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href={`/admin/customers/${customerId}`}>
          Back to customer
        </Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {organizations.error ? <DataWarning message={organizations.error} /> : null}
        {!detail.data ? (
          <section className="empty-state">
            <h2>Customer not found or no access</h2>
            <p>This record is unavailable to the current account.</p>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="surface-label">
                  <UsersRound aria-hidden="true" size={18} />
                  Edit customer
                </p>
                <h1>{detail.data.customer.display_name}</h1>
                <p>Update the customer record without changing linked jobs, quotes, invoices, notes, or portal links.</p>
              </div>
            </section>
            <section className="form-panel edit-record-panel">
              <h2>Customer information</h2>
              <EditCustomerForm customer={detail.data.customer} organizations={organizations.data} />
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
