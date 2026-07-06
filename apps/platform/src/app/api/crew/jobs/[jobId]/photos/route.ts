import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { toCrewApiJobPhoto } from "@/lib/api/crew-contract";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getCrewJobById } from "@/lib/data/crew-jobs";
import { getJobPhotos } from "@/lib/data/job-photos";
import {
  maxJobPhotoUploadBytes,
  revalidateJobPhotoPaths,
  uploadJobPhotoForUser,
} from "@/lib/storage/job-photo-upload";
import type { JobPhotoUploadCategory } from "@/lib/types/database";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CrewJobPhotosApiRouteProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: CrewJobPhotosApiRouteProps) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const { jobId } = await params;

  if (!uuidPattern.test(jobId)) {
    return apiError("invalid_job_id", "Use a valid job identifier.", 400);
  }

  const job = await getCrewJobById(jobId, {
    roles: auth.context.roles,
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
  });

  if (!job.data) {
    return apiError("job_not_available", "Job not found or not assigned to this crew account.", 404);
  }

  const photos = await getJobPhotos(jobId, auth.context.supabase);

  if (photos.error && photos.data.length === 0) {
    return apiError("job_photos_unavailable", "Private job photos could not be loaded.", 503);
  }

  return apiSuccess({
    photos: photos.data.map(toCrewApiJobPhoto),
    warning: photos.error,
  });
}

export async function POST(request: NextRequest, { params }: CrewJobPhotosApiRouteProps) {
  const auth = await getCrewApiContext(request);

  if (!auth.context) {
    return apiError(auth.error.code, auth.error.message, auth.error.status);
  }

  const { jobId } = await params;

  if (!uuidPattern.test(jobId)) {
    return apiError("invalid_job_id", "Use a valid job identifier.", 400);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maxJobPhotoUploadBytes + 1024 * 1024) {
    return apiError("photo_too_large", "Upload an image up to 6 MB.", 413);
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return apiError("unsupported_media_type", "Upload photos as multipart form data.", 415);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return apiError("invalid_form_data", "The photo upload could not be read.", 400);
  }

  const category = String(formData.get("photo_type") ?? "") as JobPhotoUploadCategory;
  const result = await uploadJobPhotoForUser({
    caption: String(formData.get("caption") ?? ""),
    category,
    file: formData.get("photo"),
    jobId,
    roles: auth.context.roles,
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
  });

  if (result.status !== "success") {
    return apiError("photo_upload_failed", result.message, 400);
  }

  await revalidateJobPhotoPaths(jobId);
  return apiSuccess(
    {
      message: result.message,
      photo: {
        caption: String(formData.get("caption") ?? "").trim().slice(0, 240) || null,
        photoType: category,
      },
    },
    201,
  );
}
