"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEmployeeEligibilityWarnings } from "@/lib/data/employees";
import { createClient } from "@/lib/supabase/server";
import { prepareSafeUpload } from "@/lib/security/upload-validation";
import { safeStaffMessage } from "@/lib/security/errors";
import type { EquipmentCategory, EquipmentStatus } from "@/lib/types/database";

export type EquipmentActionState = { status: "idle" | "success" | "error" | "warning"; message: string };

const categories: EquipmentCategory[] = [
  "vehicle", "chipper", "stump_grinder", "skid_steer", "crane", "aerial_lift", "trailer",
  "chainsaw", "climbing_gear", "rigging_gear", "ppe", "landscaping_equipment",
  "lawn_care_equipment", "other",
];
const statuses: EquipmentStatus[] = [
  "available", "assigned", "in_use", "maintenance_due", "out_of_service",
  "awaiting_parts", "repair_scheduled", "retired",
];

async function getStaffContext() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) return null;
  return { supabase, user, roles };
}

export async function createEquipmentAsset(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can add equipment.");
  const input = assetInput(formData);
  if ("message" in input) return error(String(input.message));

  const duplicate = await findPossibleDuplicate(context.supabase, input);
  if (duplicate && formData.get("duplicate_override") !== "on") {
    return { status: "warning", message: `Possible duplicate: ${duplicate.name} (${duplicate.asset_number}). Check “Create anyway” only after confirming this is a separate asset.` };
  }

  const { data: asset, error: insertError } = await context.supabase
    .from("equipment_assets")
    .insert({ ...input, created_by_user_id: context.user.id })
    .select("id")
    .single();
  if (insertError || !asset) return error(insertError?.message ?? "Could not create equipment.");

  const purchasePriceCents = moneyCents(formData, "purchase_price");
  if (purchasePriceCents !== null && hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) {
    const { error: costError } = await context.supabase.from("equipment_asset_costs").insert({
      asset_id: asset.id,
      purchase_price_cents: purchasePriceCents,
      updated_by_user_id: context.user.id,
    });
    if (costError) console.error("Equipment cost save failed", costError);
  }

  await recordActivity(context.supabase, {
    actorUserId: context.user.id,
    eventType: "equipment_created",
    subjectId: asset.id,
    subjectType: "equipment",
  });
  revalidateEquipment(asset.id);
  redirect(`/admin/equipment/${asset.id}?created=1`);
}

export async function updateEquipmentAsset(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can edit equipment.");
  const assetId = text(formData, "asset_id", 80);
  const input = assetInput(formData);
  if (!assetId || "message" in input) return error(!assetId ? "Equipment record is missing." : String(input.message));

  const duplicate = await findPossibleDuplicate(context.supabase, input, assetId);
  if (duplicate && formData.get("duplicate_override") !== "on") {
    return { status: "warning", message: `Possible duplicate: ${duplicate.name} (${duplicate.asset_number}). Check “Save anyway” only after confirming this is a separate asset.` };
  }

  const { error: updateError } = await context.supabase.from("equipment_assets").update(input).eq("id", assetId);
  if (updateError) return error(updateError.message);

  const purchasePriceCents = moneyCents(formData, "purchase_price");
  if (hasAllowedRole(context.roles, platformRoleGroups.accessApproval) && formData.has("purchase_price")) {
    const { error: costError } = await context.supabase.from("equipment_asset_costs").upsert({
      asset_id: assetId,
      purchase_price_cents: purchasePriceCents,
      updated_by_user_id: context.user.id,
    });
    if (costError) console.error("Equipment cost update failed", costError);
  }

  await recordActivity(context.supabase, {
    actorUserId: context.user.id,
    eventType: "equipment_updated",
    subjectId: assetId,
    subjectType: "equipment",
  });
  revalidateEquipment(assetId);
  redirect(`/admin/equipment/${assetId}?updated=1`);
}

export async function addEquipmentReading(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can add readings.");
  const assetId = text(formData, "asset_id", 80);
  const readingType = text(formData, "reading_type", 20);
  const readingValue = number(formData, "reading_value");
  if (!assetId || !["mileage", "hours"].includes(readingType) || readingValue === null || readingValue < 0) {
    return error("Choose mileage or hours and enter a valid reading.");
  }

  const column = readingType === "mileage" ? "current_mileage" : "current_hours";
  const { data: asset } = await context.supabase.from("equipment_assets").select("id, current_mileage, current_hours").eq("id", assetId).single();
  const currentValue = Number(readingType === "mileage" ? asset?.current_mileage ?? 0 : asset?.current_hours ?? 0);
  const isLower = readingValue < currentValue;
  const correctionReason = text(formData, "correction_reason", 500) || null;
  if (isLower && (!correctionReason || formData.get("confirm_correction") !== "on")) {
    return { status: "warning", message: `This is lower than the current ${readingType} reading (${currentValue}). Confirm the correction and explain why; history will be preserved.` };
  }

  const { data: previous } = isLower
    ? await context.supabase.from("equipment_readings").select("id").eq("asset_id", assetId).eq("reading_type", readingType).order("recorded_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const { error: readingError } = await context.supabase.from("equipment_readings").insert({
    asset_id: assetId,
    reading_type: readingType,
    reading_value: readingValue,
    correction_reason: correctionReason,
    supersedes_reading_id: isLower ? previous?.id ?? null : null,
    recorded_by_user_id: context.user.id,
  });
  if (readingError) return error(readingError.message);

  const { error: assetError } = await context.supabase.from("equipment_assets").update({ [column]: readingValue }).eq("id", assetId);
  if (assetError) return error(`Reading saved, but current display could not update: ${assetError.message}`);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_reading_added", subjectId: assetId, subjectType: "equipment", metadata: { reading_type: readingType, reading_value: readingValue } });
  revalidateEquipment(assetId);
  return { status: "success", message: "Reading added. Previous readings remain in history." };
}

export async function assignEquipment(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can assign equipment.");
  const assetId = text(formData, "asset_id", 80);
  const assignedUserId = optional(formData, "assigned_user_id", 80);
  const jobId = optional(formData, "job_id", 80);
  const scheduleEventId = optional(formData, "schedule_event_id", 80);
  const startsAt = dateTime(formData, "starts_at");
  const endsAt = dateTime(formData, "ends_at");
  const overrideReason = optional(formData, "conflict_override_reason", 600);
  if (!assetId || !startsAt || (!assignedUserId && !jobId && !scheduleEventId)) return error("Choose equipment, a start time, and an employee, job, or schedule event.");
  if (endsAt && endsAt <= startsAt) return error("Assignment end must be after its start.");

  const { data: asset, error: assetError } = await context.supabase.from("equipment_assets").select("id, name, category, status, next_inspection_due_at, current_mileage, current_hours").eq("id", assetId).single();
  if (assetError || !asset) return error(assetError?.message ?? "Equipment not found.");
  const blockingReasons: string[] = [];
  if (["out_of_service", "awaiting_parts", "repair_scheduled", "retired"].includes(asset.status)) blockingReasons.push(`status is ${asset.status.replaceAll("_", " ")}`);
  if (asset.next_inspection_due_at && new Date(asset.next_inspection_due_at) < new Date(startsAt)) blockingReasons.push("inspection is overdue");
  const { data: dueMaintenance } = await context.supabase.from("equipment_maintenance_schedules").select("id").eq("asset_id", assetId).eq("is_active", true).or(`next_due_at.lte.${startsAt},next_due_mileage.lte.${asset.current_mileage ?? -1},next_due_hours.lte.${asset.current_hours ?? -1}`).limit(1);
  if (dueMaintenance?.length) blockingReasons.push("maintenance is due");
  const overlapEnd = endsAt ?? "9999-12-31T23:59:59.999Z";
  const { data: conflicts } = await context.supabase.from("equipment_assignments").select("id, starts_at, ends_at").eq("asset_id", assetId).is("returned_at", null).lt("starts_at", overlapEnd).or(`ends_at.is.null,ends_at.gt.${startsAt}`).limit(1);
  if (conflicts?.length) blockingReasons.push("it already has an overlapping assignment");
  const qualificationWarnings = assignedUserId
    ? await getEmployeeEligibilityWarnings([assignedUserId], { type: "equipment_category", value: asset.category })
    : [];
  blockingReasons.push(...qualificationWarnings.filter((warning) => warning.requiresOverride).map((warning) => warning.message));

  const canOverride = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  if (blockingReasons.length && (!canOverride || !overrideReason)) {
    return { status: "warning", message: `${asset.name} cannot be assigned because ${blockingReasons.join(" and ")}. Owner/admin can enter an override reason when business judgment permits.` };
  }

  const { data: assignment, error: assignmentError } = await context.supabase.from("equipment_assignments").insert({
    asset_id: assetId,
    assigned_user_id: assignedUserId,
    job_id: jobId,
    schedule_event_id: scheduleEventId,
    starts_at: startsAt,
    ends_at: endsAt,
    notes: optional(formData, "notes", 1000),
    conflict_override_reason: overrideReason,
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (assignmentError || !assignment) return error(assignmentError?.message ?? "Could not assign equipment.");
  await context.supabase.from("equipment_assets").update({ assigned_employee_id: assignedUserId, status: "assigned" }).eq("id", assetId);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_assigned", subjectId: assetId, subjectType: "equipment", metadata: { assignment_id: assignment.id, override: Boolean(overrideReason) } });
  if (qualificationWarnings.length) await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: overrideReason ? "employee_qualification_override" : "employee_qualification_warning", subjectId: assetId, subjectType: "equipment", metadata: { assigned_user_id: assignedUserId, equipment_category: asset.category, reason: overrideReason, warning_count: qualificationWarnings.length } });
  revalidateEquipment(assetId);
  return qualificationWarnings.length
    ? { status: "warning", message: `Equipment assignment saved with a qualification warning. ${qualificationWarnings.map((warning) => warning.message).join(" ")}` }
    : { status: "success", message: "Equipment assignment saved." };
}

export async function changeEquipmentStatus(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can change equipment status.");
  const assetId = text(formData, "asset_id", 80);
  const nextStatus = text(formData, "next_status", 40) as EquipmentStatus;
  const reason = text(formData, "reason", 800);
  if (!assetId || !statuses.includes(nextStatus)) return error("Choose a valid equipment status.");
  if (["out_of_service", "available"].includes(nextStatus) && !reason) return error("Enter a reason for taking equipment out of service or returning it to service.");
  const { data: asset } = await context.supabase.from("equipment_assets").select("status").eq("id", assetId).single();
  if (!asset) return error("Equipment not found.");
  if (nextStatus === "available") {
    const { data: failed } = await context.supabase.from("equipment_problem_reports").select("id").eq("asset_id", assetId).in("status", ["open", "triaged", "repair_scheduled"]).in("severity", ["unsafe", "critical"]).limit(1);
    if (failed?.length) return error("Resolve unsafe or critical problem reports before returning this equipment to service.");
  }
  const { error: updateError } = await context.supabase.from("equipment_assets").update({ status: nextStatus }).eq("id", assetId);
  if (updateError) return error(updateError.message);
  await context.supabase.from("equipment_status_history").insert({ asset_id: assetId, previous_status: asset.status, next_status: nextStatus, reason, changed_by_user_id: context.user.id });
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: nextStatus === "out_of_service" ? "equipment_taken_out_of_service" : "equipment_status_changed", subjectId: assetId, subjectType: "equipment", metadata: { previous_status: asset.status, next_status: nextStatus } });
  revalidateEquipment(assetId);
  return { status: "success", message: nextStatus === "available" ? "Equipment returned to service." : "Equipment status updated." };
}

export async function addMaintenanceSchedule(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can add maintenance schedules.");
  const assetId = text(formData, "asset_id", 80);
  const title = text(formData, "title", 180);
  const intervalDays = integer(formData, "interval_days");
  const intervalMiles = number(formData, "interval_miles");
  const intervalHours = number(formData, "interval_hours");
  const nextDueAt = dateTime(formData, "next_due_at");
  if (!assetId || !title || (!intervalDays && !intervalMiles && !intervalHours && !nextDueAt)) return error("Enter a title and at least one date, mileage, hours, or day interval.");
  const { data: maintenanceSchedule, error: scheduleError } = await context.supabase.from("equipment_maintenance_schedules").insert({
    asset_id: assetId, title, maintenance_type: text(formData, "maintenance_type", 40) || "preventive",
    interval_days: intervalDays, interval_miles: intervalMiles, interval_hours: intervalHours,
    next_due_at: nextDueAt, next_due_mileage: number(formData, "next_due_mileage"),
    next_due_hours: number(formData, "next_due_hours"), instructions: optional(formData, "instructions", 2000),
    created_by_user_id: context.user.id,
  }).select("id").single();
  if (scheduleError || !maintenanceSchedule) return error(scheduleError?.message ?? "Could not add maintenance schedule.");
  if (nextDueAt) {
    const { data: asset } = await context.supabase.from("equipment_assets").select("name, asset_number, location_label").eq("id", assetId).single();
    const end = new Date(new Date(nextDueAt).getTime() + 60 * 60 * 1000).toISOString();
    const { data: calendarEvent, error: calendarError } = await context.supabase.from("schedule_events").insert({
      title: `${asset?.asset_number ?? "Equipment"} - ${title}`,
      description: `Scheduled maintenance for ${asset?.name ?? "equipment"}.`,
      event_type: "maintenance",
      status: "scheduled",
      starts_at: nextDueAt,
      ends_at: end,
      location_label: asset?.location_label,
      created_by_user_id: context.user.id,
    }).select("id").single();
    if (calendarError) console.error("Equipment maintenance calendar event failed", calendarError);
    const { error: recordError } = await context.supabase.from("equipment_maintenance_records").insert({
      asset_id: assetId, schedule_id: maintenanceSchedule.id, schedule_event_id: calendarEvent?.id ?? null,
      maintenance_type: text(formData, "maintenance_type", 40) || "preventive", status: "scheduled",
      title, description: optional(formData, "instructions", 2000), scheduled_for: nextDueAt,
      created_by_user_id: context.user.id,
    });
    if (recordError) console.error("Equipment maintenance record failed", recordError);
  }
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_maintenance_schedule_added", subjectId: assetId, subjectType: "equipment" });
  revalidateEquipment(assetId);
  return { status: "success", message: "Maintenance schedule added." };
}

export async function completeEquipmentMaintenance(formData: FormData) {
  const context = await getStaffContext();
  if (!context) return;
  const assetId = text(formData, "asset_id", 80);
  const scheduleId = text(formData, "schedule_id", 80);
  if (!assetId || !scheduleId) return;
  const { data: schedule } = await context.supabase.from("equipment_maintenance_schedules").select("*").eq("id", scheduleId).eq("asset_id", assetId).single();
  const { data: asset } = await context.supabase.from("equipment_assets").select("current_mileage, current_hours").eq("id", assetId).single();
  if (!schedule || !asset) return;
  const completedAt = new Date();
  const mileage = number(formData, "mileage_at_service") ?? asset.current_mileage;
  const hours = number(formData, "hours_at_service") ?? asset.current_hours;
  const { error: recordError } = await context.supabase.from("equipment_maintenance_records").insert({
    asset_id: assetId, schedule_id: scheduleId, maintenance_type: schedule.maintenance_type,
    status: "completed", title: schedule.title, description: optional(formData, "completion_notes", 2000),
    completed_at: completedAt.toISOString(), mileage_at_service: mileage, hours_at_service: hours,
    completed_by_user_id: context.user.id, created_by_user_id: context.user.id,
  });
  if (recordError) return;
  const nextDueAt = schedule.interval_days ? new Date(completedAt.getTime() + schedule.interval_days * 86_400_000).toISOString() : schedule.next_due_at;
  const nextDueMileage = schedule.interval_miles != null && mileage != null ? Number(mileage) + Number(schedule.interval_miles) : schedule.next_due_mileage;
  const nextDueHours = schedule.interval_hours != null && hours != null ? Number(hours) + Number(schedule.interval_hours) : schedule.next_due_hours;
  await context.supabase.from("equipment_maintenance_schedules").update({ last_completed_at: completedAt.toISOString(), last_completed_mileage: mileage, last_completed_hours: hours, next_due_at: nextDueAt, next_due_mileage: nextDueMileage, next_due_hours: nextDueHours }).eq("id", scheduleId);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_maintenance_completed", subjectId: assetId, subjectType: "equipment", metadata: { schedule_id: scheduleId } });
  revalidateEquipment(assetId);
}

export async function returnEquipmentAssignment(formData: FormData) {
  const context = await getStaffContext();
  if (!context) return;
  const assetId = text(formData, "asset_id", 80);
  const assignmentId = text(formData, "assignment_id", 80);
  if (!assetId || !assignmentId) return;
  const returnedAt = new Date().toISOString();
  const { error: returnError } = await context.supabase.from("equipment_assignments").update({ returned_at: returnedAt, returned_by_user_id: context.user.id, ends_at: returnedAt }).eq("id", assignmentId).eq("asset_id", assetId).is("returned_at", null);
  if (returnError) return;
  const { data: otherActive } = await context.supabase.from("equipment_assignments").select("id").eq("asset_id", assetId).is("returned_at", null).lte("starts_at", returnedAt).or(`ends_at.is.null,ends_at.gt.${returnedAt}`).limit(1);
  if (!otherActive?.length) await context.supabase.from("equipment_assets").update({ assigned_employee_id: null, status: "available" }).eq("id", assetId).in("status", ["assigned", "in_use"]);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_returned", subjectId: assetId, subjectType: "equipment", metadata: { assignment_id: assignmentId } });
  revalidateEquipment(assetId);
}

export async function resolveEquipmentProblem(formData: FormData) {
  const context = await getStaffContext();
  if (!context) return;
  const assetId = text(formData, "asset_id", 80);
  const reportId = text(formData, "report_id", 80);
  const resolutionNotes = text(formData, "resolution_notes", 2000);
  if (!assetId || !reportId || !resolutionNotes) return;
  const { error: resolveError } = await context.supabase.from("equipment_problem_reports").update({ status: "resolved", resolution_notes: resolutionNotes, resolved_at: new Date().toISOString(), resolved_by_user_id: context.user.id }).eq("id", reportId).eq("asset_id", assetId);
  if (resolveError) return;
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_problem_resolved", subjectId: assetId, subjectType: "equipment", metadata: { problem_report_id: reportId } });
  revalidateEquipment(assetId);
}

export async function uploadEquipmentDocument(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const context = await getStaffContext();
  if (!context) return error("Only authorized staff can upload equipment files.");
  const assetId = text(formData, "asset_id", 80);
  const title = text(formData, "title", 180);
  const documentType = text(formData, "document_type", 40);
  const file = formData.get("file");
  if (!assetId || !title || !["registration", "insurance", "inspection", "manual", "warranty", "receipt", "photo", "other"].includes(documentType)) return error("Equipment, document title, and type are required.");
  if (!(file instanceof File) || file.size === 0) return error("Choose a document or image to upload.");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) return error("Upload a PDF, JPEG, PNG, or WebP file.");
  if (file.size > 15 * 1024 * 1024) return error("File is too large. Upload a file up to 15 MB.");
  const prepared = await prepareSafeUpload(file, { maxBytes: 15 * 1024 * 1024, allowDocuments: true });
  if (!prepared.data) return error(prepared.error ?? "The file could not be validated.");
  const storagePath = `${assetId}/documents/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await context.supabase.storage.from("equipment-files").upload(storagePath, prepared.data.bytes, { contentType: prepared.data.contentType, upsert: false });
  if (uploadError) return error(`Private file upload failed: ${uploadError.message}`);
  const { error: metadataError } = await context.supabase.from("equipment_documents").insert({ asset_id: assetId, title, document_type: documentType, storage_path: storagePath, expires_at: dateTime(formData, "expires_at"), uploaded_by_user_id: context.user.id });
  if (metadataError) {
    await context.supabase.storage.from("equipment-files").remove([storagePath]);
    return error(`Document metadata could not save: ${metadataError.message}`);
  }
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_document_uploaded", subjectId: assetId, subjectType: "equipment", metadata: { document_type: documentType } });
  revalidateEquipment(assetId);
  return { status: "success", message: "Private equipment document uploaded." };
}

export async function archiveEquipment(formData: FormData) {
  const context = await getStaffContext();
  if (!context) return;
  const assetId = text(formData, "asset_id", 80);
  if (!assetId) return;
  const { error: archiveError } = await context.supabase.from("equipment_assets").update({
    is_active: false, archived_at: new Date().toISOString(), archived_by_user_id: context.user.id, status: "retired",
  }).eq("id", assetId);
  if (!archiveError) await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "equipment_archived", subjectId: assetId, subjectType: "equipment" });
  revalidateEquipment(assetId);
  redirect("/admin/equipment?archived=1");
}

function assetInput(formData: FormData) {
  const assetNumber = text(formData, "asset_number", 80);
  const name = text(formData, "name", 180);
  const category = text(formData, "category", 60) as EquipmentCategory;
  if (!assetNumber || !name || !categories.includes(category)) return { message: "Asset number, name, and category are required." };
  const modelYear = integer(formData, "model_year");
  if (modelYear && (modelYear < 1900 || modelYear > 2200)) return { message: "Enter a valid model year." };
  return {
    asset_number: assetNumber, name, category,
    manufacturer: optional(formData, "manufacturer", 120), model: optional(formData, "model", 120), model_year: modelYear,
    serial_number: optional(formData, "serial_number", 120), vin: optional(formData, "vin", 80)?.toUpperCase() ?? null,
    license_plate: optional(formData, "license_plate", 40)?.toUpperCase() ?? null,
    ownership_type: optional(formData, "ownership_type", 30), purchase_date: date(formData, "purchase_date"),
    location_label: optional(formData, "location_label", 180), safety_class: optional(formData, "safety_class", 120),
    ppe_required: optional(formData, "ppe_required", 600), inspection_template_key: optional(formData, "inspection_template_key", 80),
    inspection_interval_days: integer(formData, "inspection_interval_days"), admin_notes: optional(formData, "admin_notes", 3000),
  };
}

async function findPossibleDuplicate(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, input: Exclude<ReturnType<typeof assetInput>, { message: string }>, excludeId?: string) {
  const filters = [input.serial_number && `serial_number.ilike.${escapeFilter(input.serial_number)}`, input.vin && `vin.ilike.${escapeFilter(input.vin)}`, input.license_plate && `license_plate.ilike.${escapeFilter(input.license_plate)}`].filter(Boolean).join(",");
  if (!filters) return null;
  let query = supabase.from("equipment_assets").select("id, name, asset_number").or(filters).is("archived_at", null).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return data;
}

function revalidateEquipment(assetId: string) {
  revalidatePath("/admin"); revalidatePath("/admin/equipment"); revalidatePath(`/admin/equipment/${assetId}`);
  revalidatePath(`/admin/equipment/${assetId}/edit`); revalidatePath("/admin/schedule"); revalidatePath("/admin/jobs");
  revalidatePath("/crew"); revalidatePath("/crew/equipment");
}
function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function number(formData: FormData, key: string) { const raw = text(formData, key, 40); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) ? value : null; }
function integer(formData: FormData, key: string) { const value = number(formData, key); return value === null ? null : Math.trunc(value); }
function date(formData: FormData, key: string) { const value = text(formData, key, 40); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function dateTime(formData: FormData, key: string) { const value = text(formData, key, 60); if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function moneyCents(formData: FormData, key: string) { const value = number(formData, key); return value === null ? null : Math.round(value * 100); }
function escapeFilter(value: string) { return value.replace(/[,%()]/g, ""); }
function safeFileName(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "document"; }
function error(message: string): EquipmentActionState { return { status: "error", message: safeStaffMessage(message) }; }
