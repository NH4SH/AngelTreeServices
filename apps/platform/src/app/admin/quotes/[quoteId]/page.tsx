import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  MapPin,
  Pencil,
  ReceiptText,
  Send,
  StickyNote,
  UsersRound,
} from "lucide-react";
import { AddAppointmentForm } from "@/app/admin/schedule/AppointmentForm";
import { CommunicationControls } from "@/components/communication-controls";
import { QuoteDocument } from "@/components/documents/quote-document";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { PrintButton } from "@/components/documents/print-button";
import { EmailDraftCard } from "@/components/email-draft-card";
import { EmailHistoryList, EmailSetupNotice } from "@/components/email-history";
import { QuotePortalLinkPanel } from "@/components/quote-portal-link-panel";
import { SendQuoteEmailForm } from "@/components/send-email-action-form";
import { ManualQuoteSentAction, QuoteStatusActions } from "@/components/workflow-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateQuote } from "@/lib/actions/duplicate-records";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getAssignableUsers } from "@/lib/data/appointments";
import { getEmailEvents } from "@/lib/data/email-events";
import { getCommunicationRecipientOptions, getCustomerCommunications } from "@/lib/data/communications";
import { getQuotePortalTokens } from "@/lib/data/portal-quote";
import { getQuoteDetail } from "@/lib/data/quotes";
import { generateQuoteEmailDraft } from "@/lib/documents/email-drafts";
import { generateQuoteFollowUpMessage } from "@/lib/documents/scheduling-drafts";
import { getEmailSetupState } from "@/lib/email/config";
import { formatInvoiceStatus } from "@/lib/invoices/status";
import type { QuoteStatus } from "@/lib/types/database";

type QuoteDetailPageProps = {
  params: Promise<{
    quoteId: string;
  }>;
};

export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const { quoteId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/quotes/${quoteId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening quote details" />;
  }

  const detail = await getQuoteDetail(quoteId);
  const portalTokens = detail.data ? await getQuotePortalTokens(quoteId) : { data: [], error: null };
  const emailEvents = detail.data ? await getEmailEvents({ quoteId, limit: 8 }) : { data: [], error: null };
  const communications = detail.data ? await getCustomerCommunications({ quoteId, limit: 20 }) : { data: [], error: null };
  const recipientOptions = detail.data
    ? await getCommunicationRecipientOptions({ customerId: detail.data.customer_id, organizationId: detail.data.organization_id })
    : { data: [], error: null };
  const assignedUsers = await getAssignableUsers();
  const emailSetup = getEmailSetupState();
  const canManuallyMarkSent = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);

  return (
    <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <Link className="crew-back-link" href="/admin/quotes">Back to quotes</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {assignedUsers.error ? <DataWarning message={assignedUsers.error} /> : null}
        {emailEvents.error ? <DataWarning message={emailEvents.error} /> : null}
        {communications.error ? <DataWarning message={`Customer reminders: ${communications.error}`} /> : null}
        {recipientOptions.error ? <DataWarning message={`Reminder recipients: ${recipientOptions.error}`} /> : null}
        {!detail.data ? (
          <EmptyState title="Quote not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="commerce-detail-header">
              <div>
                <p className="surface-label">
                  <FileSignature aria-hidden="true" size={18} />
                  Quote file
                </p>
                <h1>{detail.data.quote_number || "Draft quote"}</h1>
                <p>{detail.data.organizations?.name ?? detail.data.customers?.display_name ?? "Unknown contracting party"} - {formatProposalLabel(detail.data)}</p>
              </div>
              <div className="commerce-header-aside">
                <span className={`status-pill quote-status ${detail.data.status}`}>
                  {formatQuoteStatus(detail.data.status)}
                </span>
                <strong>{formatCurrency(detail.data.total_cents)}</strong>
                {isQuoteEditable(detail.data.status) ? (
                  <Link className="primary-action" href={`/admin/quotes/${detail.data.id}/edit`}>
                    <Pencil aria-hidden="true" size={17} />
                    Edit quote
                  </Link>
                ) : null}
                <DuplicateRecordButton
                  action={duplicateQuote}
                  buttonClassName="secondary-action"
                  hiddenFieldName="quote_id"
                  hiddenFieldValue={detail.data.id}
                  label="Duplicate quote"
                  pendingLabel="Copying quote..."
                />
              </div>
            </section>

            <section className="commerce-detail-layout">
              <main className="commerce-document-column">
                <section className="commerce-document-panel">
                  <div className="document-workspace-heading print-hidden">
                    <div>
                      <p className="surface-label">
                        <FileSignature aria-hidden="true" size={18} />
                        Printable quote
                      </p>
                      <h2>Quote document preview</h2>
                    </div>
                    <PrintButton href={`/admin/quotes/${detail.data.id}/print`} label="Print or save PDF" />
                  </div>
                  <QuoteDocument quote={detail.data} showInternalPreview={detail.data.status === "draft"} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<ReceiptText size={18} />} title="Line items" />
                  {detail.data.quote_line_items?.length ? (
                    <div className="line-items-preview commerce-line-items">
                      {detail.data.quote_line_items.map((item) => (
                        <div className="line-item-row" key={item.id}>
                          <span className="formatted-line-description">
                            <strong>{item.name}</strong>
                            {item.description ? <span>{item.description}</span> : null}
                          </span>
                          <span>{item.quantity}</span>
                          <span>{formatCurrency(item.unit_price_cents)}</span>
                          <strong>{formatCurrency(item.total_cents)}</strong>
                        </div>
                      ))}
                      <div className="line-item-total">
                        <span>Total</span>
                        <strong>{formatCurrency(detail.data.total_cents)}</strong>
                      </div>
                    </div>
                  ) : (
                    <EmptyInline>No line items yet.</EmptyInline>
                  )}
                </section>

                <section className="email-draft-grid commerce-email-grid">
                  <EmailDraftCard draft={generateQuoteEmailDraft(detail.data)} label="Quote email draft" />
                  <EmailDraftCard draft={generateQuoteFollowUpMessage(detail.data)} label="Quote follow-up draft" />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<Send size={18} />} title="Quote email sending" />
                  <EmailSetupNotice configured={emailSetup.configured} />
                  <SendQuoteEmailForm
                    disabled={!emailSetup.configured || !(detail.data.approval_contact?.email ?? detail.data.recipient_contact?.email ?? detail.data.customers?.email ?? detail.data.organizations?.billing_email) || isQuoteClosedForSending(detail.data.status)}
                    quoteId={detail.data.id}
                  />
                  {!(detail.data.approval_contact?.email ?? detail.data.recipient_contact?.email ?? detail.data.customers?.email ?? detail.data.organizations?.billing_email) ? (
                    <p className="inline-empty">Add a billing email address for the contracting party before sending.</p>
                  ) : null}
                  {isQuoteClosedForSending(detail.data.status) ? (
                    <p className="inline-empty">This quote is closed, so it cannot be sent again from the main workflow.</p>
                  ) : null}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<Send size={18} />} title="Email history" />
                  <EmailHistoryList events={emailEvents.data} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<CalendarDays size={18} />} title="Quote follow-up" />
                  <CommunicationControls
                    automaticEnabled={detail.data.automatic_follow_ups_enabled}
                    communicationType="quote_follow_up"
                    communications={communications.data}
                    recipientOptions={recipientOptions.data}
                    recordId={detail.data.id}
                    recordType="quote"
                  />
                </section>
              </main>

              <aside className="commerce-detail-sidebar">
                <section className="commerce-side-panel">
                  <PanelTitle icon={<ClipboardCheck size={18} />} title="Workflow actions" />
                  <span className={`status-pill quote-status ${detail.data.status}`}>
                    {formatQuoteStatus(detail.data.status)}
                  </span>
                  <p className="inline-empty">Sending the quote marks it sent. Approval creates or links the work order.</p>
                  {detail.data.sent_at ? (
                    <p className="quote-delivery-note">
                      <Send aria-hidden="true" size={16} />
                      {formatSentActivity(detail.data.sent_method, detail.data.sent_at)}
                    </p>
                  ) : null}
                  <QuoteStatusActions quoteId={detail.data.id} status={detail.data.status} />
                  {canManuallyMarkSent ? (
                    <ManualQuoteSentAction quoteId={detail.data.id} status={detail.data.status} />
                  ) : null}
                  {detail.data.status === "approved" && detail.data.jobs ? (
                    <Link className="secondary-action" href={`/admin/jobs/${detail.data.jobs.id}`}>
                      Open work order
                    </Link>
                  ) : null}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<UsersRound size={18} />} title="Contracting party" />
                  <Link className="linked-record" href={detail.data.organization_id ? `/admin/organizations/${detail.data.organization_id}` : `/admin/customers/${detail.data.customer_id}`}>
                    <strong>{detail.data.organizations?.name ?? detail.data.customers?.display_name ?? "Unknown contracting party"}</strong>
                    <span>{detail.data.organizations?.billing_phone || detail.data.organizations?.billing_email || detail.data.customers?.phone || detail.data.customers?.email || "No contact set"}</span>
                  </Link>
                </section>

                {detail.data.organization_id ? (
                  <section className="commerce-side-panel">
                    <PanelTitle icon={<UsersRound size={18} />} title="Organization contacts" />
                    <div className="linked-record-list">
                      <ContactLine label="Attention" contact={detail.data.recipient_contact} />
                      <ContactLine label="Approval" contact={detail.data.approval_contact} />
                      <ContactLine label="Onsite" contact={detail.data.onsite_contact} />
                      <ContactLine label="Billing" contact={detail.data.billing_contact} />
                    </div>
                  </section>
                ) : null}

                <section className="commerce-side-panel">
                  <PanelTitle icon={<MapPin size={18} />} title="Service location" />
                  {detail.data.service_locations ? (
                    <article className="linked-record">
                      <strong>{detail.data.service_locations.label || "Service location"}</strong>
                      <span>
                        {detail.data.service_locations.street}, {detail.data.service_locations.city}
                      </span>
                    </article>
                  ) : (
                    <EmptyInline>No service location attached.</EmptyInline>
                  )}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<MapPin size={18} />} title="Linked work order" />
                  {detail.data.jobs ? (
                    <Link className="linked-record" href={`/admin/jobs/${detail.data.jobs.id}`}>
                      <strong>{formatJobLabel(detail.data.jobs.service_type)}</strong>
                      <span>
                        {detail.data.jobs.service_locations
                          ? `${detail.data.jobs.service_locations.street}, ${detail.data.jobs.service_locations.city}`
                          : detail.data.jobs.status.replace("_", " ")}
                      </span>
                    </Link>
                  ) : (
                    <EmptyInline>A work order will be created when this quote is approved.</EmptyInline>
                  )}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<ReceiptText size={18} />} title="Invoices from this quote" />
                  {detail.data.invoices?.length ? (
                    detail.data.invoices.map((invoice) => (
                      <Link className="linked-record" href={`/admin/invoices/${invoice.id}`} key={invoice.id}>
                        <strong>{invoice.invoice_number || "Invoice"}</strong>
                        <span>{formatInvoiceStatus(invoice.status)} - {formatCurrency(invoice.balance_due_cents)} due</span>
                      </Link>
                    ))
                  ) : (
                    <EmptyInline>No invoices created from this quote yet.</EmptyInline>
                  )}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<ReceiptText size={18} />} title="Totals" />
                  <dl className="record-details">
                    <div><dt>Subtotal</dt><dd>{formatCurrency(detail.data.subtotal_cents)}</dd></div>
                    <div><dt>Total</dt><dd>{formatCurrency(detail.data.total_cents)}</dd></div>
                    <div><dt>Expires</dt><dd>{formatDate(detail.data.expires_at)}</dd></div>
                  </dl>
                </section>

                <section className="commerce-side-panel" id="portal-link">
                  {portalTokens.error ? <DataWarning message={`Customer portal links: ${portalTokens.error}`} /> : null}
                  <QuotePortalLinkPanel
                    quoteDraftInput={{
                      quote_number: detail.data.quote_number,
                      customer_message: detail.data.customer_message,
                      customers: detail.data.customers,
                    }}
                    quoteId={detail.data.id}
                    tokens={portalTokens.data}
                  />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<CalendarDays size={18} />} title="Follow-up" />
                  <AddAppointmentForm
                    assignedUsers={assignedUsers.data}
                    defaultAppointmentType="follow_up"
                    jobId={detail.data.job_id ?? undefined}
                    jobs={[]}
                    lockedAppointmentType="follow_up"
                  />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<StickyNote size={18} />} title="Internal notes" />
                  {detail.data.notes?.length ? detail.data.notes.map((note) => (
                    <article className="linked-record" key={note.id}>
                      <strong>{note.visibility.replace("_", " ")}</strong>
                      <span>{note.body}</span>
                    </article>
                  )) : <EmptyInline>No notes yet.</EmptyInline>}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<Send size={18} />} title="Email drafts" />
                  <p className="inline-empty">Draft copy is still available below. Use the send button only when the customer email is ready.</p>
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

function EmptyInline({ children }: { children: ReactNode }) {
  return <p className="inline-empty">{children}</p>;
}

function ContactLine({ contact, label }: { contact?: { full_name: string; email?: string | null; phone?: string | null; is_active: boolean } | null; label: string }) {
  return <article className="linked-record"><strong>{label}: {contact?.full_name ?? "Not selected"}</strong><span>{contact ? (contact.email || contact.phone || "No contact details") : "Choose an organization contact while editing."}</span>{contact && !contact.is_active ? <span className="status-pill attention">Inactive</span> : null}</article>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state"><h2>{title}</h2><p>{body}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function formatQuoteStatus(status: QuoteStatus) {
  return status === "approved" ? "accepted" : status.replace("_", " ");
}

function formatSentActivity(method: string | null, sentAt: string) {
  const date = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(sentAt));

  if (method === "manual") {
    return `Marked as sent manually on ${date}`;
  }

  if (method === "crm_email") {
    return `Sent via CRM email on ${date}`;
  }

  return `Sent status recorded on ${date}`;
}

function isQuoteClosedForSending(status: QuoteStatus) {
  return ["approved", "declined", "expired", "cancelled"].includes(status);
}

function isQuoteEditable(status: QuoteStatus) {
  return ["draft", "sent", "change_requested"].includes(status);
}

function formatJobLabel(serviceType?: string | null) {
  return serviceType ? serviceType.replace("_", " ") : "Linked job";
}

function formatProposalLabel(quote: { jobs?: { service_type?: string | null } | null; service_locations?: { street?: string | null; city?: string | null } | null }) {
  if (quote.jobs?.service_type) {
    return quote.jobs.service_type.replace("_", " ");
  }

  if (quote.service_locations) {
    return [quote.service_locations.street, quote.service_locations.city].filter(Boolean).join(", ");
  }

  return "Draft proposal";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
