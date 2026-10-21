import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageMobileQuotes, validateMobileQuoteWriteInput } from "@/lib/api/mobile-quotes";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { createMobileQuote } from "@/lib/data/mobile-quotes";
import { QuoteEditError } from "@/lib/quotes/edit-result";

// A separate path prevents newer clients from silently using an older server's
// non-idempotent create endpoint. Never fall back after an uncertain result.
export async function POST(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_create_forbidden", "Your account cannot create proposals.", 403);
  const input = validateMobileQuoteWriteInput(await request.json().catch(() => null));
  if (!input.value || !input.value.requestId) return apiError("invalid_quote", input.error || "Refresh this editor to prepare the proposal request.", 400);
  try {
    return apiSuccess({ quote: await createMobileQuote(auth.context.supabase, auth.context.user.id, input.value) }, 201);
  } catch (error) {
    return apiError("quote_create_unconfirmed", error instanceof QuoteEditError ? error.message : "The proposal result could not be confirmed. Keep this form and retry with the same details to check safely.", error instanceof QuoteEditError ? error.status : 503);
  }
}
