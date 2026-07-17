import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, ClipboardList, FilePlus2, FileSignature, MailCheck, MapPin, Pencil, ReceiptText, Sprout, UsersRound, Workflow } from "lucide-react";
import { AddOrganizationContactForm, AddOrganizationPropertyForm } from "../OrganizationForms";
import { CommunicationHistoryList } from "@/components/communication-history";
import { EmailHistoryList } from "@/components/email-history";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getOrganizationDetail } from "@/lib/data/organizations";
import { getCustomerCommunications } from "@/lib/data/communications";
import { getEmailEvents } from "@/lib/data/email-events";
import { formatInvoiceStatus } from "@/lib/invoices/status";
import { getRecurringSummaryForOrganization } from "@/lib/data/recurring";

type OrganizationDetailPageProps = {
  params: Promise<{
    organizationId: string;
  }>;
  searchParams: Promise<{
    updated?: string;
  }>;
};

export default async function OrganizationDetailPage({ params, searchParams }: OrganizationDetailPageProps) {
  const { organizationId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/admin/organizations/${organizationId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening organization details" />;
  }

  const [detail, recurring] = await Promise.all([getOrganizationDetail(organizationId), getRecurringSummaryForOrganization(organizationId)]);
  const org = detail.data;
  const emailEvents = org ? await getEmailEvents({ organizationId, limit: 15 }) : { data: [], error: null };
  const communications = org ? await getCustomerCommunications({ organizationId, limit: 25 }) : { data: [], error: null };

  return (
    <PlatformFrame active="organizations" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/organizations">
          Back to organizations
        </Link>
        {detail.error ? <Warning message={detail.error} /> : null}
        {emailEvents.error ? <Warning message={emailEvents.error} /> : null}
        {communications.error ? <Warning message={`Customer reminders: ${communications.error}`} /> : null}
        {recurring.error ? <Warning message={`Recurring services: ${recurring.error}`} /> : null}
        {query.updated === "1" ? <SuccessNotice message="Organization changes saved." /> : null}
        {!org ? (
          <section className="empty-state">
            <h2>Organization not found or no access</h2>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="surface-label">
                  <Building2 aria-hidden="true" size={18} />
                  Organization file
                </p>
                <h1>{org.organization.name}</h1>
                <p>{org.organization.organization_type.replace("_", " ")} account with repeat-property workflow scaffolding.</p>
              </div>
              <Link className="primary-action" href={`/admin/organizations/${org.organization.id}/edit`}>
                <Pencil aria-hidden="true" size={17} />
                Edit
              </Link>
            </section>

            <section className="detail-grid">
              <Panel icon={<Building2 size={18} />} title="Billing">
                <p>{org.organization.billing_email || "No billing email"}</p>
                <p>{org.organization.billing_phone || "No billing phone"}</p>
                <p>{org.organization.billing_address || "No billing address"}</p>
                <p>Updated {formatDateTime(org.organization.updated_at)}</p>
              </Panel>

              <Panel icon={<UsersRound size={18} />} title="Contacts">
                {org.contacts.length ? (
                  org.contacts.map((contact) => (
                    <article className="linked-record" key={contact.id}>
                      <strong>{contact.full_name}</strong>
                      <span>{contact.contact_roles?.length ? contact.contact_roles.map((role) => role.replaceAll("_", " ")).join(", ") : contact.role_title || "Contact"} - {contact.email || contact.phone || "No contact details"}</span>
                      <span>{contact.receives_invoices ? "Invoices" : "No invoices"} - {contact.receives_job_updates ? "Job updates" : "No job updates"}</span>
                      {!contact.is_active ? <span className="status-pill attention">Inactive</span> : null}
                    </article>
                  ))
                ) : (
                  <p>No organization contacts yet.</p>
                )}
              </Panel>

              <Panel icon={<MapPin size={18} />} title="Properties">
                {org.serviceLocations.length ? (
                  org.serviceLocations.map((location) => (
                    <article className="linked-record" key={location.id}>
                      <strong>{location.label || "Property"}</strong>
                      <span>{location.street}, {location.city}, {location.state}</span>
                    </article>
                  ))
                ) : (
                  <p>No linked properties yet.</p>
                )}
              </Panel>

              <Panel icon={<UsersRound size={18} />} title="Linked customers">
                {org.customers.length ? (
                  org.customers.map((customer) => (
                    <Link className="linked-record" href={`/admin/customers/${customer.id}`} key={customer.id}>
                      <strong>{customer.display_name}</strong>
                      <span>{customer.customer_type.replace("_", " ")}</span>
                    </Link>
                  ))
                ) : (
                  <p>No linked customers yet. Link customers from the customer edit page.</p>
                )}
              </Panel>

              <Panel icon={<Workflow size={18} />} title="Jobs">
                {org.jobs.length ? (
                  org.jobs.map((job) => (
                    <Link className="linked-record" href={`/admin/jobs/${job.id}`} key={job.id}>
                      <strong>{job.service_type?.replace("_", " ") || "Job"}</strong>
                      <span>{job.status.replace("_", " ")}</span>
                    </Link>
                  ))
                ) : (
                  <p>No organization jobs yet.</p>
                )}
              </Panel>

              <Panel icon={<FileSignature size={18} />} title="Quotes">
                {org.quotes.length ? (
                  org.quotes.map((quote) => (
                    <Link className="linked-record" href={`/admin/quotes/${quote.id}`} key={quote.id}>
                      <strong>{quote.quote_number || "Quote"}</strong>
                      <span>{quote.status.replace("_", " ")}</span>
                    </Link>
                  ))
                ) : (
                  <p>No organization quotes yet.</p>
                )}
              </Panel>

              <Panel icon={<ReceiptText size={18} />} title="Invoices">
                {org.invoices.length ? (
                  org.invoices.map((invoice) => (
                    <Link className="linked-record" href={`/admin/invoices/${invoice.id}`} key={invoice.id}>
                      <strong>{invoice.invoice_number || "Invoice"}</strong>
                      <span>{formatInvoiceStatus(invoice.status)} - {money(invoice.balance_due_cents)} due</span>
                    </Link>
                  ))
                ) : (
                  <p>No organization invoices yet.</p>
                )}
              </Panel>

              <Panel icon={<FilePlus2 size={18} />} title="Change orders">
                {org.changeOrders.length ? org.changeOrders.map((order) => <Link className="linked-record" href={`/admin/change-orders/${order.id}`} key={order.id}><strong>{order.change_order_number} - {order.title}</strong><span>{order.status.replaceAll("_", " ")} - {money(order.total_cents)}</span></Link>) : <p>No organization change orders yet.</p>}
                <Link className="secondary-action compact-action" href="/admin/change-orders?new=1">Create change order</Link>
              </Panel>

              <Panel icon={<MailCheck size={18} />} title="Communication history">
                <EmailHistoryList events={emailEvents.data} />
                <CommunicationHistoryList communications={communications.data} />
              </Panel>

              <Panel icon={<ClipboardList size={18} />} title="Open follow-ups">
                {recurring.tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length ? recurring.tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).map((task) => <Link className="linked-record" href="/admin/recurring" key={task.id}><strong>{task.title}</strong><span>{task.service_locations?.label || task.service_locations?.street || "Organization-wide"} - due {formatDateTime(task.due_at)}</span></Link>) : <p>No open follow-ups.</p>}
              </Panel>

              <Panel icon={<Sprout size={18} />} title="Recurring property portfolio">
                {recurring.plans.length ? recurring.plans.map((plan) => <Link className="linked-record" href={`/admin/recurring/${plan.id}`} key={plan.id}><strong>{plan.plan_name}</strong><span>{plan.state} - {plan.recurring_plan_locations?.length ?? 0} selected propert{plan.recurring_plan_locations?.length === 1 ? "y" : "ies"}</span></Link>) : <p>No recurring service plans.</p>}
                <Link className="secondary-action compact-action" href={`/admin/recurring?new_plan=1&organization_id=${organizationId}`}>Create service plan</Link>
              </Panel>

              <Panel icon={<Sprout size={18} />} title="Recommended future work">
                {recurring.recommendations.length ? recurring.recommendations.map((item) => <Link className="linked-record" href="/admin/recurring" key={item.id}><strong>{item.title}</strong><span>{item.service_locations?.label || item.service_locations?.street} - {item.status.replaceAll("_", " ")}</span></Link>) : <p>No recommendations awaiting action.</p>}
              </Panel>
            </section>

            <section className="crm-layout">
              <aside className="crm-side">
                <section className="form-panel">
                  <h2>Add contact</h2>
                  <AddOrganizationContactForm organizationId={organizationId} serviceLocations={org.serviceLocations} />
                </section>
              </aside>
              <aside className="crm-side">
                <section className="form-panel">
                  <h2>Add property</h2>
                  <AddOrganizationPropertyForm customers={org.customers} organizationId={organizationId} />
                </section>
              </aside>
            </section>

          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function Panel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <article className="detail-panel">
      <h2 className="panel-title">{icon}{title}</h2>
      <div className="linked-record-list">{children}</div>
    </article>
  );
}

function Warning({ message }: { message: string }) {
  return <section className="data-warning"><strong>Database notice</strong><p>{message}</p></section>;
}

function SuccessNotice({ message }: { message: string }) {
  return <section className="form-message success record-save-notice" role="status">{message}</section>;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
