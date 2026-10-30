import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageMobileQuotes, validateMobileQuoteCopyInput, validateMobileQuoteWriteInput } from "@/lib/api/mobile-quotes";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { resolveMobileQuoteRequest } from "@/lib/data/mobile-quotes";
import { requestStatusUncertain } from "@/lib/quotes/request-status";

// POST keeps saved proposal text out of URLs/caches. This endpoint only reads;
// it never falls back to creation, legacy duplication, or an edit command.
export async function POST(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canManageMobileQuotes(auth.context.roles)) return apiError("quote_status_forbidden", "Your account cannot check saved proposal requests.", 403);
  const body = await request.json().catch(() => null);
  if (!body || !["create", "copy"].includes(body.kind)) return apiError("invalid_request_status", requestStatusUncertain, 400);
  const input = body.kind === "copy" ? validateMobileQuoteCopyInput(body.request) : validateMobileQuoteWriteInput(body.request);
  if (!input.value?.requestId) return apiError("invalid_request_status", requestStatusUncertain, 400);
  try {
    return apiSuccess({ requestStatus: await resolveMobileQuoteRequest(auth.context.supabase, input.value) });
  } catch { return apiError("quote_status_unconfirmed", requestStatusUncertain, 503); }
}
