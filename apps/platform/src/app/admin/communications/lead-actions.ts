"use server";

import { revalidatePath } from "next/cache";
import { updateRecordLifecycle, type LifecycleActionState } from "@/lib/actions/record-lifecycle";
import { recordActivity } from "@/lib/activity-log";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { cancelPendingCommunications } from "@/lib/communications/queue";
import { archiveWebsiteLead } from "@/lib/leads/archive";
import { safeStaffMessage } from "@/lib/security/errors";
import { createClient } from "@/lib/supabase/server";

export type LeadLifecycleState = LifecycleActionState;

export async function updateWebsiteLeadLifecycle(
  _state: LeadLifecycleState,
  formData: FormData,
): Promise<LeadLifecycleState> {
  const supabase = await createClient();
  if (!supabase) return failure("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("Sign in before changing a lead.");
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return failure("Only owners and administrators can manage website leads.");
  }

  const jobId = String(formData.get("job_id") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  if (!isUuid(jobId)) return failure("Choose a valid website lead.");

  if (intent === "permanent_delete") {
    const delegated = new FormData();
    delegated.set("record_type", "job");
    delegated.set("record_id", jobId);
    delegated.set("intent", "permanent_delete");
    delegated.set("confirmation", String(formData.get("confirmation") ?? ""));
    return updateRecordLifecycle({ status: "idle", message: "" }, delegated);
  }

  if (intent === "archive") {
    const result = await archiveWebsiteLead(supabase, {
      actorType: roles.includes("owner") ? "owner" : "admin",
      actorUserId: user.id,
      eventType: "website_lead_archive",
      idempotencyKey: `website-lead:${jobId}:archive:${new Date().toISOString()}`,
      jobId,
      reason: "Lead archived by staff.",
      summary: "Website lead archived manually by staff.",
    });
    if (result.error) return failure(result.error);
    if (result.status === "skipped") return failure("Website lead not found or no access.");

    revalidateLeadViews();
    return {
      status: "success",
      message: "Lead archived. It can be restored from the Archived view.",
    };
  }

  const next = intent === "spam"
    ? { archived_at: null, archived_by_user_id: null, lead_disposition: "spam" }
    : intent === "restore"
        ? { archived_at: null, archived_by_user_id: null, lead_disposition: "active" }
        : null;
  if (!next) return failure("Choose spam, archive, restore, or permanent delete.");

  const { data: lead, error } = await supabase
    .from("jobs")
    .update(next)
    .eq("id", jobId)
    .not("website_submission_id", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return failure(error.message);
  if (!lead) return failure("Website lead not found or no access.");

  if (intent === "spam") {
    await cancelPendingCommunications(
      supabase,
      { jobId },
      "Lead classified as spam.",
    );
  }
  await recordActivity(supabase, {
    actorType: roles.includes("owner") ? "owner" : "admin",
    actorUserId: user.id,
    eventType: `website_lead_${intent}`,
    idempotencyKey: `website-lead:${jobId}:${intent}:${new Date().toISOString()}`,
    metadata: { reversible: intent !== "permanent_delete" },
    subjectId: jobId,
    subjectType: "job",
  });
  revalidateLeadViews();
  return {
    status: "success",
    message: intent === "spam"
      ? "Lead marked as spam. Pending follow-ups were cancelled."
      : "Lead restored to the active inbox.",
  };
}

function revalidateLeadViews() {
  revalidatePath("/admin/communications");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}

function failure(message: string): LeadLifecycleState {
  return { status: "error", message: safeStaffMessage(message) };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
