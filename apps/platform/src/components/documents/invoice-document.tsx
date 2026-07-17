import { DocumentMeta, DocumentShell } from "@/components/documents/document-shell";
import { DocumentTerms } from "@/components/documents/document-terms";
import { invoiceTerms } from "@/lib/documents/terms";
import { getEmailSetupState } from "@/lib/email/config";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";
import type { InvoiceDetail } from "@/lib/types/database";

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const lineItems = [...(invoice.invoice_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const paidCents = Math.max(0, invoice.total_cents - invoice.balance_due_cents);
  const contactEmail = getEmailSetupState().replyTo;

  return (
    <DocumentShell
      brandLogoSrc="/angel-tree-services-logo.jpg"
      className="quote-proposal-document invoice-customer-document"
      documentLabel="Invoice"
      documentNumber={getInvoiceDisplayNumber(invoice.invoice_number)}
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
      statusLabel={formatInvoiceStatus(invoice.status, "customer")}
    >
      <DocumentMeta
        items={[
          { label: "Bill to", value: invoice.organizations?.name ?? invoice.customers?.display_name ?? "Contracting party not attached yet." },
          { label: "Contact", value: formatContact(invoice) },
          { label: "Service location", value: formatLocation(invoice), wide: true },
          { label: "Issue date", value: formatDate(invoice.created_at) },
          { label: "Due date", value: invoice.due_at ? formatDate(invoice.due_at) : "No due date set." },
        ]}
      />

      <InvoiceLineItems
        fallbackScope={invoice.jobs?.requested_scope}
        items={lineItems}
        paidCents={paidCents}
        subtotalCents={invoice.subtotal_cents}
        taxCents={invoice.tax_cents}
        totalCents={invoice.total_cents}
        balanceDueCents={invoice.balance_due_cents}
      />

      <DocumentTerms
        terms={invoiceTerms}
        title="Terms & Conditions - Invoices"
        variant="invoice"
      />
      <section className="business-document-payment-note">
        <strong>Balance due: {formatCurrency(invoice.balance_due_cents)}</strong>
        <p>Please include the invoice number with payment and contact our office with any billing questions.</p>
      </section>
    </DocumentShell>
  );
}

function InvoiceLineItems({
  balanceDueCents,
  fallbackScope,
  items,
  paidCents,
  subtotalCents,
  taxCents,
  totalCents,
}: {
  balanceDueCents: number;
  fallbackScope?: string | null;
  items: NonNullable<InvoiceDetail["invoice_line_items"]>;
  paidCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}) {
  return (
    <section className="quote-proposal-scope invoice-document-lines">
      <div className="quote-proposal-section-heading">
        <div>
          <span>Services and charges</span>
          <h3>Invoice details</h3>
        </div>
        <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
      </div>

      <div className="quote-proposal-line-list">
        {items.length ? (
          items.map((item, index) => (
            <article className="quote-proposal-line" key={item.id || `${item.name}-${index}`}>
              <div className="quote-proposal-line-heading">
                <strong>{item.name}</strong>
                <strong>{formatCurrency(item.total_cents)}</strong>
              </div>
              {item.description ? <p className="business-document-preformatted">{item.description}</p> : null}
              <dl className="quote-proposal-line-pricing">
                <div><dt>Qty</dt><dd>{formatQuantity(item.quantity)}</dd></div>
                <div><dt>Unit price</dt><dd>{formatCurrency(item.unit_price_cents)}</dd></div>
                <div><dt>Line total</dt><dd>{formatCurrency(item.total_cents)}</dd></div>
              </dl>
            </article>
          ))
        ) : (
          <p className="business-document-empty">
            {fallbackScope || "Invoice details will be provided by Angel Tree Services."}
          </p>
        )}
      </div>

      <dl className="quote-proposal-totals invoice-document-totals">
        <div><dt>Subtotal</dt><dd>{formatCurrency(subtotalCents)}</dd></div>
        {taxCents ? <div><dt>Tax / fees</dt><dd>{formatCurrency(taxCents)}</dd></div> : null}
        <div><dt>Total</dt><dd>{formatCurrency(totalCents)}</dd></div>
        {paidCents ? <div><dt>Paid</dt><dd>-{formatCurrency(paidCents)}</dd></div> : null}
        <div><dt>Balance due</dt><dd>{formatCurrency(balanceDueCents)}</dd></div>
      </dl>
    </section>
  );
}

function formatLocation(invoice: InvoiceDetail) {
  const location = invoice.jobs?.service_locations;
  if (!location) {
    return "No service location attached yet.";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function formatContact(invoice: InvoiceDetail) {
  const contact = invoice.organizations
    ? [invoice.organizations.billing_phone, invoice.organizations.billing_email].filter(Boolean)
    : [invoice.customers?.phone, invoice.customers?.email].filter(Boolean);
  return contact.length ? contact.join("\n") : "Contact information available through our office";
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
