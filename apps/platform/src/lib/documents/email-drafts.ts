import type { InvoiceDetail, InvoiceLineItem, JobDetail, QuoteDetail, QuoteLineItem } from "@/lib/types/database";

export type EmailDraft = {
  subject: string;
  body: string;
};

export type CustomerDocumentEmailDraft = EmailDraft & {
  documentType: "quote" | "invoice";
  greeting: string;
  intro: string;
  propertyLabel: string;
  scopeHeading: string;
  scopeText: string;
  customerNotes: string;
  closing: string;
  summaryLabel: string;
  summaryValue: string;
  timingLabel: string;
  timingValue: string;
  ctaLabel: string;
  portalUrl: string;
};

export type CustomerDocumentEmailEdits = Pick<
  CustomerDocumentEmailDraft,
  "subject" | "greeting" | "intro" | "scopeText" | "customerNotes" | "closing"
>;

const companyName = "Angel Tree Services";
type EmailLocation = {
  label?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

export type QuoteEmailDraftInput = Pick<
  QuoteDetail,
  | "approval_contact"
  | "customer_message"
  | "customers"
  | "debris_handling"
  | "debris_handling_notes"
  | "expires_at"
  | "jobs"
  | "notes"
  | "organizations"
  | "payment_terms"
  | "quote_line_items"
  | "quote_number"
  | "recipient_contact"
  | "sent_at"
  | "service_locations"
  | "status"
  | "total_cents"
  | "updated_at"
>;

export type InvoiceEmailDraftInput = Pick<
  InvoiceDetail,
  | "accounts_payable_contact"
  | "balance_due_cents"
  | "billing_contact"
  | "customers"
  | "due_at"
  | "invoice_line_items"
  | "invoice_number"
  | "jobs"
  | "notes"
  | "organizations"
  | "payment_terms"
  | "total_cents"
>;

export function generateQuoteEmailDraft(
  quote: QuoteEmailDraftInput,
  options: { portalUrl?: string } = {},
): CustomerDocumentEmailDraft {
  const propertyLabel = formatQuoteLocation(quote);
  const firstName = firstNameFrom(
    quote.approval_contact?.full_name
      ?? quote.recipient_contact?.full_name
      ?? (!quote.organizations ? quote.customers?.display_name : null),
  );
  const revised = quote.status === "change_requested";
  const draft: CustomerDocumentEmailDraft = {
    documentType: "quote",
    subject: `${companyName} Proposal – ${subjectLocation(propertyLabel)}`,
    greeting: `Hi ${firstName || "there"},`,
    intro: revised
      ? `We have updated the proposal for the requested work at ${propertyLabel}.`
      : `We have prepared a proposal for the requested work at ${propertyLabel}.`,
    propertyLabel,
    scopeHeading: "Proposed work",
    scopeText: formatLineItemScope(quote.quote_line_items, quote.jobs?.requested_scope),
    customerNotes: uniqueSections([
      quote.customer_message,
      formatDebrisHandling(quote.debris_handling, quote.debris_handling_notes),
      quote.payment_terms ? `Payment terms: ${quote.payment_terms.trim()}` : null,
      ...customerVisibleNotes(quote.notes),
    ]).join("\n\n"),
    closing: "Please reply to this email or call our office if you have questions or would like to request a change.",
    summaryLabel: "Proposal total",
    summaryValue: formatCurrency(quote.total_cents),
    timingLabel: "Proposal validity",
    timingValue: quote.expires_at ? `Valid through ${formatDate(quote.expires_at)}` : "See the proposal for validity terms",
    ctaLabel: "Review and approve proposal",
    portalUrl: options.portalUrl ?? "",
    body: "",
  };

  return withBody(draft);
}

export function generateInvoiceEmailDraft(
  invoice: InvoiceEmailDraftInput,
  options: { portalUrl?: string } = {},
): CustomerDocumentEmailDraft {
  const propertyLabel = formatInvoiceLocation(invoice);
  const firstName = firstNameFrom(
    invoice.accounts_payable_contact?.full_name
      ?? invoice.billing_contact?.full_name
      ?? (!invoice.organizations ? invoice.customers?.display_name : null),
  );
  const appliedCents = Math.max(0, invoice.total_cents - invoice.balance_due_cents);
  const completedWork = invoice.jobs?.status
    ? ["completed_pending_review", "ready_to_invoice", "completed", "invoiced", "paid"].includes(invoice.jobs.status)
    : false;
  const draft: CustomerDocumentEmailDraft = {
    documentType: "invoice",
    subject: `${companyName} Invoice – ${subjectLocation(propertyLabel)}`,
    greeting: `Hi ${firstName || "there"},`,
    intro: `This invoice is for the ${completedWork ? "completed " : ""}work listed below at ${propertyLabel}.`,
    propertyLabel,
    scopeHeading: "Completed work",
    scopeText: formatLineItemScope(invoice.invoice_line_items, invoice.jobs?.requested_scope),
    customerNotes: uniqueSections([
      appliedCents ? `Payments or credits applied: ${formatCurrency(appliedCents)}.` : null,
      invoice.due_at && invoice.payment_terms ? `Payment terms: ${invoice.payment_terms.trim()}` : null,
      ...customerVisibleNotes(invoice.notes),
    ]).join("\n\n"),
    closing: "Please reply to this email or call our office with any questions about this invoice or its payment options.",
    summaryLabel: "Balance due",
    summaryValue: formatCurrency(invoice.balance_due_cents),
    timingLabel: invoice.due_at ? "Due date" : "Payment terms",
    timingValue: invoice.due_at
      ? formatDate(invoice.due_at)
      : invoice.payment_terms?.trim() || "See the invoice for payment terms",
    ctaLabel: "Review and pay invoice",
    portalUrl: options.portalUrl ?? "",
    body: "",
  };

  return withBody(draft);
}

export function applyCustomerDocumentEmailEdits(
  draft: CustomerDocumentEmailDraft,
  edits: CustomerDocumentEmailEdits,
): CustomerDocumentEmailDraft {
  return withBody({
    ...draft,
    subject: edits.subject,
    greeting: edits.greeting,
    intro: edits.intro,
    scopeText: edits.scopeText,
    customerNotes: edits.customerNotes,
    closing: edits.closing,
  });
}

export function buildCustomerDocumentEmailText(draft: Omit<CustomerDocumentEmailDraft, "body">) {
  return [
    draft.greeting,
    "",
    draft.intro,
    "",
    draft.scopeHeading,
    draft.scopeText,
    "",
    `${draft.summaryLabel}: ${draft.summaryValue}`,
    `${draft.timingLabel}: ${draft.timingValue}`,
    draft.customerNotes ? `\nImportant notes\n${draft.customerNotes}` : "",
    "",
    draft.portalUrl ? `${draft.ctaLabel}: ${draft.portalUrl}` : "",
    "",
    draft.closing,
    "",
    "Thank you,",
    companyName,
    "(540) 388-8715",
    "info@angeltreeservice.org",
    "angeltreeservices.org",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}

function withBody(draft: CustomerDocumentEmailDraft): CustomerDocumentEmailDraft {
  return { ...draft, body: buildCustomerDocumentEmailText(draft) };
}

function formatLineItemScope(
  lineItems?: Pick<QuoteLineItem | InvoiceLineItem, "name" | "description" | "quantity" | "unit_price_cents" | "total_cents" | "sort_order">[],
  fallbackScope?: string | null,
) {
  if (!lineItems?.length) {
    return fallbackScope?.trim() || "See the attached document or secure customer page for the complete scope.";
  }

  return lineItems
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item, index) => {
      const lines = [
        `${index + 1}. ${item.name.trim()}`,
        item.description?.trim(),
        `${formatQuantity(item.quantity)} × ${formatCurrency(item.unit_price_cents)} = ${formatCurrency(item.total_cents)}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatQuoteLocation(quote: QuoteEmailDraftInput) {
  return formatLocation(quote.service_locations ?? quote.jobs?.service_locations);
}

function formatInvoiceLocation(invoice: InvoiceEmailDraftInput) {
  return formatLocation(invoice.jobs?.service_locations);
}

function formatLocation(location?: EmailLocation | null) {
  if (!location) return "the service property";
  const address = [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
  if (location.label && address && normalize(location.label) !== normalize(location.street)) return `${location.label}, ${address}`;
  return address || location.label || "the service property";
}

function subjectLocation(value: string) {
  return value === "the service property" ? "Service Property" : value;
}

function firstNameFrom(value?: string | null) {
  const normalized = value?.trim().replaceAll(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.split(" ")[0]?.replaceAll(/[^\p{L}\p{M}'-]/gu, "") ?? "";
}

function customerVisibleNotes(notes?: QuoteDetail["notes"] | InvoiceDetail["notes"]) {
  return (notes ?? [])
    .filter((note) => note.visibility === "customer_visible")
    .map((note) => note.body?.trim())
    .filter((note): note is string => Boolean(note));
}

function formatDebrisHandling(value?: string | null, notes?: string | null) {
  const detail = notes?.trim();
  if (detail) return detail;
  if (!value || value === "not_specified") return null;
  return `Debris handling: ${value.replaceAll("_", " ")}.`;
}

function uniqueSections(values: (string | null | undefined)[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => {
      if (!value) return false;
      const key = normalize(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function generateQuoteFollowUpDraft(quote: QuoteDetail): EmailDraft {
  const customerName = quote.organizations?.name ?? quote.customers?.display_name ?? "there";

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
      `Address: ${formatLocation(job.service_locations)}`,
      `Scope: ${job.requested_scope || "No requested scope entered yet."}`,
      `Access notes: ${job.service_locations?.access_notes || "None"}`,
      `Service notes: ${job.service_locations?.service_notes || "None"}`,
      "",
      "Checklist: before photos, agreed scope, cleanup, after photos, customer notification, notes, ready for invoice.",
    ].join("\n"),
  };
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
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
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function normalize(value?: string | null) {
  return value?.trim().replaceAll(/\s+/g, " ").toLowerCase() ?? "";
}
