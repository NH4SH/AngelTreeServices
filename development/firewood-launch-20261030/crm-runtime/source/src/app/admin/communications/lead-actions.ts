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
      ? "Lead marked as spam. Open the Spam view to block future requests from this sender."
      : "Lead restored to the active inbox. Any sender blocks remain in place until you unblock them.",
  };
}

export async function changeWebsiteSenderBlock(
  _state: LeadLifecycleState,
  formData: FormData,
): Promise<LeadLifecycleState> {
  const supabase = await createClient();
  if (!supabase) return failure("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("Sign in before managing sender blocks.");
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) return failure("Only owners and administrators can manage sender blocks.");
  const reason = String(formData.get("reason") ?? "").trim();
  const request = String(formData.get("request_id") ?? "");
  if (reason.length < 5 || reason.length > 500 || !isUuid(request)) return failure("Provide a reason of 5 to 500 characters and try again.");
  const unblock = formData.get("intent") === "unblock";
  let result;
  if (unblock) {
    const id = String(formData.get("block_id") ?? "");
    if (!isUuid(id)) return failure("Choose a valid sender block.");
    result = await supabase.rpc("unblock_website_sender", { p_block: id, p_reason: reason, p_request: request });
  } else {
    if (formData.get("intent") !== "block") return failure("Choose block or unblock.");
    const id = String(formData.get("job_id") ?? "");
    if (!isUuid(id)) return failure("Choose a valid website lead.");
    result = await supabase.rpc("block_website_sender", {
      p_job: id, p_contacts: { email: String(formData.get("email") ?? "") || null, phone: String(formData.get("phone") ?? "") || null },
      p_email: formData.get("block_email") === "on", p_phone: formData.get("block_phone") === "on", p_reason: reason, p_request: request,
    });
  }
  if (result.error) {
    if ((result.error.code === "PT409" || result.error.code === "40001")) return failure("Contact details changed. Close this dialog, refresh, and review the sender again.");
    return failure("The sender change could not be confirmed. Try again; your earlier click may already be saved.");
  }
  if (!result.data || result.data.unblocked !== unblock || !Array.isArray(result.data.blockIds) || !result.data.blockIds.length) {
    return failure("The sender change could not be confirmed. Refresh before trying again.");
  }
  // This page reads uncached data. Let the client refresh on Done so removing
  // the final active block does not unmount its confirmation before it is read.
  return { status: "success", message: unblock
    ? "Block removed. New requests can be received unless another block matches. Old spam leads and blocked requests stay in history."
    : "Sender blocked for the contacts selected. Future matching website requests will be kept out of active leads. History is retained." };
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
