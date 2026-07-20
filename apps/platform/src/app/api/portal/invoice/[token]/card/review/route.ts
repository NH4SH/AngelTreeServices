import { NextResponse } from "next/server";
import { getInvoicePaymentConfiguration } from "@/lib/payments/payment-options";
import { getPortalCardPaymentContext } from "@/lib/payments/portal-card-context";
import { hashPortalToken } from "@/lib/portal/tokens";
import { createCardReview } from "@/lib/stripe/card-payment";
import { getStripeServerConfig } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const stripeConfig = getStripeServerConfig();
  const paymentConfig = getInvoicePaymentConfiguration();
  if (!stripeConfig.configured || !paymentConfig.cardEnabled) return paymentError("Card payment is not available for this invoice.", 503);
  if (!validOrigin(request, stripeConfig.appBaseUrl)) return paymentError("Card payment is not available for this invoice.", 403);

  const body = await request.json().catch(() => null) as { confirmationTokenId?: unknown } | null;
  if (!body || Object.keys(body).some((key) => key !== "confirmationTokenId") || typeof body.confirmationTokenId !== "string" || !/^ctoken_[A-Za-z0-9]+$/.test(body.confirmationTokenId)) {
    return paymentError("Your card details could not be reviewed. Please try again.", 400);
  }

  const { token } = await params;
  const context = await getPortalCardPaymentContext(token, stripeConfig.stripe);
  if (!context.ok) return paymentError(context.message, context.status);

  const tokenHash = hashPortalToken(token);
  if (!tokenHash) return paymentError("This invoice link is not available.", 404);
  const { error: preferenceError } = await context.supabase.rpc("record_invoice_payment_preference", {
    p_preference: "card",
    p_token_hash: tokenHash,
  });
  if (preferenceError) {
    console.error("Card payment preference save failed", { applicationErrorCode: "payment_preference_save_failed", route: "invoice_portal_card_review" });
    return paymentError("Online payment is not available right now. Please try again later.", 503);
  }

  const result = await createCardReview({
    confirmationTokenId: body.confirmationTokenId,
    customerId: context.invoice.customer_id,
    invoiceId: context.invoice.id,
    invoicePrincipalCents: context.invoicePrincipalCents,
    organizationId: context.invoice.organization_id,
    stripe: stripeConfig.stripe,
    supabase: context.supabase,
    surchargeBps: paymentConfig.surchargeBps,
    surchargeEnabled: paymentConfig.surchargeEnabled,
  });
  if (!result.ok) return paymentError(result.message, 409);

  return NextResponse.json({
    ok: true,
    review: {
      cardFundingType: result.review.cardFundingType,
      grossChargeCents: result.review.grossChargeCents,
      invoicePrincipalCents: result.review.invoicePrincipalCents,
      reviewId: result.review.reviewId,
      surchargeCents: result.review.surchargeCents,
      surchargeEligible: result.review.surchargeEligible,
    },
  });
}

function validOrigin(request: Request, appBaseUrl: string) {
  const origin = request.headers.get("origin");
  return !origin || origin === appBaseUrl;
}

function paymentError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
