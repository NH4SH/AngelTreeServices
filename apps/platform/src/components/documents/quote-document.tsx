import { DocumentMeta, DocumentSection, DocumentShell } from "@/components/documents/document-shell";
import type { QuoteDetail } from "@/lib/types/database";

export function QuoteDocument({
  approvalMessage = "Customer approval is handled through a secure quote portal link.",
  quote,
}: {
  approvalMessage?: string;
  quote: QuoteDetail;
}) {
  return (
    <DocumentShell
      documentLabel="Quote"
      documentNumber={quote.quote_number ?? "Draft quote"}
      statusLabel={quote.status === "approved" ? "Accepted" : quote.status.replace("_", " ")}
    >
      <DocumentMeta
        items={[
          { label: "Prepared for", value: quote.customers?.display_name ?? "Customer not attached yet." },
          { label: "Contact", value: quote.customers?.phone || quote.customers?.email || "No contact information attached yet." },
          { label: "Service location", value: formatLocation(quote) },
          { label: "Expires", value: quote.expires_at ? formatDate(quote.expires_at) : "No expiration date set." },
        ]}
      />
      <DocumentSection title="Scope of work">
        <p>{quote.jobs?.requested_scope || "No requested scope attached yet."}</p>
      </DocumentSection>
      <DocumentLineItems
        items={(quote.quote_line_items ?? []).map((item) => ({
          description: item.description || item.name,
          quantity: item.quantity,
          totalCents: item.total_cents,
          unitPriceCents: item.unit_price_cents,
        }))}
        subtotalCents={quote.subtotal_cents}
        totalCents={quote.total_cents}
      />
      <DocumentSection title="Customer notes">
        <p>{quote.customer_message || "No customer-facing notes attached yet."}</p>
      </DocumentSection>
      <section className="business-document-approval">
        <strong>Approval</strong>
        <p>{approvalMessage}</p>
      </section>
    </DocumentShell>
  );
}

export function DocumentLineItems({
  items,
  subtotalCents,
  totalCents,
  totalLabel = "Total",
}: {
  items: { description: string; quantity: number; totalCents: number; unitPriceCents: number }[];
  subtotalCents: number;
  totalCents: number;
  totalLabel?: string;
}) {
  return (
    <section className="business-document-line-items">
      <div className="business-document-line-heading">
        <span>Description</span>
        <span>Qty</span>
        <span>Rate</span>
        <span>Amount</span>
      </div>
      {items.length ? (
        items.map((item, index) => (
          <div className="business-document-line-row" key={`${item.description}-${index}`}>
            <span>{item.description}</span>
            <span>{item.quantity}</span>
            <span>{formatCurrency(item.unitPriceCents)}</span>
            <strong>{formatCurrency(item.totalCents)}</strong>
          </div>
        ))
      ) : (
        <p className="business-document-empty">No line items attached yet.</p>
      )}
      <dl className="business-document-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCurrency(subtotalCents)}</dd>
        </div>
        <div>
          <dt>{totalLabel}</dt>
          <dd>{formatCurrency(totalCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatLocation(quote: QuoteDetail) {
  const location = quote.jobs?.service_locations;
  if (!location) {
    return "No service location attached yet.";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
