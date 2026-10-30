import { apiError, apiSuccess } from "@/lib/api/responses";
import { normalizeMobileDirectoryLimit, normalizeMobileJobScope } from "@/lib/api/mobile-field-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { listMobileJobs } from "@/lib/data/mobile-jobs";

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);

  const url = new URL(request.url);
  const scope = normalizeMobileJobScope(url.searchParams.get("scope"));
  if (!scope) {
    return apiError("invalid_job_scope", "Choose Upcoming, Active, Unscheduled, or Completed.", 400);
  }

  try {
    return apiSuccess(await listMobileJobs(auth.context.supabase, {
      cursor: url.searchParams.get("cursor"),
      limit: normalizeMobileDirectoryLimit(url.searchParams.get("limit")),
      query: url.searchParams.get("q"),
      scope,
    }));
  } catch (error) {
    console.error("Mobile job directory failed", error);
    if (error instanceof Error && error.message.includes("cursor")) {
      return apiError("invalid_job_cursor", "Refresh the job list and try again.", 400);
    }
    return apiError("job_directory_unavailable", "Jobs are temporarily unavailable.", 503);
  }
}
