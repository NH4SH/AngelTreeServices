import Stripe from "stripe";
import { recordActivity } from "@/lib/activity-log";
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
  } catch (error) {
    console.error("Stripe webhook handling failed", { eventId: event.id, eventType: event.type, error });
    return new Response("Webhook handler failed.", { status: 500 });
  }
  return Response.json({ received: true });
}

type CheckoutRecord = {
  id: string;
  invoice_id: string;
  customer_id: string | null;
  organization_id: string | null;
  invoice_principal_cents: number;
  surcharge_cents: number;
  total_charge_cents: number;
  currency: string;
  payment_channel: "ach" | "card";
};

async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.payment_status === "paid") {
    await reconcileSuccessfulCheckout(stripe, session);
    return;
  }
  const checkout = await getCheckout(session.id);
  if (!checkout || checkout.payment_channel !== "ach") return;
  await upsertStripePayment(checkout, session, null, "pending");
  const { error } = await requireServiceRoleClient().from("invoice_checkout_sessions")
    .update({ status: "processing", stripe_payment_intent_id: getStripeId(session.payment_intent) })
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
    .select("id, invoice_id, customer_id, organization_id, invoice_principal_cents, surcharge_cents, total_charge_cents, currency, payment_channel")
    .eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CheckoutRecord | null;
}

async function upsertStripePayment(checkout: CheckoutRecord, session: Stripe.Checkout.Session, charge: Stripe.Charge | null, status: "pending" | "succeeded") {
  const supabase = requireServiceRoleClient();
  const balanceTransaction = charge ? getStripeObject(charge.balance_transaction) : null;
  const card = charge?.payment_method_details?.card;
  const funding = card?.funding && ["credit", "debit", "prepaid"].includes(card.funding) ? card.funding : card ? "unknown" : null;
  const values = {
    amount_cents: checkout.invoice_principal_cents,
    card_brand: card?.brand ?? null,
    card_funding_type: funding,
    currency: checkout.currency.toLowerCase(),
    customer_id: checkout.customer_id,
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
  await supabase.from("invoice_checkout_sessions").update({ status: "failed" })
    .eq("stripe_checkout_session_id", session.id).in("status", ["creating", "open", "processing"]);
  await supabase.from("payments").update({ status: "failed" })
    .eq("provider_checkout_session_id", session.id).eq("status", "pending");
}

async function markPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = requireServiceRoleClient();
  await supabase.from("invoice_checkout_sessions").update({ status: "failed" })
    .eq("stripe_payment_intent_id", paymentIntent.id).in("status", ["creating", "open", "processing"]);
  await supabase.from("payments").update({ status: "failed" })
    .eq("provider_payment_id", paymentIntent.id).eq("status", "pending");
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
  const principalRefunded = totalRefunded >= Number(payment.total_collected_cents)
    ? Number(payment.amount_cents)
    : Math.min(Number(payment.amount_cents), Math.round(totalRefunded * Number(payment.amount_cents) / Number(payment.total_collected_cents)));
  const surchargeRefunded = Math.min(Number(payment.surcharge_cents), totalRefunded - principalRefunded);
  const { error: updateError } = await supabase.from("payments").update({
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
  await recordActivity(supabase, {
    eventType: eventType === "charge.dispute.created" ? "stripe_dispute_opened" : "stripe_dispute_updated",
    metadata: { dispute_id: dispute.id, dispute_status: dispute.status, payment_id: payment.id },
    subjectId: payment.invoice_id,
    subjectType: "invoice",
  });
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
