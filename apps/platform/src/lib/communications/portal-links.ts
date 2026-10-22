import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readVerifiedDocumentToken } from "@/lib/portal/document-token";
import { getCanonicalAppBaseUrl } from "@/lib/security/app-base-url";
export async function getExistingCommunicationPortalUrl(supabase: SupabaseClient, portalType: "quote" | "invoice", recordId: string) {
  const token = await readVerifiedDocumentToken({ supabase, kind: portalType, recordId });
  if (token.error || !token.rawToken) return { error: token.error, url: null, tokenId: null };
  const appBaseUrl = getCanonicalAppBaseUrl();
  if (!appBaseUrl) return { error: "APP_BASE_URL is not configured for customer links.", url: null, tokenId: null };
  return { error: null, url: new URL(`/portal/${portalType}/${encodeURIComponent(token.rawToken)}`, appBaseUrl).toString(), tokenId: token.tokenId };
}
