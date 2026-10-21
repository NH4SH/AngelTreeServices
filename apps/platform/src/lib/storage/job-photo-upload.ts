import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildJobPhotoPath, JOB_PHOTO_BUCKET } from "@/lib/storage/job-photo-paths";
import type { JobPhotoType, JobPhotoUploadCategory } from "@/lib/types/database";
import { uploadCheckedAttachment } from "@/lib/security/attachment-scan-service";
import { prepareSafeUpload } from "@/lib/security/upload-validation";

export type JobPhotoUploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const categoryToDbType: Record<JobPhotoUploadCategory, JobPhotoType> = {
  before: "before",
  during: "during",
  after: "after",
  issue: "issue",
  completion: "completion",
  equipment_access: "equipment_access",
};

export const maxJobPhotoUploadBytes = 6 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function uploadJobPhotoForUser({
  caption: rawCaption,
  category,
  file,
  jobId,
  supabase,
  userId,
}: {
  caption: string;
  category: JobPhotoUploadCategory;
  file: FormDataEntryValue | null;
  jobId: string;
  supabase: SupabaseClient<any, "public", any>;
  userId: string;
}): Promise<JobPhotoUploadState & { jobId?: string }> {
  if (typeof file === "string" && file.startsWith("ats-upload:v1:")) {
    const { withStagedUploads } = await import("@/lib/files/staged-uploads");
    const input = new FormData(); input.set("photo", file);
    return withStagedUploads(input, hydrated => uploadJobPhotoForUser({ caption: rawCaption, category,
      file: hydrated.get("photo"), jobId, supabase, userId }), { user: { id: userId } });
  }
  const caption = rawCaption.trim().slice(0, 240) || null;

  if (!uuidPattern.test(jobId)) {
    return { status: "error", message: "Job is required before uploading a photo." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a photo before uploading." };
  }

  const prepared = await prepareSafeUpload(file, { maxBytes: maxJobPhotoUploadBytes });
  if (!prepared.data) return { status: "error", message: prepared.error ?? "Upload a valid JPEG, PNG, or WebP image up to 6 MB." };

  if (!["before", "during", "after", "issue", "completion", "equipment_access"].includes(category)) {
    return { status: "error", message: "Choose a supported photo type." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, assigned_crew_user_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find this job." };
  }

  const storagePath = buildJobPhotoPath({
    jobId,
    category,
    fileName: file.name,
  });

  const { error: uploadError } = await uploadCheckedAttachment(supabase, JOB_PHOTO_BUCKET, storagePath, prepared.data, userId, { cacheControl: "0" });

  if (uploadError) {
    return {
      status: "error",
      message: `Photo upload failed. Confirm the private ${JOB_PHOTO_BUCKET} bucket and storage policies are configured. ${uploadError.message}`,
    };
  }

  let photoError: { code?: string; message: string } | null;
  try {
    const saved = await supabase.from("job_photos").insert({
      job_id: jobId,
      uploaded_by_user_id: userId,
      photo_type: categoryToDbType[category],
      storage_path: storagePath,
      caption,
    });
    photoError = saved.error;
  } catch {
    return { status: "error", message: "The photo uploaded, but its attachment could not be confirmed. Check the job photos before uploading again.", jobId };
  }

  if (photoError) {
    // A transport failure may have lost a committed metadata+audit response.
    // Keep its private object available for review rather than deleting evidence.
    if (!/^(22|23|42)[0-9A-Z]{3}$/.test(String(photoError.code ?? ""))) return {
      status: "error", message: "The photo uploaded, but its attachment could not be confirmed. Check the job photos before uploading again.", jobId,
    };
    // Storage may return success with no removed objects when SELECT/DELETE
    // policies hide a held file. Only a receipt for this exact new path confirms
    // cleanup; do not bypass those policies or discard an uncertain outcome.
    let cleanupConfirmed = false;
    try {
      const cleanup = await supabase.storage.from(JOB_PHOTO_BUCKET).remove([storagePath]);
      cleanupConfirmed = !cleanup.error && cleanup.data?.length === 1 && cleanup.data[0].name === storagePath;
    } catch { /* Preserve the attachment failure and report cleanup as unconfirmed. */ }

    return {
      status: "error",
      message: cleanupConfirmed
        ? "Photo could not be attached. The uploaded file was removed. Please try again."
        : "Photo could not be attached. File cleanup could not be confirmed. Contact an administrator before uploading again.",
      jobId,
    };
  }

  return { status: "success", message: "Photo uploaded and attached to the job.", jobId };
}

export async function revalidateJobPhotoPaths(jobId: string) {
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
}
