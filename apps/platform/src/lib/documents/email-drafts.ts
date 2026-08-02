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

export type ScopePresentationBlock = {
  kind: "heading" | "item" | "price" | "quantity" | "text";
  text: string;
};

const companyName = "Angel Tree Services";
type EmailLocation = {
  label?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

const internalAddressPlaceholders = new Set([
  "needs confirmation",
  "unknown",
  "n/a",
  "not provided",
]);

type CustomerFacingAddressParts = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
};

export function formatCustomerFacingAddress(location?: EmailLocation | null) {
  const parts = customerFacingAddressParts(location);
  const locality = formatCustomerFacingLocality(parts);

  if (parts.street && locality && !endsWithComponent(parts.street, parts.city)) {
    return `${parts.street}, ${locality}`;
  }

  if (parts.street) {
    const stateAndPostalCode = formatStateAndPostalCode(parts.state, parts.postalCode);
    return [parts.street, stateAndPostalCode].filter(Boolean).join(", ");
  }

  return parts.city ? locality : "";
}

export function formatCustomerFacingLocationPhrase(location?: EmailLocation | null) {
  const parts = customerFacingAddressParts(location);
  const locality = formatCustomerFacingLocality(parts);

  if (parts.street && locality && !endsWithComponent(parts.street, parts.city)) {
    return ` at ${parts.street} in ${locality}`;
  }

  if (parts.street) {
    const stateAndPostalCode = formatStateAndPostalCode(parts.state, parts.postalCode);
    return ` at ${[parts.street, stateAndPostalCode].filter(Boolean).join(", ")}`;
  }

  return parts.city ? ` in ${locality}` : "";
}

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
  const workDescription = describeQuoteWork(quote);
  const firstName = firstNameFrom(
    quote.approval_contact?.full_name
      ?? quote.recipient_contact?.full_name
      ?? (!quote.organizations ? quote.customers?.display_name : null),
  );
  const revised = quote.status === "change_requested";
  const draft: CustomerDocumentEmailDraft = {
    documentType: "quote",
    subject: `${companyName} Proposal – ${quoteSubjectLocation(quote)}`,
    greeting: `Hi ${firstName || "there"},`,
    intro: buildQuoteIntroduction(quote, workDescription, revised),
    propertyLabel,
    scopeHeading: "The proposed work includes",
    scopeText: formatLineItemScope(quote.quote_line_items, quote.jobs?.requested_scope, {
      proposalPricing: true,
    }),
    customerNotes: uniqueSections([
      quote.customer_message,
      formatDebrisHandling(quote.debris_handling, quote.debris_handling_notes),
      formatQuotePaymentTerms(quote.payment_terms),
      ...customerVisibleNotes(quote.notes),
    ]).join("\n\n"),
    closing: "Please reply to this email or call our office if you have any questions or would like to request a change.",
    summaryLabel: "Proposal total",
    summaryValue: formatCustomerCurrency(quote.total_cents),
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
    "",
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
  options: { proposalPricing?: boolean } = {},
) {
  if (!lineItems?.length) {
    return formatScopePresentation(fallbackScope?.trim())
      || "See the attached document or secure customer page for the complete scope.";
  }

  return formatScopePresentation(lineItems
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item, index) => {
      const lines = [
        `${index + 1}. ${item.name.trim()}`,
        item.description?.trim(),
        options.proposalPricing && item.quantity !== 1
          ? `Quantity: ${formatQuantity(item.quantity)} × ${formatCustomerCurrency(item.unit_price_cents)} each`
          : null,
        options.proposalPricing
          ? `Price: ${formatCustomerCurrency(item.total_cents)}`
          : `${formatQuantity(item.quantity)} × ${formatCurrency(item.unit_price_cents)} = ${formatCurrency(item.total_cents)}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n"));
}

function formatQuoteLocation(quote: QuoteEmailDraftInput) {
  return formatCustomerFacingAddress(quote.service_locations ?? quote.jobs?.service_locations)
    || "the service property";
}

function formatInvoiceLocation(invoice: InvoiceEmailDraftInput) {
  return formatCustomerFacingAddress(invoice.jobs?.service_locations)
    || "the service property";
}

function formatOperationalLocation(location?: EmailLocation | null) {
  if (!location) return "the service property";
  const stateAndPostalCode = formatStateAndPostalCode(location.state, location.postal_code);
  return [location.street, location.city, stateAndPostalCode].filter(Boolean).join(", ")
    || location.label
    || "the service property";
}

function subjectLocation(value: string) {
  return value === "the service property" ? "Service Property" : value;
}

function quoteSubjectLocation(quote: QuoteEmailDraftInput) {
  const location = quote.service_locations ?? quote.jobs?.service_locations;
  const parts = customerFacingAddressParts(location);
  return subjectLocation(parts.street || formatCustomerFacingLocality(parts) || formatQuoteLocation(quote));
}

function buildQuoteIntroduction(
  quote: QuoteEmailDraftInput,
  workDescription: string,
  revised: boolean,
) {
  const location = quote.service_locations ?? quote.jobs?.service_locations;
  const locationPhrase = formatCustomerFacingLocationPhrase(location);
  return `Thank you for the opportunity to provide this ${revised ? "updated " : ""}proposal for ${workDescription}${locationPhrase}.`;
}

function describeQuoteWork(quote: QuoteEmailDraftInput) {
  const scopeText = [
    quote.jobs?.requested_scope,
    ...(quote.quote_line_items ?? []).flatMap((item) => [item.name, item.description]),
  ].filter(Boolean).join(" ").toLowerCase();
  const hasTreeWork = /\b(tree|trees|branch|branches|limb|limbs|stump|stumps|oak|maple|cypress|myrtle|holly|prun\w*|trim\w*)\b/.test(scopeText);
  const hasLandscaping = /\b(landscap\w*|lawn|grass|flower|flowers|planting|beds?|bush|bushes|rose|roses|shrub|shrubs)\b/.test(scopeText);
  const hasStormDamage = /\bstorm(?:[- ]damage| cleanup)?\b/.test(scopeText);
  const hasCleanup = /\b(cleanup|clean up|debris)\b/.test(scopeText);

  if (hasTreeWork && hasLandscaping) return "the landscaping and tree work";

  switch (quote.jobs?.service_type) {
    case "tree_removal":
      return "the tree removal work";
    case "trimming":
      return "the tree trimming work";
    case "stump_grinding":
      return "the stump grinding work";
    case "landscaping":
      return "the landscaping work";
    case "lawn_care":
      return "the lawn care work";
    case "emergency":
      return hasStormDamage ? "the storm-damage tree work" : "the emergency tree work";
    default:
      if (hasStormDamage && hasTreeWork) return "the storm-damage tree work";
      if (hasCleanup && hasTreeWork) return "the cleanup and tree work";
      if (hasTreeWork) return "the tree work";
      if (hasLandscaping) return "the landscaping work";
      return "the proposed work";
  }
}

function formatStateAndPostalCode(state?: string | null, postalCode?: string | null) {
  return [state?.trim(), postalCode?.trim()].filter(Boolean).join(" ");
}

function customerFacingAddressParts(location?: EmailLocation | null): CustomerFacingAddressParts {
  let street = cleanCustomerFacingAddressValue(location?.street);
  let city = cleanCustomerFacingAddressValue(location?.city);
  const state = cleanCustomerFacingAddressValue(location?.state);
  const postalCode = cleanCustomerFacingAddressValue(location?.postal_code);

  if (street && !city && isInternalAddressPlaceholder(location?.city)) {
    const recovered = recoverLocalityFromCombinedStreet(street);
    street = recovered.street;
    city = recovered.city;
  }

  return {
    street,
    city: sameComponent(street, city) ? "" : city,
    state: sameComponent(city, state) ? "" : state,
    postalCode,
  };
}

function cleanCustomerFacingAddressValue(value?: string | null) {
  const cleaned = value?.trim().replaceAll(/\s+/g, " ") ?? "";
  return isInternalAddressPlaceholder(cleaned) ? "" : cleaned;
}

function isInternalAddressPlaceholder(value?: string | null) {
  const normalized = value?.trim().replaceAll(/\s+/g, " ").replace(/[.!]+$/, "").toLowerCase();
  return normalized ? internalAddressPlaceholders.has(normalized) : false;
}

function formatCustomerFacingLocality(parts: CustomerFacingAddressParts) {
  if (!parts.city) return "";
  const stateAndPostalCode = formatStateAndPostalCode(parts.state, parts.postalCode);
  return [parts.city, stateAndPostalCode].filter(Boolean).join(", ");
}

function sameComponent(left: string, right: string) {
  return Boolean(left && right && normalizeAddressComponent(left) === normalizeAddressComponent(right));
}

function endsWithComponent(value: string, component: string) {
  if (!component) return false;
  return normalizeAddressComponent(value).endsWith(normalizeAddressComponent(component));
}

function normalizeAddressComponent(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

function recoverLocalityFromCombinedStreet(value: string) {
  const match = value.match(
    /^(.+?\b(?:avenue|ave|boulevard|blvd|circle|cir|court|ct|drive|dr|highway|hwy|lane|ln|parkway|pkwy|place|pl|road|rd|street|st|trail|trl|way))\s+([a-z][a-z .'-]{1,80})$/i,
  );
  if (!match) return { street: value, city: "" };

  const city = match[2]?.trim() ?? "";
  if (/^(?:apartment|apt|lot|suite|unit)\b/i.test(city)) {
    return { street: value, city: "" };
  }

  return { street: match[1]?.trim() ?? value, city };
}

function formatQuotePaymentTerms(value?: string | null) {
  const terms = value?.trim();
  if (!terms) return null;
  if (/^net\s*\d+\s*(?:days?)?\.?$/i.test(terms)) return null;
  if (/^(?:payment in full is )?due (?:in|within) \d+ days?(?: of the invoice date)?\.?$/i.test(terms)) return null;
  return `Payment terms: ${terms}`;
}

const scopeHeadingLabels = new Map([
  ["front of the house", "Front of the house"],
  ["front of house", "Front of the house"],
  ["beside right", "Right side of the house"],
  ["right side", "Right side of the house"],
  ["right side of the house", "Right side of the house"],
  ["beside left", "Left side of the house"],
  ["left side", "Left side of the house"],
  ["left side of the house", "Left side of the house"],
  ["back property", "Back of the property"],
  ["back of the property", "Back of the property"],
  ["close to the shed", "Near the shed"],
  ["near the shed", "Near the shed"],
]);

export function parseScopePresentation(value: string): ScopePresentationBlock[] {
  const blocks: ScopePresentationBlock[] = [];
  let textLines: string[] = [];
  const usesProposalPricing = value.split(/\r?\n/).some((line) => /^Price:\s*\S/i.test(line.trim()));

  function flushText() {
    const text = textLines.join("\n").trim();
    if (text) blocks.push({ kind: "text", text });
    textLines = [];
  }

  for (const line of value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")) {
    const item = usesProposalPricing ? line.trim().match(/^\d+\.\s+(.+)$/) : null;
    const price = usesProposalPricing ? line.trim().match(/^Price:\s*(.+)$/i) : null;
    const quantity = usesProposalPricing ? line.trim().match(/^Quantity:\s*(.+)$/i) : null;
    const heading = scopeHeadingLabel(line);
    if (item) {
      flushText();
      blocks.push({ kind: "item", text: item[1] });
    } else if (price) {
      flushText();
      blocks.push({ kind: "price", text: price[1] });
    } else if (quantity) {
      flushText();
      blocks.push({ kind: "quantity", text: quantity[1] });
    } else if (heading) {
      flushText();
      blocks.push({ kind: "heading", text: heading });
    } else if (!line.trim()) {
      flushText();
    } else {
      textLines.push(line);
    }
  }
  flushText();
  return blocks;
}

function formatScopePresentation(value?: string | null) {
  if (!value) return "";
  let itemNumber = 0;
  return parseScopePresentation(value)
    .map((block) => {
      if (block.kind === "item") return `${++itemNumber}. ${block.text}`;
      if (block.kind === "price") return `Price: ${block.text}`;
      if (block.kind === "quantity") return `Quantity: ${block.text}`;
      return block.text;
    })
    .join("\n\n");
}

function scopeHeadingLabel(value: string) {
  const candidate = normalize(value.replaceAll(/[.:]+$/g, ""));
  return scopeHeadingLabels.get(candidate) ?? null;
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
      `Address: ${formatOperationalLocation(job.service_locations)}`,
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

function formatCustomerCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
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
