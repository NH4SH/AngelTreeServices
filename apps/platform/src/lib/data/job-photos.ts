import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_PHOTO_BUCKET } from "@/lib/storage/job-photo-paths";
import type { DataResult, JobPhoto, SignedJobPhoto } from "@/lib/types/database";

const signedUrlLifetimeSeconds = 15 * 60;

export async function getJobPhotos(
  jobId: string,
  requestClient?: SupabaseClient<any, "public", any>,
): Promise<DataResult<SignedJobPhoto[]>> {
  const supabase = requestClient ?? await createClient();

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

  const photos = (data ?? []) as JobPhoto[];
  const signedPhotos = await Promise.all(
    photos.map(async (photo): Promise<SignedJobPhoto> => {
      const { data: signedUrl, error: signedUrlError } = await supabase.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(photo.storage_path, signedUrlLifetimeSeconds);

      return {
        ...photo,
        signed_url: signedUrlError ? null : signedUrl.signedUrl,
      };
    }),
  );
  const unavailableCount = signedPhotos.filter((photo) => !photo.signed_url).length;

  return {
    data: signedPhotos,
    error: unavailableCount > 0
      ? `${unavailableCount} private photo thumbnail${unavailableCount === 1 ? " is" : "s are"} unavailable. Confirm the job-photos bucket and storage SELECT policy.`
      : null,
  };
}
