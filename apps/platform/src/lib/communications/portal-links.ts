import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPortalToken } from "@/lib/portal/tokens";

export async function getExistingCommunicationPortalUrl(
  supabase: SupabaseClient,
  portalType: "quote" | "invoice",
  recordId: string,
) {
  const table = portalType === "quote" ? "quote_portal_tokens" : "invoice_portal_tokens";
  const recordColumn = portalType === "quote" ? "quote_id" : "invoice_id";
  const { data, error } = await supabase
    .from(table)
    .select("id, token_encrypted, expires_at, revoked_at")
    .eq(recordColumn, recordId)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "No active customer link exists.", url: null };
  }

  const rawToken = decryptPortalToken(data.token_encrypted);
  if (!rawToken) {
    return { error: "The active customer link cannot be recovered safely.", url: null };
  }

  const appBaseUrl = getAppBaseUrl();
  if (!appBaseUrl) {
    return { error: "APP_BASE_URL is not configured for customer links.", url: null };
  }

  return {
    error: null,
    url: new URL(`/portal/${portalType}/${encodeURIComponent(rawToken)}`, appBaseUrl).toString(),
  };
}

function getAppBaseUrl() {
  const value = process.env.APP_BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : null;
  } catch {
    return null;
  }
}
