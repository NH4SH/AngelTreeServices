import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { redactActivityData } from "@/lib/security/activity-redaction";

export type ActivityMetadata = Record<string, boolean | number | string | null>;
export type ActivityChanges = Record<string, { before: unknown; after: unknown }>;

type RecordActivityInput = {
  actionCategory?: string | null;
  actorLabel?: string | null;
  actorType?: "owner" | "admin" | "staff" | "crew" | "customer" | "portal" | "system";
  actorUserId?: string | null;
  changes?: ActivityChanges;
  destinationPath?: string | null;
  eventType: string;
  idempotencyKey?: string | null;
  metadata?: ActivityMetadata;
  organizationId?: string | null;
  recordLabel?: string | null;
  summary?: string | null;
  subjectId: string;
  subjectType: string;
};

/** Records non-blocking operational history without affecting the primary workflow. */
export async function recordActivity(
  supabase: SupabaseClient<any, "public", any>,
  {
    actionCategory = null,
    actorLabel = null,
    actorType,
    actorUserId = null,
    changes = {},
    destinationPath = null,
    eventType,
    idempotencyKey = null,
    metadata = {},
    organizationId = null,
    recordLabel = null,
    summary = null,
    subjectId,
    subjectType,
  }: RecordActivityInput,
) {
  const writer = getServiceRoleClient() ?? supabase;

  try {
    const { data, error } = await writer.from("activity_log").insert({
      action_category: cleanText(actionCategory, 80),
      actor_label: cleanText(actorLabel, 180),
      actor_type: actorType ?? (actorUserId ? "staff" : "system"),
      actor_user_id: actorUserId,
      changes_json: redactActivityData(changes),
      destination_path: cleanPath(destinationPath),
      event_type: eventType,
      idempotency_key: cleanText(idempotencyKey, 240),
      metadata_json: redactActivityData(metadata),
      organization_id: organizationId,
      record_label: cleanText(recordLabel, 180),
      summary: cleanText(summary, 500),
      subject_id: subjectId,
      subject_type: subjectType,
    }).select("id").single();

    if (error) {
      if (error.code === "23505" && idempotencyKey) {
        const existing = await writer
          .from("activity_log")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        return { created: false, id: existing.data?.id as string | undefined };
      }
      console.error("Operational activity log write failed", { eventType, subjectId, subjectType, error });
      return { created: false, id: undefined };
    }
    return { created: true, id: data.id as string };
  } catch (error) {
    console.error("Operational activity log write threw", { eventType, subjectId, subjectType, error });
    return { created: false, id: undefined };
  }
}

function cleanText(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanPath(value: string | null | undefined) {
  const cleaned = cleanText(value, 500);
  return cleaned?.startsWith("/admin/") || cleaned === "/admin" ? cleaned : null;
}
