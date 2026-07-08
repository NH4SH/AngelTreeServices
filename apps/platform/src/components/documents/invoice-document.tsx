import { DocumentMeta, DocumentSection, DocumentShell } from "@/components/documents/document-shell";
import { DocumentLineItems } from "@/components/documents/quote-document";
import type { InvoiceDetail } from "@/lib/types/database";

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <DocumentShell
      documentLabel="Invoice"
      documentNumber={invoice.invoice_number ?? "Draft invoice"}
      statusLabel={invoice.status.replace("_", " ")}
    >
      <DocumentMeta
        items={[
          { label: "Bill to", value: invoice.customers?.display_name ?? "Customer not attached yet." },
          { label: "Contact", value: invoice.customers?.phone || invoice.customers?.email || "No contact information attached yet." },
          { label: "Service location", value: formatLocation(invoice) },
          { label: "Due date", value: invoice.due_at ? formatDate(invoice.due_at) : "No due date set." },
        ]}
      />
      <DocumentSection title="Job summary">
        <p>{invoice.jobs?.requested_scope || "No job summary attached yet."}</p>
      </DocumentSection>
      <DocumentLineItems
        items={(invoice.invoice_line_items ?? []).map((item) => ({
          description: item.description,
          name: item.name,
          quantity: item.quantity,
          totalCents: item.total_cents,
          unitPriceCents: item.unit_price_cents,
        }))}
        subtotalCents={invoice.subtotal_cents}
        totalCents={invoice.balance_due_cents}
        totalLabel="Balance due"
      />
      <section className="business-document-payment-note">
        <strong>Payment status: {invoice.status.replace("_", " ")}</strong>
        <p>Online payment links are intentionally not connected yet.</p>
      </section>
    </DocumentShell>
  );
}

function formatLocation(invoice: InvoiceDetail) {
  const location = invoice.jobs?.service_locations;
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
