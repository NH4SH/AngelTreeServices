"use server";

import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type CloseoutReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function reviewJobCloseout(
  _previousState: CloseoutReviewActionState,
  formData: FormData,
): Promise<CloseoutReviewActionState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in before reviewing closeouts." };

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { status: "error", message: "Only authorized office staff can review job closeouts." };
  }

  const jobId = String(formData.get("job_id") ?? "").trim();
  const action = String(formData.get("review_action") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);

  if (!jobId || !["approve", "return", "reopen", "ready"].includes(action)) {
    return { status: "error", message: "Choose a valid closeout review action." };
  }

  const { data, error } = await supabase.rpc("review_job_closeout", {
    p_action: action,
    p_job_id: jobId,
    p_reason: reason || null,
  });

  if (error) {
    return { status: "error", message: cleanDatabaseMessage(error.message) };
  }

  const result = (data ?? {}) as { message?: string };
  revalidateCloseoutPaths(jobId);
  return { status: "success", message: result.message ?? "Closeout review updated." };
}

function cleanDatabaseMessage(message: string) {
  return message.replace(/^.*?: /, "").replace(/\.$/, "") + ".";
}

function revalidateCloseoutPaths(jobId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/jobs/closeouts");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}/closeout`);
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
}
