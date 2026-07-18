import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { OnlinePortalPaymentMethod } from "@/lib/payments/portal-methods";

type CheckoutReservation = {
  amount_cents: number;
  checkout_url: string | null;
  created_at: string;
  currency: string;
  expires_at: string | null;
  id: string;
  payment_method: OnlinePortalPaymentMethod;
  status: "creating" | "open" | "completed" | "expired" | "failed" | "cancelled" | "processing";
  stripe_checkout_session_id: string | null;
};

type CheckoutInput = {
  amountCents: number;
  currency?: string;
  customerId: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  organizationId?: string | null;
  paymentMethod: OnlinePortalPaymentMethod;
  portalUrl: string;
  serviceLocationId?: string | null;
  stripe: Stripe;
  supabase: SupabaseClient<any, "public", any>;
};

type CheckoutResult =
  | { ok: true; url: string; reused: boolean }
  | { ok: false; message: string };

type CheckoutCancellationResult =
  | { ok: true }
  | { ok: false; message: string };

const reservationTimeoutMs = 5 * 60 * 1000;

export async function createOrReuseInvoiceCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const currency = (input.currency ?? "usd").toLowerCase();
  const reservationResult = await reserveCheckout(
    input.supabase,
    input.invoiceId,
    input.customerId,
    input.organizationId ?? null,
    input.amountCents,
    currency,
    input.paymentMethod,
  );

  if (!reservationResult.ok) {
    return reservationResult;
  }

  const reservation = reservationResult.reservation;
  if (reservation.amount_cents !== input.amountCents || reservation.payment_method !== input.paymentMethod) {
    await expireReservation(input.supabase, input.stripe, reservation);
    return createOrReuseInvoiceCheckout(input);
  }

  if (reservation.status === "open" && reservation.stripe_checkout_session_id) {
    try {
      const remoteSession = await input.stripe.checkout.sessions.retrieve(reservation.stripe_checkout_session_id);
      if (remoteSession.status === "open" && remoteSession.url && isFuture(reservation.expires_at)) {
        return { ok: true, reused: true, url: remoteSession.url };
      }

      await input.supabase
        .from("invoice_checkout_sessions")
        .update({ status: remoteSession.status === "expired" ? "expired" : "completed" })
        .eq("id", reservation.id)
        .eq("status", "open");
      return createOrReuseInvoiceCheckout(input);
    } catch (error) {
      console.error("Stripe Checkout session retrieval failed", error);
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }
  }

  if (reservation.status !== "creating") {
    return { ok: false, message: "A new payment checkout could not be prepared. Please try again." };
  }

  try {
    const metadata = compactMetadata({
      customer_id: input.customerId ?? "",
      invoice_id: input.invoiceId,
      invoice_number: input.invoiceNumber ?? "",
      organization_id: input.organizationId ?? "",
      payment_preference: input.paymentMethod,
      service_location_id: input.serviceLocationId ?? "",
    });
    const session = await input.stripe.checkout.sessions.create(
      {
        cancel_url: `${input.portalUrl}?payment=cancelled`,
        client_reference_id: input.invoiceId,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: `Angel Tree Services invoice ${input.invoiceNumber ?? ""}`.trim() },
              unit_amount: reservation.amount_cents,
            },
            quantity: 1,
          },
        ],
        metadata,
        mode: "payment",
        payment_intent_data: { metadata },
        payment_method_types: input.paymentMethod === "ach" ? ["us_bank_account"] : ["card"],
        success_url: `${input.portalUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      },
      { idempotencyKey: `angel-tree-invoice-checkout-${reservation.id}` },
    );

    if (!session.url) {
      await input.supabase.from("invoice_checkout_sessions").update({ status: "failed" }).eq("id", reservation.id);
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }

    const { error } = await input.supabase
      .from("invoice_checkout_sessions")
      .update({
        checkout_url: session.url,
        expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        status: "open",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: getStripeId(session.payment_intent),
      })
      .eq("id", reservation.id)
      .eq("status", "creating");

    if (error) {
      console.error("Stripe Checkout reservation update failed", error);
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }

    return { ok: true, reused: false, url: session.url };
  } catch (error) {
    console.error("Stripe Checkout creation failed", error);
    await input.supabase.from("invoice_checkout_sessions").update({ status: "failed" }).eq("id", reservation.id);
    return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
  }
}

async function reserveCheckout(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
  customerId: string | null,
  organizationId: string | null,
  amountCents: number,
  currency: string,
  paymentMethod: OnlinePortalPaymentMethod,
): Promise<{ ok: true; reservation: CheckoutReservation } | { ok: false; message: string }> {
  const { data: active, error: activeError } = await supabase
    .from("invoice_checkout_sessions")
    .select("id, amount_cents, checkout_url, created_at, currency, expires_at, payment_method, status, stripe_checkout_session_id")
    .eq("invoice_id", invoiceId)
    .in("status", ["creating", "open"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    console.error("Stripe Checkout reservation lookup failed", activeError);
    return { ok: false, message: "A secure payment checkout could not be prepared. Please try again." };
  }

  if (active) {
    const reservation = active as CheckoutReservation;
    if (reservation.status === "creating" && Date.now() - new Date(reservation.created_at).getTime() > reservationTimeoutMs) {
      await supabase.from("invoice_checkout_sessions").update({ status: "failed" }).eq("id", reservation.id).eq("status", "creating");
      return reserveCheckout(supabase, invoiceId, customerId, organizationId, amountCents, currency, paymentMethod);
    }

    return { ok: true, reservation };
  }

  const { data, error } = await supabase
    .from("invoice_checkout_sessions")
    .insert({
      amount_cents: amountCents,
      currency,
      customer_id: customerId,
      organization_id: organizationId,
      invoice_id: invoiceId,
      payment_method: paymentMethod,
      status: "creating",
    })
    .select("id, amount_cents, checkout_url, created_at, currency, expires_at, payment_method, status, stripe_checkout_session_id")
    .single();

  if (!error && data) {
    return { ok: true, reservation: data as CheckoutReservation };
  }

  if (error?.code === "23505") {
    return reserveCheckout(supabase, invoiceId, customerId, organizationId, amountCents, currency, paymentMethod);
  }

  console.error("Stripe Checkout reservation failed", error);
  return { ok: false, message: "A secure payment checkout could not be prepared. Please try again." };
}

async function expireReservation(
  supabase: SupabaseClient<any, "public", any>,
  stripe: Stripe,
  reservation: CheckoutReservation,
) {
  if (reservation.stripe_checkout_session_id) {
    try {
      await stripe.checkout.sessions.expire(reservation.stripe_checkout_session_id);
    } catch (error) {
      console.error("Stripe Checkout session expiry failed", error);
    }
  }

  await supabase
    .from("invoice_checkout_sessions")
    .update({ status: "cancelled" })
    .eq("id", reservation.id)
    .in("status", ["creating", "open"]);
}

export async function cancelOutstandingInvoiceCheckouts({
  invoiceId,
  stripe,
  supabase,
}: {
  invoiceId: string;
  stripe: Stripe | null;
  supabase: SupabaseClient<any, "public", any>;
}): Promise<CheckoutCancellationResult> {
  const { data: sessions, error } = await supabase
    .from("invoice_checkout_sessions")
    .select("id, stripe_checkout_session_id")
    .eq("invoice_id", invoiceId)
    .in("status", ["creating", "open", "processing"]);

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!sessions?.length) {
    return { ok: true };
  }

  if (!stripe) {
    return { ok: false, message: "Stripe must be configured before voiding an invoice with an active customer checkout." };
  }

  for (const session of sessions) {
    if (session.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(session.stripe_checkout_session_id);
      } catch (error) {
        console.error("Stripe Checkout session void expiry failed", error);
        return { ok: false, message: "Could not close the active customer checkout before voiding this invoice." };
      }
    }
  }

  const { error: updateError } = await supabase
    .from("invoice_checkout_sessions")
    .update({ status: "cancelled" })
    .eq("invoice_id", invoiceId)
    .in("status", ["creating", "open", "processing"]);

  return updateError ? { ok: false, message: updateError.message } : { ok: true };
}

function compactMetadata(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value)));
}

function getStripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function isFuture(expiresAt: string | null) {
  return !expiresAt || new Date(expiresAt).getTime() > Date.now();
}
