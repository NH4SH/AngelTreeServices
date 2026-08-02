import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordActivity } from "@/lib/activity-log";
import { cancelPendingCommunications } from "@/lib/communications/queue";
import { getWebsiteLeadArchiveDecision } from "@/lib/leads/archive-rules";

type ArchiveWebsiteLeadInput = {
  actorType: "owner" | "admin" | "staff";
  actorUserId: string;
  eventType: string;
  idempotencyKey: string;
  jobId: string;
  metadata?: Record<string, boolean | number | string | null>;
  reason: string;
  summary: string;
};

export type ArchiveWebsiteLeadResult = {
  error: string | null;
  status: "archived" | "already_archived" | "skipped" | "error";
};

export async function archiveWebsiteLead(
  supabase: SupabaseClient<any, "public", any>,
  input: ArchiveWebsiteLeadInput,
): Promise<ArchiveWebsiteLeadResult> {
  const archivedAt = new Date().toISOString();
  const { data: archivedLead, error: archiveError } = await supabase
    .from("jobs")
    .update({
      archived_at: archivedAt,
      archived_by_user_id: input.actorUserId,
      lead_disposition: "archived",
    })
    .eq("id", input.jobId)
    .not("website_submission_id", "is", null)
    .eq("lead_disposition", "active")
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (archiveError) return { error: archiveError.message, status: "error" };

  if (!archivedLead) {
    const { data: existingLead, error: existingError } = await supabase
      .from("jobs")
      .select("id, archived_at, lead_disposition")
      .eq("id", input.jobId)
      .not("website_submission_id", "is", null)
      .maybeSingle();

    if (existingError) return { error: existingError.message, status: "error" };
    const decision = getWebsiteLeadArchiveDecision(existingLead as {
      archived_at: string | null;
      lead_disposition: "active" | "spam" | "archived";
    } | null);
    return { error: null, status: decision === "already_archived" ? "already_archived" : "skipped" };
  }

  await cancelPendingCommunications(supabase, { jobId: input.jobId }, input.reason);
  await recordActivity(supabase, {
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    metadata: { ...input.metadata, reversible: true },
    summary: input.summary,
    subjectId: input.jobId,
    subjectType: "job",
  });

  return { error: null, status: "archived" };
}
