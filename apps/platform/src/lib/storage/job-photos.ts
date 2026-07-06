"use server";

import { revalidatePath } from "next/cache";
import { canAccessAssignedCrewJob } from "@/lib/auth/crewAccess";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { buildJobPhotoPath, JOB_PHOTO_BUCKET } from "@/lib/storage/job-photo-paths";
import { createClient } from "@/lib/supabase/server";
import type { JobPhotoType, JobPhotoUploadCategory } from "@/lib/types/database";

type JobPhotoUploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const categoryToDbType: Record<JobPhotoUploadCategory, JobPhotoType | null> = {
  before: "before",
  after: "after",
  issue: "issue",
  completion: null,
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxUploadBytes = 10 * 1024 * 1024;

export async function uploadJobPhoto(
  _previousState: JobPhotoUploadState,
  formData: FormData,
): Promise<JobPhotoUploadState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before uploading job photos." };
  }

  const jobId = String(formData.get("job_id") ?? "");
  const category = String(formData.get("photo_category") ?? "before") as JobPhotoUploadCategory;
  const caption = String(formData.get("caption") ?? "").trim() || null;
  const file = formData.get("photo");

  if (!jobId) {
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

  if (file.size > maxUploadBytes) {
    return {
      status: "error",
      message: "Photo is too large. Upload an image under 10 MB.",
    };
  }

  if (!["before", "after", "issue", "completion"].includes(category)) {
    return { status: "error", message: "Choose a supported photo type." };
  }

  const dbPhotoType = categoryToDbType[category];

  if (!dbPhotoType) {
    return {
      status: "error",
      message:
        "Completion photo uploads are scaffolded, but the current job_photos constraint does not persist completion as a photo type yet.",
    };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, assigned_crew_user_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find this job." };
  }

  const roles = await getCurrentUserRoles();

  if (
    !canAccessAssignedCrewJob({
      assignedCrewUserId: job.assigned_crew_user_id,
      roles,
      userId: user.id,
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
    uploaded_by_user_id: user.id,
    photo_type: dbPhotoType,
    storage_path: storagePath,
    caption,
  });

  if (photoError) {
    const { error: cleanupError } = await supabase.storage.from(JOB_PHOTO_BUCKET).remove([storagePath]);
    const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : "";

    return {
      status: "error",
      message: `Photo uploaded, but metadata failed and the uploaded file was removed.${cleanupMessage} ${photoError.message}`,
    };
  }

  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
  return { status: "success", message: "Photo uploaded and attached to the job." };
}
