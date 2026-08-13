import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageMobileQuotes, normalizeMobileQuoteScope, validateMobileQuoteWriteInput } from "@/lib/api/mobile-quotes";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { createMobileQuote, listMobileQuotes } from "@/lib/data/mobile-quotes";

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_access_forbidden", "Your account cannot view proposals.", 403);
  const url = new URL(request.url);
  const scope = normalizeMobileQuoteScope(url.searchParams.get("scope") ?? "draft");
  if (!scope) return apiError("invalid_quote_scope", "Choose a valid proposal view.", 400);
  try {
    return apiSuccess(await listMobileQuotes(auth.context.supabase, {
      scope, cursor: url.searchParams.get("cursor"), query: url.searchParams.get("q"),
      limit: Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25)),
    }));
  } catch (error) {
    console.error("Mobile proposal directory failed", error);
    return apiError("quote_directory_unavailable", error instanceof Error && error.message.includes("cursor") ? "Refresh proposals and try again." : "Proposals are temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_create_forbidden", "Your account cannot create proposals.", 403);
  const input = validateMobileQuoteWriteInput(await request.json().catch(() => null));
  if (!input.value) return apiError("invalid_quote", input.error, 400);
  try {
    return apiSuccess({ quote: await createMobileQuote(auth.context.supabase, auth.context.user.id, input.value) }, 201);
  } catch (error) {
    console.error("Mobile proposal creation failed", error);
    return apiError("quote_create_failed", error instanceof Error ? error.message : "Proposal could not be created.", 400);
  }
}
