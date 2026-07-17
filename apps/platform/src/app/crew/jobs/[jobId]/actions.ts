"use server";

import { revalidatePath } from "next/cache";
import { canAccessAssignedCrewJob } from "@/lib/auth/crewAccess";
import { getUserRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type CrewCloseoutActionState = {
  status: "idle" | "success" | "error";
  message: string;
  submitted?: boolean;
  activeTimerExists?: boolean;
};

export async function startCrewJob(
  _previousState: CrewCloseoutActionState,
  formData: FormData,
): Promise<CrewCloseoutActionState> {
  const context = await getCrewActionContext(formData);
  if (!context.ok) return context.state;

  const { data: activeTimer, error: timerError } = await context.supabase
    .from("time_entries")
    .select("id, job_id")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .is("clock_out_at", null)
    .maybeSingle();

  if (timerError) {
    return { status: "error", message: `The active timer could not be checked. ${timerError.message}` };
  }

  if (activeTimer && activeTimer.job_id !== context.jobId) {
    return {
      status: "error",
      message: "You already have an active timer for other work. Clock out before starting this job.",
    };
  }

  const { error } = await context.supabase.rpc("start_assigned_job", { p_job_id: context.jobId });

  if (error) {
    return { status: "error", message: cleanDatabaseMessage(error.message) };
  }

  revalidateCloseoutPaths(context.jobId);
  return {
    status: "success",
    message: activeTimer
      ? "Work started. Your existing timer is already attached to this job."
      : "Work started. Use the Time Clock separately if you need to track hours.",
  };
}

export async function saveCrewCloseout(
  _previousState: CrewCloseoutActionState,
  formData: FormData,
): Promise<CrewCloseoutActionState> {
  const context = await getCrewActionContext(formData);
  if (!context.ok) return context.state;

  const payload = buildCloseoutPayload(formData);
  if (!payload.ok) return payload.state;

  const { error } = await context.supabase.rpc("save_assigned_job_closeout", {
    p_job_id: context.jobId,
    p_payload: payload.data,
  });

  if (error) {
    return { status: "error", message: cleanDatabaseMessage(error.message) };
  }

  revalidateCloseoutPaths(context.jobId);
  return { status: "success", message: "Closeout progress saved." };
}

export async function submitCrewCloseout(
  _previousState: CrewCloseoutActionState,
  formData: FormData,
): Promise<CrewCloseoutActionState> {
  const context = await getCrewActionContext(formData);
  if (!context.ok) return context.state;

  const payload = buildCloseoutPayload(formData);
  if (!payload.ok) return payload.state;

  const saveResult = await context.supabase.rpc("save_assigned_job_closeout", {
    p_job_id: context.jobId,
    p_payload: payload.data,
  });

  if (saveResult.error) {
    return { status: "error", message: cleanDatabaseMessage(saveResult.error.message) };
  }

  const { data, error } = await context.supabase.rpc("submit_assigned_job_closeout", {
    p_job_id: context.jobId,
  });

  if (error) {
    return { status: "error", message: cleanDatabaseMessage(error.message) };
  }

  const result = (data ?? {}) as { active_timer_exists?: boolean };
  revalidateCloseoutPaths(context.jobId);
  return {
    status: "success",
    submitted: true,
    activeTimerExists: Boolean(result.active_timer_exists),
    message: result.active_timer_exists
      ? "Closeout submitted for office review. Your job timer is still running, so clock out when work time ends."
      : "Closeout submitted for office review.",
  };
}

export async function submitCrewRecommendation(
  _previousState: CrewCloseoutActionState,
  formData: FormData,
): Promise<CrewCloseoutActionState> {
  const context = await getCrewActionContext(formData);
  if (!context.ok) return context.state;
  const title = String(formData.get("title") ?? "").trim().slice(0, 180);
  const description = String(formData.get("description") ?? "").trim().slice(0, 5000);
  if (!title || !description) return { status: "error", message: "Add a short title and describe the future work you recommend." };
  const { error } = await context.supabase.rpc("submit_crew_service_recommendation", {
    p_description: description,
    p_internal_notes: String(formData.get("internal_notes") ?? "").trim().slice(0, 5000) || null,
    p_job_id: context.jobId,
    p_timeframe: String(formData.get("timeframe") ?? "").trim().slice(0, 240) || null,
    p_title: title,
  });
  if (error) return { status: "error", message: cleanDatabaseMessage(error.message) };
  revalidatePath("/admin/recurring");
  revalidateCloseoutPaths(context.jobId);
  return { status: "success", message: "Recommendation sent to the office for review. It was not sent to the customer and no quote was created." };
}

async function getCrewActionContext(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const, state: { status: "error" as const, message: "Supabase is not configured." } };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, state: { status: "error" as const, message: "Sign in before updating this job." } };
  }

  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) {
    return { ok: false as const, state: { status: "error" as const, message: "Work order is required." } };
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, assigned_crew_user_id")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return { ok: false as const, state: { status: "error" as const, message: error?.message ?? "Work order not found." } };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessAssignedCrewJob({ assignedCrewUserId: job.assigned_crew_user_id, roles, userId: user.id })) {
    return { ok: false as const, state: { status: "error" as const, message: "This work order is not assigned to this crew account." } };
  }

  return { ok: true as const, jobId, supabase, userId: user.id };
}

function buildCloseoutPayload(formData: FormData) {
  const checklist = parseJsonArray(formData.get("checklist_json"));
  const scopeItems = parseJsonArray(formData.get("scope_items_json"));

  if (!checklist || !scopeItems) {
    return {
      ok: false as const,
      state: { status: "error" as const, message: "Closeout selections could not be read. Refresh and try again." },
    };
  }

  const incidentAnswer = optionalBoolean(formData.get("incident_occurred"));
  const additionalWorkAnswer = optionalBoolean(formData.get("additional_work_requested"));

  return {
    ok: true as const,
    data: {
      acknowledgment_name: limited(formData, "acknowledgment_name", 200),
      acknowledgment_status: limited(formData, "acknowledgment_status", 40),
      additional_work_description: limited(formData, "additional_work_description", 5000),
      ...(additionalWorkAnswer === null ? {} : { additional_work_requested: additionalWorkAnswer }),
      checklist,
      crew_internal_notes: limited(formData, "crew_internal_notes", 5000),
      customer_summary: limited(formData, "customer_summary", 5000),
      incident_description: limited(formData, "incident_description", 5000),
      ...(incidentAnswer === null ? {} : { incident_occurred: incidentAnswer }),
      scope_items: scopeItems,
    },
  };
}

function parseJsonArray(value: FormDataEntryValue | null): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function limited(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalBoolean(value: FormDataEntryValue | null) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function cleanDatabaseMessage(message: string) {
  return message.replace(/^.*?: /, "").replace(/\.$/, "") + ".";
}

function revalidateCloseoutPaths(jobId: string) {
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/jobs/closeouts");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}/closeout`);
}
