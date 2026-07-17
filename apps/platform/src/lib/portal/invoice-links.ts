import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptPortalToken,
  encryptPortalToken,
  generatePortalToken,
  getPortalTokenHint,
  hashPortalToken,
  INVOICE_PORTAL_LINK_LIFETIME_DAYS,
} from "@/lib/portal/tokens";
import { formatInvoicePortalTokenError } from "@/lib/portal/invoice-token-errors";

export type ActiveInvoicePortalToken = {
  id: string;
  encrypted_token: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type PortalTokenRecord = {
  created: boolean;
  encrypted_token: string | null;
  expires_at: string | null;
  id: string;
};

export async function createOrGetInvoicePortalTokenRecord({
  invoiceId,
  supabase,
}: {
  invoiceId: string;
  supabase: SupabaseClient;
}): Promise<
  | { created: boolean; error: null; expiresAt: string; rawToken: string; tokenId: string }
  | { created: false; error: string; expiresAt: ""; rawToken: ""; tokenId: "" }
> {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);
  const encrypted = encryptPortalToken(rawToken);

  if (!tokenHash || encrypted.error) {
    return { created: false, error: encrypted.error ?? "Could not generate a secure invoice token.", expiresAt: "", rawToken: "", tokenId: "" };
  }

  const expiresAt = new Date(
    Date.now() + INVOICE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .rpc("create_or_get_invoice_portal_token", {
      p_expires_at: expiresAt,
      p_invoice_id: invoiceId,
      p_token_encrypted: encrypted.encryptedToken,
      p_token_hash: tokenHash,
      p_token_hint: getPortalTokenHint(rawToken),
    })
    .single();

  if (error || !data) {
    console.error("Invoice portal token create-or-get failed", error);
    return { created: false, error: formatInvoicePortalTokenError(error?.message ?? "Could not save the secure invoice link."), expiresAt: "", rawToken: "", tokenId: "" };
  }

  const token = data as PortalTokenRecord;
  if (token.created) {
    return { created: true, error: null, expiresAt: token.expires_at ?? expiresAt, rawToken, tokenId: token.id };
  }

  const recoveredToken = decryptPortalToken(token.encrypted_token);
  if (!recoveredToken) {
    return {
      created: false,
      error: "An existing customer link is still active but was created before link recovery was enabled. Use Regenerate link only if you intend to replace it.",
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

export async function createNewInvoicePortalTokenRecord({
  customerId,
  organizationId,
  invoiceId,
  supabase,
  userId,
}: {
  customerId: string | null;
  organizationId: string | null;
  invoiceId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const rawToken = generatePortalToken();
  const tokenHash = hashPortalToken(rawToken);
  const encrypted = encryptPortalToken(rawToken);

  if (!tokenHash || encrypted.error) {
    return { error: encrypted.error ?? "Could not generate a secure invoice token.", expiresAt: "", rawToken: "", tokenId: "" };
  }

  const expiresAt = new Date(
    Date.now() + INVOICE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("invoice_portal_tokens")
    .insert({
      invoice_id: invoiceId,
      customer_id: customerId,
      organization_id: organizationId,
      token_hash: tokenHash,
      token_encrypted: encrypted.encryptedToken,
      token_hint: getPortalTokenHint(rawToken),
      expires_at: expiresAt,
      created_by_user_id: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Invoice portal token regeneration failed", error);
    return {
      error: formatInvoicePortalTokenError(error?.message ?? "Could not save the secure invoice link."),
      expiresAt: "",
      rawToken: "",
      tokenId: "",
    };
  }

  return { error: null, expiresAt, rawToken, tokenId: data.id as string };
}

export async function getActiveInvoicePortalTokens(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ tokens: ActiveInvoicePortalToken[]; error: string | null }> {
  const { data, error } = await supabase
    .from("invoice_portal_tokens")
    .select("id, encrypted_token, expires_at, revoked_at")
    .eq("invoice_id", invoiceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Invoice portal token lookup failed", error);
    return { tokens: [], error: formatInvoicePortalTokenError(error.message) };
  }

  const tokens = ((data ?? []) as ActiveInvoicePortalToken[]).filter(
    (token) => !token.expires_at || new Date(token.expires_at).getTime() > Date.now(),
  );

  return { tokens, error: null };
}
