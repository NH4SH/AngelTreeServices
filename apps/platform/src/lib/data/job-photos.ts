import { privateFileLinks } from "@/lib/files/private-file-links";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeStaffMessage } from "@/lib/security/errors";
import type { DataResult, JobPhoto, SignedJobPhoto } from "@/lib/types/database";


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
  const signedByPath = new Map<string, string>();
  try {
    const links = await privateFileLinks(supabase, "job_photo", photos);
    for (const item of links.data) signedByPath.set(item.path, item.signedUrl);
  } catch { /* Preserve metadata when file access cannot be checked. */ }
  const signedPhotos: SignedJobPhoto[] = photos.map(photo => ({ ...photo, signed_url: signedByPath.get(photo.storage_path) ?? null }));
  const unavailableCount = signedPhotos.filter((photo) => !photo.signed_url).length;

  return {
    data: signedPhotos,
    error: unavailableCount > 0
      ? `${unavailableCount} private photo thumbnail${unavailableCount === 1 ? " is" : "s are"} unavailable. Refresh to try again; the photo records are still available.`
      : null,
  };
}
