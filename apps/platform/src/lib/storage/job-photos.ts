"use server";

import { getUserRoles } from "@/lib/auth/roles";
import {
  revalidateJobPhotoPaths,
  uploadJobPhotoForUser,
  type JobPhotoUploadState,
} from "@/lib/storage/job-photo-upload";
import { createClient } from "@/lib/supabase/server";
import type { JobPhotoUploadCategory } from "@/lib/types/database";

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

  const roles = await getUserRoles(supabase, user.id);
  const result = await uploadJobPhotoForUser({
    caption: String(formData.get("caption") ?? ""),
    category: String(formData.get("photo_category") ?? "before") as JobPhotoUploadCategory,
    file: formData.get("photo"),
    jobId: String(formData.get("job_id") ?? ""),
    roles,
    supabase,
    userId: user.id,
  });

  if (result.status === "success" && result.jobId) {
    await revalidateJobPhotoPaths(result.jobId);
  }

  return result;
}
