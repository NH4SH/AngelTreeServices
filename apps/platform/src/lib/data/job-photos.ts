import { createClient } from "@/lib/supabase/server";
import type { DataResult, JobPhoto } from "@/lib/types/database";

export async function getJobPhotos(jobId: string): Promise<DataResult<JobPhoto[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("job_photos")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as JobPhoto[], error: null };
}
