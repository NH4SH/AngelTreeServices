import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { createCheckoutBudget, type CheckoutBudget } from "./checkout-budget.ts";
import {
  cardIntentMatches, classifyCheckoutForClosure, closeCheckoutReservation,
  closableReservationColumns, closureFailure, safeCheckoutLog,
  type CheckoutClosureResult, type ClosableReservation,
} from "./checkout-closure.ts";

type Client = SupabaseClient<any, "public", any>;
export type InvoicePaymentContext = { stripe: Stripe | null; supabase: Client; livemode: boolean };
type CommandResult = { ok: boolean; message: string };
type Input = {
  invoiceId: string;
  staffSupabase: Client;
  getPaymentContext: () => InvoicePaymentContext | null;
  correlationId: string;
};

export async function cancelOutstandingInvoiceCheckouts({ invoiceId, context, correlationId, token, budget, verifyLease }: {
  invoiceId: string; context: InvoicePaymentContext; correlationId: string; token: string;
  budget: CheckoutBudget; verifyLease: () => Promise<void>;
}): Promise<CheckoutClosureResult> {
  // Legacy failed/cancelled rows may contain an uncertain create or expiry.
  const { data, error } = await budget.run(() => context.supabase.from("invoice_checkout_sessions")
    .select(closableReservationColumns).eq("invoice_id", invoiceId).order("created_at", { ascending: true }));
  if (error || !data) return closureFailure("checkout_lookup_failed", true);
  for (const reservation of data as ClosableReservation[]) {
    const result = await closeCheckoutReservation({ reservation, ...context, correlationId,
      voidToken: token, budget, verifyLease, operation: "admin_invoice_void" });
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function withInvoiceLease(input: Input, review: boolean, operation: (
  context: InvoicePaymentContext, token: string, budget: CheckoutBudget, verifyLease: () => Promise<void>,
) => Promise<CommandResult>): Promise<CommandResult> {
  let token: string | null = null;
  let stage: "void_begin_failed" | "void_finalize_failed" | "checkout_lookup_failed" = "void_begin_failed";
  const budget = createCheckoutBudget();
  try {
    // This live DB authorization and target lookup precedes privileged clients
    // and all provider requests, including during a stale/inactive web session.
    const begin = await budget.run(() => input.staffSupabase.rpc(
      review ? "begin_invoice_checkout_review" : "begin_invoice_void", { p_invoice_id: input.invoiceId },
    ));
    if (begin.error) return { ok: false, message: begin.error.code === "42501"
      ? "Only an active owner or admin can change this invoice."
      : begin.error.code === "55P03" ? "Another invoice operation is in progress. Wait a moment and retry."
        : begin.error.code === "P0002" ? "Invoice not found or unavailable to your account."
          : "The invoice cannot be voided while payment is submitted, recorded, or unverified. Review its payment status first." };
    if (!review && begin.data?.already_void) return { ok: true, message: "Invoice is already void." };
    if (typeof begin.data?.token !== "string" || !begin.data.token) throw new Error("void_begin_failed");
    token = begin.data.token;
    const context = input.getPaymentContext();
    if (!context) return { ok: false, message: "Payment verification is not configured. The invoice has not been changed." };
    const verifyLease = async () => {
      const checked = await budget.run(() => input.staffSupabase.rpc("check_invoice_checkout_lease", {
        p_invoice_id: input.invoiceId, p_token: token,
      }));
      if (checked.error || checked.data !== true) throw new Error("invoice_lease_changed");
    };
    stage = "checkout_lookup_failed";
    await verifyLease();
    stage = "void_finalize_failed";
    return await operation(context, token!, budget, verifyLease);
  } catch {
    console.error("Invoice operation was not confirmed", safeCheckoutLog({ code: stage,
      correlationId: input.correlationId, operation: "admin_invoice_void", retryable: true }));
    return { ok: false, message: "The invoice change was not confirmed. Reload before retrying. Payment status may need review; no new payment was requested." };
  } finally {
    if (token) {
      try {
        const released = await createCheckoutBudget(undefined, 2_000).run(() => input.staffSupabase.rpc("release_invoice_void", {
          p_invoice_id: input.invoiceId, p_token: token,
        }));
        if (released.error) throw new Error("void_release_failed");
      } catch {
        console.error("Invoice operation lease release failed", safeCheckoutLog({ code: "void_release_failed",
          correlationId: input.correlationId, operation: "admin_invoice_void", retryable: true }));
      }
    }
  }
}

export async function voidInvoiceSafely(input: Input): Promise<CommandResult> {
  return withInvoiceLease(input, false, async (context, token, budget, verifyLease) => {
    const closed = await cancelOutstandingInvoiceCheckouts({ invoiceId: input.invoiceId, context,
      correlationId: input.correlationId, token, budget, verifyLease });
    if (!closed.ok) return closed;
    await verifyLease();
    const finalized = await budget.run(() => input.staffSupabase.rpc("finalize_invoice_void", {
      p_invoice_id: input.invoiceId, p_token: token,
    }));
    if (finalized.error || finalized.data !== true) return { ok: false,
      message: "Payment checkouts were checked, but invoice voiding was not confirmed. Reload and review its payment status before retrying." };
    return { ok: true, message: "Invoice marked void. Pending reminders were cancelled. No email was sent." };
  });
}

export async function reviewInvoiceCheckout(input: Input & { reservationId: string; providerReference?: string }): Promise<CommandResult> {
  return withInvoiceLease(input, true, async (context, token, budget, verifyLease) => {
    const found = await budget.run(() => context.supabase.from("invoice_checkout_sessions")
      .select(closableReservationColumns).eq("invoice_id", input.invoiceId).eq("id", input.reservationId).maybeSingle());
    if (found.error || !found.data) return { ok: false, message: "That payment attempt is unavailable for this invoice." };
    let reservation = found.data as ClosableReservation;
    if (input.providerReference) {
      if (reservation.stripe_checkout_session_id || reservation.stripe_payment_intent_id) {
        return { ok: false, message: "This payment attempt already has a provider reference. Leave that field empty to verify it." };
      }
      if (!context.stripe) return closureFailure("checkout_stripe_unconfigured");
      await verifyLease();
      const isCheckout = input.providerReference.startsWith("cs_");
      const candidate = { ...reservation,
        ...(isCheckout ? { stripe_checkout_session_id: input.providerReference } : { stripe_payment_intent_id: input.providerReference }),
      };
      // A new binding MUST carry the exact reservation ID. Invoice/amount alone
      // cannot distinguish two legacy attempts for the same customer.
      if (isCheckout && reservation.payment_channel === "ach") {
        const session = await budget.run(() => context.stripe!.checkout.sessions.retrieve(input.providerReference!, { expand: ["payment_intent"] }, budget.requestOptions()));
        if (session.metadata?.checkout_reservation_id !== reservation.id
          || ["checkout_binding_mismatch", "checkout_remote_state_unknown"].includes(classifyCheckoutForClosure(session, candidate, context.livemode))) {
          return closureFailure("checkout_binding_mismatch");
        }
      } else if (!isCheckout && reservation.payment_channel === "card" && input.providerReference.startsWith("pi_")) {
        const intent = await budget.run(() => context.stripe!.paymentIntents.retrieve(input.providerReference!, {}, budget.requestOptions()));
        if (!cardIntentMatches(intent, candidate, context.livemode)) return closureFailure("checkout_binding_mismatch");
      } else return closureFailure("checkout_binding_mismatch");
      await verifyLease();
      const bound = await budget.run(() => context.supabase.from("invoice_checkout_sessions").update({
        stripe_checkout_session_id: candidate.stripe_checkout_session_id,
        stripe_payment_intent_id: candidate.stripe_payment_intent_id,
      }).eq("id", reservation.id).eq("invoice_id", input.invoiceId).eq("status", reservation.status)
        .is("stripe_checkout_session_id", null).is("stripe_payment_intent_id", null).select("id").maybeSingle());
      if (bound.error || !bound.data) return closureFailure("checkout_reservation_changed", true);
      reservation = candidate;
    }
    const closed = await closeCheckoutReservation({ reservation, ...context, correlationId: input.correlationId,
      operation: "admin_invoice_void", voidToken: token, budget, verifyLease, reviewing: true });
    if (!closed.ok) return closed;
    return { ok: true, message: "The unpaid checkout was safely closed. The invoice is unchanged. You can now retry the invoice action." };
  });
}
