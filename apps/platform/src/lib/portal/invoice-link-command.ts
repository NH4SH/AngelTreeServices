import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { encryptPortalToken, generatePortalToken, getPortalTokenHint, hashPortalToken, INVOICE_PORTAL_LINK_LIFETIME_DAYS } from "@/lib/portal/tokens";

export type InvoiceLinkIntent = "generate" | "regenerate" | "revoke";
export type InvoiceLinkCommand = { invoiceId: string; requestId: string; version: string; intent: InvoiceLinkIntent; tokenId: string | null; supabase: SupabaseClient };
export type InvoiceLinkReceipt = { request_id: string; id: string; reviewed_version: string; intent: InvoiceLinkIntent; target_token_id: string | null;
  token_id: string; outcome: string; revoked_count: number; link_version: string; current_link_version: string; replayed: boolean;
  token_available: boolean; token_encrypted: string | null; token_hash: string | null; expires_at: string | null };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export async function performInvoiceLinkCommand(input: InvoiceLinkCommand) {
  const identity = { p_request_id: input.requestId, p_invoice_id: input.invoiceId, p_expected_version: input.version, p_intent: input.intent, p_token_id: input.tokenId };
  const existing = await callDeliveryCommand(input.supabase, "get_invoice_link_request", identity);
  if (existing.error) return { data: null, error: existing.error };
  let data = existing.data;
  if (data === null) {
    let candidate = null;
    if (input.intent !== "revoke") {
      const raw = generatePortalToken(), hash = hashPortalToken(raw), secured = encryptPortalToken(raw);
      if (!hash || secured.error) return { data: null, error: { code: "LINK_RECOVERY_UNAVAILABLE", message: secured.error ?? "Could not secure the invoice link." } };
      candidate = { token_hash: hash, token_hint: getPortalTokenHint(raw), token_encrypted: secured.encryptedToken,
        expires_at: new Date(Date.now() + INVOICE_PORTAL_LINK_LIFETIME_DAYS * 86400000).toISOString() };
    }
    const saved = await callDeliveryCommand(input.supabase, "manage_invoice_portal_link", { ...identity, p_candidate: candidate });
    if (saved.error) return { data: null, error: saved.error };
    data = saved.data;
  }
  const outcomes = input.intent === "generate" ? ["created", "reused"] : input.intent === "regenerate" ? ["regenerated"] : ["revoked"];
  if (!data || data.request_id !== input.requestId || data.id !== input.invoiceId || data.reviewed_version !== input.version || data.intent !== input.intent
    || data.target_token_id !== input.tokenId || !uuid(data.token_id) || !outcomes.includes(data.outcome)
    || !Number.isSafeInteger(data.revoked_count) || data.revoked_count < 0 || !digest(data.link_version) || !digest(data.current_link_version)
    || typeof data.replayed !== "boolean" || typeof data.token_available !== "boolean"
    || (input.intent === "revoke" && (data.token_available || data.token_id !== input.tokenId))
    || (data.token_available ? typeof data.token_encrypted !== "string" || !data.token_encrypted || !digest(data.token_hash) : data.token_encrypted !== null || data.token_hash !== null)
    || !(data.expires_at === null || typeof data.expires_at === "string" && Number.isFinite(Date.parse(data.expires_at))))
    return { data: null, error: { code: "LINK_UNCONFIRMED", message: "The invoice-link action could not be confirmed. Check the earlier action here safely." } };
  return { data: data as InvoiceLinkReceipt, error: null };
}
