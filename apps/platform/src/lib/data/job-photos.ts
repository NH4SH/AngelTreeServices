import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_PHOTO_BUCKET } from "@/lib/storage/job-photo-paths";
import { safeStaffMessage } from "@/lib/security/errors";
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

  const photos: JobPhoto[] = [];
  try {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("job_photos")
        .select("id,job_id,uploaded_by_user_id,photo_type,storage_path,caption,created_at")
        .eq("job_id", jobId).order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + 499);
      if (error) return { data: [], error: safeStaffMessage(error.message) };
      photos.push(...(data ?? []) as JobPhoto[]);
      if ((data ?? []).length < 500) break;
    }
  } catch { return { data: [], error: "Photo records could not be loaded. Refresh to try again." }; }
  // Sign once per small batch, using the same caller that read the metadata.
  // Map by path: Storage may return partial errors or a different result order.
  const paths = [...new Set(photos.map(photo => photo.storage_path).filter(Boolean))];
  const signedByPath = new Map<string, string>();
  for (let offset = 0; offset < paths.length; offset += 100) {
    const batch = paths.slice(offset, offset + 100);
    try {
      const signed = await supabase.storage.from(JOB_PHOTO_BUCKET).createSignedUrls(batch, signedUrlLifetimeSeconds);
      if (!signed.error) for (const item of signed.data ?? []) {
        if (item.path && batch.includes(item.path) && !item.error && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    } catch { /* Preserve metadata and other batches when Storage is unavailable. */ }
  }
  const signedPhotos: SignedJobPhoto[] = photos.map(photo => ({ ...photo, signed_url: signedByPath.get(photo.storage_path) ?? null }));
  const unavailableCount = signedPhotos.filter((photo) => !photo.signed_url).length;

  return {
    data: signedPhotos,
    error: unavailableCount > 0
      ? `${unavailableCount} private photo thumbnail${unavailableCount === 1 ? " is" : "s are"} unavailable. Refresh to try again; the photo records are still available.`
      : null,
  };
}
