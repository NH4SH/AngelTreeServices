import { CheckCircle2, Clock3, FileSignature, Leaf, MapPin, ShieldCheck } from "lucide-react";
import { QuoteDocument } from "@/components/documents/quote-document";
import { PortalQuoteActions } from "@/components/portal-quote-actions";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";

type CustomerQuotePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

const trustPoints = [
  "Private quote link",
  "Clear line-item pricing",
  "Direct Angel Tree follow-up",
];

export default async function CustomerQuotePortalPage({ params }: CustomerQuotePortalPageProps) {
  const { token } = await params;
  const lookup = await getQuoteByPortalToken(token);

  if (!lookup.quote) {
    return <PortalUnavailable message={lookup.message} />;
  }

  const isApproved = lookup.quote.status === "approved";
  const scopeSummary = getQuoteScopeSummary(lookup.quote);

  return (
    <main className="customer-portal-page customer-quote-page">
      <header className="customer-portal-header">
        <div className="customer-portal-brand">
          <span><Leaf aria-hidden="true" size={22} /></span>
          <div>
            <strong>Angel Tree Services</strong>
            <small>Fredericksburg, Virginia</small>
          </div>
        </div>
        <p><ShieldCheck aria-hidden="true" size={17} /> Secure quote review</p>
      </header>

      <section className="customer-portal-hero customer-quote-hero">
        <div className="customer-portal-intro">
          <p className="surface-label">
            <FileSignature aria-hidden="true" size={18} />
            Your Quote
          </p>
          <h1>{isApproved ? "Your quote is approved." : "Review your quote and respond when you are ready."}</h1>
          <p>
            This private page shows only the quote prepared for you. Review the scope, line items, and total, then
            approve the work or request changes.
          </p>
        </div>

        <aside className="customer-portal-summary-card customer-quote-summary-card">
          <div className="customer-quote-summary-total">
            <span>Total quote</span>
            <strong>{formatCurrency(lookup.quote.total_cents)}</strong>
          </div>
          <dl className="customer-quote-summary-list">
            <div>
              <dt>Status</dt>
              <dd>{formatStatus(lookup.quote.status)}</dd>
            </div>
            <div>
              <dt>Service location</dt>
              <dd>{formatLocation(lookup.quote)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{lookup.quote.expires_at ? formatDate(lookup.quote.expires_at) : "No expiration date set"}</dd>
            </div>
          </dl>
          <div className="customer-portal-trust-list" aria-label="Portal trust cues">
            {trustPoints.map((point) => (
              <p key={point}>
                <CheckCircle2 aria-hidden="true" size={16} />
                {point}
              </p>
            ))}
          </div>
        </aside>
      </section>

      <section className="customer-quote-workspace">
        <div className="customer-quote-document-column">
          <div className="customer-quote-overview">
            {scopeSummary ? (
              <article className="customer-quote-overview-card">
                <strong>
                  <MapPin aria-hidden="true" size={16} />
                  Scope at a glance
                </strong>
                <p className="business-document-preformatted">{scopeSummary}</p>
              </article>
            ) : null}
            <article className="customer-quote-overview-card">
              <strong>
                <Clock3 aria-hidden="true" size={16} />
                What happens next
              </strong>
              <p>
                {isApproved
                  ? "Your approval is on file. Angel Tree Services will follow up with scheduling details."
                  : "After approval, Angel Tree Services will follow up with scheduling and any final coordination."}
              </p>
            </article>
          </div>

          <QuoteDocument
            approvalMessage={
              isApproved
                ? "Approved. Angel Tree Services will follow up with scheduling details."
                : "Approve this quote or request changes using your secure quote portal link."
            }
            quote={lookup.quote}
          />
        </div>

        <aside className="customer-quote-action-column">
          {isApproved ? (
            <section className="customer-quote-confirmation" role="status">
              <CheckCircle2 aria-hidden="true" size={24} />
              <div>
                <h2>Quote approved</h2>
                <p>Thank you. Angel Tree Services will follow up with scheduling details.</p>
              </div>
            </section>
          ) : (
            <PortalQuoteActions rawToken={token} />
          )}
        </aside>
      </section>

      <footer className="customer-portal-footer">
        <strong>Angel Tree Services</strong>
        <span>Questions? Reply to your quote email or call our office.</span>
      </footer>
    </main>
  );
}

function PortalUnavailable({ message }: { message: string }) {
  return (
    <main className="customer-portal-page customer-portal-unavailable">
      <div className="customer-portal-brand">
        <span><Leaf aria-hidden="true" size={22} /></span>
        <div>
          <strong>Angel Tree Services</strong>
          <small>Fredericksburg, Virginia</small>
        </div>
      </div>
      <section>
        <ShieldCheck aria-hidden="true" size={28} />
        <h1>Quote link unavailable</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status === "approved" ? "Approved" : status.replace("_", " ");
}

function formatLocation(quote: Awaited<ReturnType<typeof getQuoteByPortalToken>>["quote"]) {
  const location = quote?.service_locations ?? quote?.jobs?.service_locations;

  if (!location) {
    return "No service location attached";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function getQuoteScopeSummary(quote: NonNullable<Awaited<ReturnType<typeof getQuoteByPortalToken>>["quote"]>) {
  const lineItemScope = (quote.quote_line_items ?? [])
    .map((item) => [item.name, item.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");

  return lineItemScope || quote.jobs?.requested_scope?.trim() || null;
}
