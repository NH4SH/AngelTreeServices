import type { QuoteDetail, QuoteStatus } from "@/lib/types/database";

export type MultiQuoteEmailItem = {
  quoteId: string;
  quoteLabel: string;
  title: string;
  propertyLabel: string;
  scopeSummary: string;
  totalLabel: string;
  validityLabel: string;
  portalUrl: string;
};

export type MultiQuoteEmailDraft = {
  subject: string;
  greeting: string;
  intro: string;
  closing: string;
  items: MultiQuoteEmailItem[];
  body: string;
};

export type MultiQuoteEmailEdits = Pick<MultiQuoteEmailDraft, "subject" | "greeting" | "intro" | "closing">;

export type MultiQuoteSelectionResult =
  | {
      ok: true;
      customerId: string | null;
      organizationId: string | null;
      partyName: string;
      recipient: string;
    }
  | { ok: false; message: string };

const openQuoteStatuses = new Set<QuoteStatus>(["draft", "sent", "change_requested"]);
const quoteIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const companyName = "Angel Tree Services";

export function normalizeMultiQuoteIds(values: string[], maximum = Number.POSITIVE_INFINITY) {
  const unique = new Set<string>();
  for (const value of values) {
    const id = value.trim();
    if (quoteIdPattern.test(id)) unique.add(id);
    if (unique.size >= maximum) break;
  }
  return [...unique];
}

export function resolveQuoteEmailRecipient(quote: QuoteDetail) {
  return (
    quote.approval_contact?.email
    ?? quote.recipient_contact?.email
    ?? quote.customers?.email
    ?? quote.organizations?.billing_email
    ?? ""
  ).trim().toLowerCase();
}

export function getMultiQuoteEmailIneligibility(quote: Pick<QuoteDetail, "archived_at" | "pricing_reviewed_at" | "quote_number" | "recurring_occurrence_id" | "status">) {
  if (quote.archived_at) return `${quote.quote_number || "This quote"} is archived and cannot be emailed.`;
  if (!openQuoteStatuses.has(quote.status)) return `${quote.quote_number || "This quote"} is closed for regular sending.`;
  if (quote.recurring_occurrence_id && !quote.pricing_reviewed_at) return `${quote.quote_number || "This quote"} needs its renewal pricing reviewed before sending.`;
  return null;
}

export function validateMultiQuoteSelection(quotes: QuoteDetail[]): MultiQuoteSelectionResult {
  if (quotes.length < 2) {
    return { ok: false, message: "Select at least two quotes to send together." };
  }

  const first = quotes[0];
  const customerId = first.customer_id;
  const organizationId = first.organization_id;
  const contractingPartyKey = customerId ? `customer:${customerId}` : organizationId ? `organization:${organizationId}` : "";

  if (!contractingPartyKey) {
    return { ok: false, message: "Each selected quote must have a contracting customer or organization." };
  }

  for (const quote of quotes) {
    const quotePartyKey = quote.customer_id
      ? `customer:${quote.customer_id}`
      : quote.organization_id
        ? `organization:${quote.organization_id}`
        : "";
    if (quotePartyKey !== contractingPartyKey) {
      return { ok: false, message: "Selected quotes must belong to the same customer or organization." };
    }
    const ineligibility = getMultiQuoteEmailIneligibility(quote);
    if (ineligibility) return { ok: false, message: ineligibility };
  }

  const recipients = new Set(quotes.map(resolveQuoteEmailRecipient).filter(Boolean));
  if (recipients.size === 0) {
    return { ok: false, message: "The selected contracting party does not have a usable email address." };
  }
  if (recipients.size !== 1) {
    return { ok: false, message: "The selected quotes resolve to different recipients. Send them separately or align the approval contact first." };
  }

  return {
    ok: true,
    customerId,
    organizationId,
    partyName: first.organizations?.name ?? first.customers?.display_name ?? "Customer",
    recipient: [...recipients][0],
  };
}

export function buildMultiQuoteEmailDraft(
  quotes: { quote: QuoteDetail; portalUrl?: string }[],
  edits?: MultiQuoteEmailEdits,
): MultiQuoteEmailDraft {
  const details = quotes.map(({ quote }) => quote);
  const validation = validateMultiQuoteSelection(details);
  if (!validation.ok) throw new Error(validation.message);

  const items = quotes.map(({ quote, portalUrl }, index) => buildItem(quote, portalUrl ?? "", index));
  const locations = new Set(items.map((item) => item.propertyLabel).filter((location) => location !== "Service property"));
  const subjectContext = locations.size === 1 ? ` – ${[...locations][0]}` : "";
  const firstName = firstNameFrom(
    details[0].approval_contact?.full_name
      ?? details[0].recipient_contact?.full_name
      ?? (!details[0].organizations ? details[0].customers?.display_name : null),
  );
  const generated = {
    subject: `${companyName} | Your Proposals${subjectContext}`,
    greeting: `Hi ${firstName || "there"},`,
    intro: "Thank you for the opportunity to provide these proposals. Each proposal below can be reviewed and approved independently.",
    closing: "If you have questions or would like to discuss the options, please reply to this email or call our office.",
  };
  const draft = {
    ...generated,
    ...edits,
    items,
    body: "",
  };
  return { ...draft, body: buildMultiQuoteEmailText(draft) };
}

export function applyMultiQuoteEmailEdits(draft: MultiQuoteEmailDraft, edits: MultiQuoteEmailEdits) {
  const updated = { ...draft, ...edits };
  return { ...updated, body: buildMultiQuoteEmailText(updated) };
}

export function buildMultiQuoteEmailText(draft: Omit<MultiQuoteEmailDraft, "body">) {
  const proposals = draft.items.flatMap((item, index) => [
    `PROPOSAL ${index + 1}`,
    item.quoteLabel,
    item.title,
    item.propertyLabel,
    item.scopeSummary,
    `Proposal total: ${item.totalLabel}`,
    item.validityLabel,
    item.portalUrl ? `Review proposal: ${item.portalUrl}` : "A secure review link will be included when sent.",
    "",
  ]);

  return [
    draft.greeting,
    "",
    draft.intro,
    "",
    ...proposals,
    draft.closing,
    "",
    "Thank you,",
    "",
    companyName,
    "(540) 388-8715",
    "info@angeltreeservice.org",
    "angeltreeservices.org",
  ].join("\n").replaceAll(/\n{3,}/g, "\n\n").trim();
}

export function renderMultiQuoteEmailHtml(draft: MultiQuoteEmailDraft, logoUrl?: string | null) {
  const logo = logoUrl
    ? `<img alt="${companyName}" src="${escapeAttribute(logoUrl)}" width="78" style="display:block;width:78px;max-width:78px;height:auto;border:0;" />`
    : `<strong style="color:#ffffff;font-size:20px;line-height:1.2;">${companyName}</strong>`;
  const proposalRows = draft.items.map((item, index) => renderProposal(item, index)).join("");

  return `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><title>${escapeHtml(draft.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f2;color:#27312b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f5f2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fbfdfb;border:1px solid #d7e3da;border-radius:8px;overflow:hidden;">
<tr><td style="padding:14px 28px;background:#174b32;">${logo}</td></tr>
<tr><td style="padding:28px 28px 20px;"><p style="margin:0 0 18px;font-size:17px;line-height:1.55;">${escapeHtml(draft.greeting)}</p><p style="margin:0;color:#303934;font-size:16px;line-height:1.65;">${formatPlainText(draft.intro)}</p></td></tr>
${proposalRows}
<tr><td style="padding:4px 28px 28px;"><p style="margin:0;color:#303934;font-size:15px;line-height:1.65;">${formatPlainText(draft.closing)}</p><p style="margin:20px 0 0;font-size:15px;line-height:1.55;">Thank you,<br /><br /><strong>${companyName}</strong></p></td></tr>
<tr><td style="padding:18px 28px;background:#edf4ef;border-top:1px solid #d7e3da;color:#536158;font-size:13px;line-height:1.65;"><a href="tel:+15403888715" style="color:#174b32;text-decoration:none;">(540) 388-8715</a><br /><a href="mailto:info@angeltreeservice.org" style="color:#174b32;text-decoration:none;">info@angeltreeservice.org</a><br /><a href="https://angeltreeservices.org/" style="color:#174b32;text-decoration:none;">angeltreeservices.org</a></td></tr>
</table></td></tr></table></body></html>`;
}

function buildItem(quote: QuoteDetail, portalUrl: string, index: number): MultiQuoteEmailItem {
  const sortedItems = [...(quote.quote_line_items ?? [])].sort((left, right) => left.sort_order - right.sort_order);
  const firstItem = sortedItems[0];
  const serviceType = quote.jobs?.service_type?.replaceAll("_", " ");
  const scopeParts = sortedItems.map((item) => item.name.trim()).filter(Boolean);
  const description = firstItem?.description?.trim().replaceAll(/\s+/g, " ") ?? "";
  const scopeSummary = scopeParts.length > 1
    ? `${scopeParts.slice(0, 3).join("; ")}${scopeParts.length > 3 ? `; plus ${scopeParts.length - 3} more item(s)` : ""}`
    : description || scopeParts[0] || quote.jobs?.requested_scope?.trim() || "See the secure proposal for the complete scope.";

  return {
    quoteId: quote.id,
    quoteLabel: quote.quote_number ? `Quote ${quote.quote_number}` : `Proposal ${index + 1}`,
    title: firstItem?.name?.trim() || titleCase(serviceType) || "Tree service proposal",
    propertyLabel: formatQuoteAddress(quote.service_locations ?? quote.jobs?.service_locations) || "Service property",
    scopeSummary,
    totalLabel: formatMoney(quote.total_cents),
    validityLabel: quote.expires_at ? `Valid through ${formatDate(quote.expires_at)}` : "See proposal for validity terms",
    portalUrl,
  };
}

function renderProposal(item: MultiQuoteEmailItem, index: number) {
  const action = item.portalUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 8px;"><tr><td bgcolor="#174b32" style="border-radius:6px;"><a href="${escapeAttribute(item.portalUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;line-height:1.2;font-weight:700;">Review proposal</a></td></tr></table><p style="margin:0;color:#667169;font-size:11px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word;">Secure link: <a href="${escapeAttribute(item.portalUrl)}" style="color:#496356;text-decoration:underline;">${escapeHtml(item.portalUrl)}</a></p>`
    : "";
  return `<tr><td style="padding:0 28px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:3px solid #3f7a58;border-bottom:1px solid #d7e3da;background:#ffffff;"><tr><td style="padding:18px 0;"><p style="margin:0 0 5px;color:#667169;font-size:12px;font-weight:800;text-transform:uppercase;">Proposal ${index + 1}</p><h2 style="margin:0;color:#174b32;font-size:20px;line-height:1.3;">${escapeHtml(item.title)}</h2><p style="margin:5px 0 0;color:#4f5d54;font-size:13px;line-height:1.5;">${escapeHtml(item.quoteLabel)} · ${escapeHtml(item.propertyLabel)}</p><p style="margin:15px 0 0;color:#303934;font-size:15px;line-height:1.6;">${escapeHtml(item.scopeSummary)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;border-collapse:collapse;"><tr><td style="color:#5c675f;font-size:13px;">Proposal total<br /><span style="font-size:12px;">${escapeHtml(item.validityLabel)}</span></td><td align="right" style="color:#174b32;font-size:20px;font-weight:800;">${escapeHtml(item.totalLabel)}</td></tr></table>${action}</td></tr></table></td></tr>`;
}

function firstNameFrom(value?: string | null) {
  const normalized = value?.trim().replaceAll(/\s+/g, " ");
  return normalized?.split(" ")[0]?.replaceAll(/[^\p{L}\p{M}'-]/gu, "") ?? "";
}

function titleCase(value?: string | null) {
  return value?.replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "";
}

function formatQuoteAddress(location?: {
  city?: string | null;
  postal_code?: string | null;
  state?: string | null;
  street?: string | null;
} | null) {
  if (!location) return "";
  const locality = [location.city?.trim(), location.state?.trim()].filter(Boolean).join(", ");
  const localityWithPostal = [locality, location.postal_code?.trim()].filter(Boolean).join(" ");
  return [location.street?.trim(), localityWithPostal].filter(Boolean).join(", ");
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(value));
}

function formatPlainText(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
