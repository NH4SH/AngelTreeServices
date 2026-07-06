import { FileSignature } from "lucide-react";
import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddQuoteForm } from "./QuoteForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getJobOptions } from "@/lib/data/jobs";
import { getQuotes } from "@/lib/data/quotes";

export default async function QuotesPage() {
  const context = await getAuthenticatedPlatformContext("/admin/quotes");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening quotes" />;
  }

  const [quotes, jobs] = await Promise.all([getQuotes(), getJobOptions()]);

  return (
    <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <FileSignature aria-hidden="true" size={18} />
            Quotes
          </p>
          <h1>Quote scaffolding without PDFs, emails, or payment handling.</h1>
          <p>
            Create quote records and a first line item. Customer approval, PDF generation, and email
            delivery stay intentionally out of scope for this phase.
          </p>
        </section>

        {[quotes.error, jobs.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="crm-layout">
          <div className="crm-main">
            {quotes.data.length === 0 ? (
              <EmptyState title="No quotes yet" body="Add a job first, then create a quote scaffold." />
            ) : (
              <div className="record-list">
                {quotes.data.map((quote) => (
                  <article className="record-card" key={quote.id}>
                    <div className="record-card-header">
                      <div>
                        <h2>{quote.quote_number || "Draft quote"}</h2>
                        <p>{quote.customers?.display_name ?? "Unknown customer"}</p>
                      </div>
                      <span className="status-pill">
                        {quote.status === "approved" ? "accepted" : quote.status.replace("_", " ")}
                      </span>
                    </div>
                    <p>{quote.customer_message || "No notes yet."}</p>
                    <dl className="record-details">
                      <div>
                        <dt>Total</dt>
                        <dd>{formatCurrency(quote.total_cents)}</dd>
                      </div>
                      <div>
                        <dt>Line items</dt>
                        <dd>{quote.quote_line_items?.length ?? 0}</dd>
                      </div>
                    </dl>
                    <div className="record-actions">
                      <Link href={`/admin/quotes/${quote.id}`}>Open quote</Link>
                      <Link href={`/admin/jobs/${quote.job_id}`}>Open job</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="crm-side">
            <section className="form-panel">
              <h2>Add quote</h2>
              <AddQuoteForm jobs={jobs.data} />
            </section>
          </aside>
        </section>
      </div>
    </PlatformFrame>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
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
