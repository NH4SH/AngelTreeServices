"use server";

import { revalidatePath } from "next/cache";
import { canAccessAssignedCrewJob } from "@/lib/auth/crewAccess";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/types/database";

export type CrewStatusActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const allowedTransitions: Record<string, JobStatus> = {
  scheduled: "in_progress",
  in_progress: "completed",
};

export async function updateCrewJobStatus(
  _previousState: CrewStatusActionState,
  formData: FormData,
): Promise<CrewStatusActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating job status." };
  }

  const jobId = String(formData.get("job_id") ?? "");
  const nextStatus = String(formData.get("next_status") ?? "") as JobStatus;

  if (!jobId || !nextStatus) {
    return { status: "error", message: "Job and status are required." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, assigned_crew_user_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find this job." };
  }

  const roles = await getCurrentUserRoles();

  if (
    !canAccessAssignedCrewJob({
      assignedCrewUserId: job.assigned_crew_user_id,
      roles,
      userId: user.id,
    })
  ) {
    return { status: "error", message: "This job is not assigned to this crew account." };
  }

  if (allowedTransitions[job.status] !== nextStatus) {
    return {
      status: "error",
      message: "Only scheduled to in progress and in progress to completed are scaffolded.",
    };
  }

  const updatePayload: { status: JobStatus; completed_at?: string } = {
    status: nextStatus,
  };

  if (nextStatus === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("jobs").update(updatePayload).eq("id", jobId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
  return { status: "success", message: `Job marked ${nextStatus.replace("_", " ")}.` };
}
