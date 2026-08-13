import { apiError, apiSuccess } from "@/lib/api/responses";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { searchMobileParties } from "@/lib/data/mobile-parties";

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);

  const query = new URL(request.url).searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return apiSuccess({ results: [] });
  }

  try {
    return apiSuccess({ results: await searchMobileParties(auth.context.supabase, query) });
  } catch (error) {
    console.error("Mobile customer search failed", error);
    return apiError("customer_search_unavailable", "Customer search is temporarily unavailable.", 503);
  }
}
