"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";
import { approveQuoteAndEnsureWorkOrder } from "@/lib/quotes/workflow";
import { cancelPendingCommunications } from "@/lib/communications/queue";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createNewQuotePortalTokenRecord,
  createOrGetQuotePortalTokenRecord,
  getActiveQuotePortalTokens,
  LEGACY_QUOTE_PORTAL_LINK_RECOVERY_ERROR,
} from "@/lib/portal/quote-links";
import { getPortalUrl } from "@/lib/portal/urls";
import { normalizeMultiQuoteIds } from "@/lib/quotes/multi-email";
import type { QuoteStatus } from "@/lib/types/database";
import { checkPortalActionRateLimit } from "@/lib/security/portal-rate-limit";
import { safeStaffMessage } from "@/lib/security/errors";
import { emitCustomerActivity } from "@/lib/notifications/customer-activity";

export type PortalTokenActionState = {
  ok: boolean;
  status: string;
  message: string;
  portalUrl?: string;
  expiresAt?: string;
  reusedExisting?: boolean;
};

export type MultiQuotePortalRecoveryState = {
  message: string;
  ok: boolean;
  portalUrls: Record<string, string>;
  status: "idle" | "success" | "error";
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
    .select("id, customer_id, organization_id")
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
  const auth = await requireQuoteLinkRegenerator();
  if (auth.error) return auth.error;

  const quoteId = getString(formData, "quote_id");
  const result = await regenerateQuotePortalLinkForUser(auth.supabase, auth.userId, quoteId);
  if (result.ok) revalidatePath(`/admin/quotes/${quoteId}`);
  return result;
}

export async function regenerateLegacyQuotePortalLinksForEmail(
  _previousState: MultiQuotePortalRecoveryState,
  formData: FormData,
): Promise<MultiQuotePortalRecoveryState> {
  const quoteIds = normalizeMultiQuoteIds(formData.getAll("quote_id").map(String), 25);
  if (quoteIds.length === 0) {
    return { message: "No proposal links need replacement.", ok: false, portalUrls: {}, status: "error" };
  }

  const auth = await requireQuoteLinkRegenerator();
  if (auth.error) {
    return { message: auth.error.message, ok: false, portalUrls: {}, status: "error" };
  }

  const portalUrls: Record<string, string> = {};
  for (const quoteId of quoteIds) {
    const currentToken = await createOrGetQuotePortalTokenRecord({ quoteId, supabase: auth.supabase });
    if (!currentToken.error) {
      portalUrls[quoteId] = await getPortalUrl("quote", currentToken.rawToken);
      if (currentToken.created) {
        await recordActivity(auth.supabase, {
          actorUserId: auth.userId,
          eventType: "quote_portal_link_generated",
          subjectId: quoteId,
          subjectType: "quote",
        });
        revalidatePath(`/admin/quotes/${quoteId}`);
      }
      continue;
    }

    if (currentToken.error !== LEGACY_QUOTE_PORTAL_LINK_RECOVERY_ERROR) {
      return { message: currentToken.error, ok: false, portalUrls, status: "error" };
    }

    const result = await regenerateQuotePortalLinkForUser(auth.supabase, auth.userId, quoteId);
    if (!result.ok || !result.portalUrl) {
      return { message: result.message, ok: false, portalUrls, status: "error" };
    }

    portalUrls[quoteId] = result.portalUrl;
    revalidatePath(`/admin/quotes/${quoteId}`);
  }

  revalidatePath("/admin/quotes/email");
  return {
    message: quoteIds.length === 1
      ? "Replacement link ready. You can continue sending this proposal."
      : `${quoteIds.length} replacement links are ready. You can continue sending these proposals.`,
    ok: true,
    portalUrls,
    status: "success",
  };
}

async function requireQuoteLinkRegenerator() {
  const supabase = await createClient();
  if (!supabase) {
    return { error: { ok: false, status: "error", message: "Supabase is not configured." } satisfies PortalTokenActionState };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: { ok: false, status: "error", message: "Sign in before regenerating customer links." } satisfies PortalTokenActionState };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { error: { ok: false, status: "error", message: "Only internal staff can regenerate customer links." } satisfies PortalTokenActionState };
  }

  return { error: null, supabase, userId: user.id };
}

async function regenerateQuotePortalLinkForUser(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  userId: string,
  quoteId: string,
): Promise<PortalTokenActionState> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, customer_id, organization_id")
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

  const tokenRecord = await createNewQuotePortalTokenRecord({
    customerId: quote.customer_id,
    organizationId: quote.organization_id,
    quoteId: quote.id,
    supabase,
    userId,
  });

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
    actorUserId: userId,
    eventType: "quote_portal_link_regenerated",
    subjectId: quote.id,
    subjectType: "quote",
  });

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
  const rateLimit = await checkPortalActionRateLimit("quote-approve", rawToken);
  if (!rateLimit.available) return { ok: false, status: "error", message: "Quote responses are temporarily unavailable. Please try again shortly." };
  if (!rateLimit.allowed) return { ok: false, status: "error", message: "Please wait before submitting another response." };
  const lookup = await getQuoteByPortalToken(rawToken);
  const supabase = getServiceRoleClient();

  if (!supabase || lookup.status !== "ready" || !lookup.quote || !lookup.tokenId) {
    return { ok: false, status: "error", message: safeStaffMessage(lookup.message, "This quote link is not available.") };
  }

  if (!canCustomerRespondToQuote(lookup.quote.status)) {
    return { ok: false, status: "error", message: "This quote is no longer open for approval." };
  }

  const approvedAt = new Date().toISOString();
  const approvalResult = await approveQuoteAndEnsureWorkOrder(supabase, lookup.quote.id, approvedAt);

  if (!approvalResult.ok) {
    return { ok: false, status: "error", message: safeStaffMessage(approvalResult.message, "The quote could not be approved.") };
  }

  await supabase.from("quote_portal_tokens").update({ used_at: approvedAt }).eq("id", lookup.tokenId);
  await emitCustomerActivity({
    category: "quotes",
    customerId: lookup.quote.customer_id,
    destinationPath: `/admin/quotes/${lookup.quote.id}`,
    eventType: "quote_portal_approved",
    idempotencyKey: `quote:${lookup.quote.id}:portal-approved`,
    organizationId: lookup.quote.organization_id,
    quoteId: lookup.quote.id,
    recordLabel: lookup.quote.quote_number || "Quote",
    subjectId: lookup.quote.id,
    subjectType: "quote",
    summary: `${lookup.quote.organizations?.name ?? lookup.quote.customers?.display_name ?? "Customer"} approved ${lookup.quote.quote_number || "a quote"}.`,
    title: "Quote approved by customer",
  });

  revalidatePortalQuote(rawToken, lookup.quote.id);
  return { ok: true, status: "success", message: "Thank you. Your quote has been approved. Angel Tree Services will follow up with scheduling details." };
}

export async function requestQuoteChangesByPortalToken(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const rawToken = getString(formData, "token");
  const message = getString(formData, "message");
  const rateLimit = await checkPortalActionRateLimit("quote-change-request", rawToken);
  if (!rateLimit.available) return { ok: false, status: "error", message: "Quote responses are temporarily unavailable. Please try again shortly." };
  if (!rateLimit.allowed) return { ok: false, status: "error", message: "Please wait before submitting another response." };
  const lookup = await getQuoteByPortalToken(rawToken);
  const supabase = getServiceRoleClient();

  if (!supabase || lookup.status !== "ready" || !lookup.quote || !lookup.tokenId) {
    return { ok: false, status: "error", message: safeStaffMessage(lookup.message, "This quote link is not available.") };
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
    return { ok: false, status: "error", message: safeStaffMessage(quoteError.message, "The quote could not be updated.") };
  }

  await cancelPendingCommunications(supabase, { quoteId: lookup.quote.id }, "Customer requested changes to the quote.");

  await supabase.from("quote_portal_tokens").update({ used_at: requestedAt }).eq("id", lookup.tokenId);
  await emitCustomerActivity({
    body: message,
    category: "quotes",
    customerId: lookup.quote.customer_id,
    destinationPath: `/admin/quotes/${lookup.quote.id}`,
    eventType: "quote_portal_changes_requested",
    idempotencyKey: `quote:${lookup.quote.id}:change-request:${note.id}`,
    organizationId: lookup.quote.organization_id,
    quoteId: lookup.quote.id,
    recordLabel: lookup.quote.quote_number || "Quote",
    subjectId: lookup.quote.id,
    subjectType: "quote",
    summary: `${lookup.quote.organizations?.name ?? lookup.quote.customers?.display_name ?? "Customer"} requested changes to ${lookup.quote.quote_number || "a quote"}.`,
    title: "Customer requested quote changes",
  });

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
