import { NextResponse } from "next/server";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { isOnlinePortalPaymentMethod } from "@/lib/payments/portal-methods";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { createOrReuseInvoiceCheckout } from "@/lib/stripe/invoice-checkout";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const maxBodyBytes = 2_048;

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

  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    return paymentError("Online payment is not available for this invoice.", 413);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return paymentError("Choose a payment method and try again.", 415);
  }

  let body: { paymentMethod?: unknown };
  try {
    body = await request.json() as { paymentMethod?: unknown };
  } catch {
    return paymentError("Choose a payment method and try again.", 400);
  }

  if (!isOnlinePortalPaymentMethod(body.paymentMethod)) {
    return paymentError("Choose bank account or debit/credit card.", 400);
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
    .select("id, customer_id, organization_id, invoice_number, status, total_cents, jobs(service_location_id)")
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

  const job = asOne(invoice.jobs) as { service_location_id?: string | null } | null;
  const portalUrl = new URL(`/portal/invoice/${encodeURIComponent(token)}`, stripeConfig.appBaseUrl).toString();
  const checkout = await createOrReuseInvoiceCheckout({
    amountCents,
    customerId: invoice.customer_id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    organizationId: invoice.organization_id,
    paymentMethod: body.paymentMethod,
    portalUrl,
    serviceLocationId: job?.service_location_id ?? null,
    stripe: stripeConfig.stripe,
    supabase,
  });

  if (!checkout.ok) {
    return paymentError(checkout.message, 503);
  }

  return NextResponse.json({ ok: true, url: checkout.url });
}

function asOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function paymentError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
