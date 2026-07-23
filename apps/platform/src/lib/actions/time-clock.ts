"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRoles, getUserRoles } from "@/lib/auth/roles";
import {
  canReviewTimeClock,
  canUseTimeClock,
  getTimeClockPermissionForUser,
  isTimeClockRoleEligible,
} from "@/lib/auth/time-clock";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";

export type TimeClockActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialClockInTypes = ["job", "drive", "shop", "maintenance", "admin", "training", "break", "other"] as const;
const reviewStatuses = ["approved", "needs_correction", "rejected"] as const;

export async function clockIn(
  _previousState: TimeClockActionState,
  formData: FormData,
): Promise<TimeClockActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before using the time clock." };
  }

  const roles = await getCurrentUserRoles();
  const permission = await getTimeClockPermissionForUser(user.id, supabase);

  if (!canUseTimeClock({ permission: permission.data, roles })) {
    return { status: "error", message: "Time clock access is not enabled for this account." };
  }

  const entryType = String(formData.get("entry_type") ?? "job").trim();
  const jobId = getOptionalUuid(formData, "job_id");
  const scheduleEventId = getOptionalUuid(formData, "schedule_event_id");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  if (!initialClockInTypes.includes(entryType as (typeof initialClockInTypes)[number])) {
    return { status: "error", message: "Choose a valid time entry type." };
  }

  const { data: activeEntry } = await supabase
    .from("time_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("clock_out_at", null)
    .maybeSingle();

  if (activeEntry) {
    return { status: "error", message: "Clock out of the current timer before starting another one." };
  }

  const { error } = await supabase.from("time_entries").insert({
    user_id: user.id,
    job_id: jobId,
    schedule_event_id: scheduleEventId,
    entry_type: entryType,
    status: "active",
    clock_in_at: new Date().toISOString(),
    notes,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "23505"
        ? "You already have an active timer."
        : error.message,
    };
  }

  revalidateTimeClockPaths(user.id);
  return { status: "success", message: "Clocked in." };
}

export async function clockOut(
  _previousState: TimeClockActionState,
  formData: FormData,
): Promise<TimeClockActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before using the time clock." };
  }

  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const breakMinutes = getBreakMinutes(formData.get("break_minutes"));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  if (!timeEntryId) {
    return { status: "error", message: "No active timer was selected." };
  }

  const clockOutAt = new Date().toISOString();
  const { data: updatedEntry, error } = await supabase
    .from("time_entries")
    .update({
      break_minutes: breakMinutes,
      clock_out_at: clockOutAt,
      notes,
      status: "completed",
    })
    .eq("id", timeEntryId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("clock_out_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  if (!updatedEntry) {
    return { status: "error", message: "Active timer not found or no access." };
  }

  revalidateTimeClockPaths(user.id);
  return { status: "success", message: "Clocked out." };
}

export async function setTimeClockPermission(
  _previousState: TimeClockActionState,
  formData: FormData,
): Promise<TimeClockActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before managing time clock permissions." };
  }

  const roles = await getCurrentUserRoles();

  if (!canReviewTimeClock(roles)) {
    return { status: "error", message: "Only reviewers can manage time clock access." };
  }

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  if (!targetUserId) {
    return { status: "error", message: "Select a user first." };
  }

  const targetRoles = await getUserRoles(supabase, targetUserId);

  if (!isTimeClockRoleEligible(targetRoles)) {
    return {
      status: "error",
      message: "Only owner, admin, payroll, estimator, or crew accounts can use the time clock.",
    };
  }

  const { error } = await supabase.from("time_clock_permissions").upsert({
    user_id: targetUserId,
    is_enabled: enabled,
    notes,
    created_by_user_id: user.id,
  });

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  revalidateTimeClockPaths(targetUserId);
  return { status: "success", message: enabled ? "Time clock enabled." : "Time clock disabled." };
}

export async function approveTimeEntry(
  _previousState: TimeClockActionState,
  formData: FormData,
): Promise<TimeClockActionState> {
  const reviewData = new FormData();
  reviewData.set("time_entry_id", String(formData.get("time_entry_id") ?? ""));
  reviewData.set("user_id", String(formData.get("user_id") ?? ""));
  reviewData.set("approval_note", String(formData.get("approval_note") ?? ""));
  reviewData.set("review_status", "approved");
  return reviewTimeEntry(_previousState, reviewData);
}

export async function reviewTimeEntry(
  _previousState: TimeClockActionState,
  formData: FormData,
): Promise<TimeClockActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before approving time." };
  }

  const roles = await getCurrentUserRoles();

  if (!canReviewTimeClock(roles)) {
    return { status: "error", message: "Only reviewers can approve time." };
  }

  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const approvalNote = String(formData.get("approval_note") ?? "").trim().slice(0, 1000) || null;
  const userId = String(formData.get("user_id") ?? "").trim();
  const reviewStatus = String(formData.get("review_status") ?? "approved").trim();

  if (!timeEntryId) {
    return { status: "error", message: "Select a time entry first." };
  }

  if (!reviewStatuses.includes(reviewStatus as (typeof reviewStatuses)[number])) {
    return { status: "error", message: "Choose a valid review decision." };
  }

  const { error } = await supabase.from("time_entry_approvals").insert({
    time_entry_id: timeEntryId,
    approved_by_user_id: user.id,
    approval_status: reviewStatus,
    approval_note: approvalNote,
  });

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  revalidateTimeClockPaths(userId || undefined);
  return {
    status: "success",
    message: reviewStatus === "approved"
      ? "Time entry approved."
      : reviewStatus === "needs_correction"
        ? "Entry flagged for correction."
        : "Time entry rejected.",
  };
}

export async function adjustTimeEntry(
  _previousState: TimeClockActionState,
  formData: FormData,
): Promise<TimeClockActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adjusting time." };
  }

  const roles = await getCurrentUserRoles();

  if (!canReviewTimeClock(roles)) {
    return { status: "error", message: "Only reviewers can adjust time." };
  }

  const timeEntryId = String(formData.get("time_entry_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const newClockInAt = parseDateTime(formData.get("clock_in_at"));
  const newClockOutAt = parseDateTime(formData.get("clock_out_at"), true);
  const newBreakMinutes = getBreakMinutes(formData.get("break_minutes"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000) || null;

  if (!timeEntryId || !newClockInAt) {
    return { status: "error", message: "Entry and new clock-in time are required." };
  }

  if (newClockOutAt && newClockOutAt <= newClockInAt) {
    return { status: "error", message: "Clock out must be after clock in." };
  }

  const { data: existingEntry, error: readError } = await supabase
    .from("time_entries")
    .select("id, clock_in_at, clock_out_at, break_minutes")
    .eq("id", timeEntryId)
    .single();

  if (readError || !existingEntry) {
    return { status: "error", message: readError?.message ?? "Time entry not found or no access." };
  }

  const { error: adjustmentError } = await supabase.from("time_entry_adjustments").insert({
    time_entry_id: timeEntryId,
    adjusted_by_user_id: user.id,
    original_clock_in_at: existingEntry.clock_in_at,
    original_clock_out_at: existingEntry.clock_out_at,
    original_break_minutes: existingEntry.break_minutes,
    new_clock_in_at: newClockInAt.toISOString(),
    new_clock_out_at: newClockOutAt?.toISOString() ?? null,
    new_break_minutes: newBreakMinutes,
    reason,
  });

  if (adjustmentError) {
    return { status: "error", message: safeStaffMessage(adjustmentError.message) };
  }

  const { error: updateError } = await supabase
    .from("time_entries")
    .update({
      clock_in_at: newClockInAt.toISOString(),
      clock_out_at: newClockOutAt?.toISOString() ?? null,
      break_minutes: newBreakMinutes,
      notes: reason,
      status: "adjusted",
    })
    .eq("id", timeEntryId);

  if (updateError) {
    return { status: "error", message: safeStaffMessage(updateError.message) };
  }

  revalidateTimeClockPaths(userId || undefined);
  return { status: "success", message: "Time entry adjusted." };
}

function getOptionalUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return isUuid(value) ? value : null;
}

function parseDateTime(value: FormDataEntryValue | null, optional = false) {
  const text = String(value ?? "").trim();

  if (!text && optional) {
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBreakMinutes(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 600) : 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function revalidateTimeClockPaths(userId?: string) {
  revalidatePath("/crew");
  revalidatePath("/crew/time");
  revalidatePath("/admin");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/time");
  if (userId) {
    revalidatePath(`/admin/time/${userId}`);
  }
}
