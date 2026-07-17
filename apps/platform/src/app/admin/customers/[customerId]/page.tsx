import Link from "next/link";
import type { ReactNode } from "react";
import { BriefcaseBusiness, ClipboardList, FileSignature, MailCheck, MapPin, Pencil, ReceiptText, Sprout, StickyNote, UsersRound } from "lucide-react";
import { AddJobForm } from "../../jobs/JobForm";
import { AddServiceLocationForm } from "../CustomerForms";
import { EmailHistoryList } from "@/components/email-history";
import { CommunicationHistoryList } from "@/components/communication-history";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCustomerDetail } from "@/lib/data/customers";
import { getEmailEvents } from "@/lib/data/email-events";
import { getCustomerCommunications } from "@/lib/data/communications";
import { getLeadSources } from "@/lib/data/reports";
import { formatInvoiceStatus } from "@/lib/invoices/status";
import { getRecurringSummaryForCustomer } from "@/lib/data/recurring";

type CustomerDetailPageProps = {
  params: Promise<{
    customerId: string;
  }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
  }>;
};

export default async function CustomerDetailPage({ params, searchParams }: CustomerDetailPageProps) {
  const { customerId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/admin/customers/${customerId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening customer details" />;
  }

  const [detail, leadSources, recurring] = await Promise.all([getCustomerDetail(customerId), getLeadSources(), getRecurringSummaryForCustomer(customerId)]);
  const emailEvents = detail.data ? await getEmailEvents({ customerId, limit: 10 }) : { data: [], error: null };
  const communications = detail.data ? await getCustomerCommunications({ customerId, limit: 20 }) : { data: [], error: null };

  return (
    <PlatformFrame active="customers" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/customers">Back to customers</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {leadSources.error ? <DataWarning message={leadSources.error} /> : null}
        {emailEvents.error ? <DataWarning message={emailEvents.error} /> : null}
        {communications.error ? <DataWarning message={`Customer reminders: ${communications.error}`} /> : null}
        {recurring.error ? <DataWarning message={`Recurring services: ${recurring.error}`} /> : null}
        {query.updated === "1" ? <SuccessNotice message="Customer changes saved." /> : null}
        {query.created === "1" ? <SuccessNotice message="Customer created." /> : null}
        {!detail.data ? (
          <EmptyState title="Customer not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="surface-label">
                  <UsersRound aria-hidden="true" size={18} />
                  Customer File
                </p>
                <h1>{detail.data.customer.display_name}</h1>
                <p>
                  {detail.data.customer.customer_type.replace("_", " ")} customer with linked properties,
                  jobs, quotes, invoices, and notes.
                </p>
              </div>
              <Link className="primary-action" href={`/admin/customers/${detail.data.customer.id}/edit`}>
                <Pencil aria-hidden="true" size={17} />
                Edit
              </Link>
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
                  <div>
                    <dt>Billing address</dt>
                    <dd>{detail.data.customer.billing_address || "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatDateTime(detail.data.customer.updated_at)}</dd>
                  </div>
                </dl>
              </article>

              <article className="detail-panel">
                <PanelTitle icon={<MapPin size={18} />} title="Quick actions" />
                <div className="quick-action-list">
                  <Link href={`/admin/quotes?new=1&customer_id=${detail.data.customer.id}`}>Create quote</Link>
                  <Link href="/admin/schedule?event_type=estimate">Schedule estimate</Link>
                  <a href="#add-location">Add service location</a>
                  <a href="#add-job">Create job / work order</a>
                  <Link href={`/admin/recurring?new_task=1&customer_id=${customerId}`}>Add follow-up</Link>
                  <Link href={`/admin/recurring?new_plan=1&customer_id=${customerId}`}>Create recurring plan</Link>
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

              <RecordSection icon={<BriefcaseBusiness size={18} />} title="Jobs / work orders">
                {detail.data.jobs.length === 0 ? (
                  <EmptyInline>No approved work orders yet.</EmptyInline>
                ) : (
                  detail.data.jobs.map((job) => (
                    <Link className="linked-record" href={`/admin/jobs/${job.id}`} key={job.id}>
                      <strong>{job.service_type?.replace("_", " ") || "Work order"}</strong>
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
                      <span>{formatInvoiceStatus(invoice.status)} - {formatCurrency(invoice.balance_due_cents)} due</span>
                    </Link>
                  ))
                )}
              </RecordSection>

              <RecordSection icon={<MailCheck size={18} />} title="Email history">
                <EmailHistoryList events={emailEvents.data} />
                <CommunicationHistoryList communications={communications.data} />
              </RecordSection>

              <RecordSection icon={<ClipboardList size={18} />} title="Open follow-ups">
                {recurring.tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length ? recurring.tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).map((task) => <Link className="linked-record" href="/admin/recurring" key={task.id}><strong>{task.title}</strong><span>{task.status.replaceAll("_", " ")} - due {formatDateTime(task.due_at)}</span></Link>) : <EmptyInline>No open follow-ups.</EmptyInline>}
              </RecordSection>

              <RecordSection icon={<Sprout size={18} />} title="Recurring services">
                {recurring.plans.length ? recurring.plans.map((plan) => <Link className="linked-record" href={`/admin/recurring/${plan.id}`} key={plan.id}><strong>{plan.plan_name}</strong><span>{plan.state} - {plan.recurring_plan_locations?.length ?? 0} service location(s)</span></Link>) : <EmptyInline>No recurring plans.</EmptyInline>}
              </RecordSection>

              <RecordSection icon={<Sprout size={18} />} title="Recommended future work">
                {recurring.recommendations.length ? recurring.recommendations.map((item) => <Link className="linked-record" href="/admin/recurring" key={item.id}><strong>{item.title}</strong><span>{item.status.replaceAll("_", " ")}{item.recommended_timeframe ? ` - ${item.recommended_timeframe}` : ""}</span></Link>) : <EmptyInline>No future-work recommendations.</EmptyInline>}
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
                  <h2>Add job / work order</h2>
                  <p className="inline-empty">Use this after quote approval or for work that already has approval.</p>
                  <AddJobForm customers={[detail.data.customer]} leadSources={leadSources.data} serviceLocations={detail.data.serviceLocations} />
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

function SuccessNotice({ message }: { message: string }) {
  return <section className="form-message success record-save-notice" role="status">{message}</section>;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
