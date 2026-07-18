import { CalendarDays, CircleDollarSign, MapPin, ReceiptText, ShieldCheck } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PrintButton } from "@/components/documents/print-button";
import { InvoicePortalPaymentChooser } from "@/components/invoice-portal-payment-button";
import { PortalViewTracker } from "@/components/portal-view-tracker";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getInvoicePaymentConfiguration } from "@/lib/payments/payment-options";

type CustomerInvoicePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{ payment?: string }>;
};

export default async function CustomerInvoicePortalPage({ params, searchParams }: CustomerInvoicePortalPageProps) {
  const { token } = await params;
  const { payment } = await searchParams;
  const lookup = await getInvoiceByPortalToken(token);

  if (!lookup.invoice) {
    return <PortalUnavailable message={lookup.message} />;
  }

  const invoice = lookup.invoice;
  const scopeSummary = getInvoiceScopeSummary(invoice);
  const paymentTotalCents = (invoice.payments ?? [])
    .filter((paymentRecord) => paymentRecord.status === "succeeded")
    .reduce((sum, paymentRecord) => sum + Math.max(0, paymentRecord.amount_cents - paymentRecord.refunded_principal_cents), 0);
  const amountDueCents = Math.max(0, invoice.total_cents - paymentTotalCents);
  const stripeConfigured = getStripeServerConfig().configured;
  const paymentConfig = getInvoicePaymentConfiguration();
  const canChoosePayment = amountDueCents > 0 && ["sent", "partially_paid", "overdue"].includes(invoice.status);
  const hasProcessingPayment = (invoice.payments ?? []).some((paymentRecord) => paymentRecord.status === "pending" && paymentRecord.provider === "stripe");

  return (
    <main className="customer-portal-page customer-quote-page customer-invoice-page">
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
          <p>Review the services, balance, and due date below. You can print or save a copy for your records.</p>
          <PrintButton label="Print or save invoice" />
        </div>

        <aside className="customer-portal-summary-card customer-invoice-summary">
          <div className="customer-quote-summary-total">
            <span>Balance due</span>
            <strong>{formatCurrency(amountDueCents)}</strong>
          </div>
          <dl className="customer-quote-summary-list">
            <div>
              <dt>Status</dt>
              <dd>{formatInvoiceStatus(invoice.status, "customer")}</dd>
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

      <section className="customer-invoice-document">
        <InvoiceDocument invoice={invoice} />
      </section>

      <section className="customer-invoice-payment-note print-hidden">
        <CircleDollarSign aria-hidden="true" size={22} />
        <div>
          {invoice.status === "paid" || amountDueCents === 0 ? (
            <>
              <strong>Payment received</strong>
              <p>
                {invoice.paid_at
                  ? `${formatCurrency(paymentTotalCents)} paid ${formatDate(invoice.paid_at)}. Thank you.`
                  : `Thank you. ${formatCurrency(paymentTotalCents)} has been paid in full.`}
              </p>
            </>
          ) : canChoosePayment ? (
            <>
              <strong>{hasProcessingPayment ? "Bank payment processing" : "Payment options"}</strong>
              {payment === "success" ? <p>Payment submitted. This invoice will update as soon as Stripe confirms it.</p> : null}
              {payment === "processing" || hasProcessingPayment ? <p>Your bank payment is processing. The invoice will remain open until Stripe confirms that the payment cleared.</p> : null}
              {payment === "cancelled" ? <p>Checkout was cancelled. No payment was made.</p> : null}
              {!hasProcessingPayment ? (
                <InvoicePortalPaymentChooser
                  cardEnabled={paymentConfig.cardEnabled}
                  mailingAddress={paymentConfig.businessCheckMailingAddress}
                  onlinePaymentEnabled={stripeConfigured}
                  selectedPreference={invoice.payment_preference}
                  token={token}
                />
              ) : null}
            </>
          ) : (
            <>
              <strong>Payment options</strong>
              <p>Please contact Angel Tree Services for payment options.</p>
            </>
          )}
        </div>
      </section>

      <footer className="customer-portal-footer print-hidden">
        <strong>Angel Tree Services</strong>
        <span>Questions? Reply to your invoice email or call (540) 388-8715.</span>
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

function getInvoiceScopeSummary(
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceByPortalToken>>["invoice"]>,
) {
  const lineItemScope = (invoice.invoice_line_items ?? [])
    .map((item) => [item.name, item.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");

  return lineItemScope || invoice.jobs?.requested_scope?.trim() || null;
}
