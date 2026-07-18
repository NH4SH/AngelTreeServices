import Link from "next/link";
import type { ReactNode } from "react";
import { CircleDollarSign, ClipboardCheck, FileText, MapPin, Pencil, ReceiptText, Send, StickyNote, UsersRound } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { AttachApprovedChangeOrdersButton } from "@/components/change-order-forms";
import { CommunicationControls } from "@/components/communication-controls";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { PrintButton } from "@/components/documents/print-button";
import { PortalEngagementPanel } from "@/components/portal-engagement";
import { EmailDraftCard } from "@/components/email-draft-card";
import { EmailHistoryList, EmailSetupNotice } from "@/components/email-history";
import { InvoicePortalLinkPanel } from "@/components/invoice-portal-link-panel";
import { ManualPaymentForm } from "@/components/manual-payment-form";
import { ManualPaymentCorrectionForm } from "@/components/manual-payment-correction-form";
import { SendInvoiceEmailForm } from "@/components/send-email-action-form";
import { InvoiceStatusActions, ManualInvoiceSentAction } from "@/components/workflow-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateInvoice } from "@/lib/actions/duplicate-records";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEmailEvents } from "@/lib/data/email-events";
import { getCommunicationRecipientOptions, getCustomerCommunications } from "@/lib/data/communications";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getInvoicePortalTokens } from "@/lib/data/portal-invoice";
import { generateInvoiceEmailDraft } from "@/lib/documents/email-drafts";
import { getEmailSetupState } from "@/lib/email/config";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";
import { getStripeServerConfig } from "@/lib/stripe/server";
import type { InvoiceStatus, Payment } from "@/lib/types/database";

type InvoiceDetailPageProps = {
  params: Promise<{
    invoiceId: string;
  }>;
};

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { invoiceId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/invoices/${invoiceId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening invoice details" />;
  }

  const detail = await getInvoiceDetail(invoiceId);
  const canManageDelivery = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const portalTokens = detail.data && canManageDelivery
    ? await getInvoicePortalTokens(invoiceId)
    : { data: [], error: null };
  const emailEvents = detail.data ? await getEmailEvents({ invoiceId, limit: 8 }) : { data: [], error: null };
  const communications = detail.data ? await getCustomerCommunications({ invoiceId, limit: 20 }) : { data: [], error: null };
  const recipientOptions = detail.data
    ? await getCommunicationRecipientOptions({ customerId: detail.data.customer_id, organizationId: detail.data.organization_id })
    : { data: [], error: null };
  const emailSetup = getEmailSetupState();
  const stripeSetup = getStripeServerConfig();
  const successfulPaymentCents = (detail.data?.payments ?? [])
    .filter((payment) => payment.status === "succeeded")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <Link className="crew-back-link" href="/admin/invoices">Back to invoices</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {portalTokens.error ? <DataWarning message={`Customer invoice links: ${portalTokens.error}`} /> : null}
        {emailEvents.error ? <DataWarning message={emailEvents.error} /> : null}
        {communications.error ? <DataWarning message={`Customer reminders: ${communications.error}`} /> : null}
        {recipientOptions.error ? <DataWarning message={`Reminder recipients: ${recipientOptions.error}`} /> : null}
        {detail.data && canManageDelivery && isInvoicePayable(detail.data.status, detail.data.balance_due_cents) && !stripeSetup.configured ? (
          <DataWarning message="Stripe Checkout is not configured, so customers will not see an online payment button." />
        ) : null}
        {!detail.data ? (
          <EmptyState title="Invoice not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="commerce-detail-header">
              <div>
                <p className="surface-label">
                  <ReceiptText aria-hidden="true" size={18} />
                  Invoice file
                </p>
                <h1>{getInvoiceDisplayNumber(detail.data.invoice_number)}</h1>
                <p>{detail.data.organizations?.name ?? detail.data.customers?.display_name ?? "Unknown contracting party"} - {formatJobLabel(detail.data.jobs?.service_type)}</p>
              </div>
              <div className="commerce-header-aside">
                <span className={`status-pill invoice-status ${detail.data.status}`}>
                  {formatInvoiceStatus(detail.data.status)}
                </span>
                <strong>{formatCurrency(detail.data.balance_due_cents)}</strong>
                <span>balance due</span>
                {isInvoiceEditable(detail.data.status) ? (
                  <Link className="primary-action" href={`/admin/invoices/${detail.data.id}/edit`}>
                    <Pencil aria-hidden="true" size={17} />
                    Edit invoice
                  </Link>
                ) : null}
                {["sent", "partially_paid", "overdue"].includes(detail.data.status) ? (
                  <a className="primary-action" href="#invoice-payments">Record payment</a>
                ) : null}
                {detail.data.status === "paid" ? <Link className="primary-action" href="/admin/follow-ups">Create follow-up</Link> : null}
                <DuplicateRecordButton
                  action={duplicateInvoice}
                  buttonClassName="secondary-action"
                  hiddenFieldName="invoice_id"
                  hiddenFieldValue={detail.data.id}
                  label="Duplicate invoice"
                  pendingLabel="Copying invoice..."
                />
              </div>
            </section>

            {canManageDelivery ? (
              <section className="invoice-delivery-grid" aria-label="Customer invoice delivery">
                <InvoicePortalLinkPanel
                  invoice={detail.data}
                  invoiceId={detail.data.id}
                  tokens={portalTokens.data}
                />
                <section className="commerce-side-panel invoice-email-delivery-panel print-hidden">
                  <PanelTitle icon={<Send size={18} />} title="Send invoice email" />
                  <p className="inline-empty">
                    Sending reuses the active customer link when one exists and marks the invoice sent only after delivery succeeds.
                  </p>
                  <EmailSetupNotice configured={emailSetup.configured} />
                  <SendInvoiceEmailForm
                    disabled={
                      !emailSetup.configured ||
                      !(detail.data.accounts_payable_contact?.email ?? detail.data.billing_contact?.email ?? detail.data.customers?.email ?? detail.data.organizations?.billing_email) ||
                      ["paid", "void"].includes(detail.data.status)
                    }
                    invoiceId={detail.data.id}
                  />
                  {!(detail.data.accounts_payable_contact?.email ?? detail.data.billing_contact?.email ?? detail.data.customers?.email ?? detail.data.organizations?.billing_email) ? (
                    <p className="inline-empty">Add a billing email address for the contracting party before sending.</p>
                  ) : null}
                </section>
              </section>
            ) : null}

            <section className="commerce-detail-layout">
              <main className="commerce-document-column">
                <section className="commerce-document-panel">
                  <div className="document-workspace-heading print-hidden">
                    <div>
                      <p className="surface-label">
                        <ReceiptText aria-hidden="true" size={18} />
                        Printable invoice
                      </p>
                      <h2>Invoice document preview</h2>
                    </div>
                    <PrintButton href={`/admin/invoices/${detail.data.id}/print`} label="Print or save PDF" />
                  </div>
                  <InvoiceDocument invoice={detail.data} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<FileText size={18} />} title="Line items" />
                  {detail.data.status === "draft" ? <AttachApprovedChangeOrdersButton invoiceId={detail.data.id} /> : (
                    <p className="inline-empty">Approved additions can only be attached to a draft invoice. Use a supplemental draft for work approved after this invoice entered billing.</p>
                  )}
                  {detail.data.invoice_line_items?.length ? (
                    <div className="line-items-preview commerce-line-items">
                      {detail.data.invoice_line_items.map((item) => (
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
                        <span>Balance due</span>
                        <strong>{formatCurrency(detail.data.balance_due_cents)}</strong>
                      </div>
                    </div>
                  ) : (
                    <EmptyInline>No line items yet.</EmptyInline>
                  )}
                </section>

                <section className="email-draft-grid commerce-email-grid">
                  <EmailDraftCard draft={generateInvoiceEmailDraft(detail.data)} label="Invoice email draft" />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<Send size={18} />} title="Email history" />
                  <EmailHistoryList events={emailEvents.data} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<Send size={18} />} title="Payment reminders" />
                  <CommunicationControls
                    automaticEnabled={detail.data.automatic_reminders_enabled}
                    communicationType={detail.data.due_at && new Date(detail.data.due_at).getTime() < Date.now() ? "overdue_invoice_reminder" : "invoice_payment_reminder"}
                    communications={communications.data}
                    recipientOptions={recipientOptions.data}
                    recordId={detail.data.id}
                    recordType="invoice"
                  />
                </section>
              </main>

              <aside className="commerce-detail-sidebar">
                <section className="commerce-side-panel">
                  <PanelTitle icon={<ClipboardCheck size={18} />} title="Status and actions" />
                  <span className={`status-pill invoice-status ${detail.data.status}`}>
                    {formatInvoiceStatus(detail.data.status)}
                  </span>
                  <p className="inline-empty">
                    Email delivery marks this invoice sent. Manual sent is only for delivery outside the CRM.
                  </p>
                  {canManageDelivery ? (
                    <ManualInvoiceSentAction invoiceId={detail.data.id} status={detail.data.status} />
                  ) : null}
                  <InvoiceStatusActions invoiceId={detail.data.id} status={detail.data.status} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<UsersRound size={18} />} title="Contracting party" />
                  <Link className="linked-record" href={detail.data.organization_id ? `/admin/organizations/${detail.data.organization_id}` : `/admin/customers/${detail.data.customer_id}`}>
                    <strong>{detail.data.organizations?.name ?? detail.data.customers?.display_name ?? "Unknown contracting party"}</strong>
                    <span>{detail.data.organizations?.billing_phone || detail.data.organizations?.billing_email || detail.data.customers?.phone || detail.data.customers?.email || "No contact set"}</span>
                  </Link>
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<MapPin size={18} />} title="Job and location" />
                  {detail.data.jobs ? (
                    <Link className="linked-record" href={`/admin/jobs/${detail.data.job_id}`}>
                      <strong>{formatJobLabel(detail.data.jobs.service_type)}</strong>
                      <span>
                        {detail.data.jobs.service_locations
                          ? `${detail.data.jobs.service_locations.street}, ${detail.data.jobs.service_locations.city}`
                          : detail.data.jobs.status.replace("_", " ")}
                      </span>
                    </Link>
                  ) : <EmptyInline>No linked job available.</EmptyInline>}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<FileText size={18} />} title="Source quote" />
                  {detail.data.quote_id ? (
                    <Link className="linked-record" href={`/admin/quotes/${detail.data.quote_id}`}>
                      <strong>Open quote</strong>
                      <span>Return to the estimate that created this invoice.</span>
                    </Link>
                  ) : (
                    <EmptyInline>No quote linked to this invoice.</EmptyInline>
                  )}
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<ReceiptText size={18} />} title="Billing" />
                  <dl className="record-details">
                    <div><dt>Total due</dt><dd>{formatCurrency(detail.data.total_cents)}</dd></div>
                    <div><dt>Balance</dt><dd>{formatCurrency(detail.data.balance_due_cents)}</dd></div>
                    <div><dt>Due date</dt><dd>{formatDate(detail.data.due_at)}</dd></div>
                    <div><dt>Payments</dt><dd>{detail.data.payments?.length ?? 0}</dd></div>
                  </dl>
                </section>

                <PortalEngagementPanel engagement={detail.data} />

                <section className="commerce-side-panel" id="invoice-payments">
                  <PanelTitle icon={<CircleDollarSign size={18} />} title="Payments" />
                  <p className="inline-empty">Balance due is calculated from the invoice total minus successful payments. Undo a mistaken manual payment here, then use Edit invoice if its total also needs correction.</p>
                  <dl className="record-details">
                    <div><dt>Total</dt><dd>{formatCurrency(detail.data.total_cents)}</dd></div>
                    <div><dt>Received</dt><dd>{formatCurrency(successfulPaymentCents)}</dd></div>
                    <div><dt>Remaining</dt><dd>{formatCurrency(detail.data.balance_due_cents)}</dd></div>
                  </dl>
                  {detail.data.payments?.length ? (
                    <div className="payment-record-list">
                      {detail.data.payments.map((payment) => (
                        <article className="payment-record" key={payment.id}>
                          <div className="linked-record">
                            <strong>{formatCurrency(payment.amount_cents)} - {payment.status.replace("_", " ")}</strong>
                            <span>{formatPaymentMeta(payment)}</span>
                          </div>
                          {canManageDelivery && payment.provider === "manual" && payment.status === "succeeded" ? (
                            <ManualPaymentCorrectionForm
                              amountLabel={formatCurrency(payment.amount_cents)}
                              invoiceId={invoiceId}
                              paymentId={payment.id}
                            />
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : <EmptyInline>No payments recorded yet.</EmptyInline>}
                  {canManageDelivery && isInvoicePayable(detail.data.status, detail.data.balance_due_cents) ? (
                    <ManualPaymentForm balanceDueCents={detail.data.balance_due_cents} invoiceId={detail.data.id} />
                  ) : null}
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state"><h2>{title}</h2><p>{body}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function isInvoiceEditable(status: InvoiceStatus) {
  return !["paid", "void"].includes(status);
}

function formatJobLabel(serviceType?: string | null) {
  return serviceType ? serviceType.replace("_", " ") : "Linked job";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function isInvoicePayable(status: InvoiceStatus, balanceDueCents: number) {
  return balanceDueCents > 0 && ["sent", "partially_paid", "overdue"].includes(status);
}

function formatPaymentMeta(payment: Payment) {
  const method = payment.provider === "stripe" ? "Stripe Checkout" : payment.payment_method?.replace("_", " ") || "Manual payment";
  const reference = payment.reference || payment.provider_payment_id || "No reference";
  return `${method} - ${formatDate(payment.paid_at)} - ${reference}`;
}
