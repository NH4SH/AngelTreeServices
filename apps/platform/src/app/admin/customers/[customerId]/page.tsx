import Link from "next/link";
import type { ReactNode } from "react";
import { BriefcaseBusiness, FileSignature, MapPin, ReceiptText, StickyNote, UsersRound } from "lucide-react";
import { AddJobForm } from "../../jobs/JobForm";
import { AddServiceLocationForm } from "../CustomerForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCustomerDetail } from "@/lib/data/customers";

type CustomerDetailPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { customerId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/customers/${customerId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening customer details" />;
  }

  const detail = await getCustomerDetail(customerId);

  return (
    <PlatformFrame active="customers" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/customers">Back to customers</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {!detail.data ? (
          <EmptyState title="Customer not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="page-heading">
              <p className="surface-label">
                <UsersRound aria-hidden="true" size={18} />
                Customer File
              </p>
              <h1>{detail.data.customer.display_name}</h1>
              <p>
                {detail.data.customer.customer_type.replace("_", " ")} customer with linked properties,
                jobs, quotes, invoices, and notes.
              </p>
            </section>

            <section className="detail-grid">
              <article className="detail-panel">
                <PanelTitle icon={<UsersRound size={18} />} title="Contact" />
                <dl className="record-details">
                  <div>
                    <dt>Phone</dt>
                    <dd>{detail.data.customer.phone || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{detail.data.customer.email || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{detail.data.customer.customer_type.replace("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{detail.data.customer.status}</dd>
                  </div>
                </dl>
              </article>

              <article className="detail-panel">
                <PanelTitle icon={<MapPin size={18} />} title="Quick actions" />
                <div className="quick-action-list">
                  <a href="#add-location">Add service location</a>
                  <a href="#add-job">Add job</a>
                  <Link href="/admin/quotes">Create quote from job</Link>
                </div>
              </article>
            </section>

            <section className="detail-grid">
              <RecordSection icon={<MapPin size={18} />} title="Service locations">
                {detail.data.serviceLocations.length === 0 ? (
                  <EmptyInline>No service locations yet.</EmptyInline>
                ) : (
                  detail.data.serviceLocations.map((location) => (
                    <article className="linked-record" key={location.id}>
                      <strong>{location.label || "Service location"}</strong>
                      <span>{location.street}, {location.city}, {location.state}</span>
                    </article>
                  ))
                )}
              </RecordSection>

              <RecordSection icon={<StickyNote size={18} />} title="Notes">
                {detail.data.notes.length === 0 ? (
                  <EmptyInline>No notes yet.</EmptyInline>
                ) : (
                  detail.data.notes.map((note) => (
                    <article className="linked-record" key={note.id}>
                      <strong>{note.visibility.replace("_", " ")}</strong>
                      <span>{note.body}</span>
                    </article>
                  ))
                )}
              </RecordSection>

              <RecordSection icon={<BriefcaseBusiness size={18} />} title="Jobs">
                {detail.data.jobs.length === 0 ? (
                  <EmptyInline>No jobs yet.</EmptyInline>
                ) : (
                  detail.data.jobs.map((job) => (
                    <Link className="linked-record" href={`/admin/jobs/${job.id}`} key={job.id}>
                      <strong>{job.service_type?.replace("_", " ") || "Job"}</strong>
                      <span>{job.status.replace("_", " ")}</span>
                    </Link>
                  ))
                )}
              </RecordSection>

              <RecordSection icon={<FileSignature size={18} />} title="Quotes">
                {detail.data.quotes.length === 0 ? (
                  <EmptyInline>No quotes yet.</EmptyInline>
                ) : (
                  detail.data.quotes.map((quote) => (
                    <Link className="linked-record" href={`/admin/quotes/${quote.id}`} key={quote.id}>
                      <strong>{quote.quote_number || "Quote"}</strong>
                      <span>{quote.status.replace("_", " ")} - {formatCurrency(quote.total_cents)}</span>
                    </Link>
                  ))
                )}
              </RecordSection>

              <RecordSection icon={<ReceiptText size={18} />} title="Invoices">
                {detail.data.invoices.length === 0 ? (
                  <EmptyInline>No invoices yet.</EmptyInline>
                ) : (
                  detail.data.invoices.map((invoice) => (
                    <Link className="linked-record" href={`/admin/invoices/${invoice.id}`} key={invoice.id}>
                      <strong>{invoice.invoice_number || "Invoice"}</strong>
                      <span>{invoice.status.replace("_", " ")} - {formatCurrency(invoice.balance_due_cents)} due</span>
                    </Link>
                  ))
                )}
              </RecordSection>
            </section>

            <section className="crm-layout">
              <aside className="crm-side" id="add-location">
                <section className="form-panel">
                  <h2>Add service location</h2>
                  <AddServiceLocationForm customers={[detail.data.customer]} />
                </section>
              </aside>
              <aside className="crm-side" id="add-job">
                <section className="form-panel">
                  <h2>Add job</h2>
                  <AddJobForm customers={[detail.data.customer]} serviceLocations={detail.data.serviceLocations} />
                </section>
              </aside>
            </section>
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <h2 className="panel-title">{icon}{title}</h2>;
}

function RecordSection({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="detail-panel">
      <PanelTitle icon={icon} title={title} />
      <div className="linked-record-list">{children}</div>
    </section>
  );
}

function EmptyInline({ children }: { children: ReactNode }) {
  return <p className="inline-empty">{children}</p>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state"><h2>{title}</h2><p>{body}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
