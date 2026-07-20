import { NextResponse } from "next/server";
import { getInvoicePaymentConfiguration } from "@/lib/payments/payment-options";
import { getPortalCardPaymentContext } from "@/lib/payments/portal-card-context";
import { confirmCardReview } from "@/lib/stripe/card-payment";
import { getStripeServerConfig } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const stripeConfig = getStripeServerConfig();
  const paymentConfig = getInvoicePaymentConfiguration();
  if (!stripeConfig.configured || !paymentConfig.cardEnabled) return paymentError("Card payment is not available for this invoice.", 503);
  if (!validOrigin(request, stripeConfig.appBaseUrl)) return paymentError("Card payment is not available for this invoice.", 403);

  const body = await request.json().catch(() => null) as { reviewId?: unknown } | null;
  if (!body || Object.keys(body).some((key) => key !== "reviewId") || typeof body.reviewId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.reviewId)) {
    return paymentError("This payment review is not valid. Please review your card again.", 400);
  }

  const { token } = await params;
  const context = await getPortalCardPaymentContext(token);
  if (!context.ok) return paymentError(context.message, context.status);
  const portalUrl = new URL(`/portal/invoice/${encodeURIComponent(token)}`, stripeConfig.appBaseUrl).toString();
  const result = await confirmCardReview({
    billingEmail: context.billingEmail,
    invoiceId: context.invoice.id,
    invoiceNumber: context.invoice.invoice_number,
    invoicePrincipalCents: context.invoicePrincipalCents,
    portalUrl,
    reviewId: body.reviewId,
    stripe: stripeConfig.stripe,
    supabase: context.supabase,
    surchargeBps: paymentConfig.surchargeBps,
    surchargeEnabled: paymentConfig.surchargeEnabled,
  });
  if (!result.ok) return paymentError(result.message, 409);

  return NextResponse.json({ ok: true, clientSecret: result.clientSecret, status: result.status });
}

function validOrigin(request: Request, appBaseUrl: string) {
  const origin = request.headers.get("origin");
  return !origin || origin === appBaseUrl;
}

function paymentError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
