import type { JobPhotoUploadCategory } from "@/lib/types/database";

export const JOB_PHOTO_BUCKET = "job-photos";

export function buildJobPhotoPath({
  jobId,
  category,
  fileName,
  timestamp = Date.now(),
}: {
  jobId: string;
  category: JobPhotoUploadCategory;
  fileName: string;
  timestamp?: number;
}) {
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const folder = category === "completion" ? "completion" : category;
  return `${jobId}/${folder}/${timestamp}-${safeName || "photo"}`;
}
