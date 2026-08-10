"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { syncAutomatedCommunications } from "@/lib/communications/queue";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { safeStaffMessage } from "@/lib/security/errors";
import { buildActiveJobWorkSessions, replaceJobWorkSessionTiming } from "@/lib/schedule/job-work-sessions";
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

  try {
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

  if (sessions.length && !allowConflicts) {
    const conflicts = await findWorkSessionConflicts(supabase, jobId, sessions);
    if (conflicts.length) {
      return {
        status: "warning",
        message: "Crew conflicts were found. Review them, then select the override option to save anyway.",
        conflicts,
      };
    }
  }

  const { data, error } = await supabase.rpc("save_job_employee_work_sessions", {
    p_job_id: jobId,
    p_sessions: sessions,
    p_mode: mode,
  });

  if (error) return { status: "error", message: safeStaffMessage(error.message) };

  const sessionCount = Number((data as { session_count?: number } | null)?.session_count ?? sessions.length);
  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: sessionCount ? "work_schedule_updated" : "work_schedule_cleared",
    metadata: { session_count: sessionCount },
    subjectId: jobId,
    subjectType: "job",
  });

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

  const { data: selectedEvent, error: selectedEventError } = await supabase
    .from("schedule_events")
    .select("id, job_id")
    .eq("id", eventId)
    .eq("event_type", "job")
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .maybeSingle();

  if (selectedEventError) return { status: "error", message: safeStaffMessage(selectedEventError.message) };
  if (!selectedEvent?.job_id) return { status: "error", message: "The selected workday is no longer active or linked to a job." };

  const { data: events, error: eventsError } = await supabase
    .from("schedule_events")
    .select("id, starts_at, ends_at, status, calendar_notes, schedule_event_assignments(employee_id)")
    .eq("job_id", selectedEvent.job_id)
    .eq("event_type", "job")
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .order("starts_at", { ascending: true });

  if (eventsError) return { status: "error", message: safeStaffMessage(eventsError.message) };

  let sessions: WorkSessionInput[];
  try {
    sessions = replaceJobWorkSessionTiming(
      buildActiveJobWorkSessions(events ?? []),
      eventId,
      { date, start_time: startTime, end_time: endTime },
    );
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The selected workday could not be updated." };
  }

  const replacement = new FormData();
  replacement.set("job_id", selectedEvent.job_id);
  replacement.set("save_mode", "replace");
  replacement.set("sessions_json", JSON.stringify(sessions));
  if (formData.get("allow_conflicts") === "1") replacement.set("allow_conflicts", "1");

  const result = await saveJobWorkSessions(_previousState, replacement);
  return result.status === "success"
    ? { ...result, message: "Workday schedule updated. Crew assignments and notes were preserved." }
    : result;
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

async function findWorkSessionConflicts(supabase: Awaited<ReturnType<typeof createClient>> & {}, jobId: string, sessions: WorkSessionInput[]) {
  if (!sessions.length) return [];
  const sortedDates = sessions.map((session) => session.date).sort();
  const rangeStart = new Date(`${sortedDates[0]}T00:00:00Z`);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(`${sortedDates.at(-1)}T00:00:00Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);
  const currentIds = sessions.map((session) => session.id).filter((id): id is string => Boolean(id));
  let query = supabase
    .from("schedule_events")
    .select("id, title, starts_at, ends_at, jobs:jobs!schedule_events_job_id_fkey(id, service_type), schedule_event_assignments(employee_id, employee_records(preferred_name, legal_name, contact_email))")
    .in("status", ["scheduled", "confirmed", "in_progress"])
    .lt("starts_at", rangeEnd.toISOString())
    .gt("ends_at", rangeStart.toISOString());
  if (currentIds.length) query = query.not("id", "in", `(${currentIds.join(",")})`);
  const { data } = await query;
  const conflicts = new Set<string>();

  for (const session of sessions) {
    const sessionStart = minutes(session.start_time);
    const sessionEnd = minutes(session.end_time);
    for (const event of data ?? []) {
      const linkedJob = Array.isArray((event as any).jobs) ? (event as any).jobs[0] : (event as any).jobs;
      if (linkedJob?.id === jobId) continue;
      const eventStart = zonedDateTime(event.starts_at);
      const eventEnd = zonedDateTime(event.ends_at ?? event.starts_at);
      if (eventStart.date !== session.date || eventStart.minutes >= sessionEnd || eventEnd.minutes <= sessionStart) continue;
      for (const assignment of event.schedule_event_assignments ?? []) {
        if (!assignment.employee_id || !session.assigned_user_ids.includes(assignment.employee_id)) continue;
        const employee = Array.isArray(assignment.employee_records) ? assignment.employee_records[0] : assignment.employee_records;
        const label = employee?.preferred_name || employee?.legal_name || employee?.contact_email || "Assigned employee";
        conflicts.add(`${label}: ${session.date}, ${session.start_time}–${session.end_time}, conflicts with ${event.title}.`);
      }
    }
  }
  return [...conflicts];
}

function minutes(time: string) {
  const [hours, value] = time.split(":").map(Number);
  return hours * 60 + value;
}

function zonedDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: minutes(`${get("hour")}:${get("minute")}`) };
}
