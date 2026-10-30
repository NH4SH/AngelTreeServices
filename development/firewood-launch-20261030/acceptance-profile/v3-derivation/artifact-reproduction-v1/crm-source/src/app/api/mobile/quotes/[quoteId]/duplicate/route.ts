import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageMobileQuotes } from "@/lib/api/mobile-quotes";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { duplicateMobileQuote } from "@/lib/data/mobile-quotes";

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_duplicate_forbidden", "Your account cannot duplicate proposals.", 403);
  try { return apiSuccess({ quote: await duplicateMobileQuote(auth.context.supabase, auth.context.user.id, (await context.params).quoteId) }, 201); }
  catch (error) { console.error("Mobile proposal duplication failed", error); return apiError("quote_duplicate_failed", error instanceof Error ? error.message : "Proposal could not be duplicated.", 400); }
}
