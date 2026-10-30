"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { attachmentBuckets, checkStoredAttachment, type AttachmentBucket } from "@/lib/security/attachment-scan-service";
import { getDocumentScanClient } from "@/lib/security/document-scan-service";
export type FileCheckState = { status: "idle" | "success" | "error"; message: string };
export async function retryAttachmentCheck(_state: FileCheckState, data: FormData): Promise<FileCheckState> {
  const bucket = String(data.get("bucket") ?? "") as AttachmentBucket;
  const path = String(data.get("path") ?? "");
  const fail = (message: string): FileCheckState => ({status:"error",message});
  if (!attachmentBuckets.includes(bucket) || !path || path.length > 1024) return fail("Choose an available attachment.");
  const client = await createClient(); if (!client) return fail("File checks are unavailable. Try again later.");
  const { data: { user } } = await client.auth.getUser(); if (!user) return fail("Sign in before checking a file.");
  // The invoker view reuses each record's actual metadata RLS. No privileged listing.
  const visible = await client.from("attachment_file_checks").select("can_retry, enabled")
    .eq("bucket_id",bucket).eq("storage_path",path).limit(1).maybeSingle();
  if (visible.error || !visible.data) return fail("This file is unavailable to your account. Refresh the list.");
  if (!visible.data.enabled) return fail("Checks are not enabled for this attachment area yet.");
  if (!visible.data.can_retry) return fail("Ask the uploader or an administrator to check this file.");
  const scanner = getDocumentScanClient(); if (!scanner) return fail("File checks are unavailable. The file remains held.");
  const status = await checkStoredAttachment(scanner,bucket,path,user.id);
  revalidatePath("/files");
  if (status === "clean") return {status:"success",message:"File checked and ready to open."};
  if (status === "quarantined") return fail("File quarantined. Upload a safe replacement through the original record.");
  return fail("The check could not finish. The file remains held. Try again later.");
}
