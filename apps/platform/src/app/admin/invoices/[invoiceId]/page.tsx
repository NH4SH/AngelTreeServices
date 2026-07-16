import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardCheck, FileText, MapPin, Pencil, ReceiptText, Send, StickyNote, UsersRound } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { PrintButton } from "@/components/documents/print-button";
import { EmailDraftCard } from "@/components/email-draft-card";
import { EmailHistoryList, EmailSetupNotice } from "@/components/email-history";
import { InvoicePortalLinkPanel } from "@/components/invoice-portal-link-panel";
import { SendInvoiceEmailForm } from "@/components/send-email-action-form";
import { InvoiceStatusActions, ManualInvoiceSentAction } from "@/components/workflow-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateInvoice } from "@/lib/actions/duplicate-records";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEmailEvents } from "@/lib/data/email-events";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getInvoicePortalTokens } from "@/lib/data/portal-invoice";
import { generateInvoiceEmailDraft } from "@/lib/documents/email-drafts";
import { getEmailSetupState } from "@/lib/email/config";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";
import type { InvoiceStatus } from "@/lib/types/database";

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
  const emailSetup = getEmailSetupState();

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <Link className="crew-back-link" href="/admin/invoices">Back to invoices</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {portalTokens.error ? <DataWarning message={`Customer invoice links: ${portalTokens.error}`} /> : null}
        {emailEvents.error ? <DataWarning message={emailEvents.error} /> : null}
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
                <p>{detail.data.customers?.display_name ?? "Unknown customer"} - {formatJobLabel(detail.data.jobs?.service_type)}</p>
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
                      !detail.data.customers?.email ||
                      ["paid", "void"].includes(detail.data.status)
                    }
                    invoiceId={detail.data.id}
                  />
                  {!detail.data.customers?.email ? (
                    <p className="inline-empty">Add a customer email address before sending from the platform.</p>
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
                  <PanelTitle icon={<UsersRound size={18} />} title="Customer" />
                  <Link className="linked-record" href={`/admin/customers/${detail.data.customer_id}`}>
                    <strong>{detail.data.customers?.display_name ?? "Unknown customer"}</strong>
                    <span>{detail.data.customers?.phone || detail.data.customers?.email || "No contact set"}</span>
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
