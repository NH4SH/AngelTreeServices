import "server-only";
import type Stripe from "stripe";
import { FirewoodImportError, type FirewoodImportRequest, record, stripeSourceMetadata, woodLabels } from "./import-contract.ts";

export type FirewoodPaymentProof = { account_id: string; livemode: false; currency: "usd"; session_id: string; intent_id: string; charge_id: string;
  snapshot_hash: string; amount_cents: number; amount_received_cents: number; session_status: "complete"; payment_status: "paid"; intent_status: "succeeded";
  captured: true; paid_at: string; refunds: { id: string; intent_id: string; charge_id: string; amount_cents: number; currency: "usd"; status: string; created_at: string }[];
  dispute: { id: string; intent_id: string; charge_id: string; amount_cents: number; currency: "usd"; status: string } | null };
function fail(): never { throw new FirewoodImportError("provider_binding_invalid"); }
const id = (v: unknown): string | null => typeof v === "string" ? v : record(v) && typeof v.id === "string" ? v.id : null;
const number = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const sameText = (a: unknown, b: string) => typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
const metadata = (v: unknown, expected: Record<string, string>) => record(v) && Object.entries(expected).every(([k, x]) => v[k] === x)
  && !v.invoice_id && !v.checkout_reservation_id && !v.payment_channel;
const knownDisputes = ["warning_needs_response", "warning_under_review", "warning_closed", "needs_response", "under_review", "won", "lost"];

/** Read-only provider operations. No create/confirm/capture/refund/charge method
 * is available here. Every financial read occurs after the native lease claim. */
export async function verifyFirewoodTestPayment(input: FirewoodImportRequest, stripe: Stripe, now = Date.now()): Promise<FirewoodPaymentProof> {
  const expires = now + 12000;
  async function read<T>(fn: (options: Stripe.RequestOptions) => Promise<T>): Promise<T> {
    const remaining = expires - Date.now();
    if (remaining <= 0) throw new FirewoodImportError("provider_unavailable", true);
    try { return await fn({ timeout: Math.min(5000, remaining), maxNetworkRetries: 0 }); }
    catch { throw new FirewoodImportError("provider_unavailable", true); }
  }
  const account = await read(options => stripe.accounts.retrieve(null, {}, options));
  if (account.id !== input.account_id) fail();
  const session = await read(options => stripe.checkout.sessions.retrieve(input.session_id, { expand: ["line_items.data.price.product"] }, options));
  const expected = stripeSourceMetadata(input), total = input.order.total_cents;
  if (session.id !== input.session_id || session.livemode !== false || session.mode !== "payment"
    || session.client_reference_id !== input.reference || !metadata(session.metadata, expected)) fail();
  if (session.status !== "complete" || session.payment_status !== "paid") throw new FirewoodImportError("payment_not_paid");
  if (session.amount_total !== total || session.amount_subtotal !== total || session.currency !== "usd"
    || !session.total_details || session.total_details.amount_discount !== 0 || session.total_details.amount_shipping !== 0 || session.total_details.amount_tax !== 0
    || session.automatic_tax?.enabled || (session.shipping_cost?.amount_total ?? 0) !== 0
    || !sameText(session.customer_details?.email ?? session.customer_email, input.order.contact.email)) fail();
  const lines = session.line_items;
  if (!lines || lines.has_more !== false || lines.data.length !== (input.order.stacking ? 2 : 1)) fail();
  const expectedLines = [
    { name: `${woodLabels[input.order.quantity]} of firewood — delivery included`, cents: input.order.wood_cents },
    ...(input.order.stacking ? [{ name: "Stacking — one charge per delivery", cents: 15000 }] : []),
  ];
  for (const [i, line] of lines.data.entries()) {
    const wanted = expectedLines[i];
    if (line.quantity !== 1 || line.currency !== "usd" || line.amount_subtotal !== wanted.cents || line.amount_total !== wanted.cents
      || line.amount_discount !== 0 || line.amount_tax !== 0 || line.price?.unit_amount !== wanted.cents
      || !record(line.price.product) || line.price.product.name !== wanted.name) fail();
  }
  const intentId = id(session.payment_intent);
  if (!intentId || !/^pi_[A-Za-z0-9_]+$/.test(intentId)) fail();
  const intent = await read(options => stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] }, options));
  if (intent.id !== intentId || intent.livemode !== false || intent.currency !== "usd" || intent.amount !== total
    || intent.amount_received !== total || intent.status !== "succeeded" || !metadata(intent.metadata, expected)) fail();
  const shipping = intent.shipping, c = input.order.contact;
  if (!shipping || !sameText(shipping.name, c.name) || shipping.phone?.replace(/\D/g, "").slice(-10) !== c.phone
    || !shipping.address || !sameText(shipping.address.line1, c.address) || !sameText(shipping.address.line2 ?? "", c.address2)
    || !sameText(shipping.address.city, c.city) || shipping.address.state !== c.state || shipping.address.postal_code !== c.postal || shipping.address.country !== "US") fail();
  const charge = intent.latest_charge;
  if (!record(charge) || typeof charge.id !== "string" || !/^ch_[A-Za-z0-9_]+$/.test(charge.id) || charge.livemode !== false
    || id(charge.payment_intent) !== intentId || charge.amount !== total || charge.amount_captured !== total || charge.currency !== "usd"
    || charge.paid !== true || charge.captured !== true || charge.status !== "succeeded" || !number(charge.created)
    || charge.created * 1000 > Date.now() + 300000 || !number(charge.amount_refunded) || charge.amount_refunded > total) fail();
  const chargeId = charge.id;
  const refunds: FirewoodPaymentProof["refunds"] = [], seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await read(options => stripe.refunds.list({ charge: chargeId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options));
    if (page.has_more && !page.data.length) throw new FirewoodImportError("provider_unavailable", true);
    for (const refund of page.data) {
      if (seen.has(refund.id) || id(refund.charge) !== charge.id || id(refund.payment_intent) !== intentId
        || refund.currency !== "usd" || !number(refund.amount) || refund.amount < 1 || refund.amount > total || !number(refund.created)
        || !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(refund.status ?? "")) fail();
      seen.add(refund.id);refunds.push({ id: refund.id, intent_id: intentId, charge_id: charge.id, amount_cents: refund.amount,
        currency: "usd", status: refund.status!, created_at: new Date(refund.created * 1000).toISOString() });
      if (refunds.length > 1000) throw new FirewoodImportError("provider_unavailable", true);
    }
    if (!page.has_more) break;cursor = page.data.at(-1)!.id;
  }
  if (refunds.filter(x => x.status === "succeeded").reduce((sum, x) => sum + x.amount_cents, 0) !== charge.amount_refunded) throw new FirewoodImportError("provider_unavailable", true);
  const disputes = [] as Stripe.Dispute[];cursor = undefined;
  for (;;) {
    const page = await read(options => stripe.disputes.list({ charge: chargeId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options));
    if (page.has_more && !page.data.length) throw new FirewoodImportError("provider_unavailable", true);
    disputes.push(...page.data);
    // The existing CRM payment ledger models one dispute per captured payment.
    if (disputes.length > 1) throw new FirewoodImportError("provider_binding_invalid");
    if (!page.has_more) break;cursor = page.data.at(-1)!.id;
  }
  const dispute = disputes[0];
  if (charge.disputed === true && !dispute) throw new FirewoodImportError("provider_unavailable", true);
  if (dispute && (dispute.livemode !== false || id(dispute.charge) !== charge.id || id(dispute.payment_intent) !== intentId
    || !number(dispute.amount) || dispute.amount < 1 || dispute.amount > total || dispute.currency !== "usd" || !knownDisputes.includes(dispute.status))) fail();
  return { account_id: account.id, livemode: false, currency: "usd", session_id: session.id, intent_id: intentId, charge_id: charge.id,
    snapshot_hash: input.snapshot_hash, amount_cents: total, amount_received_cents: intent.amount_received, session_status: "complete", payment_status: "paid",
    intent_status: "succeeded", captured: true, paid_at: new Date(charge.created * 1000).toISOString(), refunds,
    dispute: dispute ? { id: dispute.id, intent_id: intentId, charge_id: charge.id, amount_cents: dispute.amount, currency: "usd", status: dispute.status } : null };
}
