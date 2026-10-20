import { createCheckoutBudget, type CheckoutBudget } from "./checkout-budget.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type CheckoutClosureCode =
  | "checkout_payment_in_progress" | "checkout_creation_unresolved" | "checkout_binding_mismatch"
  | "checkout_remote_unavailable" | "checkout_remote_state_unknown" | "checkout_local_write_failed"
  | "checkout_reservation_changed" | "checkout_lookup_failed" | "checkout_stripe_unconfigured";
export type CheckoutClosureResult = { ok: true } | { ok: false; code: CheckoutClosureCode; message: string; retryable: boolean };
export type ClosableReservation = {
  id: string;
  invoice_id: string;
  status: string;
  payment_channel: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  submitted_at: string | null;
  total_charge_cents: number;
  currency: string;
  customer_id?: string | null;
  organization_id?: string | null;
};
export const closableReservationColumns = "id, invoice_id, status, payment_channel, stripe_checkout_session_id, stripe_payment_intent_id, submitted_at, total_charge_cents, currency, customer_id, organization_id";

// Required nullable fields must be present: a missing submission/provider field
// cannot establish that an attempt has no payable remote object.
export function isClosableReservation(value: unknown): value is ClosableReservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const present = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  const nullable = (v: unknown) => v === null || present(v);
  return present(row.id) && present(row.invoice_id)
    && typeof row.status === "string" && ["creating", "open", "processing", "completed", "expired", "failed", "cancelled"].includes(row.status)
    && (row.payment_channel === "ach" || row.payment_channel === "card")
    && nullable(row.stripe_checkout_session_id) && nullable(row.stripe_payment_intent_id) && nullable(row.submitted_at)
    && typeof row.total_charge_cents === "number" && Number.isSafeInteger(row.total_charge_cents)
    && row.total_charge_cents > 0 && row.total_charge_cents <= 2_147_483_647
    && typeof row.currency === "string" && /^[a-z]{3}$/i.test(row.currency);
}

export function confirmsCheckoutRow(result: unknown, id: string): boolean {
  if (!result || typeof result !== "object") return false;
  const receipt = result as { data?: unknown; error?: unknown };
  return receipt.error === null && !!receipt.data && typeof receipt.data === "object"
    && !Array.isArray(receipt.data) && (receipt.data as { id?: unknown }).id === id;
}

export function closureFailure(code: CheckoutClosureCode, retryable = false): CheckoutClosureResult & { ok: false } {
  const message = code === "checkout_payment_in_progress"
    ? "Payment has been submitted or recorded. Review its status before voiding this invoice."
    : code === "checkout_creation_unresolved"
      ? "A payment checkout is still being prepared or needs reconciliation. The invoice has not been voided."
      : "The payment checkout could not be safely closed. The invoice has not been voided. Retry or ask an administrator to review payment status.";
  return { ok: false, code, message, retryable };
}

export function classifyCheckoutForClosure(session: Stripe.Checkout.Session, reservation: ClosableReservation, livemode: boolean) {
  if ((session.metadata?.payment_channel && session.metadata.payment_channel !== reservation.payment_channel)
    || session.id !== reservation.stripe_checkout_session_id
    || session.mode !== "payment" || session.livemode !== livemode
    || session.metadata?.invoice_id !== reservation.invoice_id
    || (session.metadata?.checkout_reservation_id && session.metadata.checkout_reservation_id !== reservation.id)
    || session.client_reference_id !== reservation.invoice_id
    || session.amount_total !== reservation.total_charge_cents
    || session.currency?.toLowerCase() !== reservation.currency.toLowerCase()) {
    return "checkout_binding_mismatch" as const;
  }
  const intent = session.payment_intent;
  if (session.status === "complete" || session.payment_status !== "unpaid") return "checkout_payment_in_progress" as const;
  if (typeof intent === "string") return "checkout_remote_state_unknown" as const;
  if (reservation.stripe_payment_intent_id && (!intent || intent.id !== reservation.stripe_payment_intent_id)) return "checkout_binding_mismatch" as const;
  if (intent && (intent.metadata.invoice_id !== reservation.invoice_id || intent.livemode !== livemode
    || (intent.metadata.checkout_reservation_id && intent.metadata.checkout_reservation_id !== reservation.id)
    || intent.amount !== reservation.total_charge_cents || intent.currency.toLowerCase() !== reservation.currency.toLowerCase())) return "checkout_binding_mismatch" as const;
  if (intent && (intent.amount_received > 0 || !["canceled", "requires_payment_method"].includes(intent.status))) return "checkout_payment_in_progress" as const;
  if (session.status === "open" || session.status === "expired") return session.status;
  return "checkout_remote_state_unknown" as const;
}

export function safeCheckoutLog({ code, correlationId, error, operation, retryable }: {
  code: CheckoutClosureCode | "void_begin_failed" | "void_finalize_failed" | "void_release_failed";
  correlationId: string;
  error?: unknown;
  operation: "admin_invoice_void" | "checkout_replacement";
  retryable: boolean;
}) {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const allowedCodes = ["resource_missing", "rate_limit", "api_key_expired", "account_invalid", "parameter_invalid_empty", "checkout_session_not_open"];
  return {
    applicationErrorCode: code, correlationId, operation, retryable,
    stripeCode: typeof e.code === "string" && allowedCodes.includes(e.code) ? e.code : null,
    stripeRequestId: typeof e.requestId === "string" && /^req_[a-zA-Z0-9]{1,100}$/.test(e.requestId) ? e.requestId : null,
    stripeStatus: typeof e.statusCode === "number" && Number.isInteger(e.statusCode) && e.statusCode >= 400 && e.statusCode <= 599 ? e.statusCode : null,
  };
}

export async function closeCheckoutReservation({ reservation, stripe, supabase, livemode, operation, correlationId, voidToken, budget = createCheckoutBudget(), verifyLease, reviewing = false }: {
  reservation: ClosableReservation;
  stripe: Stripe | null;
  supabase: SupabaseClient<any, "public", any>;
  livemode: boolean;
  operation: "admin_invoice_void" | "checkout_replacement";
  correlationId: string;
  voidToken?: string;
  budget?: CheckoutBudget;
  verifyLease?: () => Promise<void>;
  reviewing?: boolean;
}): Promise<CheckoutClosureResult> {
  const fail = (code: CheckoutClosureCode, retryable = false, error?: unknown) => {
    console.error("Invoice checkout reconciliation blocked", safeCheckoutLog({ code, correlationId, error, operation, retryable }));
    return closureFailure(code, retryable);
  };
  if (!isClosableReservation(reservation)) return fail("checkout_lookup_failed", true);
  if (reservation.status === "completed" || (!reviewing && reservation.status === "processing")) return fail("checkout_payment_in_progress");
  // Elapsed time alone cannot prove a Stripe create request did not succeed.
  if (reservation.status === "creating" && !reviewing) return fail("checkout_creation_unresolved", true);
  const remoteCall = async <T>(operation: () => PromiseLike<T>) => {
    if (verifyLease) await budget.run(verifyLease);
    return budget.run(operation);
  };
  let terminalStatus = "cancelled";
  if (reservation.stripe_checkout_session_id) {
    if (!stripe) return fail("checkout_stripe_unconfigured");
    let remote: Stripe.Checkout.Session;
    try {
      remote = await remoteCall(() => stripe!.checkout.sessions.retrieve(reservation.stripe_checkout_session_id!, { expand: ["payment_intent"] }, budget.requestOptions()));
    } catch (error) {
      return fail("checkout_remote_unavailable", isRetryableStripeError(error), error);
    }
    let state = classifyCheckoutForClosure(remote, reservation, livemode);
    if (state !== "open" && state !== "expired") return fail(state);
    if (state === "open") {
      try {
        remote = await remoteCall(() => stripe!.checkout.sessions.expire(remote.id, { expand: ["payment_intent"] }, budget.requestOptions()));
      } catch (error) {
        // The customer or another worker can win expiry. Only a verified expired
        // response authorizes release; missing objects and timeouts never do.
        try {
          remote = await remoteCall(() => stripe!.checkout.sessions.retrieve(remote.id, { expand: ["payment_intent"] }, budget.requestOptions()));
        } catch (lookupError) {
          return fail("checkout_remote_unavailable", isRetryableStripeError(lookupError), lookupError);
        }
        state = classifyCheckoutForClosure(remote, reservation, livemode);
        if (state !== "expired") return fail(state === "open" ? "checkout_remote_unavailable" : state, isRetryableStripeError(error), error);
      }
      state = classifyCheckoutForClosure(remote, reservation, livemode);
      if (state !== "expired") return fail(state === "open" ? "checkout_remote_state_unknown" : state);
    }
    terminalStatus = "expired";
  } else if (reservation.stripe_payment_intent_id && reservation.payment_channel === "card") {
    if (!stripe) return fail("checkout_stripe_unconfigured");
    try {
      let intent = await remoteCall(() => stripe!.paymentIntents.retrieve(reservation.stripe_payment_intent_id!, {}, budget.requestOptions()));
      if (!cardIntentMatches(intent, reservation, livemode)) return fail("checkout_binding_mismatch");
      if (intent.status !== "canceled") {
        if (intent.amount_received > 0 || !["requires_action", "requires_confirmation", "requires_payment_method"].includes(intent.status)) return fail("checkout_payment_in_progress");
        try {
          intent = await remoteCall(() => stripe!.paymentIntents.cancel(intent.id, {}, budget.requestOptions()));
        } catch {
          intent = await remoteCall(() => stripe!.paymentIntents.retrieve(intent.id, {}, budget.requestOptions()));
        }
      }
      if (!cardIntentMatches(intent, reservation, livemode)) return fail("checkout_binding_mismatch");
      if (intent.status !== "canceled" || intent.amount_received > 0) return fail("checkout_payment_in_progress");
      terminalStatus = "expired";
    } catch (error) { return fail("checkout_remote_unavailable", true, error); }
  } else if (reservation.stripe_payment_intent_id || reservation.submitted_at || reservation.payment_channel !== "card" || reservation.status === "creating" || reservation.status === "processing") {
    return fail("checkout_creation_unresolved");
  }
  // An unsubmitted card review has no payable remote object. The invoice gate
  // serializes this CAS with confirmation's open -> creating claim.
  if (reservation.status === terminalStatus && !voidToken) return { ok: true };
  try {
    if (verifyLease) await budget.run(verifyLease);
    let query = supabase.from("invoice_checkout_sessions").update({ status: terminalStatus, ...(voidToken ? { void_reconciled_token: voidToken } : {}) })
      .eq("id", reservation.id).eq("invoice_id", reservation.invoice_id).eq("status", reservation.status)
      .eq("total_charge_cents", reservation.total_charge_cents).eq("currency", reservation.currency)
      .eq("payment_channel", reservation.payment_channel);
    for (const column of ["stripe_checkout_session_id", "stripe_payment_intent_id", "submitted_at"] as const) {
      query = reservation[column] === null ? query.is(column, null) : query.eq(column, reservation[column]);
    }
    const updated = await budget.run(() => query.select("id").maybeSingle());
    if (updated?.error !== null) return fail("checkout_local_write_failed", true);
    if (!confirmsCheckoutRow(updated, reservation.id)) return fail("checkout_reservation_changed", true);
    return { ok: true };
  } catch {
    return fail("checkout_local_write_failed", true);
  }
}

function isRetryableStripeError(error: unknown) {
  const e = error && typeof error === "object" ? error as { type?: string; statusCode?: number } : {};
  return e.type === "StripeConnectionError" || e.statusCode === 429 || (e.statusCode ?? 0) >= 500;
}

export function cardIntentMatches(intent: Stripe.PaymentIntent, reservation: ClosableReservation, livemode: boolean) {
  return intent.id === reservation.stripe_payment_intent_id && intent.livemode === livemode
    && intent.metadata.invoice_id === reservation.invoice_id
    && intent.metadata.checkout_reservation_id === reservation.id
    && intent.metadata.payment_channel === "card"
    && intent.amount === reservation.total_charge_cents
    && intent.currency.toLowerCase() === reservation.currency.toLowerCase();
}
