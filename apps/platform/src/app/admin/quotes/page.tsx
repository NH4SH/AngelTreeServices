import { FileSignature, Link2, Plus, ReceiptText, X } from "lucide-react";
import Link from "next/link";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddQuoteForm } from "./QuoteForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateQuote } from "@/lib/actions/duplicate-records";
import { getCustomerOptions, getServiceLocations } from "@/lib/data/customers";
import { getJobOptions } from "@/lib/data/jobs";
import { getQuotes } from "@/lib/data/quotes";
import { getEstimateScheduleEventOptions, type EstimateScheduleEventOption } from "@/lib/data/schedule";
import type { Customer, Job, QuoteStatus, QuoteWithRelations, ServiceLocation } from "@/lib/types/database";

type QuotesPageProps = {
  searchParams: Promise<{
    customer_id?: string;
    new?: string;
  }>;
};

const summaryOrder: { key: QuoteStatus | "awaiting"; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "awaiting", label: "Sent / awaiting response" },
  { key: "approved", label: "Accepted" },
  { key: "change_requested", label: "Change requested" },
  { key: "expired", label: "Expired / declined" },
];

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/quotes");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening quotes" />;
  }

  const [quotes, customers, serviceLocations, jobs, estimateScheduleEvents] = await Promise.all([
    getQuotes(),
    getCustomerOptions(),
    getServiceLocations(),
    getJobOptions(),
    getEstimateScheduleEventOptions(),
  ]);
  const summary = getQuoteSummary(quotes.data);

  return (
    <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <section className="page-heading commerce-heading">
          <div>
            <p className="surface-label">
              <FileSignature aria-hidden="true" size={18} />
              Quotes
            </p>
            <h1>Quotes</h1>
            <p>Build, send, follow up, and convert estimates.</p>
          </div>
          <Link className="primary-action" href="/admin/quotes?new=1">
            <Plus aria-hidden="true" size={18} />
            New quote
          </Link>
        </section>

        {[quotes.error, customers.error, serviceLocations.error, jobs.error, estimateScheduleEvents.error]
          .filter(Boolean)
          .map((message) => (
            <DataWarning key={message} message={message ?? ""} />
          ))}

        <section className="commerce-summary-strip" aria-label="Quote workflow summary">
          {summaryOrder.map((item) => (
            <SummaryChip key={item.key} label={item.label} value={summary[item.key]} />
          ))}
        </section>

        {quotes.data.length === 0 ? (
          <EmptyState title="No quotes yet" body="Create the first draft quote from a customer and service location." />
        ) : (
          <section className="commerce-table-shell" aria-label="Quotes">
            <div className="commerce-table-header quote-grid" aria-hidden="true">
              <span>Quote</span>
              <span>Customer / job</span>
              <span>Status</span>
              <span>Total</span>
              <span>Dates</span>
              <span>Actions</span>
            </div>
            <div className="commerce-row-list">
              {quotes.data.map((quote) => (
                <article className="commerce-row quote-grid" key={quote.id}>
                  <div className="commerce-record-title">
                    <Link href={`/admin/quotes/${quote.id}`}>{quote.quote_number || "Draft quote"}</Link>
                    <span>{quote.quote_line_items?.length ?? 0} line items</span>
                  </div>
                  <div className="commerce-cell">
                    <strong>{quote.customers?.display_name ?? "Unknown customer"}</strong>
                    <span>{formatServiceType(quote.jobs?.service_type) || formatLocation(quote.service_locations) || "Proposed work"}</span>
                  </div>
                  <div className="commerce-cell">
                    <span className={`status-pill quote-status ${quote.status}`}>
                      {formatQuoteStatus(quote.status)}
                    </span>
                  </div>
                  <div className="commerce-money">{formatCurrency(quote.total_cents)}</div>
                  <div className="commerce-cell">
                    <span>Created {formatDate(quote.created_at)}</span>
                    <span>Expires {formatDate(quote.expires_at)}</span>
                  </div>
                  <div className="commerce-actions">
                    <Link className="secondary-action" href={`/admin/quotes/${quote.id}`}>
                      Open
                    </Link>
                    <DuplicateRecordButton
                      action={duplicateQuote}
                      hiddenFieldName="quote_id"
                      hiddenFieldValue={quote.id}
                      label="Duplicate"
                      pendingLabel="Copying..."
                    />
                    <Link className="secondary-action" href={`/admin/quotes/${quote.id}#portal-link`}>
                      <Link2 aria-hidden="true" size={16} />
                      Portal
                    </Link>
                    {quote.status === "approved" && quote.jobs ? (
                      <Link className="secondary-action" href={`/admin/jobs/${quote.jobs.id}`}>
                        Work order
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {params.new === "1" ? (
          <QuoteCreateDrawer
            customers={customers.data}
            defaultCustomerId={params.customer_id}
            estimateScheduleEvents={estimateScheduleEvents.data}
            jobs={jobs.data}
            serviceLocations={serviceLocations.data}
          />
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function QuoteCreateDrawer({
  customers,
  defaultCustomerId,
  estimateScheduleEvents,
  jobs,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  defaultCustomerId?: string;
  estimateScheduleEvents: EstimateScheduleEventOption[];
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
  serviceLocations: Pick<ServiceLocation, "id" | "customer_id" | "label" | "street" | "city" | "state" | "postal_code">[];
}) {
  return (
    <div aria-labelledby="new-quote-title" className="commerce-drawer-overlay" role="dialog">
      <Link aria-label="Close new quote panel" className="commerce-drawer-backdrop" href="/admin/quotes" />
      <aside className="commerce-drawer">
        <div className="commerce-drawer-header">
          <div>
            <p className="surface-label">
              <ReceiptText aria-hidden="true" size={18} />
              Quote builder
            </p>
            <h2 id="new-quote-title">New quote</h2>
            <p>Start a draft proposal from the customer, service location, and proposed work.</p>
          </div>
          <Link aria-label="Close new quote panel" className="secondary-action icon-action" href="/admin/quotes">
            <X aria-hidden="true" size={18} />
          </Link>
        </div>
        <AddQuoteForm
          customers={customers}
          defaultCustomerId={defaultCustomerId}
          estimateScheduleEvents={estimateScheduleEvents}
          jobs={jobs}
          serviceLocations={serviceLocations}
        />
        <Link className="secondary-action commerce-cancel-link" href="/admin/quotes">
          Cancel
        </Link>
      </aside>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="commerce-summary-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getQuoteSummary(quotes: QuoteWithRelations[]) {
  return quotes.reduce<Record<QuoteStatus | "awaiting", number>>(
    (counts, quote) => {
      counts[quote.status] += 1;
      if (quote.status === "sent" || quote.status === "change_requested") {
        counts.awaiting += 1;
      }
      if (quote.status === "declined") {
        counts.expired += 1;
      }
      return counts;
    },
    {
      draft: 0,
      sent: 0,
      approved: 0,
      change_requested: 0,
      expired: 0,
      declined: 0,
      cancelled: 0,
      awaiting: 0,
    },
  );
}

function formatQuoteStatus(status: QuoteStatus) {
  return status === "approved" ? "accepted" : status.replace("_", " ");
}

function formatServiceType(serviceType?: string | null) {
  return serviceType ? serviceType.replace("_", " ") : "";
}

function formatLocation(location?: QuoteWithRelations["service_locations"]) {
  if (!location) {
    return "";
  }

  return [location.street, location.city, location.state].filter(Boolean).join(", ");
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "not set";
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state commerce-empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      <Link className="primary-action" href="/admin/quotes?new=1">
        <Plus aria-hidden="true" size={18} />
        New quote
      </Link>
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
