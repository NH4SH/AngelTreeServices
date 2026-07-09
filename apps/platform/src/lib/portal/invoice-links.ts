import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generatePortalToken,
  getPortalTokenHint,
  hashPortalToken,
  INVOICE_PORTAL_LINK_LIFETIME_DAYS,
} from "@/lib/portal/tokens";

export async function createInvoicePortalTokenRecord({
  customerId,
  invoiceId,
  replaceExisting = true,
  supabase,
  userId,
}: {
  customerId: string;
  invoiceId: string;
  replaceExisting?: boolean;
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  | { error: string; expiresAt: ""; rawToken: ""; tokenId: "" }
  | { error: null; expiresAt: string; rawToken: string; tokenId: string }
> {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);

  if (!tokenHash) {
    return { error: "Could not generate a secure invoice token.", expiresAt: "", rawToken: "", tokenId: "" };
  }

  const expiresAt = new Date(
    Date.now() + INVOICE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: token, error: tokenError } = await supabase
    .from("invoice_portal_tokens")
    .insert({
      invoice_id: invoiceId,
      customer_id: customerId,
      token_hash: tokenHash,
      token_hint: getPortalTokenHint(rawToken),
      expires_at: expiresAt,
      created_by_user_id: userId,
    })
    .select("id")
    .single();

  if (tokenError || !token) {
    return {
      error: tokenError?.message ?? "Could not save the secure invoice link.",
      expiresAt: "",
      rawToken: "",
      tokenId: "",
    };
  }

  if (replaceExisting) {
    const revokeError = await revokeOtherInvoicePortalTokens(supabase, invoiceId, token.id);

    if (revokeError) {
      await supabase.from("invoice_portal_tokens").delete().eq("id", token.id);
      return { error: revokeError, expiresAt: "", rawToken: "", tokenId: "" };
    }
  }

  return { error: null, expiresAt, rawToken, tokenId: token.id as string };
}

export async function revokeOtherInvoicePortalTokens(
  supabase: SupabaseClient,
  invoiceId: string,
  retainedTokenId: string,
) {
  const { error } = await supabase
    .from("invoice_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("invoice_id", invoiceId)
    .is("revoked_at", null)
    .neq("id", retainedTokenId);

  return error?.message ?? null;
}
