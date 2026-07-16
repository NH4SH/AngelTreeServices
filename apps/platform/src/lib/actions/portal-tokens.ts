"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";
import { approveQuoteAndEnsureWorkOrder } from "@/lib/quotes/workflow";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createNewQuotePortalTokenRecord, createOrGetQuotePortalTokenRecord, getActiveQuotePortalTokens } from "@/lib/portal/quote-links";
import { getPortalUrl } from "@/lib/portal/urls";
import type { QuoteStatus } from "@/lib/types/database";

export type PortalTokenActionState = {
  ok: boolean;
  status: string;
  message: string;
  portalUrl?: string;
  expiresAt?: string;
  reusedExisting?: boolean;
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
    return { ok: false, status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: "error", message: "Sign in before generating customer links." };
  }

  const quoteId = getString(formData, "quote_id");
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, customer_id")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    console.error("Quote portal link quote lookup failed", quoteError);
    return { ok: false, status: "error", message: quoteError?.message ?? "Quote not found or no access." };
  }

  const tokenRecord = await createOrGetQuotePortalTokenRecord({ quoteId: quote.id, supabase });

  if (tokenRecord.error) {
    return { ok: false, status: "error", message: tokenRecord.error };
  }

  if (tokenRecord.created) {
    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: "quote_portal_link_generated",
      subjectId: quote.id,
      subjectType: "quote",
    });
  }

  revalidatePath(`/admin/quotes/${quote.id}`);

  return {
    ok: true,
    status: "success",
    message: "Customer link ready.",
    portalUrl: await getPortalUrl("quote", tokenRecord.rawToken),
    expiresAt: tokenRecord.expiresAt,
    reusedExisting: !tokenRecord.created,
  };
}

export async function regenerateQuotePortalLink(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: "error", message: "Sign in before regenerating customer links." };
  }

  const quoteId = getString(formData, "quote_id");
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, customer_id")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    console.error("Quote portal link quote lookup failed", quoteError);
    return { ok: false, status: "error", message: quoteError?.message ?? "Quote not found or no access." };
  }

  const activeTokenLookup = await getActiveQuotePortalTokens(supabase, quote.id);
  if (activeTokenLookup.error) {
    return { ok: false, status: "error", message: activeTokenLookup.error };
  }

  const tokenRecord = await createNewQuotePortalTokenRecord({ customerId: quote.customer_id, quoteId: quote.id, supabase, userId: user.id });

  if (tokenRecord.error || !tokenRecord.tokenId) {
    return { ok: false, status: "error", message: tokenRecord.error ?? "Could not regenerate a secure quote token." };
  }

  const activeTokenIds = activeTokenLookup.tokens.map((token) => token.id);
  if (activeTokenIds.length > 0) {
    const { error: revokeError } = await supabase
      .from("quote_portal_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("quote_id", quote.id)
      .in("id", activeTokenIds);

    if (revokeError) {
      await supabase.from("quote_portal_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenRecord.tokenId);
      console.error("Quote portal link regeneration revoke failed", revokeError);
      return { ok: false, status: "error", message: "Could not regenerate the customer link. The previous link remains protected." };
    }
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "quote_portal_link_regenerated",
    subjectId: quote.id,
    subjectType: "quote",
  });

  revalidatePath(`/admin/quotes/${quote.id}`);

  return {
    ok: true,
    status: "success",
    message: activeTokenIds.length
      ? "Secure customer quote link regenerated. The previous active link is now revoked."
      : "Customer link ready.",
    portalUrl: await getPortalUrl("quote", tokenRecord.rawToken),
    expiresAt: tokenRecord.expiresAt,
    reusedExisting: false,
  };
}

export async function revokeQuotePortalLink(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: "error", message: "Sign in before revoking customer links." };
  }

  const tokenId = getString(formData, "token_id");
  const quoteId = getString(formData, "quote_id");
  const { error } = await supabase
    .from("quote_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("quote_id", quoteId);

  if (error) {
    console.error("Quote portal link revoke failed", error);
    return { ok: false, status: "error", message: "Could not revoke the customer link. Please try again." };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "quote_portal_link_revoked",
    subjectId: quoteId,
    subjectType: "quote",
  });

  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true, status: "success", message: "Secure customer quote link revoked." };
}

export async function approveQuoteByPortalToken(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const rawToken = getString(formData, "token");
  const lookup = await getQuoteByPortalToken(rawToken);
  const supabase = getServiceRoleClient();

  if (!supabase || lookup.status !== "ready" || !lookup.quote || !lookup.tokenId) {
    return { ok: false, status: "error", message: lookup.message || "This quote link is not available." };
  }

  if (!canCustomerRespondToQuote(lookup.quote.status)) {
    return { ok: false, status: "error", message: "This quote is no longer open for approval." };
  }

  const approvedAt = new Date().toISOString();
  const approvalResult = await approveQuoteAndEnsureWorkOrder(supabase, lookup.quote.id, approvedAt);

  if (!approvalResult.ok) {
    return { ok: false, status: "error", message: approvalResult.message };
  }

  await supabase.from("quote_portal_tokens").update({ used_at: approvedAt }).eq("id", lookup.tokenId);
  await logPortalActivity(supabase, lookup.quote.id, "quote_portal_approved");

  revalidatePortalQuote(rawToken, lookup.quote.id);
  return { ok: true, status: "success", message: "Thank you. Your quote has been approved. Angel Tree Services will follow up with scheduling details." };
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
    return { ok: false, status: "error", message: lookup.message || "This quote link is not available." };
  }

  if (!canCustomerRespondToQuote(lookup.quote.status)) {
    return { ok: false, status: "error", message: "This quote is no longer open for changes." };
  }

  if (message.length < 3 || message.length > 1000) {
    return { ok: false, status: "error", message: "Please enter a short message between 3 and 1,000 characters." };
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
    return { ok: false, status: "error", message: noteError?.message ?? "We could not save your message right now. Please try again." };
  }

  const { error: quoteError } = await supabase
    .from("quotes")
    .update({ status: "change_requested", approved_at: null })
    .eq("id", lookup.quote.id);

  if (quoteError) {
    await supabase.from("notes").delete().eq("id", note.id);
    return { ok: false, status: "error", message: quoteError.message };
  }

  await supabase.from("quote_portal_tokens").update({ used_at: requestedAt }).eq("id", lookup.tokenId);
  await logPortalActivity(supabase, lookup.quote.id, "quote_portal_changes_requested");

  revalidatePortalQuote(rawToken, lookup.quote.id);
  return { ok: true, status: "success", message: "Your change request has been sent. Angel Tree Services will review it and follow up." };
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
