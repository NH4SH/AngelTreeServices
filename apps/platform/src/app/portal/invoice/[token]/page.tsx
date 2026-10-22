import { CalendarDays, CircleDollarSign, MapPin, ReceiptText, ShieldCheck } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PrintButton } from "@/components/documents/print-button";
import { InvoicePortalPaymentChooser } from "@/components/invoice-portal-payment-button";
import { PortalContact } from "@/components/portal-contact";
import { customerInvoiceState } from "@/lib/portal/customer-states";
import "../../customer-clarity.css";
import "../../customer-print.css";
import { PortalViewTracker } from "@/components/portal-view-tracker";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { formatBusinessDateTime } from "@/lib/business-time";
import { getInvoiceDisplayNumber } from "@/lib/invoices/status";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getInvoicePaymentConfiguration } from "@/lib/payments/payment-options";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { checkPortalPageRateLimit } from "@/lib/security/portal-rate-limit";

type CustomerInvoicePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{ payment?: string }>;
};

export default async function CustomerInvoicePortalPage({ params, searchParams }: CustomerInvoicePortalPageProps) {
  const { token } = await params;
  const { payment } = await searchParams;
  const rateLimit = await checkPortalPageRateLimit("invoice", token);
  if (!rateLimit.available) return <PortalUnavailable message="This secure invoice is temporarily unavailable. Please try again shortly." />;
  if (!rateLimit.allowed) return <PortalUnavailable message="Please wait a moment before opening this secure invoice again." />;
  const lookup = await getInvoiceByPortalToken(token);

  if (!lookup.invoice) {
    return <PortalUnavailable message={lookup.message} />;
  }

  const invoice = lookup.invoice;
  const scopeSummary = getInvoiceScopeSummary(invoice);
  // Token lookup above authorizes this invoice; reuse checkout's complete, read-only principal receipt.
  const paymentClient = getServiceRoleClient();
  const principal = paymentClient ? await getSuccessfulPaymentTotal(paymentClient, invoice.id) : null;
  if (!principal || principal.error) return <PortalUnavailable message="The current invoice balance could not be confirmed. Please refresh this secure link or call our office before making a payment." />;
  const paymentTotalCents = principal.totalCents;
  const amountDueCents = Math.max(0, invoice.total_cents - paymentTotalCents);
  const stripeConfigured = getStripeServerConfig().configured;
  const paymentConfig = getInvoicePaymentConfiguration();
  const paymentState = customerInvoiceState({ status: invoice.status, amountDueCents, payments: invoice.payments ?? [], returnedPayment: payment });
  const refreshHref = `/portal/invoice/${encodeURIComponent(token)}${paymentState.kind === "confirming" ? "?payment=processing" : ""}#invoice-payment-status`;


  return (
    <main className="customer-portal-page customer-quote-page customer-invoice-page customer-document-page">
      <PortalViewTracker documentType="invoice" token={token} />
      <header className="customer-portal-header print-hidden">
        <div className="customer-portal-brand">
          <img alt="" aria-hidden="true" src="/angel-tree-services-logo.jpg" />
          <div>
            <strong>Angel Tree Services</strong>
            <small>Fredericksburg, Virginia</small>
          </div>
        </div>
        <p><ShieldCheck aria-hidden="true" size={17} /> Secure invoice</p>
      </header>

      <section className="customer-portal-hero customer-invoice-hero print-hidden">
        <div className="customer-portal-intro">
          <p className="surface-label">
            <ReceiptText aria-hidden="true" size={18} />
            Customer invoice
          </p>
          <h1>{getInvoiceDisplayNumber(invoice.invoice_number)}</h1>
          <p>Check your balance and payment status here. The full invoice is below for your records.</p>
          <nav className="customer-invoice-shortcuts" aria-label="Invoice sections">{paymentState.canChoose ? <a className="customer-invoice-pay-link" href="#invoice-payment">Choose payment method</a> : <a href="#invoice-payment-status">View payment status</a>}<a href="#invoice-details">View full invoice</a></nav>
          <PrintButton label="Print or save invoice" showPrivacyHint />
        </div>

        <aside className="customer-portal-summary-card customer-invoice-summary">
          <div className="customer-quote-summary-total">
            <span>{paymentState.kind === "processing" || paymentState.kind === "confirming" ? "Balance awaiting payment confirmation" : paymentState.kind === "void" ? "Invoice amount — not payable" : "Balance due"}</span>
            <strong>{formatCurrency(amountDueCents)}</strong>
          </div>
          <dl className="customer-quote-summary-list">
            <div>
              <dt>Status</dt>
              <dd>{paymentState.label}</dd>
            </div>
            <div>
              <dt>Service location</dt>
              <dd><MapPin aria-hidden="true" size={16} /> {formatLocation(invoice)}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd><CalendarDays aria-hidden="true" size={16} /> {formatDate(invoice.due_at)}</dd>
            </div>
          </dl>
          <div id="invoice-payment-status" className={`customer-invoice-current-state ${paymentState.kind}`} role="status"><h2>{paymentState.title}</h2><p>{paymentState.message}</p>{paymentState.kind === "settled" && invoice.paid_at ? <p>Payment recorded {formatDate(invoice.paid_at)}. Thank you.</p> : null}{paymentState.refresh ? <a href={refreshHref}>Refresh payment status</a> : null}</div>
        </aside>
      </section>

      {scopeSummary ? (
        <section className="customer-quote-overview customer-invoice-scope-overview print-hidden">
          <article className="customer-quote-overview-card">
            <strong>
              <ReceiptText aria-hidden="true" size={16} />
              Scope at a glance
            </strong>
            <p className="business-document-preformatted">{scopeSummary}</p>
          </article>
        </section>
      ) : null}

      <section className="customer-invoice-payment-panel print-hidden" id="invoice-payment" aria-labelledby="invoice-payment-title">
        <h2 id="invoice-payment-title">{paymentState.canChoose ? "Choose how to pay" : "Questions about this invoice?"}</h2>
        {paymentState.canChoose ? <InvoicePortalPaymentChooser
          amountDueCents={amountDueCents}
          cardEnabled={paymentConfig.cardEnabled}
          invoiceNumber={getInvoiceDisplayNumber(invoice.invoice_number)}
          mailingAddress={paymentConfig.businessCheckMailingAddress}
          onlinePaymentEnabled={stripeConfigured}
          selectedPreference={invoice.payment_preference}
          stripePublishableKey={paymentConfig.stripePublishableKey}
          surchargeBps={paymentConfig.surchargeBps}
          surchargeEnabled={paymentConfig.surchargeEnabled}
          token={token}
        /> : null}
        <PortalContact />
      </section>

      <section className="customer-invoice-document" id="invoice-details" aria-label="Full invoice and terms">
        {/* Keep the printable copy on the same verified balance as payment review. This is a read-only projection. */}
        <InvoiceDocument invoice={{ ...invoice, balance_due_cents: amountDueCents }} />
      </section>

      <footer className="customer-portal-footer print-hidden">
        <strong>Angel Tree Services</strong>
        <span>Keep your secure invoice email to return to this document.</span>
      </footer>
    </main>
  );
}

function PortalUnavailable({ message }: { message: string }) {
  return (
    <main className="customer-portal-page customer-portal-unavailable">
      <div className="customer-portal-brand">
        <img alt="" aria-hidden="true" src="/angel-tree-services-logo.jpg" />
        <div>
          <strong>Angel Tree Services</strong>
          <small>Fredericksburg, Virginia</small>
        </div>
      </div>
      <section>
        <ShieldCheck aria-hidden="true" size={28} />
        <h1>Invoice link unavailable</h1>
        <p>{message}</p>
        <PortalContact />
      </section>
    </main>
  );
}

function formatLocation(
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceByPortalToken>>["invoice"]>,
) {
  const location = invoice.jobs?.service_locations;

  if (!location) {
    return "Contact Angel Tree Services";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Contact us for due date";
  }

  return formatBusinessDateTime(value, { dateStyle: "long" });
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getInvoiceScopeSummary(
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceByPortalToken>>["invoice"]>,
) {
  const lineItemScope = (invoice.invoice_line_items ?? [])
    .map((item) => [item.name, item.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");

  return lineItemScope || invoice.jobs?.requested_scope?.trim() || null;
}
