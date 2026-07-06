import { CheckCircle2, Leaf, ShieldCheck } from "lucide-react";
import { QuoteDocument } from "@/components/documents/quote-document";
import { PortalQuoteActions } from "@/components/portal-quote-actions";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";

type CustomerQuotePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CustomerQuotePortalPage({ params }: CustomerQuotePortalPageProps) {
  const { token } = await params;
  const lookup = await getQuoteByPortalToken(token);

  if (!lookup.quote) {
    return <PortalUnavailable message={lookup.message} />;
  }

  const isApproved = lookup.quote.status === "approved";

  return (
    <main className="customer-portal-page">
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

      <section className="customer-portal-intro">
        <p className="surface-label"><Leaf aria-hidden="true" size={18} />Your Quote</p>
        <h1>{isApproved ? "Your quote is approved." : "Review your tree service quote."}</h1>
        <p>
          This private link shows only the quote prepared for you. Review the scope and pricing, then let us know how
          you would like to proceed.
        </p>
      </section>

      <QuoteDocument
        approvalMessage={isApproved ? "Approved. Angel Tree Services will follow up with scheduling details." : "Review the details, then approve or request changes below."}
        quote={lookup.quote}
      />

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

