import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityMetadata = Record<string, boolean | number | string | null>;

type RecordActivityInput = {
  actorUserId?: string | null;
  eventType: string;
  metadata?: ActivityMetadata;
  subjectId: string;
  subjectType: string;
};

/** Records non-blocking operational history without affecting the primary workflow. */
export async function recordActivity(
  supabase: SupabaseClient<any, "public", any>,
  { actorUserId = null, eventType, metadata = {}, subjectId, subjectType }: RecordActivityInput,
) {
  try {
    const { error } = await supabase.from("activity_log").insert({
      actor_user_id: actorUserId,
      event_type: eventType,
      metadata_json: metadata,
      subject_id: subjectId,
      subject_type: subjectType,
    });

    if (error) {
      console.error("Operational activity log write failed", { eventType, subjectId, subjectType, error });
    }
  } catch (error) {
    console.error("Operational activity log write threw", { eventType, subjectId, subjectType, error });
  }
}
