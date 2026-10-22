import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import type { QuoteLinkSelection } from "@/lib/portal/quote-link-attempt";
import { decryptPortalToken, encryptPortalToken, generatePortalToken, getPortalTokenHint, hashPortalToken, QUOTE_PORTAL_LINK_LIFETIME_DAYS } from "@/lib/portal/tokens";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export async function performQuoteLinkBatchCommand({ requestId, selection, supabase }: { requestId: string; selection: QuoteLinkSelection; supabase: SupabaseClient }) {
  const identity = { p_request_id: requestId, p_entries: selection };
  const previous = await callDeliveryCommand(supabase, "get_quote_link_batch_request", identity);
  if (previous.error) return { data: null, error: previous.error };
  let data = previous.data;
  if (data === null) {
    const entries = [];
    for (const entry of selection) {
      const state = await callDeliveryCommand(supabase, "get_quote_link_state", { p_quote_id: entry.id });
      if (state.error) return { data: null, error: state.error };
      if (!state.data || state.data.link_version !== entry.version || !Array.isArray(state.data.tokens))
        return { data: null, error: { code: "PT409", message: "The selected proposal links changed. Reload before replacing them." } };
      const active = state.data.tokens.find((token: { revoked_at?: string | null; expires_at?: string | null }) => !token.revoked_at && (!token.expires_at || Date.parse(token.expires_at) > Date.now()));
      const raw = active?.usable && active.token_encrypted ? decryptPortalToken(active.token_encrypted) : null;
      const reusable = Boolean(raw && hashPortalToken(raw) === active.token_hash);
      let candidate = null;
      if (!reusable) {
        const rawToken = generatePortalToken(), hash = hashPortalToken(rawToken), secured = encryptPortalToken(rawToken);
        if (!hash || secured.error) return { data: null, error: { code: "LINK_RECOVERY_UNAVAILABLE", message: secured.error ?? "Could not secure the proposal links." } };
        candidate = { token_hash: hash, token_hint: getPortalTokenHint(rawToken), token_encrypted: secured.encryptedToken,
          expires_at: new Date(Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 86400000).toISOString() };
      }
      entries.push({ ...entry, intent: active && !reusable ? "regenerate" : "generate", candidate });
    }
    const saved = await callDeliveryCommand(supabase, "recover_quote_portal_links", { p_request_id: requestId, p_entries: entries });
    if (saved.error) return { data: null, error: saved.error };
    data = saved.data;
  }
  const fail = () => ({ data: null, error: { code: "LINK_UNCONFIRMED", message: "The proposal-link replacements could not be confirmed. Check the earlier action safely." } });
  if (!data || data.request_id !== requestId || typeof data.replayed !== "boolean" || !Array.isArray(data.entries) || !Array.isArray(data.results)
    || data.entries.length !== selection.length || data.results.length !== selection.length) return fail();
  const versions: Record<string, string> = {};
  for (const entry of selection) {
    const receipts = data.entries.filter((v: { id: string }) => v.id === entry.id), results = data.results.filter((v: { id: string }) => v.id === entry.id);
    if (receipts.length !== 1 || results.length !== 1) return fail();
    const receipt = receipts[0], result = results[0];
    if (receipt.version !== entry.version || !uuid(receipt.child_request_id) || result.request_id !== receipt.child_request_id || result.reviewed_version !== entry.version
      || !["generate", "regenerate"].includes(result.intent) || result.target_token_id !== null || !uuid(result.token_id)
      || !(result.intent === "regenerate" ? result.outcome === "regenerated" : ["created", "reused"].includes(result.outcome))
      || !Number.isSafeInteger(result.revoked_count) || result.revoked_count < 0 || !digest(result.link_version) || !digest(result.current_link_version)
      || typeof result.replayed !== "boolean" || typeof result.token_available !== "boolean"
      || (result.token_available ? typeof result.token_encrypted !== "string" || !result.token_encrypted || !digest(result.token_hash) : result.token_encrypted !== null || result.token_hash !== null)) return fail();
    versions[entry.id] = result.current_link_version;
  }
  return { data: { replayed: data.replayed as boolean, versions }, error: null };
}
