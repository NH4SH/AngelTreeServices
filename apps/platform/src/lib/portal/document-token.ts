import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPortalToken, hashPortalToken } from "@/lib/portal/tokens";
type Kind = "quote" | "invoice";
export async function readVerifiedDocumentToken({ supabase, kind, recordId, tokenId, rawToken }: {
  supabase: SupabaseClient; kind: Kind; recordId: string; tokenId?: string; rawToken?: string;
}) {
  const failure = { error: "The customer link cannot be verified for this document. Review its current links before sending.", tokenId: null, rawToken: null, expiresAt: null };
  const table = kind === "quote" ? "quote_portal_tokens" : "invoice_portal_tokens", column = kind === "quote" ? "quote_id" : "invoice_id";
  let query = supabase.from(table).select(`id, ${column}, customer_id, organization_id, token_hash, token_encrypted, expires_at, revoked_at`).eq(column, recordId);
  query = tokenId ? query.eq("id", tokenId) : query.is("revoked_at", null).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  const [{ data: token, error }, source] = await Promise.all([query.maybeSingle(), supabase.from(kind === "quote" ? "quotes" : "invoices").select("customer_id, organization_id").eq("id", recordId).maybeSingle()]);
  if (error || source.error || !token || !source.data || (token.customer_id ?? null) !== source.data.customer_id || (token.organization_id ?? null) !== source.data.organization_id
    || token.revoked_at || token.expires_at !== null && (!Number.isFinite(Date.parse(token.expires_at)) || Date.parse(token.expires_at) <= Date.now())) return failure;
  const raw = rawToken ?? decryptPortalToken(token.token_encrypted);
  if (!raw || hashPortalToken(raw) !== token.token_hash) return failure;
  return { error: null, tokenId: token.id as string, rawToken: raw, expiresAt: token.expires_at as string | null };
}
