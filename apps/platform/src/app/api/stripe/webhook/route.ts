import Stripe from "stripe";
import { recordActivity } from "@/lib/activity-log";
import { allocateRefund, normalizeCardFunding } from "@/lib/payments/card-surcharge";
import { reconcileInvoiceBalance } from "@/lib/payments/reconciliation";
import { getStripeServerConfig, getStripeWebhookSecret } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getStripeServerConfig();
  const webhookSecret = getStripeWebhookSecret();
  const signature = request.headers.get("stripe-signature");
  if (!config.configured || !webhookSecret || !signature) return new Response("Webhook configuration unavailable.", { status: 400 });

  let event: Stripe.Event;
  try {
    event = config.stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    const receipt = await claimWebhookEvent(event);
    if (receipt.duplicate) return Response.json({ received: true });

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(config.stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_succeeded":
        await reconcileSuccessfulCheckout(config.stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        await markCheckoutFailed(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        await markPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.processing":
        await markPaymentIntentProcessing(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.succeeded":
        await reconcileSuccessfulPaymentIntent(config.stripe, event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await reconcileRefund(event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
      case "charge.dispute.closed":
        await recordDispute(event.data.object as Stripe.Dispute, event.type);
        break;
      default:
        break;
    }
    await completeWebhookEvent(event.id, receipt.tracked);
  } catch (error) {
    await releaseWebhookEvent(event.id);
    console.error("Stripe webhook handling failed", { eventId: event.id, eventType: event.type, error });
    return new Response("Webhook handler failed.", { status: 500 });
  }
  return Response.json({ received: true });
}

type CheckoutRecord = {
  card_brand: string | null;
  card_funding_type: "credit" | "debit" | "prepaid" | "unknown" | null;
  id: string;
  invoice_id: string;
  customer_id: string | null;
  organization_id: string | null;
  invoice_principal_cents: number;
  surcharge_cents: number;
  total_charge_cents: number;
  currency: string;
  payment_channel: "ach" | "card";
  stripe_confirmation_token_id: string | null;
  submitted_at: string | null;
};

async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.payment_status === "paid") {
    await reconcileSuccessfulCheckout(stripe, session);
    return;
  }
  const checkout = await getCheckout(session.id);
  if (!checkout || checkout.payment_channel !== "ach") return;
  await upsertStripePayment(checkout, session, null, "pending");
  const submittedAt = checkout.submitted_at ?? new Date(session.created * 1000).toISOString();
  const { error } = await requireServiceRoleClient().from("invoice_checkout_sessions")
    .update({ authorized_at: submittedAt, status: "processing", stripe_payment_intent_id: getStripeId(session.payment_intent), submitted_at: submittedAt })
    .eq("id", checkout.id).in("status", ["creating", "open"]);
  if (error) throw new Error(error.message);
}

async function reconcileSuccessfulCheckout(stripe: Stripe, eventSession: Stripe.Checkout.Session) {
  const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["payment_intent.latest_charge.balance_transaction"],
  });
  if (session.payment_status !== "paid") return;
  const checkout = await getCheckout(session.id);
  if (!checkout || checkout.invoice_id !== session.metadata?.invoice_id || !session.amount_total || !session.currency) {
    throw new Error("Stripe Checkout session was not created by this platform.");
  }
  if (checkout.total_charge_cents !== session.amount_total || checkout.currency.toLowerCase() !== session.currency.toLowerCase()) {
    throw new Error("Stripe Checkout session did not match its reserved invoice payment.");
  }

  const paymentIntent = getStripeObject(session.payment_intent);
  const charge = paymentIntent && typeof paymentIntent !== "string" ? getStripeObject(paymentIntent.latest_charge) : null;
  const inserted = await upsertStripePayment(checkout, session, charge, "succeeded");
  const supabase = requireServiceRoleClient();
  const { error } = await supabase.from("invoice_checkout_sessions").update({
    completed_at: new Date().toISOString(),
    status: "completed",
    stripe_payment_intent_id: getStripeId(session.payment_intent),
  }).eq("id", checkout.id);
  if (error) throw new Error(error.message);
  const reconciliation = await reconcileInvoiceBalance(supabase, checkout.invoice_id);
  if (!reconciliation.ok) throw new Error(reconciliation.message);
  if (inserted) {
    await recordActivity(supabase, {
      eventType: "stripe_payment_recorded",
      metadata: {
        invoice_principal_cents: checkout.invoice_principal_cents,
        payment_channel: checkout.payment_channel,
        surcharge_cents: checkout.surcharge_cents,
        total_collected_cents: checkout.total_charge_cents,
      },
      subjectId: checkout.invoice_id,
      subjectType: "invoice",
    });
  }
}

async function getCheckout(sessionId: string): Promise<CheckoutRecord | null> {
  const { data, error } = await requireServiceRoleClient().from("invoice_checkout_sessions")
    .select("id, invoice_id, customer_id, organization_id, invoice_principal_cents, surcharge_cents, total_charge_cents, currency, payment_channel, stripe_confirmation_token_id, submitted_at")
    .eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CheckoutRecord | null;
}

async function upsertStripePayment(checkout: CheckoutRecord, session: Stripe.Checkout.Session, charge: Stripe.Charge | null, status: "pending" | "succeeded") {
  const supabase = requireServiceRoleClient();
  const balanceTransaction = charge ? getStripeObject(charge.balance_transaction) : null;
  const card = charge?.payment_method_details?.card;
  const funding = card?.funding && ["credit", "debit", "prepaid"].includes(card.funding) ? card.funding : card ? "unknown" : null;
  const submittedAt = checkout.submitted_at ?? new Date(session.created * 1000).toISOString();
  const values = {
    amount_cents: checkout.invoice_principal_cents,
    authorized_at: submittedAt,
    card_brand: card?.brand ?? null,
    card_funding_type: funding,
    currency: checkout.currency.toLowerCase(),
    customer_id: checkout.customer_id,
    failed_at: null,
    invoice_id: checkout.invoice_id,
    net_received_cents: balanceTransaction && typeof balanceTransaction !== "string" ? balanceTransaction.net : null,
    organization_id: checkout.organization_id,
    paid_at: status === "succeeded" ? new Date().toISOString() : null,
    payment_method: checkout.payment_channel,
    provider: "stripe",
    provider_charge_id: getStripeId(charge),
    provider_checkout_session_id: session.id,
    provider_payment_id: getStripeId(session.payment_intent),
    status,
    submitted_at: submittedAt,
    succeeded_at: status === "succeeded" ? new Date().toISOString() : null,
    stripe_fee_cents: balanceTransaction && typeof balanceTransaction !== "string" ? balanceTransaction.fee : null,
    surcharge_cents: checkout.surcharge_cents,
    total_collected_cents: checkout.total_charge_cents,
  };
  const { data: existing, error: lookupError } = await supabase.from("payments").select("id")
    .eq("provider_checkout_session_id", session.id).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) {
    const { error } = await supabase.from("payments").update(values).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase.from("payments").insert(values);
  if (error?.code === "23505") return false;
  if (error) throw new Error(error.message);
  return true;
}

async function markCheckoutFailed(session: Stripe.Checkout.Session) {
  const supabase = requireServiceRoleClient();
  const failedAt = new Date().toISOString();
  await supabase.from("invoice_checkout_sessions").update({ failed_at: failedAt, status: "failed" })
    .eq("stripe_checkout_session_id", session.id).in("status", ["creating", "open", "processing"]);
  await supabase.from("payments").update({ failed_at: failedAt, status: "failed" })
    .eq("provider_checkout_session_id", session.id).eq("status", "pending");
}

async function markPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = requireServiceRoleClient();
  const failedAt = new Date().toISOString();
  if (paymentIntent.metadata.payment_channel !== "card") {
    await supabase.from("invoice_checkout_sessions").update({ failed_at: failedAt, status: "failed" })
      .eq("stripe_payment_intent_id", paymentIntent.id).in("status", ["creating", "open", "processing"]);
    await supabase.from("payments").update({ failed_at: failedAt, status: "failed" })
      .eq("provider_payment_id", paymentIntent.id).eq("status", "pending");
    return;
  }
  const reservation = await getCardCheckoutForPaymentIntent(paymentIntent);
  if (!reservation) return;
  await supabase.from("invoice_checkout_sessions").update({ failed_at: failedAt, status: "failed" })
    .eq("id", reservation.id).in("status", ["creating", "open", "processing"]);
  await upsertFailedPaymentIntentPayment(reservation, paymentIntent, failedAt);
}

async function markPaymentIntentProcessing(paymentIntent: Stripe.PaymentIntent) {
  if (paymentIntent.metadata.payment_channel !== "card") {
    await requireServiceRoleClient().from("invoice_checkout_sessions").update({
      authorized_at: new Date().toISOString(),
      status: "processing",
    }).eq("stripe_payment_intent_id", paymentIntent.id).in("status", ["creating", "open"]);
    return;
  }
  const reservation = await getCardCheckoutForPaymentIntent(paymentIntent);
  if (!reservation) return;
  await requireServiceRoleClient().from("invoice_checkout_sessions").update({
    authorized_at: new Date().toISOString(),
    status: "processing",
    stripe_payment_intent_id: paymentIntent.id,
  }).eq("id", reservation.id).in("status", ["creating", "open"]);
}

async function reconcileSuccessfulPaymentIntent(stripe: Stripe, eventPaymentIntent: Stripe.PaymentIntent) {
  // Hosted ACH Checkout is reconciled from Checkout session events because
  // those events carry the authoritative session reservation.
  if (eventPaymentIntent.metadata.payment_channel !== "card") return;
  const paymentIntent = await stripe.paymentIntents.retrieve(eventPaymentIntent.id, {
    expand: ["latest_charge.balance_transaction"],
  });
  if (paymentIntent.status !== "succeeded") return;

  const supabase = requireServiceRoleClient();
  const reservation = await getCardCheckoutForPaymentIntent(paymentIntent);
  // Hosted Checkout has its own authoritative session events. This handler is
  // only for the two-step ConfirmationToken card flow.
  if (!reservation?.stripe_confirmation_token_id || reservation.payment_channel !== "card") return;
  if (
    reservation.invoice_id !== paymentIntent.metadata.invoice_id
    || reservation.total_charge_cents !== paymentIntent.amount_received
    || reservation.currency.toLowerCase() !== paymentIntent.currency.toLowerCase()
  ) {
    throw new Error("Stripe PaymentIntent did not match its reserved invoice payment.");
  }

  const charge = getStripeObject(paymentIntent.latest_charge);
  const inserted = await upsertPaymentIntentPayment(reservation, paymentIntent, charge);
  const completedAt = new Date().toISOString();
  const { error: updateError } = await supabase.from("invoice_checkout_sessions").update({
    authorized_at: completedAt,
    completed_at: completedAt,
    status: "completed",
    stripe_payment_intent_id: paymentIntent.id,
  }).eq("id", reservation.id);
  if (updateError) throw new Error(updateError.message);

  const reconciliation = await reconcileInvoiceBalance(supabase, reservation.invoice_id);
  if (!reconciliation.ok) throw new Error(reconciliation.message);
  if (inserted) {
    await recordActivity(supabase, {
      eventType: "stripe_payment_recorded",
      metadata: {
        invoice_principal_cents: reservation.invoice_principal_cents,
        payment_channel: "card",
        surcharge_cents: reservation.surcharge_cents,
        total_collected_cents: reservation.total_charge_cents,
      },
      subjectId: reservation.invoice_id,
      subjectType: "invoice",
    });
  }
}

async function getCardCheckoutForPaymentIntent(paymentIntent: Stripe.PaymentIntent): Promise<CheckoutRecord | null> {
  const reservationId = paymentIntent.metadata.checkout_reservation_id;
  const invoiceId = paymentIntent.metadata.invoice_id;
  if (!reservationId || !invoiceId) throw new Error("Stripe PaymentIntent is missing platform metadata.");
  const { data, error } = await requireServiceRoleClient().from("invoice_checkout_sessions")
    .select("id, invoice_id, customer_id, organization_id, invoice_principal_cents, surcharge_cents, total_charge_cents, currency, payment_channel, stripe_confirmation_token_id, submitted_at, card_brand, card_funding_type")
    .eq("id", reservationId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const reservation = data as CheckoutRecord | null;
  if (!reservation?.stripe_confirmation_token_id || reservation.payment_channel !== "card") {
    throw new Error("Stripe PaymentIntent was not created by the card review flow.");
  }
  return reservation;
}

async function upsertFailedPaymentIntentPayment(checkout: CheckoutRecord, paymentIntent: Stripe.PaymentIntent, failedAt: string) {
  const supabase = requireServiceRoleClient();
  const values = {
    amount_cents: checkout.invoice_principal_cents,
    card_brand: checkout.card_brand,
    card_funding_type: checkout.card_funding_type,
    currency: checkout.currency.toLowerCase(),
    customer_id: checkout.customer_id,
    failed_at: failedAt,
    invoice_id: checkout.invoice_id,
    organization_id: checkout.organization_id,
    payment_method: "card",
    provider: "stripe",
    provider_payment_id: paymentIntent.id,
    status: "failed",
    submitted_at: checkout.submitted_at ?? failedAt,
    surcharge_cents: checkout.surcharge_cents,
    total_collected_cents: checkout.total_charge_cents,
  };
  const existing = await supabase.from("payments").select("id").eq("provider_payment_id", paymentIntent.id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const updated = await supabase.from("payments").update(values).eq("id", existing.data.id);
    if (updated.error) throw new Error(updated.error.message);
    return;
  }
  const inserted = await supabase.from("payments").insert(values);
  if (inserted.error?.code !== "23505" && inserted.error) throw new Error(inserted.error.message);
}

async function upsertPaymentIntentPayment(checkout: CheckoutRecord, paymentIntent: Stripe.PaymentIntent, charge: Stripe.Charge | null) {
  const supabase = requireServiceRoleClient();
  const balanceTransaction = charge ? getStripeObject(charge.balance_transaction) : null;
  const card = charge?.payment_method_details?.card;
  const succeededAt = new Date().toISOString();
  const values = {
    amount_cents: checkout.invoice_principal_cents,
    authorized_at: succeededAt,
    card_brand: card?.brand ?? null,
    card_funding_type: normalizeCardFunding(card?.funding),
    currency: checkout.currency.toLowerCase(),
    customer_id: checkout.customer_id,
    failed_at: null,
    invoice_id: checkout.invoice_id,
    net_received_cents: balanceTransaction && typeof balanceTransaction !== "string" ? balanceTransaction.net : null,
    organization_id: checkout.organization_id,
    paid_at: succeededAt,
    payment_method: "card",
    provider: "stripe",
    provider_charge_id: getStripeId(charge),
    provider_checkout_session_id: null,
    provider_payment_id: paymentIntent.id,
    status: "succeeded",
    stripe_fee_cents: balanceTransaction && typeof balanceTransaction !== "string" ? balanceTransaction.fee : null,
    submitted_at: checkout.submitted_at ?? succeededAt,
    succeeded_at: succeededAt,
    surcharge_cents: checkout.surcharge_cents,
    total_collected_cents: checkout.total_charge_cents,
  };
  const existing = await supabase.from("payments").select("id").eq("provider_payment_id", paymentIntent.id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const { error } = await supabase.from("payments").update(values).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return false;
  }
  const inserted = await supabase.from("payments").insert(values);
  if (inserted.error?.code === "23505") return false;
  if (inserted.error) throw new Error(inserted.error.message);
  return true;
}

async function reconcileRefund(charge: Stripe.Charge) {
  const supabase = requireServiceRoleClient();
  const { data: payment, error } = await supabase.from("payments")
    .select("id, invoice_id, amount_cents, surcharge_cents, total_collected_cents")
    .eq("provider_charge_id", charge.id).maybeSingle();
  if (error) throw new Error(error.message);
  // A refund can be delivered before the corresponding success event. Returning
  // an error asks Stripe to retry instead of permanently losing the refund.
  if (!payment) throw new Error("Stripe refund arrived before its CRM payment record.");
  const totalRefunded = Math.min(charge.amount_refunded, Number(payment.total_collected_cents));
  const { refundedPrincipalCents: principalRefunded, refundedSurchargeCents: surchargeRefunded } = allocateRefund({
    grossRefundedCents: totalRefunded,
    invoicePrincipalCents: Number(payment.amount_cents),
    surchargeCents: Number(payment.surcharge_cents),
  });
  const { error: updateError } = await supabase.from("payments").update({
    refunded_at: totalRefunded > 0 ? new Date().toISOString() : null,
    refunded_principal_cents: principalRefunded,
    refunded_surcharge_cents: surchargeRefunded,
    status: totalRefunded >= Number(payment.total_collected_cents) ? "refunded" : "succeeded",
  }).eq("id", payment.id);
  if (updateError) throw new Error(updateError.message);
  const reconciliation = await reconcileInvoiceBalance(supabase, payment.invoice_id);
  if (!reconciliation.ok) throw new Error(reconciliation.message);
}

async function recordDispute(dispute: Stripe.Dispute, eventType: string) {
  const supabase = requireServiceRoleClient();
  const chargeId = getStripeId(dispute.charge);
  if (!chargeId) return;
  const { data: payment } = await supabase.from("payments").select("id, invoice_id").eq("provider_charge_id", chargeId).maybeSingle();
  if (!payment) return;
  const { error } = await supabase.from("payments").update({
    dispute_status: dispute.status,
    disputed_at: new Date().toISOString(),
  }).eq("id", payment.id);
  if (error) throw new Error(error.message);
  await recordActivity(supabase, {
    eventType: eventType === "charge.dispute.created" ? "stripe_dispute_opened" : "stripe_dispute_updated",
    metadata: { dispute_id: dispute.id, dispute_status: dispute.status, payment_id: payment.id },
    subjectId: payment.invoice_id,
    subjectType: "invoice",
  });
}

async function claimWebhookEvent(event: Stripe.Event): Promise<{ duplicate: boolean; tracked: boolean }> {
  const { error } = await requireServiceRoleClient().from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
  });
  if (!error) return { duplicate: false, tracked: true };
  if (error.code === "23505") return { duplicate: true, tracked: true };
  // Keep the existing production route operable until the new migration is
  // deliberately applied; provider/payment uniqueness still protects money.
  if (error.code === "42P01" || error.code === "PGRST205") {
    console.warn("Stripe webhook event ledger migration is not applied yet.");
    return { duplicate: false, tracked: false };
  }
  throw new Error(error.message);
}

async function completeWebhookEvent(eventId: string, tracked: boolean) {
  if (!tracked) return;
  const { error } = await requireServiceRoleClient().from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) throw new Error(error.message);
}

async function releaseWebhookEvent(eventId: string) {
  const supabase = getServiceRoleClient();
  if (!supabase) return;
  await supabase.from("stripe_webhook_events").delete().eq("event_id", eventId).is("processed_at", null);
}

function requireServiceRoleClient() {
  const supabase = getServiceRoleClient();
  if (!supabase) throw new Error("Server configuration is unavailable for Stripe reconciliation.");
  return supabase;
}

function getStripeObject<T>(value: string | T | null) {
  return typeof value === "string" ? null : value ?? null;
}

function getStripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}
