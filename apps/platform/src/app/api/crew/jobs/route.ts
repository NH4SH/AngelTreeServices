import { apiError, apiSuccess } from "@/lib/api/responses";
import {
  crewJobScopes,
  filterCrewJobsByScope,
  getDefaultEasternDateKey,
  toCrewApiJobListItem,
  type CrewJobScope,
} from "@/lib/api/crew-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getCrewJobs } from "@/lib/data/crew-jobs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

  if (!datePattern.test(dateKey)) {
    return apiError("invalid_date", "Use an ISO date in YYYY-MM-DD format.", 400);
  }

  const jobs = await getCrewJobs({
    roles: auth.context.roles,
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
  });

  if (jobs.error) {
    return apiError("crew_jobs_unavailable", "Crew jobs could not be loaded.", 503);
  }

  return apiSuccess({
    date: dateKey,
    jobs: filterCrewJobsByScope(jobs.data, scope, dateKey).map(toCrewApiJobListItem),
    scope,
  });
}
