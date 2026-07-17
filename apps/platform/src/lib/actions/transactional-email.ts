"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { hasAllowedRole, platformRoleGroups, getUserRoles } from "@/lib/auth/roles";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getQuoteDetail } from "@/lib/data/quotes";
import { generateQuoteEmailDraft } from "@/lib/documents/email-drafts";
import { invoiceEmailTemplate } from "@/lib/email/templates";
import { sendTransactionalEmail } from "@/lib/email/send";
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

export type TransactionalEmailActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

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

  const portalLink = await getQuotePortalLinkForEmail(auth, detail.data.id, formData);

  if (portalLink.error) {
    return { status: "error", message: portalLink.error };
  }

  const template = generateQuoteEmailDraft(detail.data, { portalUrl: portalLink.url });
  const result = await sendTransactionalEmail({
    to: recipient,
    subject: template.subject,
    text: template.body,
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
      metadata: { delivery_method: "crm_email" },
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
  revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  if (detail.data.organization_id) revalidatePath(`/admin/organizations/${detail.data.organization_id}`);
  return result.ok
    ? { status: "success", message: portalLink.created ? "Quote email sent and marked sent." : "Quote email resent using the existing customer link." }
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

  const recipient = detail.data.customers?.email;

  if (!recipient) {
    return { status: "error", message: "This customer does not have an email address." };
  }

  if (["paid", "void"].includes(detail.data.status)) {
    return { status: "error", message: "Paid and void invoices are closed for regular sending." };
  }

  const portalLink = await getInvoicePortalLinkForEmail(auth, detail.data.id, formData);

  if (portalLink.error) {
    return { status: "error", message: portalLink.error };
  }

  const template = invoiceEmailTemplate(detail.data, { portalUrl: portalLink.url });
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
    sentByUserId: auth.userId,
    supabase: auth.supabase,
  });

  if (result.ok) {
    const { error: statusError } = await auth.supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", detail.data.id);

    if (statusError) {
      return { status: "error", message: `Invoice email sent, but status update failed: ${statusError.message}` };
    }
    await recordActivity(auth.supabase, {
      actorUserId: auth.userId,
      eventType: "invoice_sent",
      metadata: { delivery_method: "crm_email" },
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
  revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  return result.ok
    ? { status: "success", message: portalLink.created ? "Invoice email sent and marked sent." : "Invoice email resent using the existing customer link." }
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
    return { created: false, error: error.message, tokenId: null, url: "" };
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
