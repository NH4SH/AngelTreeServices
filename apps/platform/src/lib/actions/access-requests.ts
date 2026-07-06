"use server";

import { revalidatePath } from "next/cache";
import {
  employeeRequestedRoleOptions,
  type EmployeeRequestedRoleValue,
} from "@/lib/access-request-options";
import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { AccessApprovalRole } from "@/lib/data/access-requests";

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
    return { status: "error", message: error.message };
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
  let insert = await supabase.from("employee_access_requests").insert({
    ...basePayload,
    auth_user_id: authUserId,
  });

  if (insert.error && authUserId && isAuthLinkPolicyError(insert.error.message)) {
    insert = await supabase.from("employee_access_requests").insert({
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
    return { status: "error", message: profileError.message };
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", approvedRole)
    .maybeSingle();

  if (roleError || !roleRow) {
    return { status: "error", message: roleError?.message ?? "Selected role was not found." };
  }

  const { error: userRoleError } = await supabase.from("user_roles").upsert({
    user_id: targetProfile.id,
    role_id: roleRow.id,
  });

  if (userRoleError) {
    return { status: "error", message: userRoleError.message };
  }

  if (enableTimeClock) {
    const { error: timeClockError } = await supabase.from("time_clock_permissions").upsert({
      user_id: targetProfile.id,
      is_enabled: true,
      created_by_user_id: reviewer.userId,
      notes: "Enabled during employee access approval.",
    });

    if (timeClockError) {
      return { status: "error", message: timeClockError.message };
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
    return { status: "error", message: updateError.message };
  }

  revalidateAccessPaths(targetProfile.id);
  return { status: "success", message: "Employee access approved." };
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
    .select("id, status")
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
    return { status: "error", message: updateError.message };
  }

  revalidateAccessPaths();
  return { status: "success", message: "Access request rejected." };
}

export async function resetCrewViewPreferences(
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
    return { status: "error", message: "Choose an employee before resetting the crew view." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return { status: "error", message: profileError?.message ?? "Employee profile was not found." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ crew_view_reset_requested_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidateAccessPaths(userId);
  revalidatePath("/crew/jobs");
  return {
    status: "success",
    message: "Crew view reset requested. The employee will see the default crew layout the next time they open crew tools.",
  };
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
    return { error: { status: "error" as const, message: rolesError.message } };
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
