import { FileSignature, Leaf, ShieldCheck } from "lucide-react";
import { QuoteDocument } from "@/components/documents/quote-document";
import { PortalQuoteActions } from "@/components/portal-quote-actions";
import { PortalViewTracker } from "@/components/portal-view-tracker";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";
import { formatBusinessDateTime } from "@/lib/business-time";
import { formatCustomerFacingAddress } from "@/lib/documents/email-drafts";
import { buildPortalWorkSummary, formatCustomerQuoteStatus } from "@/lib/portal/quote-presentation";
import { checkPortalPageRateLimit } from "@/lib/security/portal-rate-limit";

type CustomerQuotePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CustomerQuotePortalPage({ params }: CustomerQuotePortalPageProps) {
  const { token } = await params;
  const rateLimit = await checkPortalPageRateLimit("quote", token);
  if (!rateLimit.available) return <PortalUnavailable message="This secure quote is temporarily unavailable. Please try again shortly." />;
  if (!rateLimit.allowed) return <PortalUnavailable message="Please wait a moment before opening this secure quote again." />;
  const lookup = await getQuoteByPortalToken(token);

  if (!lookup.quote) {
    return <PortalUnavailable message={lookup.message} />;
  }

  const isApproved = lookup.quote.status === "approved";
  const statusLabel = formatCustomerQuoteStatus(lookup.quote.status);
  const totalLabel = formatCurrency(lookup.quote.total_cents);
  const expirationLabel = lookup.quote.expires_at
    ? formatDate(lookup.quote.expires_at)
    : "Contact us for validity";
  const preparedFor = lookup.quote.organizations?.name
    ?? lookup.quote.customers?.display_name
    ?? "Customer";
  const workSummary = buildPortalWorkSummary(lookup.quote);

  return (
    <main className="customer-portal-page customer-quote-page">
      <PortalViewTracker documentType="quote" token={token} />
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

      <section className="customer-quote-heading">
        <p className="surface-label">
          <FileSignature aria-hidden="true" size={18} />
          Proposal
        </p>
        <h1>{isApproved ? "Proposal approved" : "Review your proposal"}</h1>
        <p>Review the work and pricing below, then approve the proposal or request a change.</p>
      </section>

      <dl className="customer-quote-metadata" aria-label="Proposal details">
        <div className="customer-quote-metadata-prepared">
          <dt>Prepared for</dt>
          <dd>{preparedFor}</dd>
        </div>
        <div className="customer-quote-metadata-location">
          <dt>Service location</dt>
          <dd>{formatLocation(lookup.quote)}</dd>
        </div>
        <div className="customer-quote-metadata-total">
          <dt>Total</dt>
          <dd>{totalLabel}</dd>
        </div>
        <div className="customer-quote-metadata-expiration">
          <dt>Valid through</dt>
          <dd>{expirationLabel}</dd>
        </div>
        <div className="customer-quote-metadata-status">
          <dt>Status</dt>
          <dd><span className={`status-badge ${lookup.quote.status}`}>{statusLabel}</span></dd>
        </div>
      </dl>

      <section className="customer-quote-workspace">
        <aside className="customer-quote-action-column">
          <PortalQuoteActions
            approved={isApproved}
            expirationLabel={expirationLabel}
            rawToken={token}
            statusLabel={statusLabel}
            totalLabel={totalLabel}
            workSummary={workSummary}
          />
        </aside>

        <div className="customer-quote-document-column">
          <QuoteDocument
            approvalMessage={
              isApproved
                ? "Approved. Angel Tree Services will follow up with scheduling details."
                : "Approve this quote or request changes using your secure quote portal link."
            }
            quote={lookup.quote}
            showApprovalSection={false}
          />
        </div>
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
  return formatBusinessDateTime(value, { dateStyle: "long" });
}

function formatLocation(quote: Awaited<ReturnType<typeof getQuoteByPortalToken>>["quote"]) {
  const location = quote?.service_locations ?? quote?.jobs?.service_locations;
  return formatCustomerFacingAddress(location) || "Service location to be confirmed";
}
