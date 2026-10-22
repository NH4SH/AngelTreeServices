import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptPortalToken,
  encryptPortalToken,
  generatePortalToken,
  getPortalTokenHint,
  hashPortalToken,
  QUOTE_PORTAL_LINK_LIFETIME_DAYS,
} from "@/lib/portal/tokens";
import { getEncryptedPortalToken, type PortalTokenRpcRecord } from "@/lib/portal/token-record";

export const LEGACY_QUOTE_PORTAL_LINK_RECOVERY_ERROR =
  "An existing customer link is still active but was created before link recovery was enabled. Use Regenerate link only if you intend to replace it.";

export async function createOrGetQuotePortalTokenRecord({
  quoteId,
  supabase,
}: {
  quoteId: string;
  supabase: SupabaseClient;
}): Promise<
  | { created: boolean; error: null; expiresAt: string; rawToken: string; tokenId: string }
  | { created: false; error: string; expiresAt: ""; rawToken: ""; tokenId: "" }
> {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);
  const encrypted = encryptPortalToken(rawToken);

  if (!tokenHash || encrypted.error) {
    return { created: false, error: encrypted.error ?? "Could not generate a secure quote portal link.", expiresAt: "", rawToken: "", tokenId: "" };
  }

  const expiresAt = new Date(
    Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .rpc("create_or_get_quote_portal_token", {
      p_expires_at: expiresAt,
      p_quote_id: quoteId,
      p_token_encrypted: encrypted.encryptedToken,
      p_token_hash: tokenHash,
      p_token_hint: getPortalTokenHint(rawToken),
    })
    .single();

  if (error || !data) {
    console.error("Quote portal token create-or-get failed", error);
    return { created: false, error: error?.message ?? "Could not create a secure quote portal link.", expiresAt: "", rawToken: "", tokenId: "" };
  }

  const token = data as PortalTokenRpcRecord;
  if (token.created) {
    return { created: true, error: null, expiresAt: token.expires_at ?? expiresAt, rawToken, tokenId: token.id };
  }

  const recoveredToken = decryptPortalToken(getEncryptedPortalToken(token));
  if (!recoveredToken) {
    return {
      created: false,
      error: LEGACY_QUOTE_PORTAL_LINK_RECOVERY_ERROR,
      expiresAt: "",
      rawToken: "",
      tokenId: "",
    };
  }

  return {
    created: false,
    error: null,
    expiresAt: token.expires_at ?? expiresAt,
    rawToken: recoveredToken,
    tokenId: token.id,
  };
}
