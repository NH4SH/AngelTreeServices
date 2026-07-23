"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { prepareSafeUpload } from "@/lib/security/upload-validation";
import { safeStaffMessage } from "@/lib/security/errors";

export type DocumentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const allowedTypes = new Set([
  "contract", "proposal", "invoice", "work_order", "insurance", "permit",
  "safety", "employee", "equipment", "photo", "receipt", "other",
]);
const allowedMimeTypes = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const linkColumns = {
  customer: "customer_id",
  organization: "organization_id",
  job: "job_id",
  quote: "quote_id",
  invoice: "invoice_id",
  employee: "employee_id",
  equipment: "equipment_asset_id",
} as const;

export async function uploadPlatformDocument(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const context = await getStaffContext();
  if (!context) return failure("Only authorized staff can upload documents.");

  const title = text(formData, "title", 180);
  const documentType = text(formData, "document_type", 40);
  const expiresAt = optionalDate(formData, "expires_at");
  const file = formData.get("file");
  if (!title || !allowedTypes.has(documentType)) return failure("Enter a title and choose a document type.");
  if (!(file instanceof File) || file.size === 0) return failure("Choose a file to upload.");
  if (!allowedMimeTypes.has(file.type) || file.size > 25 * 1024 * 1024) {
    return failure("Upload a PDF, image, text, Word, or Excel file up to 25 MB.");
  }
  const prepared = await prepareSafeUpload(file, { maxBytes: 25 * 1024 * 1024, allowDocuments: true });
  if (!prepared.data) return failure(prepared.error ?? "The file could not be validated.");

  const linkType = text(formData, "link_type", 30) as keyof typeof linkColumns;
  const linkId = text(formData, "link_id", 80);
  if ((linkType && !linkColumns[linkType]) || (linkType && !linkId) || (!linkType && linkId)) {
    return failure("Choose both a linked record type and record, or leave both blank.");
  }

  const employeeSensitive = documentType === "employee" || formData.get("employee_sensitive") === "on";
  if (employeeSensitive && !hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) {
    return failure("Only owners and admins can upload employee-sensitive documents here.");
  }

  const storagePath = `${context.user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await context.supabase.storage
    .from("platform-documents")
    .upload(storagePath, prepared.data.bytes, { contentType: prepared.data.contentType, upsert: false });
  if (uploadError) {
    console.error("Platform document upload failed", uploadError);
    return failure(`The file could not be uploaded: ${uploadError.message}`);
  }

  const linkedRecord = linkType && linkId ? { [linkColumns[linkType]]: linkId } : {};
  const { error: metadataError } = await context.supabase.from("documents").insert({
    title,
    document_type: documentType,
    storage_path: storagePath,
    mime_type: prepared.data.contentType,
    file_size_bytes: prepared.data.size,
    expires_at: expiresAt,
    uploaded_by_user_id: context.user.id,
    access_classification: employeeSensitive ? "employee_sensitive" : "staff",
    ...linkedRecord,
  });

  if (metadataError) {
    console.error("Platform document metadata save failed", metadataError);
    await context.supabase.storage.from("platform-documents").remove([storagePath]);
    return failure(`The document record could not be saved: ${metadataError.message}`);
  }

  revalidatePath("/admin/documents");
  return { status: "success", message: "Document uploaded securely." };
}

export async function archivePlatformDocument(formData: FormData) {
  const context = await getStaffContext();
  if (!context) return;
  const documentId = text(formData, "document_id", 80);
  if (!documentId) return;

  const { error } = await context.supabase.from("documents").update({
    archived_at: new Date().toISOString(),
    archived_by_user_id: context.user.id,
  }).eq("id", documentId);
  if (error) console.error("Platform document archive failed", error);
  revalidatePath("/admin/documents");
}

async function getStaffContext() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) return null;
  return { supabase, user, roles };
}

function text(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalDate(formData: FormData, key: string) {
  const value = text(formData, key, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-140) || "document";
}

function failure(message: string): DocumentActionState {
  return { status: "error", message: safeStaffMessage(message) };
}
