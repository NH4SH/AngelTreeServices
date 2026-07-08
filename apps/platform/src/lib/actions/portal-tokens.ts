"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";
import { approveQuoteAndEnsureWorkOrder } from "@/lib/quotes/workflow";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  generatePortalToken,
  getPortalTokenHint,
  QUOTE_PORTAL_LINK_LIFETIME_DAYS,
  hashPortalToken,
} from "@/lib/portal/tokens";
import type { QuoteStatus } from "@/lib/types/database";

export type PortalTokenActionState = {
  status: string;
  message: string;
  portalUrl?: string;
  expiresAt?: string;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createQuotePortalLink(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before generating customer links." };
  }

  const quoteId = getString(formData, "quote_id");
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, customer_id")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Quote not found or no access." };
  }

  const rawToken = generatePortalToken();
  const expiresAt = new Date(Date.now() + QUOTE_PORTAL_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tokenHash = hashPortalToken(rawToken);

  if (!tokenHash) {
    return { status: "error", message: "Could not generate a secure quote token." };
  }

  const { error } = await supabase.from("quote_portal_tokens").insert({
    quote_id: quote.id,
    customer_id: quote.customer_id,
    token_hash: tokenHash,
    token_hint: getPortalTokenHint(rawToken),
    expires_at: expiresAt,
    created_by_user_id: user.id,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath(`/admin/quotes/${quote.id}`);

  return {
    status: "success",
    message: "Secure customer quote link generated. Copy it now; the raw token is not stored.",
    portalUrl: `${await getRequestOrigin()}/portal/quote/${rawToken}`,
    expiresAt,
  };
}

export async function revokeQuotePortalLink(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before revoking customer links." };
  }

  const tokenId = getString(formData, "token_id");
  const quoteId = getString(formData, "quote_id");
  const { error } = await supabase
    .from("quote_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("quote_id", quoteId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath(`/admin/quotes/${quoteId}`);
  return { status: "success", message: "Secure customer quote link revoked." };
}

export async function approveQuoteByPortalToken(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const rawToken = getString(formData, "token");
  const lookup = await getQuoteByPortalToken(rawToken);
  const supabase = getServiceRoleClient();

  if (!supabase || lookup.status !== "ready" || !lookup.quote || !lookup.tokenId) {
    return { status: "error", message: lookup.message || "This quote link is not available." };
  }

  if (!canCustomerRespondToQuote(lookup.quote.status)) {
    return { status: "error", message: "This quote is no longer open for approval." };
  }

  const approvedAt = new Date().toISOString();
  const approvalResult = await approveQuoteAndEnsureWorkOrder(supabase, lookup.quote.id, approvedAt);

  if (!approvalResult.ok) {
    return { status: "error", message: approvalResult.message };
  }

  await supabase.from("quote_portal_tokens").update({ used_at: approvedAt }).eq("id", lookup.tokenId);
  await logPortalActivity(supabase, lookup.quote.id, "quote_portal_approved");

  revalidatePortalQuote(rawToken, lookup.quote.id);
  return { status: "success", message: "Thank you. Your quote has been approved. Angel Tree Services will follow up with scheduling details." };
}

export async function requestQuoteChangesByPortalToken(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const rawToken = getString(formData, "token");
  const message = getString(formData, "message");
  const lookup = await getQuoteByPortalToken(rawToken);
  const supabase = getServiceRoleClient();

  if (!supabase || lookup.status !== "ready" || !lookup.quote || !lookup.tokenId) {
    return { status: "error", message: lookup.message || "This quote link is not available." };
  }

  if (!canCustomerRespondToQuote(lookup.quote.status)) {
    return { status: "error", message: "This quote is no longer open for changes." };
  }

  if (message.length < 3 || message.length > 1000) {
    return { status: "error", message: "Please enter a short message between 3 and 1,000 characters." };
  }

  const requestedAt = new Date().toISOString();
  const { data: note, error: noteError } = await supabase
    .from("notes")
    .insert({
      customer_id: lookup.quote.customer_id,
      service_location_id: lookup.quote.service_location_id,
      job_id: lookup.quote.job_id ?? null,
      visibility: "internal",
      body: `Customer portal change request: ${message}`,
    })
    .select("id")
    .single();

  if (noteError || !note) {
    return { status: "error", message: noteError?.message ?? "We could not save your message right now. Please try again." };
  }

  const { error: quoteError } = await supabase
    .from("quotes")
    .update({ status: "change_requested", approved_at: null })
    .eq("id", lookup.quote.id);

  if (quoteError) {
    await supabase.from("notes").delete().eq("id", note.id);
    return { status: "error", message: quoteError.message };
  }

  await supabase.from("quote_portal_tokens").update({ used_at: requestedAt }).eq("id", lookup.tokenId);
  await logPortalActivity(supabase, lookup.quote.id, "quote_portal_changes_requested");

  revalidatePortalQuote(rawToken, lookup.quote.id);
  return { status: "success", message: "Your change request has been sent. Angel Tree Services will review it and follow up." };
}

function canCustomerRespondToQuote(status: QuoteStatus) {
  return status === "draft" || status === "sent" || status === "change_requested";
}

function revalidatePortalQuote(rawToken: string, quoteId: string) {
  revalidatePath(`/portal/quote/${rawToken}`);
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function logPortalActivity(
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  quoteId: string,
  eventType: string,
) {
  await supabase.from("activity_log").insert({
    subject_type: "quote",
    subject_id: quoteId,
    event_type: eventType,
    metadata_json: { source: "customer_quote_portal" },
  });
}
