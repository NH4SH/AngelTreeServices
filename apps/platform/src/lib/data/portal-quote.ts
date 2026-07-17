import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { decryptPortalToken, hashPortalToken } from "@/lib/portal/tokens";
import { getPortalUrl } from "@/lib/portal/urls";
import type { DataResult, JobWithRelations, QuoteDetail, QuotePortalToken, QuoteWithRelations } from "@/lib/types/database";

export type QuotePortalTokenSummary = Pick<
  QuotePortalToken,
  "id" | "quote_id" | "token_hint" | "expires_at" | "used_at" | "revoked_at" | "created_at"
> & {
  portalUrl: string | null;
};

export type PortalQuoteLookupStatus = "ready" | "configuration_required" | "invalid" | "expired" | "revoked";

export type PortalQuoteLookup = {
  status: PortalQuoteLookupStatus;
  quote: QuoteDetail | null;
  tokenId: string | null;
  message: string;
};

export async function getQuotePortalTokens(quoteId: string): Promise<DataResult<QuotePortalTokenSummary[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("quote_portal_tokens")
    .select("id, quote_id, token_hint, token_encrypted, expires_at, used_at, revoked_at, created_at")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const tokenRows = data ?? [];
  const records = await Promise.all(tokenRows.map(async (token) => {
    const isActive = !token.revoked_at && (!token.expires_at || new Date(token.expires_at).getTime() > Date.now());
    const rawToken = isActive ? decryptPortalToken(token.token_encrypted) : null;
    const { token_encrypted: _tokenEncrypted, ...summary } = token;

    return {
      ...summary,
      portalUrl: rawToken ? await getPortalUrl("quote", rawToken) : null,
    } as QuotePortalTokenSummary;
  }));

  return { data: records, error: null };
}

export async function getQuoteByPortalToken(rawToken: string): Promise<PortalQuoteLookup> {
  const supabase = getServiceRoleClient();
  const tokenHash = hashPortalToken(rawToken);

  if (!supabase) {
    return portalLookup("configuration_required", "Secure quote links are not configured yet.");
  }

  if (!tokenHash) {
    return portalLookup("invalid", "This secure quote link is not valid.");
  }

  const { data: token, error: tokenError } = await supabase
    .from("quote_portal_tokens")
    .select("id, quote_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !token) {
    return portalLookup("invalid", "This secure quote link is not valid.");
  }

  if (token.revoked_at) {
    return portalLookup("revoked", "This secure quote link has been revoked. Please contact Angel Tree Services.");
  }

  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return portalLookup("expired", "This secure quote link has expired. Please contact Angel Tree Services.");
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "*, jobs:jobs!quotes_job_id_fkey(id, status, service_type, requested_scope, service_locations(id, label, street, city, state, postal_code)), customers(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email), recipient_contact:organization_contacts!quotes_recipient_contact_id_fkey(id, full_name, email, phone, is_active), approval_contact:organization_contacts!quotes_approval_contact_id_fkey(id, full_name, email, phone, is_active), onsite_contact:organization_contacts!quotes_onsite_contact_id_fkey(id, full_name, email, phone, is_active), billing_contact:organization_contacts!quotes_billing_contact_id_fkey(id, full_name, email, phone, is_active), service_locations(id, label, street, city, state, postal_code), quote_line_items(*)",
    )
    .eq("id", token.quote_id)
    .single();

  if (quoteError || !quote) {
    return portalLookup("invalid", "This quote is not available.");
  }

  return {
    status: "ready",
    quote: {
      ...(quote as QuoteWithRelations),
      jobs: (quote as { jobs?: JobWithRelations | null }).jobs ?? null,
      notes: [],
    },
    tokenId: token.id,
    message: "",
  };
}

function portalLookup(status: Exclude<PortalQuoteLookupStatus, "ready">, message: string): PortalQuoteLookup {
  return { status, quote: null, tokenId: null, message };
}
