import "server-only";

import Stripe from "stripe";

type StripeServerConfig =
  | { configured: true; appBaseUrl: string; stripe: Stripe }
  | { configured: false; appBaseUrl: null; stripe: null; error: string };

let stripeClient: Stripe | null = null;

export function getStripeServerConfig(): StripeServerConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);

  if (!secretKey || !appBaseUrl) {
    return {
      configured: false,
      appBaseUrl: null,
      stripe: null,
      error: "Stripe Checkout is not configured.",
    };
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return { configured: true, appBaseUrl, stripe: stripeClient };
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

function normalizeBaseUrl(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}
