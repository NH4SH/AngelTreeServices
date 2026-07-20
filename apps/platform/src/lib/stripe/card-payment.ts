import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  cardAuthenticationLifetimeMs,
  cardIntentCanExpire,
  cardIntentMustRemainReserved,
  cardReviewLifetimeMs,
  reservationIsStale,
} from "@/lib/payments/card-reservation-policy";
import { calculateCardCharge, normalizeCardFunding, type CardChargeBreakdown } from "@/lib/payments/card-surcharge";

export type CardReview = CardChargeBreakdown & {
  cardBrand: string;
  cardCountry: string | null;
  reviewId: string;
};

export async function createCardReview({
  confirmationTokenId,
  customerId,
  invoiceId,
  invoicePrincipalCents,
  organizationId,
  stripe,
  supabase,
  surchargeBps,
  surchargeEnabled,
}: {
  confirmationTokenId: string;
  customerId: string | null;
  invoiceId: string;
  invoicePrincipalCents: number;
  organizationId: string | null;
  stripe: Stripe;
  supabase: SupabaseClient<any, "public", any>;
  surchargeBps: number;
  surchargeEnabled: boolean;
}): Promise<{ ok: true; review: CardReview } | { ok: false; message: string }> {
  const cleanup = await releaseStaleCardReservations({ invoiceId, stripe, supabase });
  if (!cleanup.ok) return { ok: false, message: "Your payment review could not be prepared. Please try again." };

  let confirmationToken: Stripe.ConfirmationToken;
  try {
    confirmationToken = await stripe.confirmationTokens.retrieve(confirmationTokenId);
  } catch (error) {
    console.error("Stripe card review token retrieval failed", safeStripeError(error));
    return { ok: false, message: "Your card details could not be reviewed. Please check them and try again." };
  }

  const preview = confirmationToken.payment_method_preview;
  const card = preview?.type === "card" ? preview.card : null;
  if (!card) {
    return { ok: false, message: "Choose a valid debit or credit card to continue." };
  }

  const funding = normalizeCardFunding(card.funding);
  const cardCountry = card.country?.toUpperCase() ?? null;
  const breakdown = calculateCardCharge({
    cardCountry,
    funding,
    invoicePrincipalCents,
    surchargeBps,
    surchargeEnabled,
  });

  const existing = await supabase
    .from("invoice_checkout_sessions")
    .select("id, status, invoice_principal_cents, surcharge_cents, total_charge_cents, card_brand, card_country, card_funding_type, reviewed_at")
    .eq("stripe_confirmation_token_id", confirmationTokenId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (existing.error) {
    console.error("Stripe card review failed", { applicationErrorCode: "card_review_lookup_failed", route: "invoice_portal_card_review" });
    return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }
  if (existing.data) {
    const remainsCurrent = existing.data.status === "open"
      && Number(existing.data.invoice_principal_cents) === invoicePrincipalCents
      && Number(existing.data.surcharge_cents) === breakdown.surchargeCents
      && Number(existing.data.total_charge_cents) === breakdown.grossChargeCents
      && existing.data.card_brand === card.brand
      && existing.data.card_country === cardCountry
      && existing.data.card_funding_type === funding
      && Boolean(existing.data.reviewed_at)
      && Date.now() - new Date(existing.data.reviewed_at as string).getTime() <= cardReviewLifetimeMs;
    if (!remainsCurrent) {
      return existing.data.status === "creating" || existing.data.status === "processing"
        ? { ok: false, message: "This payment is already being submitted. Please wait for its status to update." }
        : { ok: false, message: "This card review is no longer active. Please enter your card details again." };
    }
    return {
      ok: true,
      review: { ...breakdown, cardBrand: card.brand, cardCountry, reviewId: existing.data.id },
    };
  }

  const active = await supabase
    .from("invoice_checkout_sessions")
    .select("id, status, stripe_checkout_session_id")
    .eq("invoice_id", invoiceId)
    .in("status", ["creating", "open", "processing"]);
  if (active.error) {
    return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }
  if (active.data?.some((session) => session.status === "creating" || session.status === "processing")) {
    return { ok: false, message: "A payment is already being submitted. Please wait for its status to update." };
  }
  for (const session of active.data ?? []) {
    if (session.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(session.stripe_checkout_session_id);
      } catch (error) {
        console.error("Stale Stripe Checkout expiry failed", safeStripeError(error));
        return { ok: false, message: "An earlier payment session is still open. Please wait a moment and try again." };
      }
    }
  }
  if (active.data?.length) {
    const { error } = await supabase
      .from("invoice_checkout_sessions")
      .update({ status: "cancelled" })
      .in("id", active.data.map((session) => session.id));
    if (error) return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }

  const reviewedAt = new Date().toISOString();
  const processingExpiresAt = new Date(Date.now() + cardReviewLifetimeMs).toISOString();
  const inserted = await supabase
    .from("invoice_checkout_sessions")
    .insert({
      amount_cents: invoicePrincipalCents,
      card_brand: card.brand,
      card_country: cardCountry,
      card_funding_type: funding,
      currency: "usd",
      customer_id: customerId,
      invoice_id: invoiceId,
      invoice_principal_cents: invoicePrincipalCents,
      organization_id: organizationId,
      payment_channel: "card",
      processing_expires_at: processingExpiresAt,
      reviewed_at: reviewedAt,
      status: "open",
      stripe_confirmation_token_id: confirmationTokenId,
      surcharge_cents: breakdown.surchargeCents,
      total_charge_cents: breakdown.grossChargeCents,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    console.error("Stripe card review failed", { applicationErrorCode: "card_review_reservation_failed", route: "invoice_portal_card_review" });
    return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }

  return {
    ok: true,
    review: { ...breakdown, cardBrand: card.brand, cardCountry, reviewId: inserted.data.id },
  };
}

export async function confirmCardReview({
  billingEmail,
  invoiceId,
  invoiceNumber,
  invoicePrincipalCents,
  portalUrl,
  reviewId,
  stripe,
  supabase,
  surchargeBps,
  surchargeEnabled,
}: {
  billingEmail: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  invoicePrincipalCents: number;
  portalUrl: string;
  reviewId: string;
  stripe: Stripe;
  supabase: SupabaseClient<any, "public", any>;
  surchargeBps: number;
  surchargeEnabled: boolean;
}): Promise<{ ok: true; clientSecret: string | null; status: Stripe.PaymentIntent.Status } | { ok: false; message: string }> {
  const reserved = await supabase
    .from("invoice_checkout_sessions")
    .select("id, customer_id, organization_id, stripe_confirmation_token_id, invoice_principal_cents, surcharge_cents, total_charge_cents, card_brand, card_country, card_funding_type, reviewed_at, status")
    .eq("id", reviewId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (reserved.error || !reserved.data || reserved.data.status !== "open" || !reserved.data.stripe_confirmation_token_id) {
    return { ok: false, message: "This card review is no longer active. Please review your card again." };
  }
  if (!reserved.data.reviewed_at || Date.now() - new Date(reserved.data.reviewed_at).getTime() > cardReviewLifetimeMs) {
    await supabase.from("invoice_checkout_sessions").update({ status: "expired" }).eq("id", reviewId).eq("status", "open");
    return { ok: false, message: "This card review expired. Please review your card again." };
  }
  if (Number(reserved.data.invoice_principal_cents) !== invoicePrincipalCents) {
    await supabase.from("invoice_checkout_sessions").update({ status: "cancelled" }).eq("id", reviewId).eq("status", "open");
    return { ok: false, message: "The invoice balance changed. Please review the updated amount before paying." };
  }

  let confirmationToken: Stripe.ConfirmationToken;
  try {
    confirmationToken = await stripe.confirmationTokens.retrieve(reserved.data.stripe_confirmation_token_id);
  } catch (error) {
    console.error("Stripe card confirmation token retrieval failed", safeStripeError(error));
    return { ok: false, message: "Your card details could not be confirmed. Please enter them again." };
  }
  const preview = confirmationToken.payment_method_preview;
  const card = preview?.type === "card" ? preview.card : null;
  if (!card) return { ok: false, message: "Choose a valid debit or credit card to continue." };

  const funding = normalizeCardFunding(card.funding);
  const cardCountry = card.country?.toUpperCase() ?? null;
  const current = calculateCardCharge({ cardCountry, funding, invoicePrincipalCents, surchargeBps, surchargeEnabled });
  if (
    current.grossChargeCents !== Number(reserved.data.total_charge_cents)
    || current.surchargeCents !== Number(reserved.data.surcharge_cents)
    || funding !== reserved.data.card_funding_type
    || card.brand !== reserved.data.card_brand
    || cardCountry !== reserved.data.card_country
  ) {
    await supabase.from("invoice_checkout_sessions").update({ status: "cancelled" }).eq("id", reviewId).eq("status", "open");
    return { ok: false, message: "The card review changed. Please review the payment amount again." };
  }

  const submittedAt = new Date().toISOString();
  const claim = await supabase
    .from("invoice_checkout_sessions")
    .update({ status: "creating", submitted_at: submittedAt })
    .eq("id", reviewId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (claim.error || !claim.data) {
    return { ok: false, message: "This payment is already being submitted. Please wait for its status to update." };
  }

  const metadata = compactMetadata({
    checkout_reservation_id: reviewId,
    customer_id: reserved.data.customer_id ?? "",
    invoice_id: invoiceId,
    invoice_number: invoiceNumber ?? "",
    organization_id: reserved.data.organization_id ?? "",
    payment_channel: "card",
  });

  try {
    const lineItems: Stripe.PaymentIntentCreateParams.AmountDetails.LineItem[] = [
      { product_name: `Invoice ${invoiceNumber ?? "payment"}`, quantity: 1, unit_cost: invoicePrincipalCents },
    ];
    if (current.surchargeCents > 0) {
      lineItems.push({ product_name: "Credit-card surcharge", quantity: 1, unit_cost: current.surchargeCents });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: current.grossChargeCents,
      amount_details: { enforce_arithmetic_validation: true, line_items: lineItems },
      confirm: true,
      confirmation_token: confirmationToken.id,
      currency: "usd",
      description: `Angel Tree Services invoice ${invoiceNumber ?? invoiceId}`,
      metadata,
      payment_method_types: ["card"],
      receipt_email: billingEmail || undefined,
      return_url: `${portalUrl}?payment=processing`,
      use_stripe_sdk: true,
    }, { idempotencyKey: `angel-tree-card-confirm-${reviewId}` });

    const authorizedAt = ["processing", "requires_capture", "succeeded"].includes(paymentIntent.status) ? new Date().toISOString() : null;
    const processingExpiresAt = cardIntentCanExpire(paymentIntent.status)
      ? new Date(Date.now() + cardAuthenticationLifetimeMs).toISOString()
      : null;
    const { error } = await supabase.from("invoice_checkout_sessions").update({
      authorized_at: authorizedAt,
      processing_expires_at: processingExpiresAt,
      // Even an immediately succeeded intent remains reserved until its webhook
      // writes the payment and reconciles the invoice balance.
      status: "processing",
      stripe_payment_intent_id: paymentIntent.id,
    }).eq("id", reviewId);
    if (error) throw new Error(error.message);

    return { ok: true, clientSecret: paymentIntent.client_secret, status: paymentIntent.status };
  } catch (error) {
    const paymentIntentId = getPaymentIntentIdFromError(error);
    await supabase.from("invoice_checkout_sessions").update({
      failed_at: new Date().toISOString(),
      status: "failed",
      stripe_payment_intent_id: paymentIntentId,
    }).eq("id", reviewId);
    console.error("Stripe card confirmation failed", safeStripeError(error));
    return { ok: false, message: "Your card payment could not be completed. Please check your card and try again." };
  }
}

export async function releaseStaleCardReservations({
  invoiceId,
  stripe,
  supabase,
}: {
  invoiceId: string;
  stripe: Stripe;
  supabase: SupabaseClient<any, "public", any>;
}): Promise<{ ok: true } | { ok: false }> {
  const nowIso = new Date().toISOString();
  const stale = await supabase
    .from("invoice_checkout_sessions")
    .select("id, status, stripe_payment_intent_id, processing_expires_at")
    .eq("invoice_id", invoiceId)
    .eq("payment_channel", "card")
    .in("status", ["creating", "open", "processing"])
    .lte("processing_expires_at", nowIso);
  if (stale.error) return { ok: false };

  for (const reservation of stale.data ?? []) {
    if (!reservationIsStale(reservation.processing_expires_at)) continue;
    const paymentIntentId = reservation.stripe_payment_intent_id as string | null;
    if (!paymentIntentId) {
      const expired = await expireCardReservation(supabase, reservation.id, null, nowIso);
      if (!expired) return { ok: false };
      continue;
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error("Stripe card reservation status lookup failed", safeStripeError(error));
      return { ok: false };
    }

    if (cardIntentMustRemainReserved(paymentIntent.status)) continue;
    if (!cardIntentCanExpire(paymentIntent.status)) continue;

    if (paymentIntent.status !== "canceled") {
      try {
        paymentIntent = await stripe.paymentIntents.cancel(paymentIntent.id);
      } catch (error) {
        // A success webhook may race cleanup. Re-read before deciding whether
        // the local reservation can be released.
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
        } catch (lookupError) {
          console.error("Stripe card reservation cancellation check failed", safeStripeError(lookupError));
          return { ok: false };
        }
      }
    }

    if (paymentIntent.status !== "canceled") continue;
    const expired = await expireCardReservation(supabase, reservation.id, paymentIntent.id, nowIso);
    if (!expired) return { ok: false };
  }

  return { ok: true };
}

async function expireCardReservation(
  supabase: SupabaseClient<any, "public", any>,
  reservationId: string,
  paymentIntentId: string | null,
  nowIso: string,
) {
  let query = supabase
    .from("invoice_checkout_sessions")
    .update({ status: "expired" })
    .eq("id", reservationId)
    .eq("payment_channel", "card")
    .in("status", ["creating", "open", "processing"])
    .lte("processing_expires_at", nowIso);
  query = paymentIntentId
    ? query.eq("stripe_payment_intent_id", paymentIntentId)
    : query.is("stripe_payment_intent_id", null);
  const result = await query.select("id").maybeSingle();
  return !result.error;
}

function compactMetadata(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value)));
}

function getPaymentIntentIdFromError(error: unknown) {
  if (!error || typeof error !== "object" || !("payment_intent" in error)) return null;
  const paymentIntent = (error as { payment_intent?: string | { id?: string } }).payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
}

function safeStripeError(error: unknown) {
  if (!error || typeof error !== "object") return { type: "unknown" };
  const value = error as { code?: string; statusCode?: number; type?: string };
  return { code: value.code, statusCode: value.statusCode, type: value.type };
}
