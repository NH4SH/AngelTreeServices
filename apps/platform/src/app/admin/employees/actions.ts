"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getEmployeeEligibilityWarnings } from "@/lib/data/employees";
import { createClient } from "@/lib/supabase/server";

export type EmployeeActionState = { status: "idle" | "success" | "error" | "warning"; message: string };
const employmentStatuses = ["applicant", "onboarding", "active", "seasonal", "leave", "inactive", "separated"];
const platformRoles = ["admin", "estimator", "crew", "payroll_admin"];

async function getStaffContext(adminOnly = false) {
  const supabase = await createClient(); if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return null;
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  const allowed = adminOnly ? platformRoleGroups.accessApproval : platformRoleGroups.internalStaff;
  return hasAllowedRole(roles, allowed) ? { supabase, user, roles } : null;
}

export async function createEmployee(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(true); if (!context) return fail("Only owner/admin can create employee records.");
  const input = employeeInput(formData); if ("message" in input) return fail(String(input.message));
  const duplicateFilters = [input.employee_number && `employee_number.ilike.${safeFilter(input.employee_number)}`, input.contact_email && `contact_email.ilike.${safeFilter(input.contact_email)}`].filter(Boolean).join(",");
  const duplicate = duplicateFilters
    ? (await context.supabase.from("employee_records").select("id, legal_name, preferred_name").or(duplicateFilters).is("archived_at", null).limit(1).maybeSingle()).data
    : null;
  if (duplicate && formData.get("duplicate_override") !== "on") return { status: "warning", message: `Possible duplicate employee: ${duplicate.preferred_name || duplicate.legal_name || "existing record"}. Confirm before creating a separate record.` };
  const { data: employee, error } = await context.supabase.from("employee_records").insert({ ...input, created_by_user_id: context.user.id }).select("id").single();
  if (error || !employee) return fail(error?.message ?? "Could not create employee.");
  await saveEmergencyContact(context.supabase, employee.id, formData);
  await savePrivateNotes(context.supabase, employee.id, formData, context.user.id);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_created", subjectId: employee.id, subjectType: "employee" });
  revalidateEmployee(employee.id); redirect(`/admin/employees/${employee.id}?created=1`);
}

export async function updateEmployee(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(true); if (!context) return fail("Only owner/admin can edit employee identity and employment fields.");
  const employeeId = text(formData, "employee_id", 80); const input = employeeInput(formData);
  if (!employeeId || "message" in input) return fail(!employeeId ? "Employee record is missing." : String(input.message));
  const { data: current } = await context.supabase.from("employee_records").select("auth_user_id, contact_email, profiles:profiles!employee_records_auth_user_id_fkey(email)").eq("id", employeeId).single();
  const { error } = await context.supabase.from("employee_records").update(input).eq("id", employeeId);
  if (error) return fail(error.message);
  await saveEmergencyContact(context.supabase, employeeId, formData);
  await savePrivateNotes(context.supabase, employeeId, formData, context.user.id);
  const photo = formData.get("profile_photo");
  if (photo instanceof File && photo.size > 0) await saveProfilePhoto(context.supabase, employeeId, photo);
  const profileRelation = current?.profiles as { email?: string | null } | { email?: string | null }[] | null;
  const loginEmail = Array.isArray(profileRelation) ? profileRelation[0]?.email : profileRelation?.email;
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_edited", subjectId: employeeId, subjectType: "employee", metadata: { login_email_differs: Boolean(current?.auth_user_id && loginEmail && input.contact_email && loginEmail.toLowerCase() !== input.contact_email.toLowerCase()) } });
  revalidateEmployee(employeeId); redirect(`/admin/employees/${employeeId}?updated=1`);
}

export async function updateOnboardingItem(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(); if (!context) return fail("Only authorized staff can update onboarding.");
  const employeeId = text(formData, "employee_id", 80); const itemId = text(formData, "item_id", 80); const nextStatus = text(formData, "completion_status", 30); const notes = optional(formData, "notes", 1000); const reopenReason = optional(formData, "reopen_reason", 600);
  if (!employeeId || !itemId || !["incomplete", "complete", "not_applicable"].includes(nextStatus)) return fail("Choose a valid onboarding item status.");
  const { data: current } = await context.supabase.from("employee_onboarding_items").select("completion_status").eq("id", itemId).eq("employee_id", employeeId).single();
  if (!current) return fail("Onboarding item not found.");
  if (current.completion_status !== "incomplete" && nextStatus === "incomplete" && !reopenReason) return fail("Enter a reason when reopening a completed item.");
  const { error } = await context.supabase.from("employee_onboarding_items").update({ completion_status: nextStatus, notes, completed_at: nextStatus === "incomplete" ? null : new Date().toISOString(), completed_by_user_id: nextStatus === "incomplete" ? null : context.user.id, reopened_at: nextStatus === "incomplete" ? new Date().toISOString() : null, reopened_by_user_id: nextStatus === "incomplete" ? context.user.id : null, reopen_reason: nextStatus === "incomplete" ? reopenReason : null }).eq("id", itemId).eq("employee_id", employeeId);
  if (error) return fail(error.message);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: nextStatus === "incomplete" ? "onboarding_item_reopened" : "onboarding_item_verified", subjectId: employeeId, subjectType: "employee", metadata: { item_id: itemId, status: nextStatus } });
  if (current.completion_status === "incomplete" && nextStatus !== "incomplete") {
    const { count } = await context.supabase.from("employee_onboarding_items").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("completion_status", "incomplete");
    if (count === 0) await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_onboarding_completed", subjectId: employeeId, subjectType: "employee" });
  }
  revalidateEmployee(employeeId); return ok("Onboarding item updated.");
}

export async function startEmployeeOnboarding(formData: FormData) {
  const context = await getStaffContext(); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); if (!employeeId) return;
  const { error } = await context.supabase.from("employee_records").update({ employment_status: "onboarding", is_active: true }).eq("id", employeeId);
  if (error) return;
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_onboarding_started", subjectId: employeeId, subjectType: "employee" });
  revalidateEmployee(employeeId);
}

export async function addEmployeeCredential(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(); if (!context) return fail("Only authorized staff can add credentials.");
  const employeeId = text(formData, "employee_id", 80); const typeId = text(formData, "credential_type_id", 80);
  if (!employeeId || !typeId) return fail("Employee and credential type are required.");
  const { data: credential, error } = await context.supabase.from("employee_credentials").insert({ employee_id: employeeId, credential_type_id: typeId, credential_number: optional(formData, "credential_number", 160), issuing_organization: optional(formData, "issuing_organization", 180), issue_date: date(formData, "issue_date"), expiration_date: date(formData, "expiration_date"), status: "pending_verification", notes: optional(formData, "notes", 1200), created_by_user_id: context.user.id }).select("id").single();
  if (error || !credential) return fail(error?.message ?? "Could not add credential.");
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "credential_added", subjectId: employeeId, subjectType: "employee", metadata: { credential_id: credential.id } });
  const file = formData.get("credential_file");
  if (file instanceof File && file.size > 0) {
    const classification = text(formData, "credential_access_classification", 40) || "employee_visible";
    if (!["employee_visible", "supervisor_visible", "admin_only", "owner_only"].includes(classification)) return { status: "warning", message: "Credential saved, but the document classification was invalid." };
    if (["admin_only", "owner_only"].includes(classification) && !hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) return { status: "warning", message: "Credential saved, but only owner/admin can attach an admin-only or owner-only file." };
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 15 * 1024 * 1024) return { status: "warning", message: "Credential saved, but the attachment must be a PDF, JPEG, PNG, or WebP file up to 15 MB." };
    const path = `${employeeId}/credentials/${credential.id}-${safeFileName(file.name)}`;
    const { error: uploadError } = await context.supabase.storage.from("employee-files").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { status: "warning", message: `Credential saved pending verification, but its attachment could not upload: ${uploadError.message}` };
    const { data: document, error: documentError } = await context.supabase.from("employee_documents").insert({ employee_id: employeeId, document_type: "credential", title: text(formData, "credential_document_title", 180) || "Credential card or certificate", storage_path: path, mime_type: file.type, file_size_bytes: file.size, issue_date: date(formData, "issue_date"), expiration_date: date(formData, "expiration_date"), access_classification: classification, review_status: "pending", uploaded_by_user_id: context.user.id }).select("id").single();
    if (documentError || !document) { await context.supabase.storage.from("employee-files").remove([path]); return { status: "warning", message: `Credential saved pending verification, but attachment metadata could not save: ${documentError?.message ?? "Unknown error"}` }; }
    await context.supabase.from("employee_credentials").update({ document_id: document.id }).eq("id", credential.id);
  }
  revalidateEmployee(employeeId); return ok("Credential added as pending verification.");
}

export async function verifyEmployeeCredential(formData: FormData) {
  const context = await getStaffContext(); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); const credentialId = text(formData, "credential_id", 80); if (!employeeId || !credentialId) return;
  const { error } = await context.supabase.from("employee_credentials").update({ status: "active", verified_at: new Date().toISOString(), verified_by_user_id: context.user.id }).eq("id", credentialId).eq("employee_id", employeeId);
  if (!error) await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "credential_verified", subjectId: employeeId, subjectType: "employee", metadata: { credential_id: credentialId } });
  revalidateEmployee(employeeId);
}

export async function uploadEmployeeDocument(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(); if (!context) return fail("Only authorized staff can upload employee documents.");
  const employeeId = text(formData, "employee_id", 80); const title = text(formData, "title", 180); const classification = text(formData, "access_classification", 40); const file = formData.get("file");
  if (!employeeId || !title || !["employee_visible", "supervisor_visible", "admin_only", "owner_only"].includes(classification)) return fail("Employee, title, and access classification are required.");
  if (["admin_only", "owner_only"].includes(classification) && !hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) return fail("Only owner/admin can upload admin-only or owner-only documents.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to upload.");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 15 * 1024 * 1024) return fail("Upload a PDF, JPEG, PNG, or WebP file up to 15 MB.");
  const path = `${employeeId}/documents/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await context.supabase.storage.from("employee-files").upload(path, file, { contentType: file.type, upsert: false }); if (uploadError) return fail(uploadError.message);
  const { data: document, error } = await context.supabase.from("employee_documents").insert({ employee_id: employeeId, document_type: text(formData, "document_type", 80) || "other", title, storage_path: path, mime_type: file.type, file_size_bytes: file.size, issue_date: date(formData, "issue_date"), expiration_date: date(formData, "expiration_date"), access_classification: classification, review_status: "approved", notes: optional(formData, "notes", 1200), uploaded_by_user_id: context.user.id, reviewed_at: new Date().toISOString(), reviewed_by_user_id: context.user.id }).select("id").single();
  if (error || !document) { await context.supabase.storage.from("employee-files").remove([path]); return fail(error?.message ?? "Document metadata could not save."); }
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_document_uploaded", subjectId: employeeId, subjectType: "employee", metadata: { document_id: document.id, classification } });
  revalidateEmployee(employeeId); return ok("Private employee document uploaded.");
}

export async function reviewEmployeeDocument(formData: FormData) {
  const context = await getStaffContext(); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); const documentId = text(formData, "document_id", 80); const reviewStatus = text(formData, "review_status", 30); if (!employeeId || !documentId || !["approved", "rejected"].includes(reviewStatus)) return;
  await context.supabase.from("employee_documents").update({ review_status: reviewStatus, review_notes: optional(formData, "review_notes", 1200), reviewed_at: new Date().toISOString(), reviewed_by_user_id: context.user.id }).eq("id", documentId).eq("employee_id", employeeId);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: `employee_document_${reviewStatus}`, subjectId: employeeId, subjectType: "employee", metadata: { document_id: documentId } }); revalidateEmployee(employeeId);
}

export async function createTrainingSession(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(); if (!context) return fail("Only authorized staff can record training.");
  const title = text(formData, "title", 180); const startsAt = dateTime(formData, "starts_at"); const attendees = formData.getAll("employee_ids").map(String).filter(Boolean);
  if (!title || !startsAt || !attendees.length) return fail("Training title, date, and at least one employee are required.");
  const { data: session, error } = await context.supabase.from("training_sessions").insert({ title, training_type: text(formData, "training_type", 100) || "general", provider_or_instructor: optional(formData, "provider_or_instructor", 180), starts_at: startsAt, duration_minutes: integer(formData, "duration_minutes"), location_label: optional(formData, "location_label", 180), refresher_due_at: dateTime(formData, "refresher_due_at"), instructor_notes: optional(formData, "instructor_notes", 3000), document_version: optional(formData, "document_version", 80), created_by_user_id: context.user.id }).select("id").single();
  if (error || !session) return fail(error?.message ?? "Could not create training session.");
  const { error: attendeeError } = await context.supabase.from("training_attendees").insert(attendees.map((employeeId) => ({ training_session_id: session.id, employee_id: employeeId, result: text(formData, "result", 30) || "completed" })));
  if (attendeeError) return fail(`Training saved, but attendees could not be added: ${attendeeError.message}`);
  await Promise.all(attendees.map((employeeId) => recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "training_recorded", subjectId: employeeId, subjectType: "employee", metadata: { training_session_id: session.id } })));
  const fileWarnings = await uploadProgramFiles(context.supabase, context.user.id, { trainingSessionId: session.id }, [{ field: "training_attachments", kind: "attachment" }], formData);
  revalidateEmployeePages(); return fileWarnings.length ? { status: "warning", message: `Training and attendees were saved, but ${fileWarnings.join(" ")}` } : ok("Training session recorded for all selected employees.");
}

export async function createSafetyMeeting(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(); if (!context) return fail("Only authorized staff can record safety meetings.");
  const title = text(formData, "title", 180); const startsAt = dateTime(formData, "starts_at"); const presentIds = formData.getAll("present_employee_ids").map(String).filter(Boolean); const absentIds = formData.getAll("absent_employee_ids").map(String).filter(Boolean);
  if (!title || !startsAt) return fail("Safety topic and date are required.");
  const { data: meeting, error } = await context.supabase.from("safety_meetings").insert({ title, topic_key: optional(formData, "topic_key", 100), starts_at: startsAt, location_label: optional(formData, "location_label", 180), leader_name: optional(formData, "leader_name", 180), subject_matter: optional(formData, "subject_matter", 3000), meeting_notes: optional(formData, "meeting_notes", 3000), follow_up_actions: optional(formData, "follow_up_actions", 2000), document_version: optional(formData, "document_version", 80), created_by_user_id: context.user.id }).select("id").single();
  if (error || !meeting) return fail(error?.message ?? "Could not create safety meeting.");
  const attendeeRows = [...presentIds.map((employeeId) => ({ safety_meeting_id: meeting.id, employee_id: employeeId, attendance_status: "present" })), ...absentIds.filter((id) => !presentIds.includes(id)).map((employeeId) => ({ safety_meeting_id: meeting.id, employee_id: employeeId, attendance_status: "absent" }))];
  if (attendeeRows.length) { const { error: attendeeError } = await context.supabase.from("safety_meeting_attendees").insert(attendeeRows); if (attendeeError) return fail(`Meeting saved, but attendance could not be added: ${attendeeError.message}`); }
  await Promise.all(attendeeRows.map((row) => recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "safety_meeting_attendance_recorded", subjectId: row.employee_id, subjectType: "employee", metadata: { safety_meeting_id: meeting.id, attendance: row.attendance_status } })));
  const fileWarnings = await uploadProgramFiles(context.supabase, context.user.id, { safetyMeetingId: meeting.id }, [{ field: "safety_attachments", kind: "attachment" }, { field: "safety_photos", kind: "photo" }], formData);
  revalidateEmployeePages(); return fileWarnings.length ? { status: "warning", message: `Safety meeting and attendance were saved, but ${fileWarnings.join(" ")}` } : ok("Safety meeting and attendance recorded.");
}

export async function reviewEmployeeRequest(formData: FormData) {
  const context = await getStaffContext(); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); const requestId = text(formData, "request_id", 80); const status = text(formData, "status", 30); if (!employeeId || !requestId || !["approved", "rejected", "completed"].includes(status)) return;
  await context.supabase.from("employee_requests").update({ status, review_notes: optional(formData, "review_notes", 1200), reviewed_at: new Date().toISOString(), reviewed_by_user_id: context.user.id }).eq("id", requestId).eq("employee_id", employeeId); revalidateEmployee(employeeId);
}

export async function updateEmployeeRoles(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(true); if (!context) return fail("Only owner/admin can change platform roles.");
  const employeeId = text(formData, "employee_id", 80); const authUserId = text(formData, "auth_user_id", 80); const selected = formData.getAll("roles").map(String).filter((role) => platformRoles.includes(role));
  if (!employeeId || !authUserId || !selected.length) return fail("Linked platform account and at least one role are required.");
  const warningRows = (await Promise.all(selected.map((role) => getEmployeeEligibilityWarnings([authUserId], { type: "platform_role", value: role })))).flat();
  const warnings = Array.from(new Map(warningRows.map((warning) => [warning.message, warning])).values());
  const overrideReason = optional(formData, "qualification_override_reason", 600);
  if (warnings.some((warning) => warning.requiresOverride) && !overrideReason) return { status: "warning", message: `${warnings.map((warning) => warning.message).join(" ")} Enter an owner/admin override reason to continue.` };
  const { data: roleRows, error: roleError } = await context.supabase.from("roles").select("id, name").in("name", platformRoles); if (roleError) return fail(roleError.message);
  const selectedRows = (roleRows ?? []).filter((role) => selected.includes(role.name)).map((role) => ({ user_id: authUserId, role_id: role.id }));
  const { error: upsertError } = await context.supabase.from("user_roles").upsert(selectedRows, { onConflict: "user_id,role_id" }); if (upsertError) return fail(upsertError.message);
  const omittedRoleIds = (roleRows ?? []).filter((role) => !selected.includes(role.name)).map((role) => role.id);
  if (omittedRoleIds.length) { const { error: deleteError } = await context.supabase.from("user_roles").delete().eq("user_id", authUserId).in("role_id", omittedRoleIds); if (deleteError) return fail(deleteError.message); }
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_roles_changed", subjectId: employeeId, subjectType: "employee", metadata: { roles: selected.join(",") } });
  if (warnings.length) await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: overrideReason ? "employee_qualification_override" : "employee_qualification_warning", subjectId: employeeId, subjectType: "employee", metadata: { roles: selected.join(","), reason: overrideReason, warning_count: warnings.length } });
  revalidateEmployee(employeeId); return warnings.length ? { status: "warning", message: `Platform roles updated with a qualification warning. ${warnings.map((warning) => warning.message).join(" ")}` } : ok("Platform roles updated.");
}

export async function markEmployeeInactive(formData: FormData) {
  const context = await getStaffContext(true); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); const reason = text(formData, "reason", 1000); if (!employeeId || !reason) return;
  const { data: employee } = await context.supabase.from("employee_records").select("auth_user_id").eq("id", employeeId).single(); if (!employee) return;
  await context.supabase.from("employee_records").update({ employment_status: "inactive", is_active: false, separation_date: new Date().toISOString().slice(0, 10), separation_reason: reason }).eq("id", employeeId);
  if (employee.auth_user_id) { await context.supabase.from("profiles").update({ status: "disabled" }).eq("id", employee.auth_user_id); await context.supabase.from("time_clock_permissions").update({ is_enabled: false, notes: "Disabled when employee was marked inactive." }).eq("user_id", employee.auth_user_id); }
  await seedSeparationItems(context.supabase, employeeId); await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_marked_inactive", subjectId: employeeId, subjectType: "employee" }); revalidateEmployee(employeeId);
}

export async function updateSeparationItem(formData: FormData) {
  const context = await getStaffContext(true); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); const itemId = text(formData, "item_id", 80); const status = text(formData, "completion_status", 30);
  if (!employeeId || !itemId || !["incomplete", "complete", "not_applicable"].includes(status)) return;
  await context.supabase.from("employee_separation_items").update({ completion_status: status, notes: optional(formData, "notes", 800), completed_at: status === "incomplete" ? null : new Date().toISOString(), completed_by_user_id: status === "incomplete" ? null : context.user.id }).eq("id", itemId).eq("employee_id", employeeId);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_separation_checklist_updated", subjectId: employeeId, subjectType: "employee", metadata: { item_id: itemId, status } });
  revalidateEmployee(employeeId);
}

export async function saveQualificationRequirement(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const context = await getStaffContext(true); if (!context) return fail("Only owner/admin can configure qualification warnings.");
  const requirementScope = text(formData, "requirement_scope", 40); const scopeValue = text(formData, "scope_value", 100).toLowerCase().replace(/\s+/g, "_"); const credentialTypeId = text(formData, "credential_type_id", 80);
  if (!["platform_role", "job_assignment_role", "equipment_category"].includes(requirementScope) || !scopeValue || !credentialTypeId) return fail("Scope, assignment value, and credential are required.");
  const { error } = await context.supabase.from("qualification_requirements").upsert({ requirement_scope: requirementScope, scope_value: scopeValue, credential_type_id: credentialTypeId, warning_only: formData.get("requires_override") !== "on", is_active: true, notes: optional(formData, "notes", 800), created_by_user_id: context.user.id }, { onConflict: "requirement_scope,scope_value,credential_type_id" });
  if (error) return fail(error.message);
  revalidateEmployeePages(); return ok("Qualification warning saved. Existing assignments were not changed.");
}

export async function deactivateQualificationRequirement(formData: FormData) {
  const context = await getStaffContext(true); if (!context) return;
  const requirementId = text(formData, "requirement_id", 80); if (!requirementId) return;
  await context.supabase.from("qualification_requirements").update({ is_active: false }).eq("id", requirementId);
  revalidateEmployeePages();
}

export async function archiveEmployee(formData: FormData) {
  const context = await getStaffContext(true); if (!context) return;
  const employeeId = text(formData, "employee_id", 80); if (!employeeId) return;
  await context.supabase.from("employee_records").update({ archived_at: new Date().toISOString(), archived_by_user_id: context.user.id, is_active: false }).eq("id", employeeId);
  await recordActivity(context.supabase, { actorUserId: context.user.id, eventType: "employee_archived", subjectId: employeeId, subjectType: "employee" }); revalidateEmployee(employeeId); redirect("/admin/employees?archived=1");
}

function employeeInput(formData: FormData) { const legalName = text(formData, "legal_name", 180); const preferredName = optional(formData, "preferred_name", 180); const status = text(formData, "employment_status", 30); if (!legalName || !employmentStatuses.includes(status)) return { message: "Legal name and employment status are required." }; return { legal_name: legalName, preferred_name: preferredName, employee_number: optional(formData, "employee_number", 80), contact_email: optional(formData, "contact_email", 180)?.toLowerCase() ?? null, contact_phone: optional(formData, "contact_phone", 50), home_address: optional(formData, "home_address", 500), hire_date: date(formData, "hire_date"), employment_status: status, employment_type: optional(formData, "employment_type", 30), job_title: optional(formData, "job_title", 160), department: optional(formData, "department", 120), crew_name: optional(formData, "crew_name", 120), supervisor_employee_id: optional(formData, "supervisor_employee_id", 80), preferred_language: optional(formData, "preferred_language", 80), operational_notes: optional(formData, "operational_notes", 3000), is_supervisor: formData.get("is_supervisor") === "on", is_active: !["inactive", "separated"].includes(status), separation_date: date(formData, "separation_date"), separation_reason: optional(formData, "separation_reason", 1000), manual_review_required: false }; }
async function saveEmergencyContact(supabase: any, employeeId: string, formData: FormData) { const name = text(formData, "emergency_name", 180); const phone = text(formData, "emergency_phone", 50); if (!name && !phone) return; if (!name || !phone) return; const { data: current } = await supabase.from("employee_emergency_contacts").select("id").eq("employee_id", employeeId).eq("is_primary", true).maybeSingle(); const values = { employee_id: employeeId, full_name: name, relationship: optional(formData, "emergency_relationship", 100), phone, alternate_phone: optional(formData, "emergency_alternate_phone", 50), is_primary: true }; if (current) await supabase.from("employee_emergency_contacts").update(values).eq("id", current.id); else await supabase.from("employee_emergency_contacts").insert(values); }
async function savePrivateNotes(supabase: any, employeeId: string, formData: FormData, userId: string) { if (!formData.has("private_hr_notes")) return; await supabase.from("employee_private_records").upsert({ employee_id: employeeId, private_hr_notes: optional(formData, "private_hr_notes", 5000), updated_by_user_id: userId }); }
async function saveProfilePhoto(supabase: any, employeeId: string, file: File) { if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 6 * 1024 * 1024) return; const path = `${employeeId}/profile/${Date.now()}-${safeFileName(file.name)}`; const { error } = await supabase.storage.from("employee-files").upload(path, file, { contentType: file.type }); if (!error) await supabase.from("employee_records").update({ profile_photo_storage_path: path }).eq("id", employeeId); }
async function seedSeparationItems(supabase: any, employeeId: string) { await supabase.from("employee_separation_items").upsert([['platform_access','Platform access disabled'],['equipment_returned','Equipment and PPE returned'],['keys_cards','Keys and cards returned'],['future_schedule','Future schedule reviewed'],['final_time','Final time entries reviewed'],['documents_archived','Documents archived']].map(([item_key,label]) => ({ employee_id: employeeId, item_key, label })), { onConflict: "employee_id,item_key" }); }
async function uploadProgramFiles(supabase: any, userId: string, context: { trainingSessionId?: string; safetyMeetingId?: string }, fields: { field: string; kind: "attachment" | "photo" }[], formData: FormData) { const warnings: string[] = []; for (const input of fields) { for (const value of formData.getAll(input.field)) { if (!(value instanceof File) || value.size === 0) continue; if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(value.type) || value.size > 15 * 1024 * 1024) { warnings.push(`${value.name || "One file"} was not a supported PDF or image up to 15 MB.`); continue; } const ownerType = context.trainingSessionId ? "training" : "safety"; const ownerId = context.trainingSessionId ?? context.safetyMeetingId ?? "unknown"; const path = `${ownerType}/${ownerId}/${Date.now()}-${safeFileName(value.name)}`; const { error: uploadError } = await supabase.storage.from("employee-program-files").upload(path, value, { contentType: value.type, upsert: false }); if (uploadError) { warnings.push(`${value.name} could not upload.`); continue; } const { error: metadataError } = await supabase.from("employee_program_files").insert({ training_session_id: context.trainingSessionId ?? null, safety_meeting_id: context.safetyMeetingId ?? null, file_kind: input.kind, title: value.name.slice(0, 180), storage_path: path, mime_type: value.type, file_size_bytes: value.size, uploaded_by_user_id: userId }); if (metadataError) warnings.push(`${value.name} uploaded, but its record could not be linked.`); } } return warnings; }
function revalidateEmployee(id: string) { revalidateEmployeePages(); revalidatePath(`/admin/employees/${id}`); revalidatePath(`/admin/employees/${id}/edit`); }
function revalidateEmployeePages() { revalidatePath("/admin"); revalidatePath("/admin/employees"); revalidatePath("/admin/training"); revalidatePath("/admin/safety"); revalidatePath("/admin/schedule"); revalidatePath("/employee"); }
function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function date(formData: FormData, key: string) { const value = text(formData, key, 40); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function dateTime(formData: FormData, key: string) { const value = text(formData, key, 60); if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function integer(formData: FormData, key: string) { const value = Number(text(formData, key, 20)); return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null; }
function safeFilter(value: string) { return value.replace(/[,%()]/g, ""); }
function safeFileName(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "file"; }
function fail(message: string): EmployeeActionState { return { status: "error", message }; }
function ok(message: string): EmployeeActionState { return { status: "success", message }; }
