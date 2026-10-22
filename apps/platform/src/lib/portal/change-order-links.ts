import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { decryptPortalToken, encryptPortalToken, generatePortalToken, getPortalTokenHint, hashPortalToken, QUOTE_PORTAL_LINK_LIFETIME_DAYS } from "@/lib/portal/tokens";

type LinkIntent = "generate" | "regenerate" | "revoke";
export type LinkCommandInput = { changeOrderId: string; requestId: string; revision: number; linkVersion: string; intent: LinkIntent; supabase: SupabaseClient };
export type ChangeOrderLinkReceipt = { request_id: string; id: string; intent: LinkIntent; reviewed_revision: number; reviewed_link_version: string;
  token_id: string | null; outcome: string; revoked_count: number; link_version: string; current_link_version: string; current_revision: number;
  current_status: string; replayed: boolean; token_available: boolean; token_encrypted: string | null; token_hash: string | null; expires_at: string | null };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export async function performChangeOrderLinkCommand(input: LinkCommandInput) {
  const identity = { p_request_id: input.requestId, p_change_order_id: input.changeOrderId, p_expected_revision: input.revision, p_expected_link_version: input.linkVersion, p_intent: input.intent };
  const existing = await callDeliveryCommand(input.supabase, "get_change_order_link_request", identity);
  if (existing.error) return { data: null, error: existing.error };
  let data = existing.data;
  if (data === null) {
    let candidate = null;
    if (input.intent !== "revoke") {
      const raw = generatePortalToken(), hash = hashPortalToken(raw), encrypted = encryptPortalToken(raw);
      if (!hash || encrypted.error) return { data: null, error: { code: "LINK_RECOVERY_UNAVAILABLE", message: encrypted.error ?? "Could not secure the customer link." } };
      candidate = { token_hash: hash, token_hint: getPortalTokenHint(raw), token_encrypted: encrypted.encryptedToken,
        expires_at: new Date(Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 86400000).toISOString() };
    }
    const saved = await callDeliveryCommand(input.supabase, "manage_change_order_portal_link", { ...identity, p_candidate: candidate });
    if (saved.error) return { data: null, error: saved.error };
    data = saved.data;
  }
  const outcomes = input.intent === "generate" ? ["created", "reused"] : input.intent === "regenerate" ? ["regenerated"] : ["revoked"];
  if (!data || data.request_id !== input.requestId || data.id !== input.changeOrderId || data.intent !== input.intent || data.reviewed_revision !== input.revision
    || data.reviewed_link_version !== input.linkVersion || !outcomes.includes(data.outcome) || !Number.isSafeInteger(data.revoked_count) || data.revoked_count < 0
    || !digest(data.link_version) || !digest(data.current_link_version) || !Number.isSafeInteger(data.current_revision) || data.current_revision < input.revision
    || !["draft", "pending_internal_review", "ready_to_send", "sent", "approved", "declined", "change_requested", "cancelled", "expired"].includes(data.current_status)
    || typeof data.replayed !== "boolean" || typeof data.token_available !== "boolean" || !(data.token_id === null || uuid(data.token_id))
    || (input.intent === "revoke" ? (data.token_id !== null || data.token_available !== false) : !uuid(data.token_id))
    || (data.token_available ? typeof data.token_encrypted !== "string" || !data.token_encrypted || !digest(data.token_hash) : data.token_encrypted !== null || data.token_hash !== null)
    || !(data.expires_at === null || typeof data.expires_at === "string" && Number.isFinite(Date.parse(data.expires_at))))
    return { data: null, error: { code: "LINK_UNCONFIRMED", message: "The link action could not be confirmed. Retry the same action here safely." } };
  return { data: data as ChangeOrderLinkReceipt, error: null };
}

export async function createOrGetChangeOrderPortalTokenRecord(input: Omit<LinkCommandInput, "intent">) {
  const result = await performChangeOrderLinkCommand({ ...input, intent: "generate" });
  if (result.error) return failure(result.error.message, ["PT409", "40001", "22023", "23514", "42501"].includes(result.error.code ?? ""));
  const receipt = result.data;
  if (!receipt?.token_available || !receipt.token_id) return failure("The earlier link was replaced or revoked. Reload the record before sending.", true);
  const rawToken = decryptPortalToken(receipt.token_encrypted);
  if (!rawToken || hashPortalToken(rawToken) !== receipt.token_hash) return failure("The active link cannot be recovered. Review Link controls and the link recovery setup before sending.");
  return { created: receipt.outcome === "created", error: null, reviewRequired: false, expiresAt: receipt.expires_at ?? "", rawToken, tokenId: receipt.token_id };
}
function failure(error: string, reviewRequired = false) { return { created: false, error, reviewRequired, expiresAt: "", rawToken: "", tokenId: "" }; }
