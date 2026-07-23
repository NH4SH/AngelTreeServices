"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getInspectionTemplate } from "@/lib/equipment/inspection-templates";
import { createClient } from "@/lib/supabase/server";
import { prepareSafeUpload } from "@/lib/security/upload-validation";
import { safeStaffMessage } from "@/lib/security/errors";

export type CrewEquipmentActionState = { status: "idle" | "success" | "error"; message: string };

export async function submitEquipmentInspection(_state: CrewEquipmentActionState, formData: FormData): Promise<CrewEquipmentActionState> {
  const context = await getUserContext();
  if (!context) return fail("Sign in before submitting an inspection.");
  const assetId = text(formData, "asset_id", 80);
  const assignmentId = text(formData, "assignment_id", 80);
  const templateKey = text(formData, "template_key", 80);
  const template = getInspectionTemplate(templateKey);
  if (!assetId || !assignmentId || !template) return fail("This equipment inspection checklist is unavailable.");

  const responses: Record<string, "pass" | "attention" | "fail"> = {};
  for (const checklistItem of template.items) {
    const response = text(formData, `item_${checklistItem.key}`, 20) as "pass" | "attention" | "fail";
    if (!["pass", "attention", "fail"].includes(response)) return fail(`Complete “${checklistItem.label}” before submitting.`);
    responses[checklistItem.key] = response;
  }
  const hasFailure = Object.values(responses).includes("fail");
  const hasAttention = Object.values(responses).includes("attention");
  const overallResult = hasFailure ? "failed" : hasAttention ? "passed_with_attention" : "passed";
  const notes = text(formData, "notes", 2000);
  if ((hasFailure || hasAttention) && !notes) return fail("Add a short note explaining every item that needs attention or failed.");

  const { error } = await context.supabase.rpc("submit_assigned_equipment_inspection", {
    p_asset_id: assetId,
    p_assignment_id: assignmentId,
    p_template_key: template.key,
    p_responses: responses,
    p_overall_result: overallResult,
    p_notes: notes || null,
    p_mileage: optionalNumber(formData, "mileage"),
    p_hours: optionalNumber(formData, "hours"),
  });
  if (error) return fail(error.message);
  await recordActivity(context.supabase, { actorUserId: context.userId, eventType: "equipment_inspection_submitted", subjectId: assetId, subjectType: "equipment", metadata: { result: overallResult } });
  revalidateEquipment(assetId);
  return { status: "success", message: hasFailure ? "Inspection submitted. This equipment is now out of service. Tell your supervisor before using another asset." : "Inspection submitted. Equipment is ready for the assignment." };
}

export async function reportEquipmentProblem(_state: CrewEquipmentActionState, formData: FormData): Promise<CrewEquipmentActionState> {
  const context = await getUserContext();
  if (!context) return fail("Sign in before reporting a problem.");
  const assetId = text(formData, "asset_id", 80);
  const assignmentId = text(formData, "assignment_id", 80);
  const title = text(formData, "title", 160);
  const description = text(formData, "description", 2000);
  const severity = text(formData, "severity", 20);
  const stopped = formData.get("equipment_stopped") === "on";
  if (!assetId || !assignmentId || !title || !description || !["attention", "unsafe", "critical"].includes(severity)) return fail("Problem title, details, and severity are required.");

  let storagePath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) return fail("Upload a JPEG, PNG, or WebP photo.");
    if (photo.size > 6 * 1024 * 1024) return fail("Photo is too large. Upload an image up to 6 MB.");
    const prepared = await prepareSafeUpload(photo, { maxBytes: 6 * 1024 * 1024 });
    if (!prepared.data) return fail(prepared.error ?? "The photo could not be validated.");
    storagePath = `${assetId}/problems/${Date.now()}-${safeFileName(photo.name)}`;
    const { error: uploadError } = await context.supabase.storage.from("equipment-files").upload(storagePath, prepared.data.bytes, { contentType: prepared.data.contentType, upsert: false });
    if (uploadError) return fail(`Problem photo could not upload: ${uploadError.message}`);
  }

  const { error } = await context.supabase.rpc("report_assigned_equipment_problem", {
    p_asset_id: assetId,
    p_assignment_id: assignmentId,
    p_title: title,
    p_description: description,
    p_severity: severity,
    p_equipment_stopped: stopped,
    p_photo_storage_path: storagePath,
  });
  if (error) {
    if (storagePath) await context.supabase.storage.from("equipment-files").remove([storagePath]);
    return fail(error.message);
  }
  await recordActivity(context.supabase, { actorUserId: context.userId, eventType: "equipment_problem_reported", subjectId: assetId, subjectType: "equipment", metadata: { severity, equipment_stopped: stopped } });
  revalidateEquipment(assetId);
  return { status: "success", message: severity === "attention" && !stopped ? "Problem reported for staff review." : "Unsafe problem reported. This equipment is now out of service. Tell your supervisor and do not use it." };
}

async function getUserContext() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}
function revalidateEquipment(assetId: string) { revalidatePath("/crew"); revalidatePath("/crew/equipment"); revalidatePath(`/crew/equipment/${assetId}`); revalidatePath("/admin"); revalidatePath("/admin/equipment"); revalidatePath(`/admin/equipment/${assetId}`); }
function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optionalNumber(formData: FormData, key: string) { const raw = text(formData, key, 40); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; }
function safeFileName(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "photo.jpg"; }
function fail(message: string): CrewEquipmentActionState { return { status: "error", message: safeStaffMessage(message) }; }
