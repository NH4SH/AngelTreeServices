import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  CredentialType,
  DataResult,
  EmployeeDetail,
  EmployeeRecord,
  EmployeeSelfServiceData,
  SupervisedTeamData,
} from "@/lib/types/database";

const detailSelect = `
  *,
  profiles:profiles!employee_records_auth_user_id_fkey(id, full_name, email),
  supervisor:employee_records!employee_records_supervisor_employee_id_fkey(id, preferred_name, legal_name),
  employee_emergency_contacts(*),
  employee_onboarding_items(*),
  employee_credentials(*, credential_types(*)),
  employee_documents(*),
  employee_requests(*),
  employee_separation_items(*),
  training_attendees(*, training_sessions(*)),
  safety_meeting_attendees(*, safety_meetings(*))
`;

export type EmployeeListRow = EmployeeRecord & {
  onboardingProgress: number;
  credentialState: "current" | "expiring" | "expired" | "pending" | "none";
  trainingState: "recorded" | "none";
  roleNames: string[];
  platformAccessState: "active" | "disabled" | "pending" | "no_account";
};

export type EmployeeDetailData = {
  employee: EmployeeDetail;
  roles: string[];
  timeClockEnabled: boolean;
  equipmentAssignments: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  privateNotes: string | null;
};

export async function getEmployees(): Promise<DataResult<EmployeeListRow[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("employee_records").select("*, profiles:profiles!employee_records_auth_user_id_fkey(id, full_name, email), employee_onboarding_items(completion_status), employee_credentials(status, expiration_date, archived_at, credential_types(default_warning_days)), training_attendees(id)").is("archived_at", null).order("preferred_name", { ascending: true, nullsFirst: false }).order("legal_name");
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as (EmployeeRecord & { employee_onboarding_items?: { completion_status: string }[]; employee_credentials?: { status: string; expiration_date: string | null; archived_at: string | null; credential_types?: { default_warning_days?: number } | { default_warning_days?: number }[] | null }[]; training_attendees?: { id: string }[] })[];
  const authIds = rows.map((row) => row.auth_user_id).filter((id): id is string => Boolean(id));
  const [rolesResult, profilesResult, pendingResult] = await Promise.all([
    authIds.length ? supabase.from("user_roles").select("user_id, roles(name)").in("user_id", authIds) : Promise.resolve({ data: [], error: null }),
    authIds.length ? supabase.from("profiles").select("id, status").in("id", authIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("employee_access_requests").select("id, email, status").eq("status", "pending"),
  ]);
  const rolesByUser = new Map<string, string[]>();
  for (const row of rolesResult.data ?? []) {
    const relation = row.roles as { name?: string } | { name?: string }[] | null;
    const names = (Array.isArray(relation) ? relation : relation ? [relation] : []).map((role) => role.name).filter((name): name is string => Boolean(name));
    rolesByUser.set(row.user_id, names);
  }
  const profileStatus = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.status]));
  const pendingEmails = new Set((pendingResult.data ?? []).map((request) => request.email.toLowerCase()));
  return {
    data: rows.map((employee) => {
      const onboarding = employee.employee_onboarding_items ?? [];
      const complete = onboarding.filter((item) => item.completion_status !== "incomplete").length;
      return {
        ...employee,
        onboardingProgress: onboarding.length ? Math.round((complete / onboarding.length) * 100) : 0,
        credentialState: credentialState(employee.employee_credentials ?? []),
        trainingState: employee.training_attendees?.length ? "recorded" : "none",
        roleNames: employee.auth_user_id ? rolesByUser.get(employee.auth_user_id) ?? [] : [],
        platformAccessState: employee.auth_user_id
          ? profileStatus.get(employee.auth_user_id) === "active" ? "active" : "disabled"
          : employee.contact_email && pendingEmails.has(employee.contact_email.toLowerCase()) ? "pending" : "no_account",
      };
    }),
    error: rolesResult.error?.message ?? profilesResult.error?.message ?? pendingResult.error?.message ?? null,
  };
}

export async function getEmployeeDetail(employeeId: string, includePrivateNotes = false): Promise<DataResult<EmployeeDetailData | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.from("employee_records").select(detailSelect).eq("id", employeeId).single();
  if (error || !data) return { data: null, error: error?.message ?? "Employee not found or no access." };
  const employee = data as EmployeeDetail;
  const authId = employee.auth_user_id;
  const [roles, timer, equipment, activity, privateRecord] = await Promise.all([
    authId ? supabase.from("user_roles").select("roles(name)").eq("user_id", authId) : Promise.resolve({ data: [], error: null }),
    authId ? supabase.from("time_clock_permissions").select("is_enabled").eq("user_id", authId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    authId ? supabase.from("equipment_assignments").select("*, equipment_assets(id, asset_number, name, category, status)").eq("assigned_user_id", authId).order("starts_at", { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
    supabase.from("activity_log").select("id, event_type, actor_user_id, metadata_json, created_at").eq("subject_type", "employee").eq("subject_id", employeeId).order("created_at", { ascending: false }).limit(50),
    includePrivateNotes ? supabase.from("employee_private_records").select("private_hr_notes").eq("employee_id", employeeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const documents = employee.employee_documents ?? [];
  if (documents.length) {
    const { data: signed } = await supabase.storage.from("employee-files").createSignedUrls(documents.map((document) => document.storage_path), 3600);
    const byPath = new Map((signed ?? []).map((file) => [file.path, file.signedUrl]));
    employee.employee_documents = documents.map((document) => ({ ...document, signed_url: byPath.get(document.storage_path) ?? null }));
  }
  const roleNames = (roles.data ?? []).flatMap((row) => {
    const relation = row.roles as { name?: string } | { name?: string }[] | null;
    return (Array.isArray(relation) ? relation : relation ? [relation] : []).map((role) => role.name).filter((name): name is string => Boolean(name));
  });
  return {
    data: { employee, roles: roleNames, timeClockEnabled: Boolean(timer.data?.is_enabled), equipmentAssignments: equipment.data ?? [], activity: activity.data ?? [], privateNotes: privateRecord.data?.private_hr_notes ?? null },
    error: roles.error?.message ?? timer.error?.message ?? equipment.error?.message ?? activity.error?.message ?? privateRecord.error?.message ?? null,
  };
}

export async function getEmployeeFormOptions() {
  const supabase = await createClient();
  if (!supabase) return { supervisors: [], credentialTypes: [], employees: [], qualificationRequirements: [], error: "Supabase is not configured." };
  const [employees, credentialTypes, qualificationRequirements] = await Promise.all([
    supabase.from("employee_records").select("id, legal_name, preferred_name, crew_name, is_supervisor, auth_user_id").is("archived_at", null).order("preferred_name"),
    supabase.from("credential_types").select("*").eq("is_active", true).order("label"),
    supabase.from("qualification_requirements").select("id, requirement_scope, scope_value, credential_type_id, warning_only, is_active, notes, credential_types(label)").eq("is_active", true).order("requirement_scope").order("scope_value"),
  ]);
  return { supervisors: (employees.data ?? []).filter((employee) => employee.is_supervisor), employees: employees.data ?? [], credentialTypes: (credentialTypes.data ?? []) as CredentialType[], qualificationRequirements: qualificationRequirements.data ?? [], error: employees.error?.message ?? credentialTypes.error?.message ?? qualificationRequirements.error?.message ?? null };
}

export async function getEmployeeDashboardSummary() {
  const employees = await getEmployees();
  const supabase = await createClient();
  const empty = { onboarding: [], pendingAccess: [], expiring: [], expired: [], missingTraining: [], pendingSafetyAcknowledgments: [], pendingDocuments: [], pendingRequests: [], equipmentDueBack: [], inactiveAccessReview: [] };
  if (!supabase) return { data: empty, error: "Supabase is not configured." };
  const today = new Date(); const in90Days = new Date(today.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
  const [accessRequests, credentials, safetyAcknowledgments, documents, requests, equipment] = await Promise.all([
    supabase.from("employee_access_requests").select("id, full_name, email, status").eq("status", "pending").order("created_at").limit(20),
    supabase.from("employee_credentials").select("id, employee_id, expiration_date, status, employee_records(preferred_name, legal_name), credential_types(default_warning_days)").is("archived_at", null).not("expiration_date", "is", null).lte("expiration_date", in90Days).order("expiration_date").limit(30),
    supabase.from("safety_meeting_attendees").select("id, employee_id, safety_meeting_id, attendance_status, acknowledged_at, employee_records(preferred_name, legal_name), safety_meetings(title, starts_at)").eq("attendance_status", "present").is("acknowledged_at", null).order("created_at").limit(30),
    supabase.from("employee_documents").select("id, employee_id, title, review_status, employee_records(preferred_name, legal_name)").eq("review_status", "pending").is("archived_at", null).limit(20),
    supabase.from("employee_requests").select("id, employee_id, title, request_type, employee_records(preferred_name, legal_name)").eq("status", "pending").order("created_at").limit(20),
    supabase.from("equipment_assignments").select("id, assigned_user_id, ends_at, returned_at, equipment_assets(name, asset_number), profiles(full_name)").is("returned_at", null).not("ends_at", "is", null).lt("ends_at", today.toISOString()).limit(20),
  ]);
  const credentialRows = credentials.data ?? [];
  return { data: {
    onboarding: employees.data.filter((employee) => employee.employment_status === "onboarding" || employee.onboardingProgress < 100).slice(0, 12),
    pendingAccess: accessRequests.data ?? [],
    expiring: credentialRows.filter((credential) => { const relation = credential.credential_types as { default_warning_days?: number } | { default_warning_days?: number }[] | null; const warningDays = (Array.isArray(relation) ? relation[0]?.default_warning_days : relation?.default_warning_days) ?? 30; return credential.expiration_date && credential.expiration_date >= today.toISOString().slice(0, 10) && credential.expiration_date <= new Date(today.getTime() + warningDays * 86_400_000).toISOString().slice(0, 10); }),
    expired: credentialRows.filter((credential) => credential.expiration_date && credential.expiration_date < today.toISOString().slice(0, 10)),
    missingTraining: employees.data.filter((employee) => employee.is_active && employee.trainingState === "none").slice(0, 20),
    pendingSafetyAcknowledgments: safetyAcknowledgments.data ?? [],
    pendingDocuments: documents.data ?? [], pendingRequests: requests.data ?? [], equipmentDueBack: equipment.data ?? [],
    inactiveAccessReview: employees.data.filter((employee) => !employee.is_active && employee.platformAccessState === "active").slice(0, 20),
  }, error: employees.error ?? accessRequests.error?.message ?? credentials.error?.message ?? safetyAcknowledgments.error?.message ?? documents.error?.message ?? requests.error?.message ?? equipment.error?.message ?? null };
}

export async function getMyEmployeeSelfService(): Promise<DataResult<EmployeeSelfServiceData | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("get_my_employee_self_service");
  const result = (data as EmployeeSelfServiceData | null) ?? null;
  if (result?.documents.length) {
    const { data: signed, error: signedError } = await supabase.storage.from("employee-files").createSignedUrls(result.documents.map((document) => document.storage_path), 1800);
    const byPath = new Map((signed ?? []).map((file) => [file.path, file.signedUrl]));
    result.documents = result.documents.map((document) => ({ ...document, signed_url: byPath.get(document.storage_path) ?? null }));
    return { data: result, error: error?.message ?? signedError?.message ?? null };
  }
  return { data: result, error: error?.message ?? null };
}

export async function getMySupervisedTeam(): Promise<DataResult<SupervisedTeamData | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("get_my_supervised_team");
  const result = (data as SupervisedTeamData | null) ?? null;
  if (!result?.is_supervisor || !result.employees.length) return { data: result, error: error?.message ?? null };
  const employeeIds = result.employees.map((employee) => employee.id);
  const documents = await supabase.from("employee_documents").select("id, employee_id, title, storage_path, access_classification").in("employee_id", employeeIds).in("access_classification", ["employee_visible", "supervisor_visible"]).eq("review_status", "approved").is("archived_at", null);
  const paths = (documents.data ?? []).map((document) => document.storage_path);
  const signed = paths.length ? await supabase.storage.from("employee-files").createSignedUrls(paths, 1800) : { data: [], error: null };
  const signedByPath = new Map((signed.data ?? []).map((file) => [file.path, file.signedUrl]));
  result.employees = result.employees.map((employee) => ({ ...employee, documents: (documents.data ?? []).filter((document) => document.employee_id === employee.id).map((document) => ({ id: document.id, title: document.title, access_classification: document.access_classification, signed_url: signedByPath.get(document.storage_path) ?? null })) }));
  return { data: result, error: error?.message ?? documents.error?.message ?? signed.error?.message ?? null };
}

export async function getEmployeeEligibilityWarnings(userIds: string[], scope: { type: "job_assignment_role" | "equipment_category" | "platform_role"; value: string }) {
  const supabase = await createClient();
  if (!supabase || !userIds.length) return [];
  const { data: employees } = await supabase.from("employee_records").select("id, auth_user_id, preferred_name, legal_name, employment_status, is_active, employee_credentials(status, expiration_date, credential_type_id)").in("auth_user_id", userIds);
  const { data: requirements } = await supabase.from("qualification_requirements").select("credential_type_id, warning_only, credential_types(label)").eq("requirement_scope", scope.type).eq("scope_value", scope.value).eq("is_active", true);
  const today = new Date().toISOString().slice(0, 10);
  const foundUserIds = new Set((employees ?? []).map((employee) => employee.auth_user_id));
  const missingRecords = userIds.filter((userId) => !foundUserIds.has(userId)).map((userId) => ({ userId, message: "This assigned user has no linked employee readiness record. Review the assignment.", requiresOverride: false }));
  const employeeWarnings = (employees ?? []).flatMap((employee) => {
    const label = employee.preferred_name || employee.legal_name || "Employee";
    const warnings: { userId: string; message: string; requiresOverride: boolean }[] = [];
    if (!employee.is_active || ["inactive", "separated", "leave"].includes(employee.employment_status)) warnings.push({ userId: employee.auth_user_id, message: `${label} is ${employee.employment_status} and is not normally scheduling-eligible.`, requiresOverride: true });
    else if (["applicant", "onboarding"].includes(employee.employment_status)) warnings.push({ userId: employee.auth_user_id, message: `${label} is still ${employee.employment_status}. Review supervision and assignment limits.`, requiresOverride: false });
    for (const requirement of requirements ?? []) {
      const valid = (employee.employee_credentials ?? []).some((credential) => credential.credential_type_id === requirement.credential_type_id && credential.status === "active" && (!credential.expiration_date || credential.expiration_date >= today));
      if (!valid) {
        const relation = requirement.credential_types as { label?: string } | { label?: string }[] | null;
        const credentialLabel = (Array.isArray(relation) ? relation[0]?.label : relation?.label) || "required qualification";
        warnings.push({ userId: employee.auth_user_id, message: `${label} does not have a current verified ${credentialLabel} for this assignment.`, requiresOverride: !requirement.warning_only });
      }
    }
    return warnings;
  });
  return [...missingRecords, ...employeeWarnings];
}

function credentialState(credentials: { status: string; expiration_date: string | null; archived_at: string | null; credential_types?: { default_warning_days?: number } | { default_warning_days?: number }[] | null }[]): EmployeeListRow["credentialState"] {
  const active = credentials.filter((credential) => !credential.archived_at);
  if (!active.length) return "none";
  if (active.some((credential) => credential.status === "pending_verification")) return "pending";
  const today = new Date();
  if (active.some((credential) => credential.expiration_date && new Date(credential.expiration_date) < today)) return "expired";
  if (active.some((credential) => { const relation = credential.credential_types; const warningDays = (Array.isArray(relation) ? relation[0]?.default_warning_days : relation?.default_warning_days) ?? 30; return credential.expiration_date && new Date(credential.expiration_date) <= new Date(today.getTime() + warningDays * 86_400_000); })) return "expiring";
  return "current";
}
