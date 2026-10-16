"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { syncAutomatedCommunications } from "@/lib/communications/queue";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { safeStaffMessage } from "@/lib/security/errors";
import { parseScheduleDateTime } from "@/lib/schedule/event-form";
import type { JobPriority, JobStatus } from "@/lib/types/database";

export type JobActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type JobScheduleActionState = {
  status: "idle" | "success" | "error" | "warning";
  message: string;
  conflicts?: string[];
  sessionCount?: number;
  revision?: number;
  snapshot?: { id: string; edit_revision: number }[];
  sessions?: WorkSessionInput[];
};

type WorkSessionInput = {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  assigned_user_ids: string[];
  notes?: string;
  status?: "scheduled" | "confirmed" | "in_progress";
};

export async function createJob(
  _previousState: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const party = parseContractingParty(formData.get("contracting_party"));
  const serviceLocationId = String(formData.get("service_location_id") ?? "");
  const serviceType = String(formData.get("service_type") ?? "other");
  const requestedScope = String(formData.get("requested_scope") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal") as JobPriority;
  const estimatedDate = String(formData.get("estimated_date") ?? "");
  const leadSourceId = String(formData.get("lead_source_id") ?? "").trim() || null;
  const leadCampaign = String(formData.get("lead_campaign") ?? "").trim().slice(0, 240) || null;

  if (!party || !serviceLocationId || !requestedScope) {
    return { status: "error", message: "Contracting party, service location, and description are required." };
  }

  const { data: serviceLocation, error: locationError } = await supabase
    .from("service_locations")
    .select("id, customer_id, organization_id")
    .eq("id", serviceLocationId)
    .single();

  if (locationError || !serviceLocation) {
    return { status: "error", message: locationError?.message ?? "Could not find the selected service location." };
  }

  if (!belongsToContractingParty(serviceLocation, party)) {
    return { status: "error", message: "Selected service location does not belong to the selected contracting party." };
  }

  const scheduledStartAt = estimatedDate ? new Date(`${estimatedDate}T09:00:00`).toISOString() : null;
  const status: JobStatus = scheduledStartAt ? "estimate_scheduled" : "new_lead";

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: party.customerId,
      organization_id: party.organizationId,
      service_location_id: serviceLocationId,
      service_type: serviceType,
      requested_scope: requestedScope,
      status,
      priority,
      lead_source_id: leadSourceId,
      lead_campaign: leadCampaign,
      scheduled_start_at: scheduledStartAt,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { status: "error", message: error?.message ?? "Could not create work order." };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "work_order_created",
    subjectId: job.id,
    subjectType: "job",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/schedule");
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);
  return { status: "success", message: "Job saved." };
}

export async function saveJobWorkSessions(
  _previousState: JobScheduleActionState,
  formData: FormData,
): Promise<JobScheduleActionState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in before scheduling work." };

  const jobId = String(formData.get("job_id") ?? "");
  const mode = formData.get("save_mode") === "add" ? "add" : "replace";
  const allowConflicts = formData.get("allow_conflicts") === "1";
  let sessions: WorkSessionInput[];
  let expectedSnapshot: unknown;

  try {
    expectedSnapshot = JSON.parse(String(formData.get("expected_snapshot") ?? "null"));
    sessions = JSON.parse(String(formData.get("sessions_json") ?? "[]")) as WorkSessionInput[];
  } catch {
    return { status: "error", message: "The schedule could not be read. Refresh and try again." };
  }

  if (formData.get("clear_schedule") === "1") sessions = [];

  if (!jobId || !Array.isArray(sessions) || sessions.length > 60) {
    return { status: "error", message: "Choose a valid job schedule with no more than 60 workdays." };
  }

  const validationError = validateWorkSessions(sessions);
  if (validationError) return { status: "error", message: validationError };

  const { data, error } = await supabase.rpc("save_job_employee_work_sessions", {
    p_job_id: jobId,
    p_sessions: sessions,
    p_mode: mode,
    p_expected_snapshot: expectedSnapshot,
    p_override_reason: String(formData.get("eligibility_override_reason") ?? "").trim() || null,
    p_allow_conflicts: allowConflicts,
  });

  if (error) return { status: error.code === "23P01" ? "warning" : "error", message: safeStaffMessage(error.message), conflicts: error.code === "23P01" ? [safeStaffMessage(error.message)] : undefined };

  if (!data || data.job_id !== jobId || !Number.isInteger(data.session_count) || !Array.isArray(data.snapshot) || !Array.isArray(data.sessions)) {
    return { status: "error", message: "The save could not be confirmed. Refresh and review the schedule before trying again." };
  }
  const sessionCount = data.session_count;
  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/schedule");
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);

  return {
    status: "success",
    sessionCount,
    snapshot: data.snapshot,
    sessions: data.sessions,
    message: sessionCount
      ? `Schedule saved for ${sessionCount} ${sessionCount === 1 ? "workday" : "workdays"}.`
      : "The job schedule was cleared. No work records were deleted.",
  };
}

export async function updateJobWorkSessionTime(
  _previousState: JobScheduleActionState,
  formData: FormData,
): Promise<JobScheduleActionState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in before rescheduling work." };

  const eventId = String(formData.get("event_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();

  if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { status: "error", message: "Choose a valid date, start time, and end time." };
  }
  if (endTime <= startTime) return { status: "error", message: "End time must be after the start time." };

  const startsAt = parseScheduleDateTime(`${date}T${startTime}`);
  const endsAt = parseScheduleDateTime(`${date}T${endTime}`);
  if (!startsAt || !endsAt) return { status: "error", message: "Choose a valid date and time." };
  const { data, error } = await supabase.rpc("save_schedule_event", {
    p_event_id: eventId, p_expected_revision: Number(formData.get("expected_revision")) || null,
    p_event: { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() }, p_mode: "time",
    p_override_reason: String(formData.get("eligibility_override_reason") ?? "").trim() || null,
    p_allow_conflicts: formData.get("allow_conflicts") === "1",
  });
  if (error) return { status: error.code === "23P01" ? "warning" : "error", message: safeStaffMessage(error.message), conflicts: error.code === "23P01" ? [safeStaffMessage(error.message)] : undefined };
  if (!data?.id) return { status: "error", message: "The save could not be confirmed. Refresh the calendar." };
  revalidatePath("/admin/schedule");
  revalidatePath(`/admin/jobs/${data.job_id}`);
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${data.job_id}`);
  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);
  return { status: "success", revision: data.edit_revision, message: "Workday schedule updated. Crew assignments and notes were preserved." };
}

function validateWorkSessions(sessions: WorkSessionInput[]) {
  const dates = new Set<string>();
  for (const session of sessions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date)) return "Each workday needs a valid date.";
    if (!/^\d{2}:\d{2}$/.test(session.start_time) || !/^\d{2}:\d{2}$/.test(session.end_time)) {
      return `Choose a valid start and end time for ${session.date}.`;
    }
    if (session.end_time <= session.start_time) return `End time must be after start time on ${session.date}.`;
    if (dates.has(session.date)) return `${session.date} is listed more than once. Keep one session per workday.`;
    if (!Array.isArray(session.assigned_user_ids)) return `Choose a valid crew assignment for ${session.date}.`;
    dates.add(session.date);
  }
  return null;
}
