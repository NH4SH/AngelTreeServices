import { apiError, apiSuccess } from "@/lib/api/responses";
import {
  crewJobScopes,
  getDefaultEasternDateKey,
  toCrewApiJobListItem,
  type CrewJobScope,
} from "@/lib/api/crew-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getCrewJobPage, isFieldDate } from "@/lib/data/crew-field-jobs";


export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") ?? "today") as CrewJobScope;
  const dateKey = url.searchParams.get("date") ?? getDefaultEasternDateKey();

  if (!crewJobScopes.includes(scope)) {
    return apiError("invalid_scope", "Use scope=today, upcoming, or active.", 400);
  }

  if (!isFieldDate(dateKey)) {
    return apiError("invalid_date", "Use an ISO date in YYYY-MM-DD format.", 400);
  }

  const jobs = await getCrewJobPage(auth.context.supabase, {
    scope, date: dateKey, cursor: url.searchParams.get("cursor"),
    limit: Number(url.searchParams.get("limit") ?? 25),
  });

  if (jobs.error) {
    return jobs.errorCode ? apiError(jobs.errorCode, jobs.error, 400) : apiError("crew_jobs_unavailable", "Crew jobs could not be loaded.", 503);
  }

  return apiSuccess({
    date: dateKey,
    jobs: jobs.data.map(toCrewApiJobListItem),
    nextCursor: jobs.nextCursor, total: jobs.total,
    scope,
  });
}
