import { MapPin, UsersRound } from "lucide-react";
import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddCustomerForm, AddServiceLocationForm } from "./CustomerForms";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCustomerNotes, getCustomers } from "@/lib/data/customers";

export default async function CustomersPage() {
  const context = await getAuthenticatedPlatformContext("/admin/customers");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening customers" />;
  }

  const customers = await getCustomers();
  const notes = await getCustomerNotes(customers.data.map((customer) => customer.id));

  return (
    <PlatformFrame active="customers" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <UsersRound aria-hidden="true" size={18} />
            Customers
          </p>
          <h1>Customers</h1>
          <p>Contact details, service locations, and first notes for every account.</p>
        </section>

        {customers.error ? <DataWarning message={customers.error} /> : null}
        {notes.error ? <DataWarning message={`Notes: ${notes.error}`} /> : null}

        <section className="crm-layout">
          <div className="crm-main">
            {customers.data.length === 0 ? (
              <EmptyState title="No customers yet" body="Add a customer when the first request is ready to enter." />
            ) : (
              <div className="record-list">
                {customers.data.map((customer) => {
                  const customerNotes = notes.data.filter((note) => note.customer_id === customer.id);

                  return (
                    <article className="record-card" key={customer.id}>
                      <div className="record-card-header">
                        <div>
                          <h2>{customer.display_name}</h2>
                          <p>{customer.customer_type.replace("_", " ")}</p>
                        </div>
                        <span className="status-pill">{customer.status}</span>
                      </div>
                      <dl className="record-details">
                        <div>
                          <dt>Phone</dt>
                          <dd>{customer.phone || "Not set"}</dd>
                        </div>
                        <div>
                          <dt>Email</dt>
                          <dd>{customer.email || "Not set"}</dd>
                        </div>
                      </dl>
                      {customer.service_locations?.length ? (
                        <div className="mini-list">
                          {customer.service_locations.map((location) => (
                            <p key={location.id}>
                              <MapPin aria-hidden="true" size={15} />
                              {location.label ? `${location.label}: ` : ""}
                              {location.street}, {location.city}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {customerNotes[0] ? <p className="record-note">{customerNotes[0].body}</p> : null}
                      <div className="record-actions">
                        <Link href={`/admin/customers/${customer.id}`}>Open customer file</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="crm-side">
            <section className="form-panel">
              <h2>Add customer</h2>
              <p className="form-panel-copy">Start the account record with the main contact, then add the first property if it is ready.</p>
              <AddCustomerForm />
            </section>
            <section className="form-panel">
              <h2>Add service location</h2>
              <p className="form-panel-copy">Keep addresses and access notes separate so jobs, quotes, and crew directions stay tidy later.</p>
              <AddServiceLocationForm customers={customers.data} />
            </section>
          </aside>
        </section>
      </div>
    </PlatformFrame>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
