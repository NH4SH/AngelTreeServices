"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  employeeRequestedRoleOptions,
  type EmployeeRequestedRoleValue,
} from "@/lib/access-request-options";
import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { AccessApprovalRole } from "@/lib/data/access-requests";
import { getInternalLeadNotificationEmail } from "@/lib/email/config";
import {
  employeeAccessApprovedTemplate,
  employeeAccessRejectedTemplate,
  employeeAccessRequestAdminTemplate,
} from "@/lib/email/templates";
import { recordEmailEvent, sendTransactionalEmail } from "@/lib/email/send";
import { recordActivity } from "@/lib/activity-log";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";
import { safeStaffMessage } from "@/lib/security/errors";
import { getServiceRoleClient } from "@/lib/supabase/admin";

const allowedRequestedRoles = new Set(employeeRequestedRoleOptions.map((option) => option.value));
const allowedApprovalRoles = new Set<AccessApprovalRole>(["admin", "estimator", "crew", "payroll_admin"]);

export type AccessRequestActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function requestEmployeeAccess(
  _previousState: AccessRequestActionState,
  formData: FormData,
): Promise<AccessRequestActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured yet." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizeOptionalText(formData.get("phone"), 50);
  const requestedRole = String(formData.get("requested_role") ?? "").trim();
  const note = normalizeOptionalText(formData.get("note"), 1000);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!fullName || !email || !password) {
    return { status: "error", message: "Full name, email, and password are required." };
  }

  if (!email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (password.length < 8) {
    return { status: "error", message: "Choose a password with at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { status: "error", message: "The password confirmation does not match." };
  }

  if (!allowedRequestedRoles.has(requestedRole as EmployeeRequestedRoleValue)) {
    return { status: "error", message: "Choose the kind of access you need." };
  }

  const rateLimit = await enforceSharedRateLimit({
    action: "public.employee-access.create",
    headers: await headers(),
    identifiers: [email],
    limit: 5,
    windowSeconds: 900,
  });
  if (!rateLimit.available) return { status: "error", message: "Employee signup is temporarily unavailable. Please try again shortly." };
  if (!rateLimit.allowed) return { status: "error", message: "Please wait before submitting another access request." };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        name: fullName,
        phone,
      },
    },
  });

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  const authUserId = data.session?.user.id ?? null;
  const basePayload = {
    email,
    full_name: fullName,
    phone,
    requested_role: requestedRole,
    note,
    status: "pending" as const,
  };
  const accessRequestClient = getServiceRoleClient();
  if (!accessRequestClient) {
    return { status: "error", message: "Your sign-in was created, but employee access review is temporarily unavailable." };
  }
  let insert = await accessRequestClient.from("employee_access_requests").insert({
    ...basePayload,
    auth_user_id: authUserId,
  });

  if (insert.error && authUserId && isAuthLinkPolicyError(insert.error.message)) {
    insert = await accessRequestClient.from("employee_access_requests").insert({
      ...basePayload,
      auth_user_id: null,
    });
  }

  if (insert.error) {
    if (insert.error.code === "23505") {
      return {
        status: "success",
        message: "Your access request is already pending review. An owner or admin still needs to approve it.",
      };
    }

    return {
      status: "error",
      message: "Your sign-in was created, but the access request could not be recorded. Sign in and contact an admin to finish approval.",
    };
  }

  revalidatePath("/login");
  revalidatePath("/signup");

  if (!insert.error) {
    const template = employeeAccessRequestAdminTemplate({
      ...basePayload,
      id: "",
      auth_user_id: authUserId,
      assigned_role: null,
      time_clock_enabled: false,
      reviewed_by_user_id: null,
      reviewed_at: null,
      rejection_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await sendTransactionalEmail({
      to: getInternalLeadNotificationEmail(),
      subject: template.subject,
      text: template.text,
      html: template.html,
      emailType: "access_request_admin_notice",
    });
  }

  return {
    status: "success",
    message: data.session
      ? "Your access request has been submitted. An admin will approve your account before the app opens."
      : "Your access request has been submitted. If your project uses email confirmation, verify your email before signing in.",
  };
}

export async function approveEmployeeAccessRequest(
  _previousState: AccessRequestActionState,
  formData: FormData,
): Promise<AccessRequestActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured yet." };
  }

  const reviewer = await requireAccessApprovalUser();

  if (reviewer.error) {
    return reviewer.error;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const approvedRole = String(formData.get("approved_role") ?? "").trim();
  const enableTimeClock = String(formData.get("enable_time_clock") ?? "false") === "true";

  if (!requestId) {
    return { status: "error", message: "Choose a request first." };
  }

  if (!allowedApprovalRoles.has(approvedRole as AccessApprovalRole)) {
    return { status: "error", message: "Choose a valid role before approval." };
  }

  const { data: request, error: requestError } = await supabase
    .from("employee_access_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    return { status: "error", message: requestError?.message ?? "Access request not found." };
  }

  if (request.status !== "pending") {
    return { status: "error", message: "This request has already been reviewed." };
  }

  const targetProfile = await getTargetProfileId(supabase, request.auth_user_id, request.email);

  if (!targetProfile) {
    return {
      status: "error",
      message: "The employee account could not be matched to a profile yet. Ask them to finish sign-up and try again.",
    };
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: targetProfile.id,
    email: request.email,
    full_name: request.full_name,
    phone: request.phone,
    user_type: mapApprovalRoleToUserType(approvedRole as AccessApprovalRole),
    status: "active",
  });

  if (profileError) {
    return { status: "error", message: safeStaffMessage(profileError.message) };
  }

  const existingEmployeeByRequest = await supabase
    .from("employee_records")
    .select("id, employment_status, legal_name, preferred_name")
    .eq("access_request_id", request.id)
    .maybeSingle();
  const existingEmployeeByAuth = existingEmployeeByRequest.data
    ? existingEmployeeByRequest
    : await supabase
        .from("employee_records")
        .select("id, employment_status, legal_name, preferred_name")
        .eq("auth_user_id", targetProfile.id)
        .maybeSingle();
  const existingEmployeeByEmail = existingEmployeeByAuth.data
    ? existingEmployeeByAuth
    : await supabase
        .from("employee_records")
        .select("id, employment_status, legal_name, preferred_name")
        .is("auth_user_id", null)
        .ilike("contact_email", request.email)
        .is("archived_at", null)
        .limit(1)
        .maybeSingle();
  const employeeRecord = existingEmployeeByEmail.data;
  const employeeResult = employeeRecord
    ? await supabase
        .from("employee_records")
        .update({
          access_request_id: request.id,
          auth_user_id: targetProfile.id,
          contact_email: request.email,
          contact_phone: request.phone,
          legal_name: employeeRecord.legal_name ?? request.full_name,
          preferred_name: employeeRecord.preferred_name ?? request.full_name,
          employment_status: employeeRecord.employment_status === "applicant" ? "onboarding" : employeeRecord.employment_status,
          manual_review_required: false,
        })
        .eq("id", employeeRecord.id)
        .select("id")
        .single()
    : await supabase
        .from("employee_records")
        .insert({
          access_request_id: request.id,
          auth_user_id: targetProfile.id,
          contact_email: request.email,
          contact_phone: request.phone,
          legal_name: request.full_name,
          preferred_name: request.full_name,
          employment_status: "onboarding",
          manual_review_required: false,
          created_by_user_id: reviewer.userId,
        })
        .select("id")
        .single();

  if (employeeResult.error || !employeeResult.data) {
    return { status: "error", message: employeeResult.error?.message ?? "Employee record could not be linked to the approved account." };
  }

  const { error: userRoleError } = await supabase.rpc("replace_platform_user_roles", {
    p_target_user_id: targetProfile.id,
    p_role_names: [approvedRole],
    p_reason: "Employee access request approval",
  });

  if (userRoleError) {
    return { status: "error", message: safeStaffMessage(userRoleError.message) };
  }

  if (enableTimeClock) {
    const { error: timeClockError } = await supabase.from("time_clock_permissions").upsert({
      user_id: targetProfile.id,
      is_enabled: true,
      created_by_user_id: reviewer.userId,
      notes: "Enabled during employee access approval.",
    });

    if (timeClockError) {
      return { status: "error", message: safeStaffMessage(timeClockError.message) };
    }
  }

  const { error: updateError } = await supabase
    .from("employee_access_requests")
    .update({
      auth_user_id: request.auth_user_id ?? targetProfile.id,
      status: "approved",
      assigned_role: approvedRole,
      time_clock_enabled: enableTimeClock,
      reviewed_by_user_id: reviewer.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", requestId);

  if (updateError) {
    return { status: "error", message: safeStaffMessage(updateError.message) };
  }

  await recordActivity(supabase, {
    actorUserId: reviewer.userId,
    eventType: "platform_access_approved",
    metadata: { assigned_role: approvedRole, time_clock_enabled: enableTimeClock },
    subjectId: employeeResult.data.id,
    subjectType: "employee",
  });

  revalidateAccessPaths(targetProfile.id);
  const emailResult = await sendTransactionalEmail({
    to: request.email,
    ...employeeAccessApprovedTemplate({
      fullName: request.full_name,
      assignedRole: approvedRole as AccessApprovalRole,
    }),
    emailType: "access_approved",
    sentByUserId: reviewer.userId,
    supabase,
  });

  return {
    status: "success",
    message: emailResult.ok
      ? "Employee access approved and approval email sent."
      : `Employee access approved. ${emailResult.message}`,
  };
}

export async function rejectEmployeeAccessRequest(
  _previousState: AccessRequestActionState,
  formData: FormData,
): Promise<AccessRequestActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured yet." };
  }

  const reviewer = await requireAccessApprovalUser();

  if (reviewer.error) {
    return reviewer.error;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  const rejectionReason = normalizeOptionalText(formData.get("rejection_reason"), 1000);

  if (!requestId) {
    return { status: "error", message: "Choose a request first." };
  }

  const { data: request, error: requestError } = await supabase
    .from("employee_access_requests")
    .select("id, email, full_name, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    return { status: "error", message: requestError?.message ?? "Access request not found." };
  }

  if (request.status !== "pending") {
    return { status: "error", message: "This request has already been reviewed." };
  }

  const { error: updateError } = await supabase
    .from("employee_access_requests")
    .update({
      status: "rejected",
      assigned_role: null,
      time_clock_enabled: false,
      reviewed_by_user_id: reviewer.userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason,
    })
    .eq("id", requestId);

  if (updateError) {
    return { status: "error", message: safeStaffMessage(updateError.message) };
  }

  revalidateAccessPaths();
  const emailResult = await sendTransactionalEmail({
    to: request.email,
    ...employeeAccessRejectedTemplate({
      fullName: request.full_name,
      reason: rejectionReason,
    }),
    emailType: "access_rejected",
    sentByUserId: reviewer.userId,
    supabase,
  });

  return {
    status: "success",
    message: emailResult.ok
      ? "Access request rejected and email sent."
      : `Access request rejected. ${emailResult.message}`,
  };
}

export async function sendEmployeePasswordReset(
  _previousState: AccessRequestActionState,
  formData: FormData,
): Promise<AccessRequestActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured yet." };
  }

  const reviewer = await requireAccessApprovalUser();

  if (reviewer.error) {
    return reviewer.error;
  }

  const userId = String(formData.get("user_id") ?? "").trim();

  if (!userId) {
    return { status: "error", message: "Choose an employee before sending a password reset." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (profileError || !profile) {
    return { status: "error", message: profileError?.message ?? "Employee profile was not found." };
  }

  const email = String(profile.email ?? "").trim().toLowerCase();

  if (!email) {
    return { status: "error", message: "This employee profile is missing an email address." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await getPasswordResetRedirectTo(),
  });

  if (error) {
    const safeMessage = formatSupabaseEmailError(error.message);
    await recordEmailEvent({
      to: email,
      subject: "Angel Tree Platform password reset",
      emailType: "password_reset_admin_triggered",
      status: "failed",
      errorMessage: safeMessage,
      sentByUserId: reviewer.userId,
      supabase,
    });
    return {
      status: "error",
      message: safeMessage,
    };
  }

  await recordEmailEvent({
    to: email,
    subject: "Angel Tree Platform password reset",
    emailType: "password_reset_admin_triggered",
    status: "sent",
    sentByUserId: reviewer.userId,
    supabase,
  });
  revalidatePath("/admin/access");
  return { status: "success", message: "Password reset email sent." };
}

async function requireAccessApprovalUser() {
  const supabase = await createClient();

  if (!supabase) {
    return { error: { status: "error" as const, message: "Supabase is not configured yet." } };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: { status: "error" as const, message: "Sign in before managing employee access." } };
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  if (rolesError) {
    return { error: { status: "error" as const, message: safeStaffMessage(rolesError.message) } };
  }

  const roles = ((roleRows ?? []) as { roles: { name: PlatformRoleName } | { name: PlatformRoleName }[] | null }[])
    .flatMap((row) => row.roles ?? [])
    .map((role) => role.name);

  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { error: { status: "error" as const, message: "Only owners and admins can review employee access." } };
  }

  return { userId: user.id };
}

async function getTargetProfileId(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  authUserId: string | null,
  email: string,
) {
  if (authUserId) {
    const byId = await supabase
      .from("profiles")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();

    if (!byId.error && byId.data) {
      return byId.data;
    }
  }

  const byEmail = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  return byEmail.error ? null : byEmail.data ?? null;
}

function mapApprovalRoleToUserType(role: AccessApprovalRole) {
  switch (role) {
    case "crew":
      return "crew";
    case "estimator":
      return "estimator";
    default:
      return "admin";
  }
}

function normalizeOptionalText(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim().slice(0, maxLength);
  return text || null;
}

function isAuthLinkPolicyError(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("row-level security") || lowered.includes("violates row-level security");
}

function formatSupabaseEmailError(message: string) {
  const lowered = message.toLowerCase();

  if (lowered.includes("rate") || lowered.includes("too many") || lowered.includes("over email send rate limit")) {
    return "Password reset email was not sent because the email provider is rate-limited. Wait a few minutes and try again.";
  }

  return `Supabase could not send the password reset email: ${message}`;
}

function revalidateAccessPaths(userId?: string) {
  revalidatePath("/login");
  revalidatePath("/signup");
  revalidatePath("/admin");
  revalidatePath("/admin/access");
  revalidatePath("/admin/time");
  revalidatePath("/crew");
  revalidatePath("/crew/time");
  if (userId) {
    revalidatePath(`/admin/time/${userId}`);
  }
}

async function getPasswordResetRedirectTo() {
  return buildCanonicalAppUrl("/update-password") ?? "https://admin.angeltreeservices.org/update-password";
}
