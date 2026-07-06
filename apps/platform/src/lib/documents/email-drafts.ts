import type { InvoiceDetail, JobDetail, QuoteDetail } from "@/lib/types/database";

export type EmailDraft = {
  subject: string;
  body: string;
};

const companyName = "Angel Tree Services";

export type QuoteEmailDraftInput = Pick<QuoteDetail, "quote_number" | "customer_message" | "customers">;

export function generateQuoteEmailDraft(
  quote: QuoteEmailDraftInput,
  options: { portalUrl?: string } = {},
): EmailDraft {
  const customerName = quote.customers?.display_name ?? "there";
  const quoteLabel = quote.quote_number ?? "your tree service quote";

  return {
    subject: `${companyName}: ${quoteLabel} is ready`,
    body: [
      `Hi ${customerName},`,
      "",
      `Your ${companyName} quote is ready for review.`,
      quote.customer_message ? `Notes: ${quote.customer_message}` : "",
      "",
      options.portalUrl ? `Review and approve your quote securely: ${options.portalUrl}` : "",
      "",
      "Please reply to this email or call our office with any questions.",
      "",
      "Thank you,",
      companyName,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function generateInvoiceEmailDraft(invoice: InvoiceDetail): EmailDraft {
  const customerName = invoice.customers?.display_name ?? "there";
  const invoiceLabel = invoice.invoice_number ?? "your invoice";

  return {
    subject: `${companyName}: ${invoiceLabel}`,
    body: [
      `Hi ${customerName},`,
      "",
      `Your invoice from ${companyName} is ready.`,
      `Balance due: ${formatCurrency(invoice.balance_due_cents)}.`,
      invoice.due_at ? `Due date: ${formatDate(invoice.due_at)}.` : "",
      "",
      "Please reply to this email or call our office with any questions. Online payment links will be added in a future phase.",
      "",
      "Thank you,",
      companyName,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function generateQuoteFollowUpDraft(quote: QuoteDetail): EmailDraft {
  const customerName = quote.customers?.display_name ?? "there";

  return {
    subject: `${companyName}: following up on your quote`,
    body: [
      `Hi ${customerName},`,
      "",
      "We wanted to follow up on your tree service quote and see if you have any questions.",
      "",
      "Reply here or call our office when you are ready. We are happy to talk through the scope or make adjustments.",
      "",
      "Thank you,",
      companyName,
    ].join("\n"),
  };
}

export function generateWorkOrderCrewMessage(job: JobDetail): EmailDraft {
  return {
    subject: `${companyName} work order: ${job.service_type?.replace("_", " ") ?? "service job"}`,
    body: [
      `Address: ${formatLocation(job)}`,
      `Scope: ${job.requested_scope || "No requested scope entered yet."}`,
      `Access notes: ${job.service_locations?.access_notes || "None"}`,
      `Service notes: ${job.service_locations?.service_notes || "None"}`,
      "",
      "Checklist: before photos, agreed scope, cleanup, after photos, customer notification, notes, ready for invoice.",
    ].join("\n"),
  };
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

function formatLocation(job: JobDetail) {
  const location = job.service_locations;
  if (!location) {
    return "No service location attached yet.";
  }

  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}
