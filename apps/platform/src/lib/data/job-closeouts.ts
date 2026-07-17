import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  DataResult,
  JobCloseout,
  JobCloseoutBundle,
  JobCloseoutChecklistItem,
  JobCloseoutScopeItem,
  JobCloseoutSubmission,
  JobStatus,
} from "@/lib/types/database";

export type CloseoutQueueItem = JobCloseout & {
  assigned_crew_label?: string | null;
  jobs?: {
    id: string;
    status: JobStatus;
    completed_at: string | null;
    assigned_crew_user_id: string | null;
    customers?: { display_name: string } | null;
    organizations?: { name: string } | null;
    service_locations?: { street: string; city: string; state: string } | null;
    job_photos?: { id: string; photo_type: string }[];
    invoices?: { id: string; status: string }[];
  } | null;
};

export async function getJobCloseout(
  jobId: string,
  supabaseClient?: SupabaseClient<any, "public", any>,
): Promise<DataResult<JobCloseoutBundle | null>> {
  const supabase = supabaseClient ?? await createClient();

  if (!supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const closeoutResult = await supabase
    .from("job_closeouts")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (closeoutResult.error) {
    return { data: null, error: closeoutResult.error.message };
  }

  if (!closeoutResult.data) {
    return {
      data: null,
      error: "Closeout setup is unavailable. Apply the crew closeout migration before using this page.",
    };
  }

  const [checklistResult, scopeResult, submissionsResult] = await Promise.all([
    supabase
      .from("job_closeout_checklist_items")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("job_closeout_scope_items")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("job_closeout_submissions")
      .select("*")
      .eq("closeout_id", closeoutResult.data.id)
      .order("revision_number", { ascending: false }),
  ]);

  const error = checklistResult.error?.message ?? scopeResult.error?.message ?? submissionsResult.error?.message ?? null;

  return {
    data: {
      closeout: closeoutResult.data as JobCloseout,
      checklist: (checklistResult.data ?? []) as JobCloseoutChecklistItem[],
      scopeItems: (scopeResult.data ?? []) as JobCloseoutScopeItem[],
      submissions: (submissionsResult.data ?? []) as JobCloseoutSubmission[],
    },
    error,
  };
}

export async function getCloseoutQueue(): Promise<DataResult<CloseoutQueueItem[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("job_closeouts")
    .select(`
      *,
      jobs!inner(
        id,
        status,
        completed_at,
        assigned_crew_user_id,
        customers:customers!jobs_customer_id_fkey(display_name),
        organizations(name),
        service_locations(street, city, state),
        job_photos(id, photo_type),
        invoices(id, status)
      )
    `)
    .in("status", ["submitted", "returned", "approved", "ready_to_invoice"])
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const items = (data ?? []) as unknown as CloseoutQueueItem[];
  const assignedIds = [...new Set(items.map((item) => item.jobs?.assigned_crew_user_id).filter(Boolean))] as string[];
  const profilesResult = assignedIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", assignedIds)
    : { data: [], error: null };

  if (profilesResult.error) {
    return { data: items, error: profilesResult.error.message };
  }

  const labels = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "Assigned crew"]),
  );

  return {
    data: items.map((item) => ({
      ...item,
      assigned_crew_label: item.jobs?.assigned_crew_user_id
        ? labels.get(item.jobs.assigned_crew_user_id) ?? "Assigned crew"
        : "Unassigned",
    })),
    error: null,
  };
}
