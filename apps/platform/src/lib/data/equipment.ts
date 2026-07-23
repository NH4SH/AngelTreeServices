import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type {
  AssignableUser,
  CrewEquipmentAssignment,
  DataResult,
  EquipmentAsset,
  EquipmentDetail,
} from "@/lib/types/database";

const assetDetailSelect = `
  *,
  equipment_assignments(
    *,
    profiles:profiles!equipment_assignments_assigned_user_id_fkey(id, full_name, email),
    created_by_profile:profiles!equipment_assignments_created_by_user_id_fkey(id, full_name, email),
    jobs(id, service_type, status),
    schedule_events(id, title, starts_at, ends_at)
  ),
  equipment_maintenance_schedules(*),
  equipment_maintenance_records(*),
  equipment_inspections(*, profiles:profiles!equipment_inspections_inspected_by_user_id_fkey(id, full_name, email)),
  equipment_problem_reports(*, profiles:profiles!equipment_problem_reports_reported_by_user_id_fkey(id, full_name, email)),
  equipment_readings(*),
  equipment_documents(*)
`;

export async function getEquipmentAssets(): Promise<DataResult<EquipmentAsset[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("equipment_assets")
    .select("*")
    .is("archived_at", null)
    .order("name");

  return { data: (data ?? []) as EquipmentAsset[], error: error ? safeStaffMessage(error.message) : null };
}

export async function getEquipmentAsset(assetId: string): Promise<DataResult<EquipmentDetail | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("equipment_assets")
    .select(assetDetailSelect)
    .eq("id", assetId)
    .single();

  if (error || !data) return { data: null, error: error ? safeStaffMessage(error.message, "Equipment not found or no access.") : "Equipment not found or no access." };

  const detail = data as EquipmentDetail;
  const documentPaths = (detail.equipment_documents ?? []).map((document) => document.storage_path);
  const photoPaths = (detail.equipment_problem_reports ?? []).map((report) => report.photo_storage_path).filter((path): path is string => Boolean(path));
  if (documentPaths.length || photoPaths.length) {
    const [signedDocuments, signedPhotos] = await Promise.all([
      documentPaths.length ? supabase.storage.from("equipment-files").createSignedUrls(documentPaths, 3600, { download: true }) : Promise.resolve({ data: [], error: null }),
      photoPaths.length ? supabase.storage.from("equipment-files").createSignedUrls(photoPaths, 3600) : Promise.resolve({ data: [], error: null }),
    ]);
    const signedByPath = new Map([...(signedDocuments.data ?? []), ...(signedPhotos.data ?? [])].map((file) => [file.path, file.signedUrl]));
    detail.equipment_documents = (detail.equipment_documents ?? []).map((document) => ({ ...document, signed_url: signedByPath.get(document.storage_path) ?? null }));
    detail.equipment_problem_reports = (detail.equipment_problem_reports ?? []).map((report) => ({ ...report, photo_signed_url: report.photo_storage_path ? signedByPath.get(report.photo_storage_path) ?? null : null }));
    const signedError = signedDocuments.error ?? signedPhotos.error;
    if (signedError) return { data: detail, error: safeStaffMessage(signedError.message, "Equipment loaded, but private files could not be opened.") };
  }
  return { data: detail, error: null };
}

export async function getEquipmentFormOptions() {
  const supabase = await createClient();
  if (!supabase) {
    return { users: [] as AssignableUser[], jobs: [], events: [], error: "Supabase is not configured." };
  }

  const [profiles, jobs, events] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("jobs").select("id, service_type, status").is("archived_at", null).in("status", ["accepted", "scheduled", "in_progress"]).order("updated_at", { ascending: false }).limit(100),
    supabase.from("schedule_events").select("id, title, starts_at, ends_at").neq("status", "cancelled").gte("starts_at", new Date(Date.now() - 86_400_000).toISOString()).order("starts_at").limit(150),
  ]);

  return {
    users: (profiles.data ?? []) as AssignableUser[],
    jobs: jobs.data ?? [],
    events: events.data ?? [],
    error: profiles.error ? safeStaffMessage(profiles.error.message) : jobs.error ? safeStaffMessage(jobs.error.message) : events.error ? safeStaffMessage(events.error.message) : null,
  };
}

export async function getMyAssignedEquipment(): Promise<DataResult<CrewEquipmentAssignment[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };

  const { data, error } = await supabase.rpc("get_my_assigned_equipment");
  return { data: (data ?? []) as CrewEquipmentAssignment[], error: error ? safeStaffMessage(error.message) : null };
}

export async function getEquipmentDashboardSummary() {
  const supabase = await createClient();
  const empty = { dueMaintenance: [], failedInspections: [], openProblems: [], expiringDocuments: [], outOfService: [] };
  if (!supabase) return { data: empty, error: "Supabase is not configured." };

  const now = new Date();
  const inThirtyDays = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const [maintenance, inspections, problems, documents, outOfService] = await Promise.all([
    supabase.from("equipment_maintenance_schedules").select("id, asset_id, title, next_due_at, next_due_mileage, next_due_hours, equipment_assets(name, asset_number, current_mileage, current_hours)").eq("is_active", true).order("next_due_at", { ascending: true, nullsFirst: false }).limit(200),
    supabase.from("equipment_inspections").select("id, asset_id, overall_result, inspected_at, equipment_assets(name, asset_number)").eq("overall_result", "failed").order("inspected_at", { ascending: false }).limit(12),
    supabase.from("equipment_problem_reports").select("id, asset_id, title, severity, status, created_at, equipment_assets(name, asset_number)").in("status", ["open", "triaged", "repair_scheduled"]).order("created_at", { ascending: false }).limit(12),
    supabase.from("equipment_documents").select("id, asset_id, title, expires_at, equipment_assets(name, asset_number)").lte("expires_at", inThirtyDays).gte("expires_at", now.toISOString()).order("expires_at").limit(12),
    supabase.from("equipment_assets").select("id, name, asset_number, status").in("status", ["out_of_service", "awaiting_parts", "repair_scheduled"]).order("updated_at", { ascending: false }).limit(12),
  ]);

  return {
    data: {
      dueMaintenance: (maintenance.data ?? []).filter((schedule) => {
        const asset = Array.isArray(schedule.equipment_assets) ? schedule.equipment_assets[0] : schedule.equipment_assets;
        return Boolean(
          (schedule.next_due_at && schedule.next_due_at <= inThirtyDays) ||
          (schedule.next_due_mileage != null && asset?.current_mileage != null && Number(asset.current_mileage) >= Number(schedule.next_due_mileage)) ||
          (schedule.next_due_hours != null && asset?.current_hours != null && Number(asset.current_hours) >= Number(schedule.next_due_hours))
        );
      }).slice(0, 12),
      failedInspections: inspections.data ?? [],
      openProblems: problems.data ?? [],
      expiringDocuments: documents.data ?? [],
      outOfService: outOfService.data ?? [],
    },
    error: maintenance.error?.message ?? inspections.error?.message ?? problems.error?.message ?? documents.error?.message ?? outOfService.error?.message ?? null,
  };
}
