import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { closeCheckoutReservation, classifyCheckoutForClosure, closableReservationColumns, isClosableReservation, confirmsCheckoutRow, type ClosableReservation } from "@/lib/payments/checkout-closure";
import { achCheckoutPaymentMethodTypes } from "@/lib/payments/ach-checkout";

type CheckoutReservation = ClosableReservation & {
  amount_cents: number;
  invoice_principal_cents: number;
  checkout_url: string | null;
  created_at: string;
  currency: string;
  expires_at: string | null;
  id: string;
  payment_channel: "ach" | "card";
  status: "creating" | "open" | "processing" | "completed" | "expired" | "failed" | "cancelled";
  stripe_checkout_session_id: string | null;
};

type CheckoutInput = {
  amountCents: number;
  currency?: string;
  customerId: string | null;
  customerEmail?: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  organizationId?: string | null;
  portalUrl: string;
  serviceLocationId?: string | null;
  stripe: Stripe;
  livemode: boolean;
  supabase: SupabaseClient<any, "public", any>;
};

type CheckoutResult =
  | { ok: true; url: string; reused: boolean }
  | { ok: false; message: string };

export async function createOrReuseInvoiceCheckout(input: CheckoutInput, attempt = 0): Promise<CheckoutResult> {
  if (attempt >= 3) return { ok: false, message: "Payment state is changing. Please wait and try again." };
  const currency = (input.currency ?? "usd").toLowerCase();
  const reservationResult = await reserveCheckout(input.supabase, input.invoiceId, input.customerId, input.organizationId ?? null, input.amountCents, currency).catch(() => {
    logAchCheckoutError("checkout_reservation_unconfirmed");
    return { ok: false as const, message: "A secure payment checkout could not be prepared. Please try again." };
  });

  if (!reservationResult.ok) {
    return reservationResult;
  }

  const reservation = reservationResult.reservation;
  if (reservation.status === "processing") {
    return { ok: false, message: "A payment is already processing for this invoice." };
  }
  if (reservation.status === "creating" && reservation.payment_channel !== "ach") {
    return { ok: false, message: "A payment is already being submitted for this invoice." };
  }
  if (reservation.invoice_principal_cents !== input.amountCents || reservation.total_charge_cents !== input.amountCents
    || reservation.payment_channel !== "ach" || reservation.currency.toLowerCase() !== currency
    || reservation.customer_id !== input.customerId || reservation.organization_id !== (input.organizationId ?? null)) {
    const closed = await closeCheckoutReservation({ reservation, stripe: input.stripe, supabase: input.supabase, livemode: input.livemode, operation: "checkout_replacement", correlationId: crypto.randomUUID() });
    if (!closed.ok) return { ok: false, message: "An earlier payment needs review before another checkout can open." };
    return createOrReuseInvoiceCheckout(input, attempt + 1);
  }

  if (reservation.status === "open" && reservation.stripe_checkout_session_id) {
    try {
      const remoteSession = await input.stripe.checkout.sessions.retrieve(reservation.stripe_checkout_session_id, { expand: ["payment_intent"] });
      const state = classifyCheckoutForClosure(remoteSession, reservation, input.livemode);
      if (state === "open" && isCheckoutUrl(remoteSession.url)) {
        return { ok: true, reused: true, url: remoteSession.url };
      }
      if (state !== "expired") return { ok: false, message: "Payment is processing or needs review. Please wait for its status to update." };
      const closed = await closeCheckoutReservation({ reservation, stripe: input.stripe, supabase: input.supabase, livemode: input.livemode, operation: "checkout_replacement", correlationId: crypto.randomUUID() });
      if (!closed.ok) return { ok: false, message: "Payment status could not be verified. Please try again." };
      return createOrReuseInvoiceCheckout(input, attempt + 1);
    } catch {
      logAchCheckoutError("checkout_session_retrieval_failed");
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }
  }

  if (reservation.status !== "creating") {
    return { ok: false, message: "A new payment checkout could not be prepared. Please try again." };
  }

  try {
    const metadata = compactMetadata({
      checkout_reservation_id: reservation.id,
      customer_id: input.customerId ?? "",
      invoice_id: input.invoiceId,
      invoice_number: input.invoiceNumber ?? "",
      organization_id: input.organizationId ?? "",
      payment_channel: "ach",
      service_location_id: input.serviceLocationId ?? "",
    });
    const session = await input.stripe.checkout.sessions.create(
      {
        cancel_url: `${input.portalUrl}?payment=cancelled`,
        client_reference_id: input.invoiceId,
        customer_email: input.customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: `Angel Tree Services invoice ${input.invoiceNumber ?? ""}`.trim() },
              unit_amount: reservation.invoice_principal_cents,
            },
            quantity: 1,
          },
        ],
        metadata,
        mode: "payment",
        payment_method_types: [...achCheckoutPaymentMethodTypes],
        payment_intent_data: { metadata },
        success_url: `${input.portalUrl}?payment=processing&session_id={CHECKOUT_SESSION_ID}`,
      },
      { idempotencyKey: `angel-tree-invoice-checkout-${reservation.id}` },
    );

    if (!matchesCreatedSession(session, reservation, input.livemode)) {
      logAchCheckoutError("checkout_session_binding_unconfirmed");
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }

    if (!isCheckoutUrl(session.url)) {
      // Keep both the guard and any known provider reference for staff review.
      await input.supabase.from("invoice_checkout_sessions").update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: getStripeId(session.payment_intent),
      }).eq("id", reservation.id).eq("invoice_id", input.invoiceId).eq("status", "creating")
        .is("stripe_checkout_session_id", null).is("stripe_payment_intent_id", null).is("submitted_at", null);
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }

    const saved = await input.supabase
      .from("invoice_checkout_sessions")
      .update({
        checkout_url: session.url,
        expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        status: "open",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: getStripeId(session.payment_intent),
      })
      .eq("id", reservation.id)
      .eq("invoice_id", input.invoiceId)
      .eq("status", "creating").is("stripe_checkout_session_id", null)
      .is("stripe_payment_intent_id", null).is("submitted_at", null).select("id").maybeSingle();

    if (!confirmsCheckoutRow(saved, reservation.id)) {
      logAchCheckoutError("checkout_reservation_update_failed");
      return { ok: false, message: "A secure payment checkout could not be opened. Please try again." };
    }

    return { ok: true, reused: false, url: session.url };
  } catch {
    logAchCheckoutError("checkout_session_creation_failed");
    // Network/provider/local-write uncertainty must retain the creating guard.
    // A retry cannot safely infer that Stripe never created a session.
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
  retry = false,
): Promise<{ ok: true; reservation: CheckoutReservation } | { ok: false; message: string }> {
  const { data: active, error: activeError } = await supabase
    .from("invoice_checkout_sessions")
    .select(`${closableReservationColumns}, amount_cents, invoice_principal_cents, checkout_url, created_at, expires_at`)
    .eq("invoice_id", invoiceId)
    .in("status", ["creating", "open", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError !== null || (active !== null && (!isCheckoutReservation(active) || active.invoice_id !== invoiceId
    || !["creating", "open", "processing"].includes(active.status)))) {
    logAchCheckoutError("checkout_reservation_lookup_failed");
    return { ok: false, message: "A secure payment checkout could not be prepared. Please try again." };
  }

  if (active) {
    const reservation = active as CheckoutReservation;
    if (reservation.status === "processing") {
      return { ok: false, message: "A payment is already processing for this invoice." };
    }
    if (reservation.status === "creating") {
      return { ok: false, message: "A payment checkout is being prepared or needs review. Please wait for its status to update." };
    }

    return { ok: true, reservation };
  }

  const { data, error } = await supabase
    .from("invoice_checkout_sessions")
    .insert({
      amount_cents: amountCents,
      currency,
      customer_id: customerId,
      invoice_id: invoiceId,
      invoice_principal_cents: amountCents,
      organization_id: organizationId,
      payment_channel: "ach",
      status: "creating",
      surcharge_cents: 0,
      total_charge_cents: amountCents,
    })
    .select(`${closableReservationColumns}, amount_cents, invoice_principal_cents, checkout_url, created_at, expires_at`)
    .single();

  if (error === null && isCheckoutReservation(data) && data.invoice_id === invoiceId
    && data.customer_id === customerId && data.organization_id === organizationId
    && data.invoice_principal_cents === amountCents && data.total_charge_cents === amountCents
    && data.currency.toLowerCase() === currency && data.payment_channel === "ach" && data.status === "creating"
    && data.stripe_checkout_session_id === null && data.stripe_payment_intent_id === null && data.submitted_at === null) {
    return { ok: true, reservation: data };
  }

  if (error?.code === "23505" && !retry) {
    return reserveCheckout(supabase, invoiceId, customerId, organizationId, amountCents, currency, true);
  }

  logAchCheckoutError("checkout_reservation_insert_failed");
  return { ok: false, message: "A secure payment checkout could not be prepared. Please try again." };
}

function isCheckoutReservation(value: unknown): value is CheckoutReservation {
  if (!isClosableReservation(value)) return false;
  const row = value as CheckoutReservation;
  return Number.isSafeInteger(row.invoice_principal_cents) && row.invoice_principal_cents > 0
    && row.amount_cents === row.invoice_principal_cents && row.total_charge_cents >= row.invoice_principal_cents
    && typeof row.customer_id === "string" && row.customer_id.length > 0
    && (row.organization_id === null || (typeof row.organization_id === "string" && row.organization_id.length > 0));
}

function isCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    // Stripe can use a custom checkout domain; do not hard-code its hostname.
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

function matchesCreatedSession(session: Stripe.Checkout.Session, reservation: CheckoutReservation, livemode: boolean): boolean {
  const intent = session?.payment_intent;
  const intentId = typeof intent === "string" ? intent : intent?.id;
  return !!session && typeof session.id === "string" && /^cs_[a-zA-Z0-9_]+$/.test(session.id)
    && session.mode === "payment" && session.livemode === livemode && session.status === "open" && session.payment_status === "unpaid"
    && session.client_reference_id === reservation.invoice_id && session.metadata?.invoice_id === reservation.invoice_id
    && session.metadata?.checkout_reservation_id === reservation.id && session.metadata?.payment_channel === "ach"
    && session.amount_total === reservation.total_charge_cents && typeof session.currency === "string"
    && session.currency.toLowerCase() === reservation.currency.toLowerCase()
    && Number.isSafeInteger(session.expires_at) && session.expires_at > 0 && session.expires_at <= 8_640_000_000_000
    && (intent === null || (typeof intentId === "string" && /^pi_[a-zA-Z0-9_]+$/.test(intentId)));
}

function compactMetadata(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value)));
}

function getStripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function logAchCheckoutError(applicationErrorCode: string) {
  console.error("Stripe ACH Checkout operation failed", {
    applicationErrorCode,
    paymentChannel: "ach",
    route: "/api/portal/invoice/[token]/checkout",
  });
}
