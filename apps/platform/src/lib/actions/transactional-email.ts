"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
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
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { syncAutomatedCommunications } from "@/lib/communications/queue";
import { safeStaffMessage } from "@/lib/security/errors";
import { reconcileInvoiceBalance } from "@/lib/payments/reconciliation";
import {
  buildMultiQuoteEmailDraft,
  normalizeMultiQuoteIds,
  renderMultiQuoteEmailHtml,
  validateMultiQuoteSelection,
  type MultiQuoteEmailEdits,
} from "@/lib/quotes/multi-email";

export type TransactionalEmailActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function sendMultiQuoteEmail(
  _previousState: TransactionalEmailActionState,
  formData: FormData,
): Promise<TransactionalEmailActionState> {
  const quoteIds = normalizeMultiQuoteIds(formData.getAll("quote_id").map(String));
  if (quoteIds.length < 2) return { status: "error", message: "Select at least two quotes to send together." };

  const auth = await requireInternalEmailSender();
  if (auth.error) return auth.error;

  const loaded = await Promise.all(quoteIds.map((quoteId) => getQuoteDetail(quoteId)));
  const failedLoad = loaded.find((detail) => detail.error || !detail.data);
  if (failedLoad) return { status: "error", message: failedLoad.error ?? "One or more selected quotes could not be loaded." };

  const quotes = loaded.flatMap((detail) => detail.data ? [detail.data] : []);
  const validation = validateMultiQuoteSelection(quotes);
  if (!validation.ok) return { status: "error", message: validation.message };

  const submittedDraft = readMultiQuoteEmailEdits(formData);
  if (submittedDraft.error) return { status: "error", message: submittedDraft.error };

  const createdTokenIds: string[] = [];
  const linkedQuotes: { quote: (typeof quotes)[number]; portalUrl: string }[] = [];
  for (const quote of quotes) {
    const token = await createOrGetQuotePortalTokenRecord({ quoteId: quote.id, supabase: auth.supabase });
    if (token.error) {
      await revokeNewQuoteTokens(auth.supabase, createdTokenIds);
      return { status: "error", message: token.error };
    }
    if (token.created) createdTokenIds.push(token.tokenId);
    try {
      linkedQuotes.push({ quote, portalUrl: await getPortalUrl("quote", token.rawToken) });
    } catch {
      await revokeNewQuoteTokens(auth.supabase, createdTokenIds);
      return { status: "error", message: "The secure customer link could not be built. Verify APP_BASE_URL before sending." };
    }
  }

  const template = buildMultiQuoteEmailDraft(linkedQuotes, submittedDraft.edits);
  const result = await sendTransactionalEmail({
    to: validation.recipient,
    subject: template.subject,
    text: template.body,
    html: renderMultiQuoteEmailHtml(template, buildCanonicalAppUrl("/angel-tree-services-logo.jpg")),
    emailType: "quote",
    relatedCustomerId: validation.customerId,
    relatedQuoteId: quoteIds[0],
    relatedOrganizationId: validation.organizationId,
    sentByUserId: auth.userId,
    supabase: auth.supabase,
    idempotencyKey: normalizeDraftText(String(formData.get("email_attempt_id") ?? "")) || undefined,
  });

  if (!result.ok) {
    await revokeNewQuoteTokens(auth.supabase, createdTokenIds);
    return { status: "error", message: result.message };
  }

  const sentAt = new Date().toISOString();
  const { data: updatedQuotes, error: statusError } = await auth.supabase
    .from("quotes")
    .update({ status: "sent", sent_at: sentAt, sent_method: "crm_email", sent_by_user_id: auth.userId })
    .in("id", quoteIds)
    .select("id");

  if (statusError || (updatedQuotes?.length ?? 0) !== quoteIds.length) {
    return {
      status: "error",
      message: `Proposal email sent, but not every quote status could be updated. Contact an administrator before sending again${statusError ? `: ${safeStaffMessage(statusError.message)}` : "."}`,
    };
  }

  await Promise.all(quotes.map(async (quote) => {
    await recordActivity(auth.supabase, {
      actorUserId: auth.userId,
      eventType: "quote_sent",
      metadata: {
        delivery_method: "crm_email",
        provider_message_id: result.providerMessageId,
        subject: template.subject,
        template_type: "branded_multi_quote",
        quote_count: quotes.length,
        primary_quote_id: quoteIds[0],
      },
      subjectId: quote.id,
      subjectType: "quote",
    });
    if (quote.recurring_occurrence_id) {
      await auth.supabase.from("recurring_service_occurrences").update({ status: "quote_sent" }).eq("id", quote.recurring_occurrence_id);
      await recordActivity(auth.supabase, {
        actorUserId: auth.userId,
        eventType: "renewal_quote_sent",
        subjectId: quote.recurring_occurrence_id,
        subjectType: "recurring_occurrence",
        metadata: { quote_id: quote.id },
      });
    }
  }));

  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);
  quoteIds.forEach((quoteId) => revalidatePath(`/admin/quotes/${quoteId}`));
  if (validation.customerId) revalidatePath(`/admin/customers/${validation.customerId}`);
  if (validation.organizationId) revalidatePath(`/admin/organizations/${validation.organizationId}`);
  revalidatePath("/admin/communications");

  return {
    status: "success",
    message: result.historyRecorded
      ? `${quotes.length} proposals were accepted by the email provider, recorded in delivery history, and marked sent.`
      : "The proposal email was accepted, but its CRM delivery history could not be recorded. Contact an administrator before sending again.",
  };
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

  const detail = await getQuoteDetail(quoteId);

  if (detail.error || !detail.data) {
    return { status: "error", message: detail.error ?? "Quote not found." };
  }

  const recipient = detail.data.approval_contact?.email ?? detail.data.recipient_contact?.email ?? detail.data.customers?.email ?? detail.data.organizations?.billing_email;

  if (!recipient) {
    return { status: "error", message: "The selected quote recipient does not have an email address." };
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
    to: recipient,
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
  });

  if (result.ok) {
    const sentAt = new Date().toISOString();
    const { error: statusError } = await auth.supabase
      .from("quotes")
      .update({
        status: "sent",
        sent_at: sentAt,
        sent_method: "crm_email",
        sent_by_user_id: auth.userId,
      })
      .eq("id", detail.data.id);

    if (statusError) {
      return { status: "error", message: `Quote email sent, but status update failed: ${statusError.message}` };
    }
    await recordActivity(auth.supabase, {
      actorUserId: auth.userId,
      eventType: "quote_sent",
      metadata: {
        delivery_method: "crm_email",
        provider_message_id: result.providerMessageId,
        subject: template.subject,
        template_type: "branded_quote",
      },
      subjectId: detail.data.id,
      subjectType: "quote",
    });
    if (detail.data.recurring_occurrence_id) {
      await auth.supabase.from("recurring_service_occurrences").update({ status: "quote_sent" }).eq("id", detail.data.recurring_occurrence_id);
      await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "renewal_quote_sent", subjectId: detail.data.recurring_occurrence_id, subjectType: "recurring_occurrence", metadata: { quote_id: detail.data.id } });
    }
    const communicationSupabase = getServiceRoleClient();
    if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);
  } else if (portalLink.created && portalLink.tokenId) {
    await auth.supabase
      .from("quote_portal_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", portalLink.tokenId);
  }

  revalidatePath(`/admin/quotes/${quoteId}`);
  if (detail.data.customer_id) revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  if (detail.data.organization_id) revalidatePath(`/admin/organizations/${detail.data.organization_id}`);
  return result.ok
    ? {
        status: "success",
        message: result.historyRecorded
          ? portalLink.created
            ? "Quote email accepted by the provider, recorded in delivery history, and marked sent."
            : "Quote email accepted by the provider and recorded in delivery history using the existing customer link."
          : "Quote email was accepted by the provider, but its CRM delivery history could not be recorded. Contact an administrator before sending again.",
      }
    : { status: "error", message: result.message };
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
    to: recipient,
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
  });

  if (result.ok) {
    const sentAt = new Date().toISOString();
    const { data: deliveredInvoice, error: statusError } = await auth.supabase
      .from("invoices")
      .update({ sent_at: sentAt })
      .eq("id", detail.data.id)
      .neq("status", "void")
      .select("id")
      .maybeSingle();

    if (statusError || !deliveredInvoice) {
      return { status: "error", message: `Invoice email sent, but delivery state could not be updated: ${statusError?.message ?? "Invoice is no longer eligible."}` };
    }
    const reconciliation = await reconcileInvoiceBalance(auth.supabase, detail.data.id);
    if (!reconciliation.ok) {
      return { status: "error", message: `Invoice email sent, but payment state could not be reconciled: ${reconciliation.message}` };
    }
    await recordActivity(auth.supabase, {
      actorUserId: auth.userId,
      eventType: "invoice_sent",
      metadata: {
        delivery_method: "crm_email",
        provider_message_id: result.providerMessageId,
        subject: template.subject,
        template_type: "branded_invoice",
      },
      subjectId: detail.data.id,
      subjectType: "invoice",
    });
    const communicationSupabase = getServiceRoleClient();
    if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);
  } else if (portalLink.created && portalLink.tokenId) {
    await auth.supabase
      .from("invoice_portal_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", portalLink.tokenId);
  }

  revalidatePath(`/admin/invoices/${invoiceId}`);
  if (detail.data.customer_id) revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  if (detail.data.organization_id) revalidatePath(`/admin/organizations/${detail.data.organization_id}`);
  return result.ok
    ? {
        status: "success",
        message: result.historyRecorded
          ? portalLink.created
            ? "Invoice email accepted by the provider, recorded in delivery history, and marked sent."
            : "Invoice email accepted by the provider and recorded in delivery history using the existing customer link."
          : "Invoice email was accepted by the provider, but its CRM delivery history could not be recorded. Contact an administrator before sending again.",
      }
    : { status: "error", message: result.message };
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

  if (!data || data.revoked_at) {
    return { created: false, error: "The submitted customer link is not active for this record.", tokenId: null, url: "" };
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { created: false, error: "The submitted customer link has expired. Regenerate only if you intend to replace it.", tokenId: null, url: "" };
  }

  return {
    created: false,
    error: null,
    tokenId: data.id as string,
    url: submittedPortalUrl.startsWith("http") ? submittedPortalUrl : await getPortalUrl(portalType, rawToken),
  };
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

function multiQuoteDraftFieldLabel(field: keyof MultiQuoteEmailEdits) {
  return { subject: "Email subject", greeting: "Greeting", intro: "Introduction", closing: "Closing" }[field];
}

async function revokeNewQuoteTokens(
  supabase: Parameters<typeof createOrGetQuotePortalTokenRecord>[0]["supabase"],
  tokenIds: string[],
) {
  if (!tokenIds.length) return;
  await supabase.from("quote_portal_tokens").update({ revoked_at: new Date().toISOString() }).in("id", tokenIds);
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
