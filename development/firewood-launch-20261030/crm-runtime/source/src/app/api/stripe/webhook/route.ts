import { processStripeWebhook, type WebhookEnvelope } from "@/lib/payments/webhook-recovery";
import { sendWebhookNotificationEmail } from "@/lib/payments/webhook-email";
import { syncInvoicePaymentCommunications } from "@/lib/communications/queue";
import { safeWebhookLog } from "@/lib/payments/webhook-logging";
import { getStripeServerConfig, getStripeWebhookSecret } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = getStripeServerConfig(), secret = getStripeWebhookSecret(), signature = request.headers.get("stripe-signature");
  if (!config.configured || !secret || !signature) return new Response("Webhook configuration unavailable.", { status: 400 });
  let event: WebhookEnvelope;
  try {
    // Verify the original body, before any receipt, provider read or financial write.
    event = config.stripe.webhooks.constructEvent(await request.text(), signature, secret) as WebhookEnvelope;
  } catch (error) {
    console.error("Stripe webhook rejected", safeWebhookLog({ error, eventType: null, internalEventCategory: "signature" }));
    return new Response("Invalid signature.", { status: 400 });
  }
  try {
    const supabase = getServiceRoleClient();
    if (!supabase) throw new Error("Webhook storage unavailable.");
    const result = await processStripeWebhook(event, { stripe: config.stripe, livemode: config.livemode, supabase,
      sendEmail: sendWebhookNotificationEmail, syncCommunications: invoiceId => syncInvoicePaymentCommunications(supabase, invoiceId) });
    if (result.status !== "completed") return new Response("Webhook processing is not complete.", { status: 503, headers: { "Retry-After": "10" } });
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", safeWebhookLog({ error, eventType: event.type, internalEventCategory: "processing" }));
    return new Response("Webhook handler failed.", { status: 500 });
  }
}
