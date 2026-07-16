import { DocumentMeta, DocumentSection, DocumentShell } from "@/components/documents/document-shell";
import { DocumentTerms } from "@/components/documents/document-terms";
import { getEmailSetupState } from "@/lib/email/config";
import { getQuoteTerms } from "@/lib/documents/terms";
import type { QuoteDetail } from "@/lib/types/database";

export function QuoteDocument({
  approvalMessage = "Approve this quote or request changes using the secure quote portal link included in your quote email.",
  quote,
  showInternalPreview = false,
}: {
  approvalMessage?: string;
  quote: QuoteDetail;
  showInternalPreview?: boolean;
}) {
  const lineItems = [...(quote.quote_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const proposalNote = getProposalNote(quote, lineItems);
  const contactEmail = getEmailSetupState().replyTo;

  return (
    <DocumentShell
      brandLogoSrc="/angel-tree-services-logo.jpg"
      className="quote-proposal-document"
      documentLabel="Proposal"
      documentNumber={quote.quote_number ?? "Prepared proposal"}
      footerDetails={
        <>
          <div>
            <strong>Angel Tree Services</strong>
            <span>Fredericksburg, Virginia region</span>
          </div>
          <div>
            <span>(540) 388-8715</span>
            <span>{contactEmail}</span>
            <span>angeltreeservices.org</span>
          </div>
        </>
      }
      previewLabel={showInternalPreview ? "Internal draft preview" : undefined}
    >
      <DocumentMeta
        items={[
          { label: "Prepared for", value: quote.customers?.display_name ?? "Customer" },
          { label: "Contact", value: formatContact(quote) },
          { label: "Service location", value: formatLocation(quote), wide: true },
          { label: "Prepared", value: formatDate(quote.created_at) },
          { label: "Valid through", value: quote.expires_at ? formatDate(quote.expires_at) : "Contact us for validity" },
        ]}
      />

      <QuoteScopeItems
        fallbackScope={quote.jobs?.requested_scope}
        items={lineItems}
        subtotalCents={quote.subtotal_cents}
        totalCents={quote.total_cents}
      />

      {proposalNote ? (
        <DocumentSection title="Notes from Angel Tree Services">
          <p className="business-document-preformatted">{proposalNote}</p>
        </DocumentSection>
      ) : null}

      <DocumentTerms
        terms={getQuoteTerms(quote.expires_at)}
        title="Terms & Conditions"
        variant="quote"
      />

      <section className="business-document-approval">
        <strong>Ready to move forward?</strong>
        <p>{approvalMessage}</p>
        <small>Your secure link keeps approval and change requests connected to this proposal.</small>
      </section>
    </DocumentShell>
  );
}

function QuoteScopeItems({
  fallbackScope,
  items,
  subtotalCents,
  totalCents,
}: {
  fallbackScope?: string | null;
  items: NonNullable<QuoteDetail["quote_line_items"]>;
  subtotalCents: number;
  totalCents: number;
}) {
  return (
    <section className="quote-proposal-scope">
      <div className="quote-proposal-section-heading">
        <div>
          <span>Proposed services</span>
          <h3>Scope of Work</h3>
        </div>
        <span>{items.length} {items.length === 1 ? "service" : "services"}</span>
      </div>

      <div className="quote-proposal-line-list">
        {items.length ? (
          items.map((item, index) => (
            <article className="quote-proposal-line" key={item.id || `${item.name}-${index}`}>
              <div className="quote-proposal-line-heading">
                <strong>{item.name}</strong>
                <strong>{formatCurrency(item.total_cents)}</strong>
              </div>
              {item.description ? (
                <p className="business-document-preformatted">{item.description}</p>
              ) : null}
              <dl className="quote-proposal-line-pricing">
                <div><dt>Qty</dt><dd>{formatQuantity(item.quantity)}</dd></div>
                <div><dt>Unit price</dt><dd>{formatCurrency(item.unit_price_cents)}</dd></div>
                <div><dt>Line total</dt><dd>{formatCurrency(item.total_cents)}</dd></div>
              </dl>
            </article>
          ))
        ) : (
          <p className="business-document-empty">{fallbackScope || "Scope details will be confirmed before work begins."}</p>
        )}
      </div>

      <dl className="quote-proposal-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCurrency(subtotalCents)}</dd>
        </div>
        <div>
          <dt>Quote total</dt>
          <dd>{formatCurrency(totalCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function DocumentLineItems({
  items,
  subtotalCents,
  totalCents,
  totalLabel = "Total",
}: {
  items: { description: string | null; name: string; quantity: number; totalCents: number; unitPriceCents: number }[];
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
          <div className="business-document-line-row" key={`${item.name}-${index}`}>
            <span className="business-document-line-description">
              <strong>{item.name}</strong>
              {item.description ? <span>{item.description}</span> : null}
            </span>
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
  const location = quote.service_locations ?? quote.jobs?.service_locations;
  if (!location) {
    return "No service location attached yet.";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function formatContact(quote: QuoteDetail) {
  const contact = [quote.customers?.phone, quote.customers?.email].filter(Boolean);
  return contact.length ? contact.join("\n") : "Contact information available through our office";
}

function getProposalNote(quote: QuoteDetail, items: NonNullable<QuoteDetail["quote_line_items"]>) {
  const message = quote.customer_message?.trim();
  if (!message) {
    return null;
  }

  const normalizedMessage = normalizeText(message);
  const duplicatesScope =
    normalizeText(quote.jobs?.requested_scope) === normalizedMessage ||
    items.some((item) =>
      [item.name, item.description].some((value) => normalizeText(value) === normalizedMessage),
    );

  return duplicatesScope ? null : message;
}

function normalizeText(value?: string | null) {
  return value?.trim().replaceAll(/\s+/g, " ").toLowerCase() ?? "";
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
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
