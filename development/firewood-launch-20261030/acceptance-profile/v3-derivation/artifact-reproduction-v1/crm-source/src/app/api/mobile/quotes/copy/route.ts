import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageMobileQuotes, validateMobileQuoteCopyInput } from "@/lib/api/mobile-quotes";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { createMobileQuote } from "@/lib/data/mobile-quotes";
import { QuoteEditError } from "@/lib/quotes/edit-result";

// Copy the explicitly submitted snapshot without editor text normalization.
// Keep the existing atomic request transaction; never fall back to legacy copy.
export async function POST(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_duplicate_forbidden", "Your account cannot duplicate proposals.", 403);
  const input = validateMobileQuoteCopyInput(await request.json().catch(() => null));
  if (!input.value || !input.value.requestId) return apiError("invalid_quote", input.error || "Refresh this editor to prepare the proposal request.", 400);
  try {
    return apiSuccess({ quote: await createMobileQuote(auth.context.supabase, auth.context.user.id, input.value) }, 201);
  } catch (error) {
    return apiError("quote_copy_unconfirmed", error instanceof QuoteEditError ? error.message : "The proposal result could not be confirmed. Keep this form and retry with the same details to check safely.", error instanceof QuoteEditError ? error.status : 503);
  }
}
