import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { FIREWOOD_IMPORT_CONTRACT, FirewoodImportError, parseFirewoodImport, record, uuid, type FirewoodImportRequest } from "./import-contract.ts";
import { verifyFirewoodTestPayment } from "./verify-test-payment.ts";

export const FIREWOOD_IMPORT_PATH = "/api/integrations/firewood/test-import";
export type FirewoodImportConfig = { sourceId: string; accountId: string; environmentId: string; signingSecret: string; keyId: string };
type Dependencies = { config: FirewoodImportConfig; supabase: SupabaseClient; stripe: Stripe; now?: () => number };
const signatureText = (timestamp: string, body: string) => `${timestamp}\nPOST\n${FIREWOOD_IMPORT_PATH}\n${body}`;
export function signFirewoodTestImport(body: string, timestamp: string, secret: string): string {
  return `v1=${createHmac("sha256", secret).update(signatureText(timestamp, body)).digest("hex")}`;
}
async function rawBody(request: Request): Promise<string> {
  if (!request.body || request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new FirewoodImportError("invalid_request", false, 422);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];let length = 0;
  try { for (;;) { const next = await reader.read();if (next.done) break;length += next.value.length;
    if (length > 16384) { await reader.cancel();throw new FirewoodImportError("request_too_large", false, 413); }chunks.push(next.value); }
  } finally { reader.releaseLock(); }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new FirewoodImportError("invalid_request", false, 422); }
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "5" } : {}) } });
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await db.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
  if (result.error) {
    const message = result.error.message ?? "";
    if (/contact requires review|address requires review/.test(message)) throw new FirewoodImportError("contact_review_required");
    if (result.error.code === "23505" || /identity changed|already belongs|binding changed|billing requires review/.test(message)) throw new FirewoodImportError("import_identity_conflict");
    throw new FirewoodImportError("database_unconfirmed", true);
  }
  return result.data;
}
function validReceipt(value: unknown, input: FirewoodImportRequest): value is Record<string, unknown> {
  return record(value) && value.contract === FIREWOOD_IMPORT_CONTRACT && value.import_status === "recorded"
    && value.source_id === input.source_id && value.order_id === input.order_id && value.reference === input.reference && value.attempt_id === input.attempt_id
    && value.account_id === input.account_id && value.mode === "test" && value.session_id === input.session_id
    && typeof value.payment_intent_id === "string" && /^pi_[A-Za-z0-9_]+$/.test(value.payment_intent_id)
    && uuid(value.invoice_id) && uuid(value.payment_id) && typeof value.invoice_number === "string" && value.invoice_number.length > 0
    && ["draft", "sent", "paid", "partially_paid", "overdue"].includes(String(value.invoice_status))
    && Number.isSafeInteger(value.balance_due_cents) && (value.balance_due_cents as number) >= 0 && (value.balance_due_cents as number) <= input.order.total_cents
    && value.total_cents === input.order.total_cents && value.currency === "usd" && typeof value.replayed === "boolean"
    && record(value.original_receipt) && value.original_receipt.paid === true && value.original_receipt.balance_due_cents === 0
    && value.notification_authority === "website" && value.crm_customer_email_sent === false && value.delivery_completed === false
    && typeof value.review_required === "boolean" && Number.isSafeInteger(value.refund_cents) && (value.refund_cents as number) >= 0 && (value.refund_cents as number) <= input.order.total_cents
    && (value.dispute_status === null || ["warning_needs_response", "warning_under_review", "warning_closed", "needs_response", "under_review", "won", "lost"].includes(String(value.dispute_status)))
    && value.review_required === ((value.refund_cents as number) > 0 || value.dispute_status !== null)
    && (value.review_required === true || value.invoice_status === "paid" && value.balance_due_cents === 0);
}

export async function handleFirewoodTestImport(request: Request, deps: Dependencies): Promise<Response> {
  let input: FirewoodImportRequest | undefined, lease: string | undefined;
  try {
    const { config } = deps, url = new URL(request.url), timestamp = request.headers.get("x-ats-timestamp"), signature = request.headers.get("x-ats-signature");
    if (request.method !== "POST" || url.pathname !== FIREWOOD_IMPORT_PATH || url.search) return json({ code: "invalid_request", retryable: false }, 400);
    if (request.headers.get("x-ats-key-id") !== config.keyId || !timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^v1=[a-f0-9]{64}$/.test(signature)
      || Math.abs((deps.now?.() ?? Date.now()) / 1000 - Number(timestamp)) > 300) return json({ code: "unauthorized", retryable: false }, 401);
    const body = await rawBody(request), expected = signFirewoodTestImport(body, timestamp, config.signingSecret);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return json({ code: "unauthorized", retryable: false }, 401);
    try { input = parseFirewoodImport(JSON.parse(body)); } catch (error) { if (error instanceof FirewoodImportError) throw error;throw new FirewoodImportError("invalid_request", false, 422); }
    if (input.source_id !== config.sourceId || input.account_id !== config.accountId) throw new FirewoodImportError("source_not_allowed", false, 403);
    const scope = await rpc(deps.supabase, "get_firewood_test_source_context", { p_source: config.sourceId });
    if (!record(scope) || scope.environment_id !== config.environmentId || scope.account_id !== config.accountId || scope.livemode !== false) throw new FirewoodImportError("isolation_not_confirmed", false, 503);
    const claim = await rpc(deps.supabase, "claim_firewood_test_import", { p_source: config.sourceId, p_request: input });
    if (!record(claim) || typeof claim.busy !== "boolean") throw new FirewoodImportError("database_unconfirmed", true);
    if (claim.busy) throw new FirewoodImportError("import_busy", true);
    if (!uuid(claim.lease_id)) throw new FirewoodImportError("database_unconfirmed", true);
    lease = claim.lease_id;
    const proof = await verifyFirewoodTestPayment(input, deps.stripe);
    const result = await rpc(deps.supabase, "finish_firewood_test_import", { p_source: config.sourceId, p_order: input.order_id, p_lease: lease, p_proof: proof });
    if (!validReceipt(result, input) || result.payment_intent_id !== proof.intent_id) throw new FirewoodImportError("database_unconfirmed", true);
    lease = undefined;
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    const known = error instanceof FirewoodImportError ? error : new FirewoodImportError("database_unconfirmed", true);
    if (lease && input) {
      const safe = ["provider_unavailable", "payment_not_paid", "provider_binding_invalid", "contact_review_required", "invalid_request"].includes(known.code) ? known.code : "database_unconfirmed";
      try { await rpc(deps.supabase, "release_firewood_test_import", { p_source: input.source_id, p_order: input.order_id, p_lease: lease, p_code: safe }); } catch { /* The durable lease expires; never claim a financial rollback. */ }
    }
    return json({ contract: FIREWOOD_IMPORT_CONTRACT, code: known.code, retryable: known.retryable, payment_retry_required: false }, known.httpStatus);
  }
}
