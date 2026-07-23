import { NextResponse } from "next/server";
import { getPortalPaymentContext } from "@/lib/payments/portal-card-context";
import { hashPortalToken } from "@/lib/portal/tokens";
import { createOrReuseInvoiceCheckout } from "@/lib/stripe/invoice-checkout";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";

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

  const { token } = await params;
  const rateLimit = await enforceSharedRateLimit({ action: "portal.invoice.ach-checkout", identifiers: [hashPortalToken(token)], limit: 8, request, windowSeconds: 600 });
  if (!rateLimit.available) return paymentError("Online payment is not available right now. Please try again later.", 503);
  if (!rateLimit.allowed) return paymentError("Please wait before starting another payment.", 429, rateLimit.retryAfterSeconds);

  const body = await request.json().catch(() => null) as { method?: unknown } | null;
  if (!body || Object.keys(body).some((key) => key !== "method") || body.method !== "ach") {
    return paymentError("Choose bank account payment to continue.", 400);
  }

  const context = await getPortalPaymentContext(token, stripeConfig.stripe);
  if (!context.ok) return paymentError(context.message, context.status);
  const { invoice, invoicePrincipalCents: amountCents, supabase } = context;

  const tokenHash = hashPortalToken(token);
  if (!tokenHash) {
    return paymentError("This invoice link is not available.", 404);
  }
  const { error: preferenceError } = await supabase.rpc("record_invoice_payment_preference", {
    p_preference: "ach",
    p_token_hash: tokenHash,
  });
  if (preferenceError) {
    console.error("Checkout payment preference save failed", { applicationErrorCode: "payment_preference_save_failed", route: "invoice_portal_ach_checkout" });
    return paymentError("Online payment is not available right now. Please try again later.", 503);
  }

  const job = asOne(invoice.jobs) as { service_location_id?: string | null } | null;
  const portalUrl = new URL(`/portal/invoice/${encodeURIComponent(token)}`, stripeConfig.appBaseUrl).toString();
  const checkout = await createOrReuseInvoiceCheckout({
    amountCents,
    customerEmail: context.billingEmail,
    customerId: invoice.customer_id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    organizationId: invoice.organization_id,
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

function paymentError(message: string, status: number, retryAfterSeconds?: number) {
  const headers = retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined;
  return NextResponse.json({ ok: false, message }, { status, headers });
}
