"use client";

import { useActionState } from "react";
import { Camera } from "lucide-react";
import { uploadJobPhoto } from "@/lib/storage/job-photos";
import type { JobPhotoUploadCategory } from "@/lib/types/database";

type JobPhotoUploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: JobPhotoUploadState = {
  status: "idle",
  message: "",
};

type JobPhotoUploaderProps = {
  description: string;
  jobId: string;
  photoCategory: JobPhotoUploadCategory;
  title: string;
};

export function JobPhotoUploader({
  description,
  jobId,
  photoCategory,
  title,
}: JobPhotoUploaderProps) {
  const [state, formAction, pending] = useActionState(uploadJobPhoto, initialState);

  return (
    <form action={formAction} className="photo-uploader">
      <input name="job_id" type="hidden" value={jobId} />
      <input name="photo_category" type="hidden" value={photoCategory} />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <label>
        Photo
        <input accept="image/*" name="photo" type="file" />
      </label>
      <label>
        Caption
        <input name="caption" placeholder="Optional field note" />
      </label>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      <button disabled={pending} type="submit">
        <Camera aria-hidden="true" size={18} />
        {pending ? "Uploading..." : "Upload photo"}
      </button>
    </form>
  );
}
