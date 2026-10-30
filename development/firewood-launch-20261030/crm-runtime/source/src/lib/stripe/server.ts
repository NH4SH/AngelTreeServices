import "server-only";

import Stripe from "stripe";
import { createHash } from "node:crypto";
import { getCanonicalAppBaseUrl } from "@/lib/security/app-base-url";

type StripeServerConfig =
  | { configured: true; appBaseUrl: string; stripe: Stripe; livemode: boolean }
  | { configured: false; appBaseUrl: null; stripe: null; error: string };

let stripeClient: Stripe | null = null;
const clientKeyFingerprints = new WeakMap<Stripe, string>();
const fingerprint = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

// Provenance of this exact constructed client, never a supplied key or an
// assumption about a previously cached client's current environment.
export function getStripeClientKeyFingerprint(client: Stripe): string | null {
  return clientKeyFingerprints.get(client) ?? null;
}

export function getStripeServerConfig(): StripeServerConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appBaseUrl = getCanonicalAppBaseUrl();

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
    clientKeyFingerprints.set(stripeClient, fingerprint(secretKey));
  } else if (clientKeyFingerprints.get(stripeClient) !== fingerprint(secretKey)) {
    return { configured: false, appBaseUrl: null, stripe: null,
      error: "Stripe configuration changed. A reviewed server restart is required." };
  }

  return { configured: true, appBaseUrl, stripe: stripeClient, livemode: /^(sk|rk)_live_/.test(secretKey) };
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
