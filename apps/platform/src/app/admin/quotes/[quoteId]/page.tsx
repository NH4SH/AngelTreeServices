import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, ClipboardCheck, FileSignature, MapPin, ReceiptText, StickyNote, UsersRound } from "lucide-react";
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
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/quotes">Back to quotes</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {assignedUsers.error ? <DataWarning message={assignedUsers.error} /> : null}
        {!detail.data ? (
          <EmptyState title="Quote not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="page-heading">
              <p className="surface-label"><FileSignature aria-hidden="true" size={18} />Quote File</p>
              <h1>{detail.data.quote_number || "Draft quote"}</h1>
              <p>{detail.data.customer_message || "No customer-facing message yet."}</p>
            </section>

            <section className="detail-grid">
              <article className="detail-panel">
                <PanelTitle icon={<ClipboardCheck size={18} />} title="Quote status" />
                <span className="status-pill">{formatQuoteStatus(detail.data.status)}</span>
                <QuoteStatusActions quoteId={detail.data.id} />
                <CreateInvoiceFromQuoteAction quoteId={detail.data.id} />
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<UsersRound size={18} />} title="Customer" />
                <Link className="linked-record" href={`/admin/customers/${detail.data.customer_id}`}>
                  <strong>{detail.data.customers?.display_name ?? "Unknown customer"}</strong>
                  <span>{detail.data.customers?.phone || detail.data.customers?.email || "No contact set"}</span>
                </Link>
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<MapPin size={18} />} title="Job and location" />
                {detail.data.jobs ? (
                  <Link className="linked-record" href={`/admin/jobs/${detail.data.job_id}`}>
                    <strong>{detail.data.jobs.service_type?.replace("_", " ") || "Job"}</strong>
                    <span>{detail.data.jobs.service_locations ? `${detail.data.jobs.service_locations.street}, ${detail.data.jobs.service_locations.city}` : detail.data.jobs.status.replace("_", " ")}</span>
                  </Link>
                ) : (
                  <EmptyInline>No linked job available.</EmptyInline>
                )}
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<ReceiptText size={18} />} title="Totals" />
                <dl className="record-details">
                  <div><dt>Subtotal</dt><dd>{formatCurrency(detail.data.subtotal_cents)}</dd></div>
                  <div><dt>Total</dt><dd>{formatCurrency(detail.data.total_cents)}</dd></div>
                </dl>
              </article>
            </section>

            <section className="detail-grid">
              <article className="detail-panel wide-detail-panel">
                <PanelTitle icon={<ReceiptText size={18} />} title="Line items" />
                {detail.data.quote_line_items?.length ? (
                  <div className="line-items-preview">
                    {detail.data.quote_line_items.map((item) => (
                      <div className="line-item-row" key={item.id}>
                        <span>{item.description || item.name}</span>
                        <span>{item.quantity}</span>
                        <span>{formatCurrency(item.unit_price_cents)}</span>
                        <strong>{formatCurrency(item.total_cents)}</strong>
                      </div>
                    ))}
                    <div className="line-item-total"><span>Total</span><strong>{formatCurrency(detail.data.total_cents)}</strong></div>
                  </div>
                ) : (
                  <EmptyInline>No line items yet.</EmptyInline>
                )}
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<StickyNote size={18} />} title="Notes" />
                {detail.data.notes?.length ? detail.data.notes.map((note) => (
                  <article className="linked-record" key={note.id}><strong>{note.visibility.replace("_", " ")}</strong><span>{note.body}</span></article>
                )) : <EmptyInline>No notes yet.</EmptyInline>}
              </article>
            </section>

            <section className="document-workspace">
              <div className="document-workspace-heading print-hidden">
                <div>
                  <p className="surface-label"><FileSignature aria-hidden="true" size={18} />Printable quote</p>
                  <h2>Quote document preview</h2>
                </div>
                <PrintButton label="Print quote" />
              </div>
              <QuoteDocument quote={detail.data} />
            </section>

            <section className="scheduling-workspace">
              <div className="document-workspace-heading">
                <div>
                  <p className="surface-label"><CalendarDays aria-hidden="true" size={18} />Follow-up reminder</p>
                  <h2>Set the next quote check-in</h2>
                </div>
              </div>
              <AddAppointmentForm assignedUsers={assignedUsers.data} defaultAppointmentType="follow_up" jobId={detail.data.job_id} jobs={[]} lockedAppointmentType="follow_up" />
            </section>

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

            <section className="email-draft-grid">
              <EmailDraftCard draft={generateQuoteEmailDraft(detail.data)} label="Quote email draft" />
              <EmailDraftCard draft={generateQuoteFollowUpMessage(detail.data)} label="Quote follow-up draft" />
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

function formatQuoteStatus(status: string) {
  return status === "approved" ? "accepted" : status.replace("_", " ");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
