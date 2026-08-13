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
  try { return apiSuccess({ quote: await updateMobileQuote(auth.context.supabase, auth.context.user.id, (await context.params).quoteId, input.value) }); }
  catch (error) { console.error("Mobile proposal update failed", error); return apiError("quote_update_failed", error instanceof Error ? error.message : "Proposal could not be updated.", 400); }
}
