import "server-only";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessAssignedCrewJob } from "@/lib/auth/crewAccess";
import type { PlatformRoleName } from "@/lib/auth/roles";
import { buildJobPhotoPath, JOB_PHOTO_BUCKET } from "@/lib/storage/job-photo-paths";
import type { JobPhotoType, JobPhotoUploadCategory } from "@/lib/types/database";

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

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
export const maxJobPhotoUploadBytes = 6 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function uploadJobPhotoForUser({
  caption: rawCaption,
  category,
  file,
  jobId,
  roles,
  supabase,
  userId,
}: {
  caption: string;
  category: JobPhotoUploadCategory;
  file: FormDataEntryValue | null;
  jobId: string;
  roles: PlatformRoleName[];
  supabase: SupabaseClient<any, "public", any>;
  userId: string;
}): Promise<JobPhotoUploadState & { jobId?: string }> {
  const caption = rawCaption.trim().slice(0, 240) || null;

  if (!uuidPattern.test(jobId)) {
    return { status: "error", message: "Job is required before uploading a photo." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a photo before uploading." };
  }

  if (!allowedImageTypes.has(file.type)) {
    return {
      status: "error",
      message: "Upload a JPEG, PNG, WebP, HEIC, or HEIF image.",
    };
  }

  if (file.size > maxJobPhotoUploadBytes) {
    return {
      status: "error",
      message: "Photo is too large. Upload an image up to 6 MB.",
    };
  }

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

  if (
    !canAccessAssignedCrewJob({
      assignedCrewUserId: job.assigned_crew_user_id,
      roles,
      userId,
    })
  ) {
    return { status: "error", message: "This job is not assigned to this crew account." };
  }

  const storagePath = buildJobPhotoPath({
    jobId,
    category,
    fileName: file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(JOB_PHOTO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      status: "error",
      message: `Photo upload failed. Confirm the private ${JOB_PHOTO_BUCKET} bucket and storage policies are configured. ${uploadError.message}`,
    };
  }

  const { error: photoError } = await supabase.from("job_photos").insert({
    job_id: jobId,
    uploaded_by_user_id: userId,
    photo_type: categoryToDbType[category],
    storage_path: storagePath,
    caption,
  });

  if (photoError) {
    const { error: cleanupError } = await supabase.storage.from(JOB_PHOTO_BUCKET).remove([storagePath]);
    const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : "";

    return cleanupError
      ? {
          status: "error",
          message: `Photo metadata failed and cleanup also failed. Contact an administrator. ${cleanupMessage} ${photoError.message}`,
        }
      : {
          status: "error",
          message: `Photo metadata failed. The uploaded file was removed. ${photoError.message}`,
        };
  }

  await recordActivity(supabase, {
    actorUserId: userId,
    eventType: "job_photo_uploaded",
    metadata: { photo_type: category },
    subjectId: jobId,
    subjectType: "job",
  });

  return { status: "success", message: "Photo uploaded and attached to the job.", jobId };
}

export async function revalidateJobPhotoPaths(jobId: string) {
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
}
