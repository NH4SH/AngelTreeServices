import { canViewAllCrewJobs } from "@/lib/auth/crewAccess";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRoleName } from "@/lib/auth/roles";
import type { CrewJob, DataResult } from "@/lib/types/database";

const crewJobSelect = `
  *,
  customers(id, display_name, phone),
  service_locations(id, label, street, city, state, postal_code, access_notes, gate_code, service_notes),
  job_photos(id, photo_type, storage_path, caption, created_at),
  notes(id, visibility, body, created_at)
`;

type CrewAccessContext = {
  roles: PlatformRoleName[];
  userId: string;
};

export async function getCrewJobs(access?: CrewAccessContext): Promise<DataResult<CrewJob[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  let query = supabase
    .from("jobs")
    .select(crewJobSelect)
    .in("status", ["scheduled", "in_progress", "completed"])
    .order("scheduled_start_at", { ascending: true, nullsFirst: false });

  if (access && !canViewAllCrewJobs(access.roles)) {
    query = query.eq("assigned_crew_user_id", access.userId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CrewJob[], error: null };
}

export async function getCrewJobById(
  jobId: string,
  access?: CrewAccessContext,
): Promise<DataResult<CrewJob | null>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  let query = supabase
    .from("jobs")
    .select(crewJobSelect)
    .eq("id", jobId);

  if (access && !canViewAllCrewJobs(access.roles)) {
    query = query.eq("assigned_crew_user_id", access.userId);
  }

  const { data, error } = await query.single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as CrewJob, error: null };
}

export async function getCrewDashboardSummaries(access?: CrewAccessContext) {
  const jobs = await getCrewJobs(access);

  if (jobs.error) {
    return {
      lanes: {
        todaysJobs: [],
        upcomingJobs: [],
        needsPhotos: [],
        readyToComplete: [],
      },
      error: jobs.error,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    lanes: {
      todaysJobs: jobs.data.filter((job) => job.scheduled_start_at?.startsWith(today)),
      upcomingJobs: jobs.data.filter(
        (job) => job.scheduled_start_at && job.scheduled_start_at.slice(0, 10) > today,
      ),
      needsPhotos: jobs.data.filter((job) => {
        const photoTypes = new Set((job.job_photos ?? []).map((photo) => photo.photo_type));
        return !photoTypes.has("before") || !photoTypes.has("after");
      }),
      readyToComplete: jobs.data.filter((job) => job.status === "in_progress"),
    },
    error: null,
  };
}
