import { QuoteEditError } from "@/lib/quotes/edit-result";
import { safeStaffMessage } from "@/lib/security/errors";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageMobileQuotes, validateMobileQuoteWriteInput } from "@/lib/api/mobile-quotes";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getMobileQuote, updateMobileQuote } from "@/lib/data/mobile-quotes";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_access_forbidden", "Your account cannot view proposals.", 403);
  try { return apiSuccess({ quote: await getMobileQuote(auth.context.supabase, (await context.params).quoteId) }); }
  catch (error) { console.error("Mobile proposal detail failed", error); return apiError("quote_not_found", "Proposal not found or no access.", 404); }
}

export async function PATCH(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_edit_forbidden", "Your account cannot edit proposals.", 403);
  const input = validateMobileQuoteWriteInput(await request.json().catch(() => null));
  if (!input.value) return apiError("invalid_quote", input.error, 400);
  if (!input.value.expectedRevision) return apiError("quote_version_required", "Update the app and refresh this proposal before saving edits.", 409);
  try { return apiSuccess({ quote: await updateMobileQuote(auth.context.supabase, auth.context.user.id, (await context.params).quoteId, input.value) }); }
  catch (error) {
    if (error instanceof QuoteEditError) return apiError(error.conflict ? "quote_edit_conflict" : "quote_update_failed", error.message, error.status);
    return apiError("quote_update_failed", safeStaffMessage((error as {message?: string})?.message, "Proposal could not be updated."), 400);
  }
}
