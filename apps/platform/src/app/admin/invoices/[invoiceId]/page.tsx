import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardCheck, FileText, MapPin, ReceiptText, Send, StickyNote, UsersRound } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PrintButton } from "@/components/documents/print-button";
import { EmailDraftCard } from "@/components/email-draft-card";
import { InvoiceStatusActions } from "@/components/workflow-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { generateInvoiceEmailDraft } from "@/lib/documents/email-drafts";
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

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <Link className="crew-back-link" href="/admin/invoices">Back to invoices</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
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
                <h1>{detail.data.invoice_number || "Draft invoice"}</h1>
                <p>{detail.data.customers?.display_name ?? "Unknown customer"} - {formatJobLabel(detail.data.jobs?.service_type)}</p>
              </div>
              <div className="commerce-header-aside">
                <span className={`status-pill invoice-status ${detail.data.status}`}>
                  {formatInvoiceStatus(detail.data.status)}
                </span>
                <strong>{formatCurrency(detail.data.balance_due_cents)}</strong>
                <span>balance due</span>
              </div>
            </section>

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
                    <PrintButton label="Print invoice" />
                  </div>
                  <InvoiceDocument invoice={detail.data} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<FileText size={18} />} title="Line items" />
                  {detail.data.invoice_line_items?.length ? (
                    <div className="line-items-preview commerce-line-items">
                      {detail.data.invoice_line_items.map((item) => (
                        <div className="line-item-row" key={item.id}>
                          <span>{item.description || item.name}</span>
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
              </main>

              <aside className="commerce-detail-sidebar">
                <section className="commerce-side-panel">
                  <PanelTitle icon={<ClipboardCheck size={18} />} title="Status and actions" />
                  <span className={`status-pill invoice-status ${detail.data.status}`}>
                    {formatInvoiceStatus(detail.data.status)}
                  </span>
                  <InvoiceStatusActions invoiceId={detail.data.id} />
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

                <section className="commerce-side-panel">
                  <PanelTitle icon={<Send size={18} />} title="Email draft" />
                  <p className="inline-empty">Draft copy is generated below. Nothing is sent from the platform yet.</p>
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

function formatInvoiceStatus(status: InvoiceStatus) {
  return status.replace("_", " ");
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
