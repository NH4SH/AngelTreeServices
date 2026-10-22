"use server";

import { readVerifiedDocumentToken } from "@/lib/portal/document-token";
import { revalidatePath } from "next/cache";
import { hasAllowedRole, platformRoleGroups, getUserRoles } from "@/lib/auth/roles";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getQuoteDetail } from "@/lib/data/quotes";
import type { CustomerDocumentEmailEdits } from "@/lib/documents/email-drafts";
import { invoiceEmailTemplate, quoteEmailTemplate } from "@/lib/email/templates";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import {
  createOrGetInvoicePortalTokenRecord,
} from "@/lib/portal/invoice-links";
import {
  hashPortalToken,
} from "@/lib/portal/tokens";
import { createOrGetQuotePortalTokenRecord } from "@/lib/portal/quote-links";
import { getPortalUrl } from "@/lib/portal/urls";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import {
  buildMultiQuoteEmailDraft,
  normalizeMultiQuoteIds,
  renderMultiQuoteEmailHtml,
  validateMultiQuoteSelection,
  type MultiQuoteEmailEdits,
} from "@/lib/quotes/multi-email";

export type TransactionalEmailActionState = {
  status: "idle" | "success" | "error" | "warning";
  deliveryState?: "accepted" | "unknown" | "not_sent";
  message: string;
  deliveryId?: string;
};

export async function sendMultiQuoteEmail(
  _previousState: TransactionalEmailActionState,
  formData: FormData,
): Promise<TransactionalEmailActionState> {
  const quoteIds = normalizeMultiQuoteIds(formData.getAll("quote_id").map(String));
  if (quoteIds.length < 2) return { status: "error", message: "Select at least two quotes to send together." };

  const auth = await requireInternalEmailSender();
  if (auth.error) return auth.error;

  const requestKey = emailRequestKey(formData, auth.userId, `multi-quote/${quoteIds[0]}`);
  if (!requestKey) return { status: "error", message: "Reload the email composer before sending." };
  const loaded = await Promise.all(quoteIds.map((quoteId) => getQuoteDetail(quoteId)));
  const failedLoad = loaded.find((detail) => detail.error || !detail.data);
  if (failedLoad) return { status: "error", message: failedLoad.error ?? "One or more selected quotes could not be loaded." };

  const quotes = loaded.flatMap((detail) => detail.data ? [detail.data] : []);
  const validation = validateMultiQuoteSelection(quotes);
  if (!validation.ok) return { status: "error", message: validation.message };

  const cc = readCcRecipients(formData, validation.recipient);
  if (cc.error) return { status: "error", message: cc.error };

  const submittedDraft = readMultiQuoteEmailEdits(formData);
  if (submittedDraft.error) return { status: "error", message: submittedDraft.error };

  // Keep generated links available for retry. Another reviewed email may already
  // have reused one; failed preparation must never revoke that customer access.
  const deliveryTokens: {kind:string;id:string}[] = [];
  const linkedQuotes: { quote: (typeof quotes)[number]; portalUrl: string }[] = [];
  for (const quote of quotes) {
    const token = await createOrGetQuotePortalTokenRecord({ quoteId: quote.id, supabase: auth.supabase });
    if (token.error) {
      return { status: "error", message: token.error };
    }
    deliveryTokens.push({kind:"quote",id:token.tokenId});
    try {
      linkedQuotes.push({ quote, portalUrl: await getPortalUrl("quote", token.rawToken) });
    } catch {
      return { status: "error", message: "The secure customer link could not be built. Verify APP_BASE_URL before sending." };
    }
  }

  const template = buildMultiQuoteEmailDraft(linkedQuotes, submittedDraft.edits);
  const result = await sendTransactionalEmail({
    deliveryQuoteIds: quoteIds,
    expectedSourceVersions: Object.fromEntries(quotes.map((quote) => [`quote:${quote.id}`,quote.edit_revision])),
    deliveryPortalTokens: deliveryTokens,
    to: validation.recipient,
    cc: cc.recipients,
    subject: template.subject,
    text: template.body,
    html: renderMultiQuoteEmailHtml(template, buildCanonicalAppUrl("/angel-tree-services-logo.jpg")),
    emailType: "quote",
    relatedCustomerId: validation.customerId,
    relatedQuoteId: quoteIds[0],
    relatedOrganizationId: validation.organizationId,
    sentByUserId: auth.userId,
    supabase: auth.supabase,
    idempotencyKey: requestKey,
    confirmedAdditionalCopy: formData.get("email_additional_copy") === "1",
    additionalCopyRequestId: String(formData.get("email_copy_request_id") ?? ""),
  });

  quoteIds.forEach((id) => revalidatePath(`/admin/quotes/${id}`));
  revalidatePath("/admin/communications");
  return deliveryActionResult(result);
}

export async function sendQuoteEmail(
  _previousState: TransactionalEmailActionState,
  formData: FormData,
): Promise<TransactionalEmailActionState> {
  const quoteId = String(formData.get("quote_id") ?? "").trim();

  if (!quoteId) {
    return { status: "error", message: "Choose a quote before sending." };
  }

  const auth = await requireInternalEmailSender();

  if (auth.error) {
    return auth.error;
  }

  const requestKey = emailRequestKey(formData, auth.userId, `quote/${quoteId}`);
  if (!requestKey) return { status: "error", message: "Reload the email composer before sending." };
  const detail = await getQuoteDetail(quoteId);

  if (detail.error || !detail.data) {
    return { status: "error", message: detail.error ?? "Quote not found." };
  }

  const recipient = detail.data.approval_contact?.email ?? detail.data.recipient_contact?.email ?? detail.data.customers?.email ?? detail.data.organizations?.billing_email;

  if (!recipient) {
    return { status: "error", message: "The selected quote recipient does not have an email address." };
  }

  const cc = readCcRecipients(formData, recipient);
  if (cc.error) {
    return { status: "error", message: cc.error };
  }

  if (detail.data.recurring_occurrence_id && !detail.data.pricing_reviewed_at) {
    return { status: "error", message: "Review and save renewal pricing before sending this quote. Prior-year pricing is never sent automatically." };
  }

  if (["approved", "declined", "expired", "cancelled"].includes(detail.data.status)) {
    return { status: "error", message: "This quote is no longer open for sending." };
  }

  const submittedDraft = readCustomerDocumentEmailEdits(formData);
  if (submittedDraft.error) {
    return { status: "error", message: submittedDraft.error };
  }

  const portalLink = await getQuotePortalLinkForEmail(auth, detail.data.id, formData);

  if (portalLink.error) {
    return { status: "error", message: portalLink.error };
  }

  const template = quoteEmailTemplate(detail.data, {
    edits: submittedDraft.edits,
    portalUrl: portalLink.url,
  });
  const result = await sendTransactionalEmail({
    expectedSourceVersions: { [`quote:${detail.data.id}`]: detail.data.edit_revision },
    deliveryPortalTokens: portalLink.tokenId ? [{kind:"quote",id:portalLink.tokenId}] : [],
    to: recipient,
    cc: cc.recipients,
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: "quote",
    relatedCustomerId: detail.data.customer_id,
    relatedJobId: detail.data.job_id ?? null,
    relatedQuoteId: detail.data.id,
    relatedOrganizationId: detail.data.organization_id,
    sentByUserId: auth.userId,
    supabase: auth.supabase,
    idempotencyKey: requestKey,
    confirmedAdditionalCopy: formData.get("email_additional_copy") === "1",
    additionalCopyRequestId: String(formData.get("email_copy_request_id") ?? ""),
  });

  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/communications");
  return deliveryActionResult(result);
}

export async function sendInvoiceEmail(
  _previousState: TransactionalEmailActionState,
  formData: FormData,
): Promise<TransactionalEmailActionState> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();

  if (!invoiceId) {
    return { status: "error", message: "Choose an invoice before sending." };
  }

  const auth = await requireInternalEmailSender();

  if (auth.error) {
    return auth.error;
  }

  const requestKey = emailRequestKey(formData, auth.userId, `invoice/${invoiceId}`);
  if (!requestKey) return { status: "error", message: "Reload the email composer before sending." };
  const detail = await getInvoiceDetail(invoiceId);

  if (detail.error || !detail.data) {
    return { status: "error", message: detail.error ?? "Invoice not found." };
  }

  const recipient = detail.data.accounts_payable_contact?.email
    ?? detail.data.billing_contact?.email
    ?? detail.data.customers?.email
    ?? detail.data.organizations?.billing_email;

  if (!recipient) {
    return { status: "error", message: "The contracting party does not have a billing email address." };
  }

  const cc = readCcRecipients(formData, recipient);
  if (cc.error) {
    return { status: "error", message: cc.error };
  }

  if (detail.data.status === "void") {
    return { status: "error", message: "Void invoices cannot be sent." };
  }

  const submittedDraft = readCustomerDocumentEmailEdits(formData);
  if (submittedDraft.error) {
    return { status: "error", message: submittedDraft.error };
  }

  const portalLink = await getInvoicePortalLinkForEmail(auth, detail.data.id, formData);

  if (portalLink.error) {
    return { status: "error", message: portalLink.error };
  }

  const template = invoiceEmailTemplate(detail.data, {
    edits: submittedDraft.edits,
    portalUrl: portalLink.url,
  });
  const result = await sendTransactionalEmail({
    expectedSourceVersions: { [`invoice:${detail.data.id}`]: detail.data.updated_at },
    deliveryPortalTokens: portalLink.tokenId ? [{kind:"invoice",id:portalLink.tokenId}] : [],
    to: recipient,
    cc: cc.recipients,
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: "invoice",
    relatedCustomerId: detail.data.customer_id,
    relatedJobId: detail.data.job_id,
    relatedQuoteId: detail.data.quote_id,
    relatedInvoiceId: detail.data.id,
    relatedOrganizationId: detail.data.organization_id,
    sentByUserId: auth.userId,
    supabase: auth.supabase,
    idempotencyKey: requestKey,
    confirmedAdditionalCopy: formData.get("email_additional_copy") === "1",
    additionalCopyRequestId: String(formData.get("email_copy_request_id") ?? ""),
  });

  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath("/admin/communications");
  return deliveryActionResult(result);
}

async function requireInternalEmailSender() {
  const supabase = await createClient();

  if (!supabase) {
    return { error: { status: "error" as const, message: "Supabase is not configured." } };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: { status: "error" as const, message: "Sign in before sending email." } };
  }

  const roles = await getUserRoles(supabase, user.id);

  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { error: { status: "error" as const, message: "Only internal staff can send customer emails." } };
  }

  return { supabase, userId: user.id };
}

async function getQuotePortalLinkForEmail(
  auth: { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; userId: string },
  quoteId: string,
  formData: FormData,
) {
  const submittedPortalUrl = String(formData.get("portal_url") ?? "").trim();

  if (submittedPortalUrl) {
    return validateSubmittedPortalUrl(auth.supabase, "quote", quoteId, submittedPortalUrl);
  }

  const token = await createOrGetQuotePortalTokenRecord({ quoteId, supabase: auth.supabase });
  if (token.error) {
    return { created: false, error: token.error, tokenId: null, url: "" };
  }

  return {
    created: token.created,
    error: null,
    tokenId: token.tokenId,
    url: await getPortalUrl("quote", token.rawToken),
  };
}

async function getInvoicePortalLinkForEmail(
  auth: { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; userId: string },
  invoiceId: string,
  formData: FormData,
) {
  const submittedPortalUrl = String(formData.get("portal_url") ?? "").trim();

  if (submittedPortalUrl) {
    return validateSubmittedPortalUrl(auth.supabase, "invoice", invoiceId, submittedPortalUrl);
  }

  const token = await createOrGetInvoicePortalTokenRecord({
    invoiceId,
    supabase: auth.supabase,
  });

  if (token.error) {
    return { created: false, error: token.error, tokenId: null, url: "" };
  }

  return {
    created: token.created,
    error: null,
    tokenId: token.tokenId,
    url: await getPortalUrl("invoice", token.rawToken),
  };
}

async function validateSubmittedPortalUrl(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  portalType: "quote" | "invoice",
  recordId: string,
  submittedPortalUrl: string,
) {
  const rawToken = extractPortalToken(submittedPortalUrl, portalType);
  const tokenHash = hashPortalToken(rawToken);

  if (!rawToken || !tokenHash) {
    return { created: false, error: "The submitted customer link is not a valid secure portal link.", tokenId: null, url: "" };
  }

  const table = portalType === "quote" ? "quote_portal_tokens" : "invoice_portal_tokens";
  const recordColumn = portalType === "quote" ? "quote_id" : "invoice_id";
  const { data, error } = await supabase
    .from(table)
    .select("id, expires_at, revoked_at")
    .eq(recordColumn, recordId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return { created: false, error: safeStaffMessage(error.message), tokenId: null, url: "" };
  }

  if (!data) return { created: false, error: "The submitted customer link is not active for this record.", tokenId: null, url: "" };
  const verified = await readVerifiedDocumentToken({ supabase, kind: portalType, recordId, tokenId: data.id, rawToken });
  if (verified.error || !verified.rawToken) return { created: false, error: verified.error ?? "Review the current customer links.", tokenId: null, url: "" };
  return { created: false, error: null, tokenId: verified.tokenId, url: await getPortalUrl(portalType, verified.rawToken) };
}

function extractPortalToken(value: string, portalType: "quote" | "invoice") {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmed);
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    const portalIndex = parts.findIndex((part) => part === "portal");

    if (portalIndex >= 0 && parts[portalIndex + 1] === portalType && parts[portalIndex + 2]) {
      return decodeURIComponent(parts[portalIndex + 2]);
    }
  } catch {
    // Treat non-URL input as a raw token.
  }

  return trimmed;
}

function readCustomerDocumentEmailEdits(
  formData: FormData,
): { edits?: CustomerDocumentEmailEdits; error?: string } {
  const fields = {
    subject: "email_subject",
    greeting: "email_greeting",
    intro: "email_intro",
    scopeText: "email_scope",
    customerNotes: "email_customer_notes",
    closing: "email_closing",
  } as const;
  const submitted = Object.values(fields).some((field) => formData.has(field));
  if (!submitted) return {};

  const limits: Record<keyof CustomerDocumentEmailEdits, number> = {
    subject: 180,
    greeting: 160,
    intro: 1_200,
    scopeText: 12_000,
    customerNotes: 6_000,
    closing: 1_200,
  };
  const edits = {} as CustomerDocumentEmailEdits;

  for (const [key, field] of Object.entries(fields) as [keyof CustomerDocumentEmailEdits, string][]) {
    const value = normalizeDraftText(String(formData.get(field) ?? ""));
    if (value.length > limits[key]) {
      return { error: `${draftFieldLabel(key)} is too long. Shorten it and try again.` };
    }
    if (key !== "customerNotes" && !value) {
      return { error: `${draftFieldLabel(key)} is required.` };
    }
    edits[key] = value;
  }

  if (/[\r\n]/.test(edits.subject)) {
    return { error: "Email subject must stay on one line." };
  }

  return { edits };
}

function readMultiQuoteEmailEdits(
  formData: FormData,
): { edits?: MultiQuoteEmailEdits; error?: string } {
  const fields = {
    subject: "email_subject",
    greeting: "email_greeting",
    intro: "email_intro",
    closing: "email_closing",
  } as const;
  const limits: Record<keyof MultiQuoteEmailEdits, number> = {
    subject: 180,
    greeting: 160,
    intro: 1_200,
    closing: 1_200,
  };
  const edits = {} as MultiQuoteEmailEdits;

  for (const [key, field] of Object.entries(fields) as [keyof MultiQuoteEmailEdits, string][]) {
    const value = normalizeDraftText(String(formData.get(field) ?? ""));
    if (!value) return { error: `${multiQuoteDraftFieldLabel(key)} is required.` };
    if (value.length > limits[key]) return { error: `${multiQuoteDraftFieldLabel(key)} is too long. Shorten it and try again.` };
    edits[key] = value;
  }
  if (/[\r\n]/.test(edits.subject)) return { error: "Email subject must stay on one line." };
  return { edits };
}

function readCcRecipients(formData: FormData, primaryRecipient: string): { recipients: string[]; error?: string } {
  const raw = String(formData.get("email_cc") ?? "").trim();
  if (!raw) return { recipients: [] };
  if (raw.length > 2_000 || /[\r\n]/.test(raw)) {
    return { recipients: [], error: "CC must contain plain email addresses on one line." };
  }

  const candidates = raw.split(/[;,]/).map((value) => value.trim()).filter(Boolean);
  if (candidates.length > 10) {
    return { recipients: [], error: "Add no more than 10 CC recipients." };
  }

  const primary = primaryRecipient.trim().toLowerCase();
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { recipients: [], error: `CC address “${candidate}” is invalid.` };
    }
    if (normalized === primary || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }
  return { recipients };
}

function multiQuoteDraftFieldLabel(field: keyof MultiQuoteEmailEdits) {
  return { subject: "Email subject", greeting: "Greeting", intro: "Introduction", closing: "Closing" }[field];
}

function normalizeDraftText(value: string) {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function draftFieldLabel(field: keyof CustomerDocumentEmailEdits) {
  return {
    subject: "Email subject",
    greeting: "Greeting",
    intro: "Introduction",
    scopeText: "Scope",
    customerNotes: "Customer-facing notes",
    closing: "Closing",
  }[field];
}

function emailRequestKey(form: FormData, userId: string, source: string) {
  const value = String(form.get("email_attempt_id") ?? "").trim();
  if(!/^[A-Za-z0-9_-]{16,90}$/.test(value))return null;
  const key=`manual-email/${userId}/${source}/${value}`;
  if(form.get("email_additional_copy")!=="1")return key;
  const copy=String(form.get("email_copy_request_id")??"");
  return /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(copy)?`${key}/copy/${copy}`:null;
}

function deliveryActionResult(result: Awaited<ReturnType<typeof sendTransactionalEmail>>): TransactionalEmailActionState {
  return {status:result.ok?(result.sourceReconciled?"success":"warning"):["unknown","accepted"].includes(result.outcome)?"warning":"error",
    deliveryState:result.outcome==="accepted"?"accepted":result.outcome==="unknown"?"unknown":"not_sent",message:result.message,deliveryId:result.deliveryId};
}
