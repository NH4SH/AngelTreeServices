import "server-only";
import { readVerifiedDocumentToken } from "@/lib/portal/document-token";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  encryptPortalToken,
  generatePortalToken,
  getPortalTokenHint,
  hashPortalToken,
  INVOICE_PORTAL_LINK_LIFETIME_DAYS,
} from "@/lib/portal/tokens";
import { formatInvoicePortalTokenError } from "@/lib/portal/invoice-token-errors";
import { type PortalTokenRpcRecord } from "@/lib/portal/token-record";

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

  const token = data as PortalTokenRpcRecord;
  const verified = await readVerifiedDocumentToken({ supabase, kind: "invoice", recordId: invoiceId, tokenId: token.id, ...(token.created ? { rawToken } : {}) });
  const recoveredToken = verified.rawToken;
  if (!recoveredToken) {
    return {
      created: false,
      error: verified.error ?? "Review the current customer links before sending.",
      expiresAt: "",
      rawToken: "",
      tokenId: "",
    };
  }

  return {
    created: token.created,
    error: null,
    expiresAt: token.expires_at ?? expiresAt,
    rawToken: recoveredToken,
    tokenId: token.id,
  };
}
