import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRoleName } from "@/lib/auth/roles";
import { safeStaffMessage } from "@/lib/security/errors";
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
  customers:customers!jobs_customer_id_fkey(id, display_name, phone, email),
  organizations(id, name, billing_phone, billing_email),
  service_locations(id, label, street, city, state, postal_code, access_notes, gate_code, service_notes),
  job_photos(photo_type),
  notes(id, visibility, body, created_at),
  schedule_events:schedule_events!schedule_events_job_id_fkey(id, starts_at, ends_at, status, calendar_notes, schedule_event_assignments(event_id, user_id, employee_id, assignment_role, profiles(id, full_name, email), employee_records(id, preferred_name, legal_name, contact_email))),
  equipment_assignments(id, equipment_assets(id, asset_number, name, category, status)),
  job_material_requirements(id, planned_quantity, unit, notes, material_catalog(name))
`;

type CrewAccessContext = {
  roles: PlatformRoleName[];
  supabase?: SupabaseClient<any, "public", any>;
  userId: string;
};

export type CrewClockJobOption = Pick<CrewJob, "id" | "service_type"> & {
  customers?: { display_name: string } | null;
  organizations?: { name: string } | null;
};

export async function getCrewClockJobOptions(access?: CrewAccessContext): Promise<DataResult<CrewClockJobOption[]>> {
  const supabase = access?.supabase ?? await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };
  // Clock-in options retain every accessible job, fetched in small, deterministic
  // pages. No history/details expansion on the field landing page or selector.
  const jobs: CrewClockJobOption[] = [];
  let after: string | null = null;
  while (true) {
    let query = supabase.from("jobs")
      .select("id, service_type, customers:customers!jobs_customer_id_fkey(display_name), organizations(name)")
      .is("archived_at", null)
      .in("status", ["scheduled", "in_progress", "returned_for_correction", "completed_pending_review", "ready_to_invoice", "completed"])
      .order("id").limit(100);
    if (after) query = query.gt("id", after);
    const result = await query;
    if (result.error) return { data: [], error: safeStaffMessage(result.error.message) };
    const rows = (result.data ?? []) as unknown as CrewClockJobOption[];
    jobs.push(...rows);
    if (rows.length < 100) return { data: jobs, error: null };
    after = rows[rows.length - 1].id;
  }
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
    .is("archived_at", null)
    .eq("id", jobId);

  // Crew row visibility is enforced by jobs RLS, including normalized work-session assignments.

  const { data, error } = await query.single();

  if (error) {
    return { data: null, error: safeStaffMessage(error.message) };
  }

  return { data: data as unknown as CrewJob, error: null };
}
