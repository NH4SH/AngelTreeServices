import { CalendarDays, CircleDollarSign, MapPin, ReceiptText, ShieldCheck } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PrintButton } from "@/components/documents/print-button";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";

type CustomerInvoicePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CustomerInvoicePortalPage({ params }: CustomerInvoicePortalPageProps) {
  const { token } = await params;
  const lookup = await getInvoiceByPortalToken(token);

  if (!lookup.invoice) {
    return <PortalUnavailable message={lookup.message} />;
  }

  const invoice = lookup.invoice;

  return (
    <main className="customer-portal-page customer-quote-page customer-invoice-page">
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
            <strong>{formatCurrency(invoice.balance_due_cents)}</strong>
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

      <section className="customer-invoice-document">
        <InvoiceDocument invoice={invoice} />
      </section>

      <section className="customer-invoice-payment-note print-hidden">
        <CircleDollarSign aria-hidden="true" size={22} />
        <div>
          <strong>Payment options</strong>
          <p>Online payment is not enabled yet. Please contact Angel Tree Services for payment options.</p>
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
