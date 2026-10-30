import {firewoodSurchargeFields,type FirewoodCollectorPolicy} from "@/lib/firewood/handoff/collector-policy";
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { cardIntentMatches, closeCheckoutReservation, closableReservationColumns, isClosableReservation, isCheckoutContractingParty, confirmsCheckoutRow, type ClosableReservation } from "@/lib/payments/checkout-closure";
import { createCheckoutBudget } from "@/lib/payments/checkout-budget";
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

type CardReviewInput = {
  confirmationTokenId: string;
  customerId: string | null;
  invoiceId: string;
  invoicePrincipalCents: number;
  organizationId: string | null;
  stripe: Stripe;
  livemode: boolean;
  supabase: SupabaseClient<any, "public", any>;
  surchargeBps: number;
  surchargeEnabled: boolean;
};
type CardReviewResult = { ok: true; review: CardReview } | { ok: false; message: string };
const cardReviewColumns = `${closableReservationColumns}, stripe_confirmation_token_id, invoice_principal_cents, surcharge_cents, card_brand, card_country, card_funding_type, reviewed_at`;

export async function createCardReview(input: CardReviewInput): Promise<CardReviewResult> {
  try { return await createCardReviewCommand(input); }
  catch (error) {
    console.error("Stripe card review preparation was not confirmed", safeStripeError(error));
    return { ok: false, message: "Your payment review could not be confirmed. Please refresh and review its saved status before trying again." };
  }
}

async function createCardReviewCommand({
  confirmationTokenId,
  customerId,
  invoiceId,
  invoicePrincipalCents,
  organizationId,
  stripe,
  livemode,
  supabase,
  surchargeBps,
  surchargeEnabled,
}: CardReviewInput): Promise<CardReviewResult> {
  const cleanup = await releaseStaleCardReservations({ invoiceId, stripe, supabase, livemode });
  if (!cleanup.ok) return { ok: false, message: "Your payment review could not be prepared. Please try again." };

  let confirmationToken: Stripe.ConfirmationToken;
  try {
    confirmationToken = await stripe.confirmationTokens.retrieve(confirmationTokenId);
  } catch (error) {
    console.error("Stripe card review token retrieval failed", safeStripeError(error));
    return { ok: false, message: "Your card details could not be reviewed. Please check them and try again." };
  }
  if (confirmationToken?.id !== confirmationTokenId || confirmationToken.livemode !== livemode) {
    return { ok: false, message: "Your card details could not be reviewed. Please check them and try again." };
  }

  const preview = confirmationToken.payment_method_preview;
  const card = preview?.type === "card" ? preview.card : null;
  if (!card || typeof card.brand !== "string" || !card.brand) {
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
  const matchesReview = (value: unknown): value is CardConfirmationReservation => isCardConfirmationReservation(value)
    && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id)
    && value.invoice_id === invoiceId && value.customer_id === customerId && value.organization_id === organizationId
    && value.stripe_confirmation_token_id === confirmationTokenId && value.payment_channel === "card" && value.currency.toLowerCase() === "usd"
    && value.status === "open" && value.submitted_at === null && value.stripe_checkout_session_id === null && value.stripe_payment_intent_id === null
    && value.invoice_principal_cents === invoicePrincipalCents && value.surcharge_cents === breakdown.surchargeCents
    && value.total_charge_cents === breakdown.grossChargeCents && value.card_brand === card.brand
    && value.card_country === cardCountry && value.card_funding_type === funding
    && Number.isFinite(Date.parse(value.reviewed_at)) && Date.now() - Date.parse(value.reviewed_at) <= cardReviewLifetimeMs;

  const existing = await supabase
    .from("invoice_checkout_sessions")
    .select(cardReviewColumns)
    .eq("stripe_confirmation_token_id", confirmationTokenId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (existing?.error !== null) {
    console.error("Stripe card review failed", { applicationErrorCode: "card_review_lookup_failed", route: "invoice_portal_card_review" });
    return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }
  if (existing.data !== null) {
    if (!matchesReview(existing.data)) {
      return existing.data?.status === "creating" || existing.data?.status === "processing"
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
    .select(closableReservationColumns)
    .eq("invoice_id", invoiceId)
    .in("status", ["creating", "open", "processing"]);
  if (active?.error !== null || !Array.isArray(active.data)
    || !active.data.every(row => isClosableReservation(row) && row.invoice_id === invoiceId && ["creating", "open", "processing"].includes(row.status))
    || new Set(active.data.map(row => row.id)).size !== active.data.length) {
    return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }
  if (active.data.some((session) => session.status === "creating" || session.status === "processing")) {
    return { ok: false, message: "A payment is already being submitted. Please wait for its status to update." };
  }
  for (const reservation of active.data as ClosableReservation[]) {
    const closed = await closeCheckoutReservation({ reservation, stripe, supabase, livemode, operation: "checkout_replacement", correlationId: crypto.randomUUID() });
    if (!closed.ok) return { ok: false, message: "An earlier payment needs review before another payment can start." };
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
    .select(cardReviewColumns)
    .single();

  if (inserted?.error !== null || !matchesReview(inserted.data)) {
    console.error("Stripe card review failed", { applicationErrorCode: "card_review_reservation_failed", route: "invoice_portal_card_review" });
    return { ok: false, message: "Your payment review could not be prepared. Please try again." };
  }

  return {
    ok: true,
    review: { ...breakdown, cardBrand: card.brand, cardCountry, reviewId: inserted.data.id },
  };
}

type CardConfirmationInput = {
  billingEmail: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  invoicePrincipalCents: number;
  portalUrl: string;
  reviewId: string;
  livemode: boolean;
  stripe: Stripe;
  supabase: SupabaseClient<any, "public", any>;
  surchargeBps: number;
  surchargeEnabled: boolean;
  firewoodPolicy?:FirewoodCollectorPolicy|null;
};
type CardConfirmationResult = { ok: true; clientSecret: string | null; status: Stripe.PaymentIntent.Status } | { ok: false; message: string };
type CardConfirmationReservation = ClosableReservation & {
  customer_id: string | null;
  organization_id: string | null;
  stripe_confirmation_token_id: string;
  invoice_principal_cents: number;
  surcharge_cents: number;
  card_brand: string;
  card_country: string | null;
  card_funding_type: string;
  reviewed_at: string;
};

export async function confirmCardReview(input: CardConfirmationInput): Promise<CardConfirmationResult> {
  try { return await confirmCardReviewCommand(input); }
  catch (error) {
    console.error("Stripe card confirmation was not confirmed", safeStripeError(error));
    return { ok: false, message: "Your payment confirmation is not yet verified. Please wait for its status to update before trying again." };
  }
}

async function confirmCardReviewCommand({
  billingEmail,
  invoiceId,
  invoiceNumber,
  invoicePrincipalCents,
  portalUrl,
  reviewId,
  livemode,
  stripe,
  supabase,
  surchargeBps,
  surchargeEnabled,
  firewoodPolicy,
}: CardConfirmationInput): Promise<CardConfirmationResult> {
  const reserved = await supabase
    .from("invoice_checkout_sessions")
    .select(`${closableReservationColumns}, stripe_confirmation_token_id, invoice_principal_cents, surcharge_cents, card_brand, card_country, card_funding_type, reviewed_at`)
    .eq("id", reviewId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (reserved?.error !== null || !isCardConfirmationReservation(reserved.data)
    || reserved.data.id !== reviewId || reserved.data.invoice_id !== invoiceId || reserved.data.status !== "open"
    || reserved.data.payment_channel !== "card" || reserved.data.currency.toLowerCase() !== "usd"
    || reserved.data.stripe_checkout_session_id !== null || reserved.data.stripe_payment_intent_id !== null || reserved.data.submitted_at !== null) {
    return { ok: false, message: "This card review is no longer active. Please review your card again." };
  }
  const review = reserved.data;
  if (!Number.isFinite(Date.parse(review.reviewed_at))) return { ok: false, message: "This card review is no longer active. Please review your card again." };
  if (!review.reviewed_at || Date.now() - new Date(review.reviewed_at).getTime() > cardReviewLifetimeMs) {
    await supabase.from("invoice_checkout_sessions").update({ status: "expired" }).eq("id", reviewId).eq("invoice_id", invoiceId).eq("status", "open")
      .is("stripe_payment_intent_id", null).is("submitted_at", null);
    return { ok: false, message: "This card review expired. Please review your card again." };
  }
  if (review.invoice_principal_cents !== invoicePrincipalCents) {
    await supabase.from("invoice_checkout_sessions").update({ status: "cancelled" }).eq("id", reviewId).eq("invoice_id", invoiceId).eq("status", "open")
      .is("stripe_payment_intent_id", null).is("submitted_at", null);
    return { ok: false, message: "The invoice balance changed. Please review the updated amount before paying." };
  }

  let confirmationToken: Stripe.ConfirmationToken;
  try {
    confirmationToken = await stripe.confirmationTokens.retrieve(review.stripe_confirmation_token_id);
  } catch (error) {
    console.error("Stripe card confirmation token retrieval failed", safeStripeError(error));
    return { ok: false, message: "Your card details could not be confirmed. Please enter them again." };
  }
  if (confirmationToken?.id !== review.stripe_confirmation_token_id || confirmationToken.livemode !== livemode) {
    return { ok: false, message: "Your card details could not be confirmed. Please enter them again." };
  }
  const preview = confirmationToken.payment_method_preview;
  const card = preview?.type === "card" ? preview.card : null;
  if (!card) return { ok: false, message: "Choose a valid debit or credit card to continue." };

  const funding = normalizeCardFunding(card.funding);
  const cardCountry = card.country?.toUpperCase() ?? null;
  const current = calculateCardCharge({ cardCountry, funding, invoicePrincipalCents, surchargeBps, surchargeEnabled });
  if (
    current.grossChargeCents !== review.total_charge_cents
    || current.surchargeCents !== review.surcharge_cents
    || funding !== review.card_funding_type
    || card.brand !== review.card_brand
    || cardCountry !== review.card_country
  ) {
    await supabase.from("invoice_checkout_sessions").update({ status: "cancelled" }).eq("id", reviewId).eq("invoice_id", invoiceId).eq("status", "open")
      .is("stripe_payment_intent_id", null).is("submitted_at", null);
    return { ok: false, message: "The card review changed. Please review the payment amount again." };
  }

  const submittedAt = new Date().toISOString();
  const claim = await supabase
    .from("invoice_checkout_sessions")
    .update({ status: "creating", submitted_at: submittedAt })
    .eq("id", reviewId)
    .eq("invoice_id", invoiceId)
    .eq("payment_channel", "card")
    .eq("stripe_confirmation_token_id", review.stripe_confirmation_token_id)
    .eq("reviewed_at", review.reviewed_at)
    .eq("invoice_principal_cents", review.invoice_principal_cents)
    .eq("surcharge_cents", review.surcharge_cents)
    .eq("total_charge_cents", review.total_charge_cents)
    .is("stripe_checkout_session_id", null).is("stripe_payment_intent_id", null).is("submitted_at", null)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!confirmsCheckoutRow(claim, reviewId)) {
    return { ok: false, message: "This payment is already being submitted. Please wait for its status to update." };
  }

  const metadata = compactMetadata({
    ...(firewoodPolicy?{firewood_source_id:firewoodPolicy.sourceId,firewood_order_id:firewoodPolicy.orderId,receipt_authority:"crm"}:{}),
    checkout_reservation_id: reviewId,
    customer_id: review.customer_id ?? "",
    invoice_id: invoiceId,
    invoice_number: invoiceNumber ?? "",
    organization_id: review.organization_id ?? "",
    payment_channel: "card",
  });

  let knownPaymentIntentId: string | null = null;
  try {
    const lineItems: Stripe.PaymentIntentCreateParams.AmountDetails.LineItem[] = [
      { product_name: `Invoice ${invoiceNumber ?? "payment"}`, quantity: 1, unit_cost: invoicePrincipalCents },
    ];
    const dedicatedSurcharge=firewoodSurchargeFields(firewoodPolicy,current.surchargeCents);
    if (current.surchargeCents > 0 && !dedicatedSurcharge) {
      lineItems.push({ product_name: "Credit-card surcharge", quantity: 1, unit_cost: current.surchargeCents });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: current.grossChargeCents,
      amount_details: { enforce_arithmetic_validation: true, line_items: lineItems,...(dedicatedSurcharge?{surcharge:dedicatedSurcharge}:{}) },
      confirm: true,
      confirmation_token: confirmationToken.id,
      currency: "usd",
      description: `Angel Tree Services invoice ${invoiceNumber ?? invoiceId}`,
      metadata,
      ...(firewoodPolicy?{allowed_payment_method_types:["card"]}:{payment_method_types:["card"]}),
      ...(firewoodPolicy?{}:{receipt_email:billingEmail||undefined}),
      return_url: `${portalUrl}?payment=processing`,
      use_stripe_sdk: true,
    }, { idempotencyKey: `angel-tree-card-confirm-${reviewId}`,...(firewoodPolicy?{apiVersion:"2026-03-25.preview" as Stripe.LatestApiVersion}:{}) });

    if (!paymentIntent || typeof paymentIntent.id !== "string" || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntent.id)
      || !cardIntentMatches(paymentIntent, { ...review, stripe_payment_intent_id: paymentIntent.id }, livemode)) {
      throw new Error("card_intent_binding_unconfirmed");
    }
    knownPaymentIntentId = paymentIntent.id;
    if(firewoodPolicy){const surcharge=(paymentIntent.amount_details as unknown as {surcharge?:{amount?:number;status?:string;maximum_amount?:number}})?.surcharge;if(current.surchargeCents>0?(surcharge?.amount!==current.surchargeCents||surcharge.status!=="available"||!Number.isSafeInteger(surcharge.maximum_amount)||surcharge.maximum_amount!<current.surchargeCents):(surcharge?.amount!=null&&surcharge.amount!==0))throw Error("firewood_surcharge_reporting_unconfirmed");}
    if (!["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "succeeded", "canceled"].includes(paymentIntent.status)
      || !Number.isSafeInteger(paymentIntent.amount_received) || paymentIntent.amount_received < 0 || paymentIntent.amount_received > paymentIntent.amount
      || (paymentIntent.client_secret !== null && (typeof paymentIntent.client_secret !== "string"
        || !paymentIntent.client_secret.startsWith(`${paymentIntent.id}_secret_`) || paymentIntent.client_secret.length <= paymentIntent.id.length + 8))) {
      throw new Error("card_intent_response_unconfirmed");
    }

    const authorizedAt = ["processing", "requires_capture", "succeeded"].includes(paymentIntent.status) ? new Date().toISOString() : null;
    const processingExpiresAt = cardIntentCanExpire(paymentIntent.status)
      ? new Date(Date.now() + cardAuthenticationLifetimeMs).toISOString()
      : null;
    const saved = await supabase.from("invoice_checkout_sessions").update({
      authorized_at: authorizedAt,
      processing_expires_at: processingExpiresAt,
      // Even an immediately succeeded intent remains reserved until its webhook
      // writes the payment and reconciles the invoice balance.
      status: "processing",
      stripe_payment_intent_id: paymentIntent.id,
    }).eq("id", reviewId).eq("invoice_id", invoiceId).eq("status", "creating")
      .eq("submitted_at", submittedAt).eq("stripe_confirmation_token_id", review.stripe_confirmation_token_id)
      .is("stripe_payment_intent_id", null).select("id").maybeSingle();
    if (!confirmsCheckoutRow(saved, reviewId)) throw new Error("card_intent_save_unconfirmed");

    return { ok: true, clientSecret: paymentIntent.client_secret, status: paymentIntent.status };
  } catch (error) {
    const paymentIntentId = knownPaymentIntentId ?? getPaymentIntentIdFromError(error);
    // A timeout or failed local write can follow a successful remote charge.
    // Keep the collection guard until webhook/authoritative reconciliation.
    if (typeof paymentIntentId === "string" && /^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) await supabase.from("invoice_checkout_sessions")
      .update({ stripe_payment_intent_id: paymentIntentId }).eq("id", reviewId).eq("invoice_id", invoiceId)
      .eq("status", "creating").eq("submitted_at", submittedAt).is("stripe_payment_intent_id", null);
    console.error("Stripe card confirmation failed", safeStripeError(error));
    return { ok: false, message: "Your payment confirmation is not yet verified. Please wait for its status to update before trying again." };
  }
}

function isCardConfirmationReservation(value: unknown): value is CardConfirmationReservation {
  if (!isClosableReservation(value)) return false;
  const row = value as CardConfirmationReservation;
  return isCheckoutContractingParty(row)
    && typeof row.stripe_confirmation_token_id === "string" && /^ctoken_[a-zA-Z0-9]+$/.test(row.stripe_confirmation_token_id)
    && Number.isSafeInteger(row.invoice_principal_cents) && row.invoice_principal_cents > 0
    && Number.isSafeInteger(row.surcharge_cents) && row.surcharge_cents >= 0
    && row.total_charge_cents === row.invoice_principal_cents + row.surcharge_cents
    && typeof row.card_brand === "string" && row.card_brand.length > 0
    && (row.card_country === null || typeof row.card_country === "string")
    && ["credit", "debit", "prepaid", "unknown"].includes(row.card_funding_type)
    && typeof row.reviewed_at === "string";
}

type CardCleanupInput = {
  invoiceId: string;
  stripe: Stripe;
  livemode: boolean;
  supabase: SupabaseClient<any, "public", any>;
};
type StaleCardReservation = ClosableReservation & { processing_expires_at: string };

export async function releaseStaleCardReservations(input: CardCleanupInput): Promise<{ ok: true } | { ok: false }> {
  try { return await releaseStaleCardReservationsCommand(input); }
  catch (error) {
    console.error("Stripe card reservation cleanup was not confirmed", safeStripeError(error));
    return { ok: false };
  }
}

async function releaseStaleCardReservationsCommand({
  invoiceId,
  stripe,
  supabase,
  livemode,
}: CardCleanupInput): Promise<{ ok: true } | { ok: false }> {
  const budget = createCheckoutBudget();
  const nowIso = new Date().toISOString();
  const stale = await budget.run(() => supabase
    .from("invoice_checkout_sessions")
    .select(`${closableReservationColumns}, processing_expires_at`)
    .eq("invoice_id", invoiceId)
    .eq("payment_channel", "card")
    .in("status", ["creating", "open", "processing"])
    .lte("processing_expires_at", nowIso));
  if (stale?.error !== null || !Array.isArray(stale.data)
    || !stale.data.every(row => isStaleCardReservation(row) && row.invoice_id === invoiceId
      && row.payment_channel === "card" && ["creating", "open", "processing"].includes(row.status))
    || new Set(stale.data.map(row => row.id)).size !== stale.data.length) return { ok: false };

  // Validate the whole invoice-bound list before cancelling any remote intent.
  for (const reservation of stale.data as StaleCardReservation[]) {
    if (!reservationIsStale(reservation.processing_expires_at)) continue;
    const paymentIntentId = reservation.stripe_payment_intent_id as string | null;
    if (!paymentIntentId) {
      // Only an unsubmitted open card review is proven to have no remote intent.
      // A stale creating/processing row may still have an in-flight request.
      if (reservation.status !== "open" || reservation.submitted_at !== null) return { ok: false };
      const expired = await expireCardReservation(supabase, reservation, nowIso, budget);
      if (!expired) return { ok: false };
      continue;
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await budget.run(() => stripe.paymentIntents.retrieve(paymentIntentId, {}, budget.requestOptions()));
    } catch (error) {
      console.error("Stripe card reservation status lookup failed", safeStripeError(error));
      return { ok: false };
    }

    if (!cardIntentMatches(paymentIntent, reservation, livemode)) return { ok: false };
    if (cardIntentMustRemainReserved(paymentIntent.status)) continue;
    if (!cardIntentCanExpire(paymentIntent.status) || paymentIntent.amount_received !== 0) return { ok: false };

    if (paymentIntent.status !== "canceled") {
      try {
        paymentIntent = await budget.run(() => stripe.paymentIntents.cancel(paymentIntent.id, {}, budget.requestOptions()));
      } catch (error) {
        // A success webhook may race cleanup. Re-read before deciding whether
        // the local reservation can be released.
        try {
          paymentIntent = await budget.run(() => stripe.paymentIntents.retrieve(paymentIntent.id, {}, budget.requestOptions()));
        } catch (lookupError) {
          console.error("Stripe card reservation cancellation check failed", safeStripeError(lookupError));
          return { ok: false };
        }
      }
    }

    if (!cardIntentMatches(paymentIntent, reservation, livemode) || paymentIntent.amount_received !== 0) return { ok: false };
    if (paymentIntent.status !== "canceled") {
      if (cardIntentMustRemainReserved(paymentIntent.status)) continue;
      return { ok: false };
    }
    const expired = await expireCardReservation(supabase, reservation, nowIso, budget);
    if (!expired) return { ok: false };
  }

  return { ok: true };
}

function isStaleCardReservation(value: unknown): value is StaleCardReservation {
  if (!isClosableReservation(value)) return false;
  const row = value as StaleCardReservation;
  return row.stripe_checkout_session_id === null
    && (row.stripe_payment_intent_id === null || /^pi_[a-zA-Z0-9]+$/.test(row.stripe_payment_intent_id))
    && (row.submitted_at === null || Number.isFinite(Date.parse(row.submitted_at)))
    && typeof row.processing_expires_at === "string" && Number.isFinite(Date.parse(row.processing_expires_at));
}

async function expireCardReservation(
  supabase: SupabaseClient<any, "public", any>,
  reservation: StaleCardReservation,
  nowIso: string,
  budget: ReturnType<typeof createCheckoutBudget>,
) {
  let query = supabase
    .from("invoice_checkout_sessions")
    .update({ status: "expired" })
    .eq("id", reservation.id)
    .eq("invoice_id", reservation.invoice_id)
    .eq("payment_channel", "card")
    .eq("status", reservation.status)
    .eq("total_charge_cents", reservation.total_charge_cents).eq("currency", reservation.currency)
    .eq("processing_expires_at", reservation.processing_expires_at)
    .lte("processing_expires_at", nowIso);
  for (const column of ["stripe_checkout_session_id", "stripe_payment_intent_id", "submitted_at"] as const) {
    query = reservation[column] === null ? query.is(column, null) : query.eq(column, reservation[column]);
  }
  const result = await budget.run(() => query.select("id").maybeSingle());
  return confirmsCheckoutRow(result, reservation.id);
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
