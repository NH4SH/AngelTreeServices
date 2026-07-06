import { apiError, apiSuccess } from "@/lib/api/responses";
import { toCrewApiJobDetail } from "@/lib/api/crew-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getCrewJobById } from "@/lib/data/crew-jobs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CrewJobApiRouteProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(request: Request, { params }: CrewJobApiRouteProps) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const { jobId } = await params;

  if (!uuidPattern.test(jobId)) {
    return apiError("invalid_job_id", "Use a valid job identifier.", 400);
  }

  const job = await getCrewJobById(jobId, {
    roles: auth.context.roles,
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
  });

  if (!job.data) {
    return apiError("job_not_available", "Job not found or not assigned to this crew account.", 404);
  }

  return apiSuccess({
    job: toCrewApiJobDetail(job.data),
  });
}
