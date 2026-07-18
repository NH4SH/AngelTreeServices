import { NextResponse } from "next/server";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { getInvoicePaymentConfiguration, isOnlinePaymentChannel } from "@/lib/payments/payment-options";
import { hashPortalToken } from "@/lib/portal/tokens";
import { createOrReuseInvoiceCheckout } from "@/lib/stripe/invoice-checkout";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CheckoutRouteProps = {
  params: Promise<{ token: string }>;
};

export async function POST(request: Request, { params }: CheckoutRouteProps) {
  const stripeConfig = getStripeServerConfig();
  if (!stripeConfig.configured) {
    return paymentError("Online payment is not available for this invoice.", 503);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== stripeConfig.appBaseUrl) {
    return paymentError("Online payment is not available for this invoice.", 403);
  }

  const body = await request.json().catch(() => null) as { method?: unknown } | null;
  if (!body || Object.keys(body).some((key) => key !== "method") || !isOnlinePaymentChannel(body.method)) {
    return paymentError("Choose bank account or card payment.", 400);
  }

  const paymentConfig = getInvoicePaymentConfiguration();
  if (body.method === "card" && !paymentConfig.cardEnabled) {
    return paymentError("Card payment is temporarily unavailable. Please choose bank account or contact our office.", 409);
  }

  const { token } = await params;
  const lookup = await getInvoiceByPortalToken(token);
  if (lookup.status !== "ready" || !lookup.invoice) {
    return paymentError("This invoice link is not available.", 404);
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return paymentError("Online payment is not available for this invoice.", 503);
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, customer_id, organization_id, invoice_number, status, total_cents, customers:customers!invoices_customer_id_fkey(email), organizations(billing_email), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(email), accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(email), jobs(service_location_id)")
    .eq("id", lookup.invoice.id)
    .single();

  if (invoiceError || !invoice) {
    console.error("Stripe Checkout invoice lookup failed", invoiceError);
    return paymentError("This invoice is not available.", 404);
  }

  if (!["sent", "partially_paid", "overdue"].includes(invoice.status)) {
    return paymentError("This invoice is not available for online payment.", 409);
  }

  const payments = await getSuccessfulPaymentTotal(supabase, invoice.id);
  if (payments.error) {
    console.error("Stripe Checkout payment total failed", payments.error);
    return paymentError("Online payment is not available right now. Please try again later.", 503);
  }

  const amountCents = Math.max(0, Number(invoice.total_cents) - payments.totalCents);
  if (amountCents <= 0) {
    return paymentError("This invoice no longer has a balance due.", 409);
  }


  const { data: processingCheckout } = await supabase
    .from("invoice_checkout_sessions")
    .select("id")
    .eq("invoice_id", invoice.id)
    .eq("status", "processing")
    .limit(1)
    .maybeSingle();
  if (processingCheckout) {
    return paymentError("A bank payment is already processing for this invoice.", 409);
  }

  const tokenHash = hashPortalToken(token);
  if (!tokenHash) {
    return paymentError("This invoice link is not available.", 404);
  }
  const { error: preferenceError } = await supabase.rpc("record_invoice_payment_preference", {
    p_preference: body.method,
    p_token_hash: tokenHash,
  });
  if (preferenceError) {
    console.error("Checkout payment preference save failed", preferenceError);
    return paymentError("Online payment is not available right now. Please try again later.", 503);
  }

  const job = asOne(invoice.jobs) as { service_location_id?: string | null } | null;
  const portalUrl = new URL(`/portal/invoice/${encodeURIComponent(token)}`, stripeConfig.appBaseUrl).toString();
  const checkout = await createOrReuseInvoiceCheckout({
    amountCents,
    customerEmail: getBillingEmail(invoice),
    customerId: invoice.customer_id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    organizationId: invoice.organization_id,
    portalUrl,
    paymentChannel: body.method,
    serviceLocationId: job?.service_location_id ?? null,
    stripe: stripeConfig.stripe,
    supabase,
  });

  if (!checkout.ok) {
    return paymentError(checkout.message, 503);
  }

  return NextResponse.json({ ok: true, url: checkout.url });
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

function paymentError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
