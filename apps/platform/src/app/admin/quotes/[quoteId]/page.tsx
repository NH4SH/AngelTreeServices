import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  FileSignature,
  MapPin,
  ReceiptText,
  Send,
  StickyNote,
  UsersRound,
} from "lucide-react";
import { AddAppointmentForm } from "@/app/admin/schedule/AppointmentForm";
import { QuoteDocument } from "@/components/documents/quote-document";
import { PrintButton } from "@/components/documents/print-button";
import { EmailDraftCard } from "@/components/email-draft-card";
import { QuotePortalLinkPanel } from "@/components/quote-portal-link-panel";
import { CreateInvoiceFromQuoteAction, QuoteStatusActions } from "@/components/workflow-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getAssignableUsers } from "@/lib/data/appointments";
import { getQuotePortalTokens } from "@/lib/data/portal-quote";
import { getQuoteDetail } from "@/lib/data/quotes";
import { generateQuoteEmailDraft } from "@/lib/documents/email-drafts";
import { generateQuoteFollowUpMessage } from "@/lib/documents/scheduling-drafts";
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
  const assignedUsers = await getAssignableUsers();

  return (
    <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <Link className="crew-back-link" href="/admin/quotes">Back to quotes</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {assignedUsers.error ? <DataWarning message={assignedUsers.error} /> : null}
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
                <p>{detail.data.customers?.display_name ?? "Unknown customer"} - {formatJobLabel(detail.data.jobs?.service_type)}</p>
              </div>
              <div className="commerce-header-aside">
                <span className={`status-pill quote-status ${detail.data.status}`}>
                  {formatQuoteStatus(detail.data.status)}
                </span>
                <strong>{formatCurrency(detail.data.total_cents)}</strong>
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
                    <PrintButton label="Print quote" />
                  </div>
                  <QuoteDocument quote={detail.data} />
                </section>

                <section className="commerce-side-panel">
                  <PanelTitle icon={<ReceiptText size={18} />} title="Line items" />
                  {detail.data.quote_line_items?.length ? (
                    <div className="line-items-preview commerce-line-items">
                      {detail.data.quote_line_items.map((item) => (
                        <div className="line-item-row" key={item.id}>
                          <span>{item.description || item.name}</span>
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
              </main>

              <aside className="commerce-detail-sidebar">
                <section className="commerce-side-panel">
                  <PanelTitle icon={<ClipboardCheck size={18} />} title="Status and actions" />
                  <span className={`status-pill quote-status ${detail.data.status}`}>
                    {formatQuoteStatus(detail.data.status)}
                  </span>
                  <QuoteStatusActions quoteId={detail.data.id} />
                  <CreateInvoiceFromQuoteAction quoteId={detail.data.id} />
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
                  ) : (
                    <EmptyInline>No linked job available.</EmptyInline>
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
                    jobId={detail.data.job_id}
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

function formatQuoteStatus(status: QuoteStatus) {
  return status === "approved" ? "accepted" : status.replace("_", " ");
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
