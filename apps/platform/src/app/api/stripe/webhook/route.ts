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

  if (!config.configured || !webhookSecret || !signature) {
    return new Response("Webhook configuration unavailable.", { status: 400 });
  }

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
      case "checkout.session.async_payment_succeeded":
        await handleSuccessfulCheckout(config.stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        await markCheckoutFailed(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        await markPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
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

async function handleSuccessfulCheckout(stripe: Stripe, eventSession: Stripe.Checkout.Session) {
  const supabase = getServiceRoleClient();
  if (!supabase || !eventSession.id) {
    throw new Error("Server configuration is unavailable for Stripe payment reconciliation.");
  }

  const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["payment_intent.latest_charge"],
  });

  if (session.payment_status !== "paid") {
    return;
  }

  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId || !session.amount_total || session.amount_total <= 0 || !session.currency) {
    throw new Error("Stripe Checkout session is missing required invoice payment data.");
  }

  const { data: checkout, error: checkoutError } = await supabase
    .from("invoice_checkout_sessions")
    .select("id, invoice_id, customer_id, organization_id, amount_cents, currency, status")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (checkoutError || !checkout) {
    throw new Error("Stripe Checkout session was not created by this platform.");
  }

  if (
    checkout.invoice_id !== invoiceId ||
    Number(checkout.amount_cents) !== session.amount_total ||
    String(checkout.currency).toLowerCase() !== session.currency.toLowerCase()
  ) {
    throw new Error("Stripe Checkout session did not match its reserved invoice payment.");
  }

  const paymentIntent = getStripeObject(session.payment_intent);
  const charge = paymentIntent && typeof paymentIntent !== "string"
    ? getStripeObject(paymentIntent.latest_charge)
    : null;
  const paymentIntentId = getStripeId(session.payment_intent);
  const chargeId = getStripeId(charge);
  const { error: paymentError } = await supabase.from("payments").insert({
    amount_cents: session.amount_total,
    currency: session.currency.toLowerCase(),
    customer_id: checkout.customer_id,
    organization_id: checkout.organization_id,
    invoice_id: checkout.invoice_id,
    paid_at: new Date().toISOString(),
    payment_method: "stripe_checkout",
    provider: "stripe",
    provider_charge_id: chargeId,
    provider_checkout_session_id: session.id,
    provider_payment_id: paymentIntentId,
    status: "succeeded",
  });

  const wasInserted = !paymentError;
  if (paymentError && paymentError.code !== "23505") {
    throw new Error(paymentError.message);
  }

  const { error: checkoutUpdateError } = await supabase
    .from("invoice_checkout_sessions")
    .update({
      completed_at: new Date().toISOString(),
      status: "completed",
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", checkout.id);

  if (checkoutUpdateError) {
    throw new Error(checkoutUpdateError.message);
  }

  const reconciliation = await reconcileInvoiceBalance(supabase, checkout.invoice_id);
  if (!reconciliation.ok) {
    throw new Error(reconciliation.message);
  }

  if (wasInserted) {
    await recordActivity(supabase, {
      actorUserId: null,
      eventType: "stripe_payment_recorded",
      metadata: {
        amount_cents: session.amount_total,
        checkout_session_id: session.id,
        payment_intent_id: paymentIntentId,
      },
      subjectId: checkout.invoice_id,
      subjectType: "invoice",
    });
  }
}

async function markCheckoutFailed(session: Stripe.Checkout.Session) {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return;
  }

  await supabase
    .from("invoice_checkout_sessions")
    .update({ status: "failed" })
    .eq("stripe_checkout_session_id", session.id)
    .in("status", ["creating", "open"]);
}

async function markPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return;
  }

  await supabase
    .from("invoice_checkout_sessions")
    .update({ status: "failed" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .in("status", ["creating", "open"]);
}

function getStripeObject<T>(value: string | T | null) {
  return typeof value === "string" ? value : value ?? null;
}

function getStripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}
