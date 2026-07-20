import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRoleName } from "@/lib/auth/roles";
import type { CrewChangeOrderScopeItem, CrewJob, DataResult } from "@/lib/types/database";

const crewJobSelect = `
  id,
  assigned_crew_user_id,
  status,
  service_type,
  priority,
  requested_scope,
  scheduled_start_at,
  scheduled_end_at,
  completed_at,
  created_at,
  updated_at,
  customers:customers!jobs_customer_id_fkey(display_name, phone),
  organizations(name, billing_phone),
  service_locations(label, street, city, state, postal_code, access_notes, gate_code, service_notes),
  job_photos(photo_type),
  notes(id, visibility, body, created_at),
  schedule_events(id, starts_at, ends_at, status, calendar_notes, schedule_event_assignments(event_id, user_id, assignment_role, profiles(id, full_name, email)))
`;

type CrewAccessContext = {
  roles: PlatformRoleName[];
  supabase?: SupabaseClient<any, "public", any>;
  userId: string;
};

export async function getCrewJobs(access?: CrewAccessContext): Promise<DataResult<CrewJob[]>> {
  const supabase = access?.supabase ?? await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  let query = supabase
    .from("jobs")
    .select(crewJobSelect)
    .in("status", ["scheduled", "in_progress", "returned_for_correction", "completed_pending_review", "ready_to_invoice", "completed"])
    .order("scheduled_start_at", { ascending: true, nullsFirst: false });

  // Crew row visibility is enforced by jobs RLS, including normalized work-session assignments.

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as unknown as CrewJob[], error: null };
}

export async function getCrewApprovedChangeOrderScope(jobId: string, access?: CrewAccessContext): Promise<DataResult<CrewChangeOrderScopeItem[]>> {
  const supabase = access?.supabase ?? await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("get_crew_change_order_scope", { p_job_id: jobId });
  return { data: (data ?? []) as CrewChangeOrderScopeItem[], error: error?.message ?? null };
}

export async function getCrewJobById(
  jobId: string,
  access?: CrewAccessContext,
): Promise<DataResult<CrewJob | null>> {
  const supabase = access?.supabase ?? await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  let query = supabase
    .from("jobs")
    .select(crewJobSelect)
    .eq("id", jobId);

  // Crew row visibility is enforced by jobs RLS, including normalized work-session assignments.

  const { data, error } = await query.single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as unknown as CrewJob, error: null };
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
      readyToComplete: jobs.data.filter((job) => ["in_progress", "returned_for_correction"].includes(job.status)),
    },
    error: null,
  };
}
