"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { hasAllowedRole, platformRoleGroups, getUserRoles } from "@/lib/auth/roles";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getQuoteDetail } from "@/lib/data/quotes";
import { generateQuoteEmailDraft } from "@/lib/documents/email-drafts";
import { invoiceEmailTemplate } from "@/lib/email/templates";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  generatePortalToken,
  getPortalTokenHint,
  hashPortalToken,
  QUOTE_PORTAL_LINK_LIFETIME_DAYS,
} from "@/lib/portal/tokens";
import { createClient } from "@/lib/supabase/server";

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

  const recipient = detail.data.customers?.email;

  if (!recipient) {
    return { status: "error", message: "This customer does not have an email address." };
  }

  if (["approved", "declined", "expired", "cancelled"].includes(detail.data.status)) {
    return { status: "error", message: "This quote is no longer open for sending." };
  }

  const portalLink = await createQuotePortalLinkForEmail(auth, detail.data.id, detail.data.customer_id);

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
    sentByUserId: auth.userId,
    supabase: auth.supabase,
  });

  if (result.ok) {
    const sentAt = new Date().toISOString();
    const { error: statusError } = await auth.supabase
      .from("quotes")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", detail.data.id);

    if (statusError) {
      return { status: "error", message: `Quote email sent, but status update failed: ${statusError.message}` };
    }
  }

  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  return result.ok
    ? { status: "success", message: "Quote email sent and marked sent." }
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

  const template = invoiceEmailTemplate(detail.data);
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

  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  return result.ok
    ? { status: "success", message: "Invoice email sent." }
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

async function createQuotePortalLinkForEmail(
  auth: { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; userId: string },
  quoteId: string,
  customerId: string,
) {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);

  if (!tokenHash) {
    return { error: "Could not generate a secure quote portal link.", url: "" };
  }

  const expiresAt = new Date(Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await auth.supabase.from("quote_portal_tokens").insert({
    quote_id: quoteId,
    customer_id: customerId,
    token_hash: tokenHash,
    token_hint: getPortalTokenHint(rawToken),
    expires_at: expiresAt,
    created_by_user_id: auth.userId,
  });

  if (error) {
    return { error: error.message, url: "" };
  }

  return { error: null, url: `${await getRequestOrigin()}/portal/quote/${rawToken}` };
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
