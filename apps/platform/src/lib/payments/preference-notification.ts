import "server-only";

import { getInternalLeadNotificationEmail } from "@/lib/email/config";
import { sendTransactionalEmail } from "@/lib/email/send";
import { paymentPreferenceLabel, type InvoicePaymentPreference } from "@/lib/payments/payment-options";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function notifyOfficeOfInvoicePaymentPreference(input: {
  balanceDueCents: number;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string | null;
  preference: InvoicePaymentPreference;
  appBaseUrl: string;
  supabase: SupabaseClient<any, "public", any>;
}) {
  const invoiceLabel = input.invoiceNumber ? `Invoice ${input.invoiceNumber}` : "an invoice";
  const subject = input.preference === "cash_check_pickup"
    ? `Pickup requested for ${invoiceLabel}`
    : `Customer plans to mail a check for ${invoiceLabel}`;
  const adminUrl = new URL(`/admin/invoices/${input.invoiceId}`, input.appBaseUrl).toString();
  const text = [
    `${input.customerName} selected ${paymentPreferenceLabel(input.preference)} for ${invoiceLabel}.`,
    `Balance due: ${formatCurrency(input.balanceDueCents)}`,
    "This is a payment preference only. No payment has been recorded.",
    `Open invoice: ${adminUrl}`,
  ].join("\n\n");

  return sendTransactionalEmail({
    to: getInternalLeadNotificationEmail(),
    subject,
    text,
    emailType: "payment_preference_notice",
    relatedInvoiceId: input.invoiceId,
    supabase: input.supabase,
  });
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
