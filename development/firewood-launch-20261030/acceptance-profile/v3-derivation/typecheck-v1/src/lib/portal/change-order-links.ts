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

type PortalTokenRecord = {
  created: boolean;
  expires_at: string | null;
  id: string;
  token_encrypted: string | null;
};

export async function createOrGetChangeOrderPortalTokenRecord({
  changeOrderId,
  supabase,
}: {
  changeOrderId: string;
  supabase: SupabaseClient;
}) {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);
  const encrypted = encryptPortalToken(rawToken);

  if (!tokenHash || encrypted.error) {
    return failure(encrypted.error ?? "Could not generate a secure change order link.");
  }

  const expiresAt = new Date(
    Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .rpc("create_or_get_change_order_portal_token", {
      p_change_order_id: changeOrderId,
      p_expires_at: expiresAt,
      p_token_encrypted: encrypted.encryptedToken,
      p_token_hash: tokenHash,
      p_token_hint: getPortalTokenHint(rawToken),
    })
    .single();

  if (error || !data) {
    console.error("Change order portal token create-or-get failed", error);
    return failure(error?.message ?? "Could not create a secure change order link.");
  }

  const token = data as PortalTokenRecord;
  if (token.created) {
    return { created: true, error: null, expiresAt: token.expires_at ?? expiresAt, rawToken, tokenId: token.id };
  }

  const recoveredToken = decryptPortalToken(token.token_encrypted);
  if (!recoveredToken) {
    return failure("An active link exists but cannot be recovered. Regenerate it only if you intend to disable the previous link.");
  }

  return {
    created: false,
    error: null,
    expiresAt: token.expires_at ?? expiresAt,
    rawToken: recoveredToken,
    tokenId: token.id,
  };
}

export async function createNewChangeOrderPortalTokenRecord({
  changeOrderId,
  customerId,
  organizationId,
  intendedContactId,
  supabase,
  userId,
}: {
  changeOrderId: string;
  customerId: string | null;
  organizationId: string | null;
  intendedContactId: string | null;
  supabase: SupabaseClient;
  userId: string;
}) {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);
  const encrypted = encryptPortalToken(rawToken);
  if (!tokenHash || encrypted.error) return failure(encrypted.error ?? "Could not generate a secure change order link.");

  const expiresAt = new Date(Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase.from("change_order_portal_tokens").insert({
    change_order_id: changeOrderId,
    customer_id: customerId,
    organization_id: organizationId,
    intended_contact_id: intendedContactId,
    token_hash: tokenHash,
    token_hint: getPortalTokenHint(rawToken),
    token_encrypted: encrypted.encryptedToken,
    expires_at: expiresAt,
    created_by_user_id: userId,
  }).select("id").single();

  if (error || !data) {
    console.error("Change order portal token regeneration failed", error);
    return failure(error?.message ?? "Could not regenerate the secure change order link.");
  }
  return { created: true, error: null, expiresAt, rawToken, tokenId: data.id as string };
}

function failure(error: string) {
  return { created: false, error, expiresAt: "", rawToken: "", tokenId: "" };
}
