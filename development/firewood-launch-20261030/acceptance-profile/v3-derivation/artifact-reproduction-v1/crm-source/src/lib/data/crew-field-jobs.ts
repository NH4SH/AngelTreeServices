import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDateKey } from "@/lib/business-time";
import type { CrewJob, JobPhotoUploadCategory } from "@/lib/types/database";

export const fieldJobScopes = ["today", "upcoming", "active", "unscheduled", "history", "needs_photos", "ready_to_complete"] as const;
export type FieldJobScope = (typeof fieldJobScopes)[number];
export type FieldJob = Pick<CrewJob, "id" | "assigned_crew_user_id" | "status" | "service_type" | "priority" | "requested_scope" | "scheduled_start_at" | "scheduled_end_at" | "completed_at" | "created_at" | "updated_at"> & {
  customers: { id: string; display_name: string; phone: string | null } | null;
  organizations: { id: string; name: string; billing_phone: string | null } | null;
  service_locations: { id: string; label: string | null; street: string; city: string; state: string; postal_code: string | null } | null;
  photo_counts: Partial<Record<JobPhotoUploadCategory, number>>;
};
export type FieldJobPage = {
  errorCode?: "invalid_request" | "invalid_cursor";
  data: FieldJob[]; total: number; nextCursor: string | null; error: string | null;
  counts: { upcoming: number; needs_photos: number; ready_to_complete: number } | null;
};
export function isFieldDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export async function getCrewJobPage(supabase: SupabaseClient<any, "public", any>, input: {
  scope: FieldJobScope | "dashboard"; date?: string; cursor?: string | null; limit?: number;
}): Promise<FieldJobPage> {
  const empty: FieldJobPage = { data: [], total: 0, nextCursor: null, counts: null, error: null };
  const date = input.date ?? getBusinessDateKey(new Date());
  if (!isFieldDate(date) || ![...fieldJobScopes, "dashboard"].includes(input.scope)) return { ...empty, errorCode: "invalid_request", error: "Choose a valid job view and date." };
  let cursor: unknown = null;
  try {
    if (input.cursor) {
      if (input.cursor.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw Error();
      const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (c.v !== 1 || c.scope !== input.scope || c.date !== date || typeof c.at !== "string" || !Number.isFinite(Date.parse(c.at)) || !/^[0-9a-f-]{36}$/i.test(c.id)) throw Error();
      cursor = c;
    }
  } catch { return { ...empty, errorCode: "invalid_cursor", error: "This job page has expired or changed. Open the first page to continue." }; }
  try {
    const result = await supabase.rpc("read_crew_job_page", {
      p_scope: input.scope, p_date: date, p_limit: Math.min(100, Math.max(1, Math.floor(input.limit ?? 25) || 25)), p_cursor: cursor,
    });
    if (result.error || !result.data || !Array.isArray(result.data.jobs)) return { ...empty, error: "Jobs could not be loaded. Try refreshing this view." };
    return { data: result.data.jobs as FieldJob[], total: Number(result.data.total), counts: result.data.counts,
      nextCursor: result.data.next_cursor ? Buffer.from(JSON.stringify(result.data.next_cursor)).toString("base64url") : null, error: null };
  } catch { return { ...empty, error: "Jobs could not be loaded. Try refreshing this view." }; }
}
