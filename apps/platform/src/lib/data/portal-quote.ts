import "server-only";

import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { decryptPortalToken, hashPortalToken } from "@/lib/portal/tokens";
import { getPortalUrl } from "@/lib/portal/urls";
import { safeStaffMessage } from "@/lib/security/errors";
import type { DataResult, JobWithRelations, QuoteDetail, QuotePortalToken, QuoteWithRelations } from "@/lib/types/database";

export type QuotePortalTokenSummary = Pick<
  QuotePortalToken,
  "id" | "quote_id" | "token_hint" | "expires_at" | "used_at" | "revoked_at" | "created_at"
> & {
  portalUrl: string | null;
  usable: boolean;
};

export type PortalQuoteLookupStatus = "ready" | "configuration_required" | "invalid" | "expired" | "revoked";

export type PortalQuoteLookup = {
  status: PortalQuoteLookupStatus;
  quote: QuoteDetail | null;
  tokenId: string | null;
  message: string;
};

export async function getQuotePortalTokens(quoteId: string): Promise<DataResult<QuotePortalTokenSummary[]> & { linkVersion: string | null }> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured.", linkVersion: null };
  const { data, error } = await callDeliveryCommand(supabase, "get_quote_link_state", { p_quote_id: quoteId });
  if (error || !data || typeof data.link_version !== "string" || !/^[a-f0-9]{64}$/.test(data.link_version) || !Array.isArray(data.tokens)
    || data.tokens.some((t: unknown) => !t || typeof t !== "object" || typeof (t as { id?: unknown }).id !== "string" || typeof (t as { usable?: unknown }).usable !== "boolean"
      || !((t as { token_encrypted?: unknown }).token_encrypted === null || typeof (t as { token_encrypted?: unknown }).token_encrypted === "string")))
    return { data: [], error: safeStaffMessage(error?.message ?? "Quote links could not be loaded. Reload before changing them."), linkVersion: null };
  const records = await Promise.all(data.tokens.map(async (token: QuotePortalToken & { usable: boolean }) => {
    const raw = token.usable ? decryptPortalToken(token.token_encrypted) : null;
    return { id: token.id, quote_id: token.quote_id, token_hint: token.token_hint, expires_at: token.expires_at, revoked_at: token.revoked_at, created_at: token.created_at, used_at: token.used_at,
      usable: token.usable, portalUrl: raw && hashPortalToken(raw) === token.token_hash ? await getPortalUrl("quote", raw) : null };
  }));
  return { data: records, error: null, linkVersion: data.link_version };
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
    .select("id, quote_id, customer_id, organization_id, expires_at, revoked_at")
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
      "*, jobs:jobs!quotes_job_id_fkey(id, status, service_type, requested_scope, service_locations(id, label, street, city, state, postal_code)), customers:customers!quotes_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email), recipient_contact:organization_contacts!quotes_recipient_contact_id_fkey(id, full_name, email, phone, is_active), approval_contact:organization_contacts!quotes_approval_contact_id_fkey(id, full_name, email, phone, is_active), onsite_contact:organization_contacts!quotes_onsite_contact_id_fkey(id, full_name, email, phone, is_active), billing_contact:organization_contacts!quotes_billing_contact_id_fkey(id, full_name, email, phone, is_active), service_locations(id, label, street, city, state, postal_code), quote_line_items(*)",
    )
    .eq("id", token.quote_id)
    .single();

  if (quoteError || !quote) {
    return portalLookup("invalid", "This quote is not available.");
  }

  if (token.customer_id !== quote.customer_id || token.organization_id !== quote.organization_id) return portalLookup("invalid", "This secure proposal link is no longer available. Please contact Angel Tree Services.");

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
