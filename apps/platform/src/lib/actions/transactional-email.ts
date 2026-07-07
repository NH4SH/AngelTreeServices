"use server";

import { revalidatePath } from "next/cache";
import { hasAllowedRole, platformRoleGroups, getUserRoles } from "@/lib/auth/roles";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getQuoteDetail } from "@/lib/data/quotes";
import { invoiceEmailTemplate, quoteEmailTemplate } from "@/lib/email/templates";
import { sendTransactionalEmail } from "@/lib/email/send";
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

  const template = quoteEmailTemplate(detail.data);
  const result = await sendTransactionalEmail({
    to: recipient,
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: "quote",
    relatedCustomerId: detail.data.customer_id,
    relatedJobId: detail.data.job_id,
    relatedQuoteId: detail.data.id,
    sentByUserId: auth.userId,
    supabase: auth.supabase,
  });

  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath(`/admin/customers/${detail.data.customer_id}`);
  return result.ok
    ? { status: "success", message: "Quote email sent." }
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
