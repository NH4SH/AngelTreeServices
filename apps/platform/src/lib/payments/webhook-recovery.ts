import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCheckoutBudget, type CheckoutBudget } from "./checkout-budget.ts";
import { WebhookProcessingError } from "./webhook-logging.ts";

type Client = SupabaseClient<any, "public", any>;
export type WebhookEnvelope = {
  id: string; type: string; created: number; livemode: boolean;
  account?: string; data: { object: { id: string } };
};
export type WebhookEmail = {
  to: string; title: string; body: string | null; destination: string | null;
  invoice_id: string; notificationId: string; signal: AbortSignal;
};
export type WebhookEmailResult = {
  ok: boolean; configured: boolean; providerMessageId: string | null; retryable: boolean;
  outcome?: "accepted" | "rejected" | "unknown" | "not_attempted";
};
type Dependencies = {
  supabase: Client; stripe: Stripe | null; livemode: boolean;
  sendEmail(input: WebhookEmail): Promise<WebhookEmailResult>;
  syncCommunications(invoiceId: string): Promise<{ error: string | null }>;
  budget?: CheckoutBudget;
};
type Evidence = Record<string, unknown> & { operation: string };
type WebhookClaim = { status: "completed" | "busy" | "review" } | {
  status: "claimed"; token: string; phase: "pending" | "effects_ready";
  invoice_id: string | null; communications_synced: boolean;
};
type NotificationAttempt = { status: "done" | "review" | "gone" } | {
  status: "send"; to: string; title: string; body: string | null;
  destination: string | null; invoice_id: string;
};
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
function isWebhookClaim(value: unknown): value is WebhookClaim {
  if (!isRecord(value)) return false;
  if (typeof value.status === "string" && ["completed", "busy", "review"].includes(value.status)) return true;
  return value.status === "claimed" && isUuid(value.token) && typeof value.phase === "string" && ["pending", "effects_ready"].includes(value.phase)
    && (value.invoice_id === null || isUuid(value.invoice_id)) && typeof value.communications_synced === "boolean";
}
function isNotificationAttempt(value: unknown): value is NotificationAttempt {
  if (!isRecord(value)) return false;
  if (typeof value.status === "string" && ["done", "review", "gone"].includes(value.status)) return true;
  return value.status === "send" && typeof value.to === "string" && value.to.length > 0
    && typeof value.title === "string" && value.title.length > 0
    && (value.body === null || typeof value.body === "string")
    && (value.destination === null || typeof value.destination === "string") && isUuid(value.invoice_id);
}
function isWebhookEmailResult(value: unknown): value is WebhookEmailResult {
  return isRecord(value) && typeof value.ok === "boolean" && typeof value.configured === "boolean" && typeof value.retryable === "boolean"
    && (value.providerMessageId === null || (typeof value.providerMessageId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value.providerMessageId)))
    && (value.ok || value.providerMessageId === null)
    && (value.outcome === undefined || (typeof value.outcome === "string" && ["accepted", "rejected", "unknown", "not_attempted"].includes(value.outcome)))
    && (value.outcome !== "accepted" || value.ok) && (!value.ok || value.outcome === undefined || value.outcome === "accepted");
}
const handled = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired",
  "payment_intent.succeeded", "payment_intent.processing", "payment_intent.payment_failed",
  "charge.refunded", "refund.created", "refund.updated", "refund.failed", "charge.refund.updated",
  "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
  "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated",
]);

// Provider reads are outside the DB transaction. The owned apply RPC is the only
// financial write boundary, and revalidates local bindings after the invoice lock.
export async function processStripeWebhook(event: WebhookEnvelope, deps: Dependencies) {
  const budget = deps.budget ?? createCheckoutBudget();
  const { supabase } = deps;
  if (!/^evt_[A-Za-z0-9_]+$/.test(event.id) || !event.data?.object?.id || !Number.isSafeInteger(event.created)
    || event.livemode !== deps.livemode || event.account) {
    throw new WebhookProcessingError("event_binding_invalid", false);
  }
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const timeout = budget.requestOptions().timeout;
    const result = await budget.run(() => supabase.rpc(name, args).abortSignal(AbortSignal.timeout(timeout)));
    if (!result || result.error !== null) throw new WebhookProcessingError(result?.error?.details === "provider_snapshot_superseded"
      ? "provider_snapshot_superseded" : `${name.replace("stripe_webhook", "receipt")}_failed`, true);
    return result.data;
  }
  const claim = await rpc("claim_stripe_webhook", {
    p_event_id: event.id, p_event_type: event.type, p_object_id: event.data.object.id,
    p_created_at: new Date(event.created * 1000).toISOString(), p_livemode: event.livemode,
  });
  // An unconfirmed claim cannot authorize use of an ownership token. Its lease
  // stays reclaimable; do not guess progress or fail a potentially different owner.
  if (!isWebhookClaim(claim)) throw new WebhookProcessingError("receipt_claim_invalid", true);
  if (claim.status !== "claimed") return { status: claim.status };
  const owned = { p_event_id: event.id, p_token: claim.token };
  try {
    let needsSync = !claim.communications_synced;
    let invoiceId = claim.invoice_id;
    if (claim.phase !== "effects_ready") {
      // The preliminary read resolves immutable local/provider bindings only.
      // Financial evidence is fetched again AFTER issuing an invoice observation
      // fence. A later observation makes this one's apply fail, even if its own
      // receipt lease is still live. Event timestamps are not object versions.
      let evidence = await normalizeStripeWebhook(event, deps, budget, false);
      if (evidence.operation !== "ignored") {
        const snapshot = await rpc("prepare_stripe_webhook_snapshot", { ...owned, p_evidence: evidence });
        if (!isUuid(snapshot)) throw new WebhookProcessingError("receipt_snapshot_invalid", true);
        const current = await normalizeStripeWebhook(event, deps, budget);
        if (current.operation === "ignored") throw new WebhookProcessingError("provider_binding_changed", false);
        evidence = { ...current, snapshot_token: snapshot };
      }
      const applied = await rpc("apply_stripe_webhook", { ...owned, p_evidence: evidence });
      if (!isRecord(applied)) throw new WebhookProcessingError("receipt_apply_invalid", true);
      if (evidence.operation === "ignored") {
        // The SQL command returns {ignored:true} initially and {invoice_id:null}
        // when that same ignored checkpoint is replayed under its owned lease.
        if (!((applied.ignored === true && applied.invoice_id == null)
          || (applied.ignored === undefined && applied.invoice_id === null))) throw new WebhookProcessingError("receipt_apply_invalid", true);
        needsSync = false;
        invoiceId = null;
      } else {
        if (!isUuid(applied.invoice_id) || applied.ignored !== undefined
          || (typeof evidence.invoice_id === "string" && applied.invoice_id !== evidence.invoice_id)) throw new WebhookProcessingError("receipt_apply_invalid", true);
        invoiceId = applied.invoice_id;
      }
    }
    // Existing queue planning is idempotent and sends no messages. Preserve its
    // settings/master switch; resume it after failures without rerunning money.
    if (needsSync) {
      if (!isUuid(invoiceId)) throw new WebhookProcessingError("invoice_checkpoint_missing", true);
      const sync = await budget.run(() => deps.syncCommunications(invoiceId));
      if (!isRecord(sync) || sync.error !== null) throw new WebhookProcessingError("communication_sync_failed", true);
      if (await rpc("mark_stripe_webhook_sync", owned) !== true) throw new WebhookProcessingError("communication_checkpoint_failed", true);
    }
    const notifications = await budget.run(() => supabase.from("admin_notifications").select("id")
      .eq("stripe_event_id", event.id).in("stripe_email_state", ["queued", "submitting"]).order("id").limit(100)
      .abortSignal(AbortSignal.timeout(budget.requestOptions().timeout)));
    if (!notifications || notifications.error !== null || !Array.isArray(notifications.data)
      || notifications.data.some(row => !isRecord(row) || !isUuid(row.id))
      || new Set(notifications.data.map(row => row.id)).size !== notifications.data.length) throw new WebhookProcessingError("notification_read_failed", true);
    for (const row of notifications.data) {
      const attempt = await rpc("begin_stripe_notification_email", { ...owned, p_notification: row.id });
      if (!isNotificationAttempt(attempt)) throw new WebhookProcessingError("notification_claim_invalid", true);
      if (attempt.status !== "send") continue;
      if (attempt.invoice_id !== invoiceId) throw new WebhookProcessingError("notification_binding_invalid", true);
      let result: WebhookEmailResult;
      try {
        const received = await budget.run(() => deps.sendEmail({ ...attempt, notificationId: row.id,
          signal: AbortSignal.timeout(budget.requestOptions().timeout) }));
        if (!isWebhookEmailResult(received)) throw new WebhookProcessingError("notification_result_invalid", true);
        result = received;
      } catch {
        // Persist uncertainty; do not send this notification again on replay.
        await supabase.rpc("finish_stripe_notification_email", {
          p_notification: row.id, p_attempt_token: claim.token, p_outcome: "review", p_provider_id: null,
        }).abortSignal(AbortSignal.timeout(2000));
        throw new WebhookProcessingError("notification_delivery_uncertain", true);
      }
      // A timeout/lost acknowledgement may have reached the provider. The
      // durable sender deliberately disables automatic retries for that case.
      const uncertain = result.outcome === "unknown" || (!result.ok && result.configured && result.outcome === undefined);
      const outcome = uncertain ? "review" : result.ok && result.providerMessageId ? "accepted"
        : result.ok || (result.configured && result.retryable) ? "review" : "failed";
      // The immutable submission token may record a late positive acceptance,
      // but cannot complete a newer owner's receipt or authorize another send.
      const saved = await supabase.rpc("finish_stripe_notification_email", {
        p_notification: row.id, p_attempt_token: claim.token, p_outcome: outcome, p_provider_id: result.providerMessageId,
      }).abortSignal(AbortSignal.timeout(2000));
      if (saved.error || saved.data !== true) throw new WebhookProcessingError("notification_result_unrecorded", true);
    }
    if (await rpc("complete_stripe_webhook", owned) !== true) throw new WebhookProcessingError("receipt_completion_unconfirmed", true);
    return { status: "completed" as const };
  } catch (error) {
    // A failed/stale invocation never deletes the receipt, its progress, another
    // owner's lease, or an uncertain provider submission.
    try {
      await supabase.rpc("fail_stripe_webhook", { ...owned,
        p_problem: error instanceof WebhookProcessingError ? error.applicationErrorCode : "processing_failed",
      }).abortSignal(AbortSignal.timeout(2000));
    } catch { /* The lease remains reclaimable even if failure recording fails. */ }
    throw error;
  }
}

export async function normalizeStripeWebhook(event: WebhookEnvelope, deps: Pick<Dependencies, "supabase" | "stripe" | "livemode">, budget: CheckoutBudget, includeRefunds = true): Promise<Evidence> {
  if (!handled.has(event.type)) return { operation: "ignored" };
  if (!deps.stripe) throw new WebhookProcessingError("provider_config_unavailable", true);
  const stripe = deps.stripe;
  const id = event.data.object.id;
  const request = () => budget.requestOptions();
  const lookup = async (column: string, value: string) => {
    const result = await budget.run(() => deps.supabase.from("invoice_checkout_sessions").select("*").eq(column, value)
      .abortSignal(AbortSignal.timeout(request().timeout)).maybeSingle());
    if (result.error) throw new WebhookProcessingError("reservation_read_failed", true);
    return result.data;
  };
  if (event.type.startsWith("checkout.session.")) {
    const session = await budget.run(() => stripe.checkout.sessions.retrieve(id, { expand: ["payment_intent.latest_charge.balance_transaction"] }, request()));
    requireMode(session, deps.livemode);
    const checkout = await lookup("stripe_checkout_session_id", id);
    if (!checkout && !session.metadata?.invoice_id) return { operation: "ignored" };
    if (!checkout || session.id !== id || checkout.invoice_id !== session.metadata?.invoice_id
      || session.client_reference_id !== checkout.invoice_id || session.amount_total !== checkout.total_charge_cents
      || session.currency?.toLowerCase() !== checkout.currency.toLowerCase()
      || (session.metadata?.checkout_reservation_id && session.metadata.checkout_reservation_id !== checkout.id)) {
      throw new WebhookProcessingError("checkout_binding_invalid", false);
    }
    const intent = object(session.payment_intent);
    if (intent) {
      requireMode(intent, deps.livemode);
      if (intent.amount !== checkout.total_charge_cents || intent.currency.toLowerCase() !== checkout.currency.toLowerCase()
        || (intent.metadata?.invoice_id && intent.metadata.invoice_id !== checkout.invoice_id)
        || (intent.metadata?.checkout_reservation_id && intent.metadata.checkout_reservation_id !== checkout.id)) {
        throw new WebhookProcessingError("intent_binding_invalid", false);
      }
    }
    if (checkout.stripe_payment_intent_id && checkout.stripe_payment_intent_id !== providerId(session.payment_intent)) {
      throw new WebhookProcessingError("intent_binding_invalid", false);
    }
    const common = { reservation_id: checkout.id, invoice_id: checkout.invoice_id, session_id: id,
      intent_id: providerId(session.payment_intent), amount_cents: session.amount_total, currency: session.currency };
    if (session.payment_status === "paid") {
      if (!intent || intent.status !== "succeeded" || intent.amount_received !== checkout.total_charge_cents || intent.currency !== session.currency) {
        throw new WebhookProcessingError("checkout_payment_not_ready", true);
      }
      const charge = object(intent.latest_charge);
      const evidence = chargeEvidence(charge, deps.livemode, intent.id, checkout.total_charge_cents, checkout.currency);
      return { ...common, ...evidence, refunds: includeRefunds ? await readRefunds(charge!, stripe, budget) : undefined, operation: "succeeded" };
    }
    if (event.type === "checkout.session.async_payment_succeeded") throw new WebhookProcessingError("checkout_payment_not_ready", true);
    if (session.status === "expired" && (!intent || ["canceled", "requires_payment_method"].includes(intent.status))) return { ...common, operation: "expired" };
    if (checkout.payment_channel !== "ach") return { operation: "ignored" };
    if (intent?.status === "processing") return { ...common, operation: "pending" };
    if (intent && ["requires_payment_method", "canceled"].includes(intent.status)) return { ...common, operation: "failed" };
    throw new WebhookProcessingError("checkout_state_unresolved", true);
  }
  if (event.type.startsWith("payment_intent.")) {
    const intent = await budget.run(() => stripe.paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] }, request()));
    requireMode(intent, deps.livemode);
    if (intent.metadata.payment_channel !== "card") {
      const known = await lookup("stripe_payment_intent_id", id);
      const reserved = intent.metadata.checkout_reservation_id ? await lookup("id", intent.metadata.checkout_reservation_id) : null;
      if (known?.payment_channel === "card" || reserved?.payment_channel === "card") throw new WebhookProcessingError("intent_binding_invalid", false);
      return { operation: "ignored" };
    }
    const reservationId = intent.metadata.checkout_reservation_id;
    if (!reservationId || !intent.metadata.invoice_id) throw new WebhookProcessingError("intent_binding_invalid", false);
    const checkout = await lookup("id", reservationId);
    if (!checkout || intent.id !== id || checkout.invoice_id !== intent.metadata.invoice_id || !checkout.stripe_confirmation_token_id
      || checkout.payment_channel !== "card" || checkout.stripe_checkout_session_id
      || (checkout.stripe_payment_intent_id && checkout.stripe_payment_intent_id !== id)
      || intent.amount !== checkout.total_charge_cents || intent.currency.toLowerCase() !== checkout.currency.toLowerCase()) {
      throw new WebhookProcessingError("intent_binding_invalid", false);
    }
    const common = { reservation_id: checkout.id, invoice_id: checkout.invoice_id, intent_id: id,
      amount_cents: intent.amount, currency: intent.currency };
    if (intent.status === "succeeded") {
      if (intent.amount_received !== checkout.total_charge_cents) throw new WebhookProcessingError("intent_amount_invalid", false);
      const charge = object(intent.latest_charge);
      const evidence = chargeEvidence(charge, deps.livemode, intent.id, checkout.total_charge_cents, checkout.currency);
      return { ...common, ...evidence, refunds: includeRefunds ? await readRefunds(charge!, stripe, budget) : undefined, operation: "succeeded" };
    }
    if (intent.status === "processing") return { ...common, operation: "pending" };
    if (["requires_payment_method", "canceled"].includes(intent.status)) return { ...common, operation: "failed" };
    throw new WebhookProcessingError("intent_state_unresolved", true);
  }
  if (event.type === "charge.refunded" || event.type.startsWith("refund.") || event.type === "charge.refund.updated") {
    const refund = event.type === "charge.refunded" ? null : await budget.run(() => stripe.refunds.retrieve(id, {}, request()));
    if (refund && refund.id !== id) throw new WebhookProcessingError("refund_binding_invalid", false);
    const chargeId = refund ? providerId(refund.charge) : id;
    if (!chargeId) throw new WebhookProcessingError("refund_binding_invalid", false);
    const charge = await budget.run(() => stripe.charges.retrieve(chargeId, {}, request()));
    requireMode(charge, deps.livemode);
    if (charge.id !== chargeId || !charge.paid || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > charge.amount) {
      throw new WebhookProcessingError("refund_amount_invalid", false);
    }
    return { operation: "refund", charge_id: charge.id, intent_id: providerId(charge.payment_intent),
      refund_id: refund?.id, amount_cents: charge.amount, currency: charge.currency,
      refunds: includeRefunds ? await readRefunds(charge, stripe, budget, refund?.id) : undefined };
  }
  const dispute = await budget.run(() => stripe.disputes.retrieve(id, {}, request()));
  requireMode(dispute, deps.livemode);
  if (dispute.id !== id) throw new WebhookProcessingError("dispute_binding_invalid", false);
  return { operation: "dispute", dispute_id: dispute.id, charge_id: providerId(dispute.charge),
    dispute_status: dispute.status, dispute_amount_cents: dispute.amount, currency: dispute.currency };
}

async function readRefunds(charge: Stripe.Charge, stripe: Stripe, budget: CheckoutBudget, requiredId?: string) {
  const refunds = [], seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await budget.run(() => stripe.refunds.list({ charge: charge.id, limit: 100, starting_after: cursor }, budget.requestOptions()));
    if (!page.data.length && page.has_more) throw new WebhookProcessingError("refund_page_incomplete", true);
    for (const refund of page.data) {
      if (seen.has(refund.id) || providerId(refund.charge) !== charge.id
        || (providerId(refund.payment_intent) && providerId(refund.payment_intent) !== providerId(charge.payment_intent))
        || refund.currency.toLowerCase() !== charge.currency.toLowerCase() || !Number.isSafeInteger(refund.amount)
        || refund.amount <= 0 || refund.amount > charge.amount || !Number.isSafeInteger(refund.created)
        || !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(refund.status ?? "")) {
        throw new WebhookProcessingError("refund_binding_invalid", false);
      }
      seen.add(refund.id);
      refunds.push({ id: refund.id, charge_id: charge.id, intent_id: providerId(refund.payment_intent), amount_cents: refund.amount,
        currency: refund.currency.toLowerCase(), status: refund.status, created_at: new Date(refund.created * 1000).toISOString() });
      if (refunds.length > 1000) throw new WebhookProcessingError("refund_page_limit", true);
    }
    if (!page.has_more) break;
    cursor = page.data.at(-1)!.id;
  }
  if (requiredId && !seen.has(requiredId)) throw new WebhookProcessingError("refund_page_incomplete", true);
  return refunds;
}

function requireMode(value: { livemode: boolean }, expected: boolean) {
  if (value.livemode !== expected) throw new WebhookProcessingError("provider_mode_invalid", false);
}
function chargeEvidence(charge: Stripe.Charge | null, mode: boolean, intentId: string, amount: number, currency: string) {
  if (!charge) throw new WebhookProcessingError("charge_not_ready", true);
  requireMode(charge, mode);
  if (providerId(charge.payment_intent) !== intentId || charge.amount !== amount || charge.currency.toLowerCase() !== currency.toLowerCase() || !charge.paid
    || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > charge.amount) {
    throw new WebhookProcessingError("charge_binding_invalid", false);
  }
  const balance = object(charge.balance_transaction), card = charge.payment_method_details?.card;
  return { charge_id: charge.id, refund_gross_cents: charge.amount_refunded,
    card_brand: card?.brand ?? null, card_funding_type: card ? (["credit", "debit", "prepaid"].includes(card.funding ?? "") ? card.funding : "unknown") : null,
    fee_cents: balance?.fee ?? null, net_cents: balance?.net ?? null };
}
function object<T>(value: string | T | null | undefined): T | null { return typeof value === "string" ? null : value ?? null; }
function providerId(value: string | { id: string } | null | undefined) { return typeof value === "string" ? value : value?.id ?? null; }
