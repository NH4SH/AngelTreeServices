import "server-only";

import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export async function getPortalCardPaymentContext(rawToken: string) {
  const lookup = await getInvoiceByPortalToken(rawToken);
  if (lookup.status !== "ready" || !lookup.invoice) {
    return failure("This invoice link is not available.", 404);
  }

  const supabase = getServiceRoleClient();
  if (!supabase) return failure("Online payment is not available for this invoice.", 503);

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, customer_id, organization_id, invoice_number, status, total_cents, customers:customers!invoices_customer_id_fkey(email), organizations(billing_email), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(email), accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(email)")
    .eq("id", lookup.invoice.id)
    .single();
  if (error || !invoice) {
    console.error("Card payment invoice lookup failed", error);
    return failure("This invoice is not available.", 404);
  }
  if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
    return failure("This invoice is not available for online payment.", 409);
  }

  const payments = await getSuccessfulPaymentTotal(supabase, invoice.id);
  if (payments.error) {
    console.error("Card payment balance lookup failed", payments.error);
    return failure("Online payment is not available right now. Please try again later.", 503);
  }
  const invoicePrincipalCents = Number(invoice.total_cents) - payments.totalCents;
  if (!Number.isSafeInteger(invoicePrincipalCents) || invoicePrincipalCents <= 0) {
    return failure("This invoice no longer has a balance due.", 409);
  }
  if (invoicePrincipalCents > 99_999_999) {
    return failure("This invoice amount cannot be paid online. Please contact Angel Tree Services.", 409);
  }

  const { data: processingPayment, error: processingError } = await supabase
    .from("invoice_checkout_sessions")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("status", "processing")
    .limit(1)
    .maybeSingle();
  if (processingError) return failure("Online payment is not available right now. Please try again later.", 503);
  if (processingPayment) return failure("A payment is already processing for this invoice.", 409);

  return {
    ok: true as const,
    billingEmail: getBillingEmail(invoice),
    invoice,
    invoicePrincipalCents,
    supabase,
  };
}

function getBillingEmail(invoice: {
  customers?: { email?: string | null } | { email?: string | null }[] | null;
  organizations?: { billing_email?: string | null } | { billing_email?: string | null }[] | null;
  billing_contact?: { email?: string | null } | { email?: string | null }[] | null;
  accounts_payable_contact?: { email?: string | null } | { email?: string | null }[] | null;
}) {
  return asOne(invoice.accounts_payable_contact)?.email
    ?? asOne(invoice.billing_contact)?.email
    ?? asOne(invoice.customers)?.email
    ?? asOne(invoice.organizations)?.billing_email
    ?? null;
}

function asOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function failure(message: string, status: number) {
  return { ok: false as const, message, status };
}
