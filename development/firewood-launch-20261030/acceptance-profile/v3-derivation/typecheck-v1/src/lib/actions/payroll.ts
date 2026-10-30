"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { canReviewTimeClock } from "@/lib/auth/time-clock";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import type { PayPeriodStatus } from "@/lib/types/database";

export type PayrollActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const allowedStatuses = ["open", "review", "approved", "exported", "locked"] as const satisfies readonly PayPeriodStatus[];

export async function createPayPeriod(
  _previousState: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before creating pay periods." };
  }

  const roles = await getCurrentUserRoles();

  if (!canReviewTimeClock(roles)) {
    return { status: "error", message: "Only owners, admins, and payroll admins can manage pay periods." };
  }

  const startDate = String(formData.get("starts_at") ?? "").trim();
  const endDate = String(formData.get("ends_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  if (!isDateOnly(startDate) || !isDateOnly(endDate)) {
    return { status: "error", message: "Choose both a valid start date and end date." };
  }

  const startsAt = new Date(`${startDate}T00:00:00`);
  const endsAt = new Date(`${endDate}T23:59:59.999`);

  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return { status: "error", message: "The pay period end must be after the start." };
  }

  const { data: overlappingPeriods, error: overlapError } = await supabase
    .from("pay_periods")
    .select("id")
    .lte("starts_at", endsAt.toISOString())
    .gte("ends_at", startsAt.toISOString())
    .limit(1);

  if (overlapError) {
    return { status: "error", message: safeStaffMessage(overlapError.message) };
  }

  if ((overlappingPeriods?.length ?? 0) > 0) {
    return { status: "error", message: "That date range overlaps an existing pay period." };
  }

  const { error } = await supabase.from("pay_periods").insert({
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "open",
    notes,
    created_by_user_id: user.id,
  });

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  revalidatePayrollPaths();
  return { status: "success", message: "Pay period created." };
}

export async function updatePayPeriodStatus(
  _previousState: PayrollActionState,
  formData: FormData,
): Promise<PayrollActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating pay periods." };
  }

  const roles = await getCurrentUserRoles();

  if (!canReviewTimeClock(roles)) {
    return { status: "error", message: "Only owners, admins, and payroll admins can manage pay periods." };
  }

  const payPeriodId = String(formData.get("pay_period_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() as PayPeriodStatus;

  if (!payPeriodId) {
    return { status: "error", message: "Select a pay period first." };
  }

  if (!allowedStatuses.includes(nextStatus)) {
    return { status: "error", message: "Choose a valid pay period status." };
  }

  const { data: period, error: readError } = await supabase
    .from("pay_periods")
    .select("id, status")
    .eq("id", payPeriodId)
    .maybeSingle();

  if (readError || !period) {
    return { status: "error", message: readError?.message ?? "Pay period not found or no access." };
  }

  if (period.status === "locked" && nextStatus !== "locked") {
    return { status: "error", message: "Locked periods stay read-only until unlock flow is added." };
  }

  const { error } = await supabase
    .from("pay_periods")
    .update({ status: nextStatus })
    .eq("id", payPeriodId);

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  revalidatePayrollPaths();
  return { status: "success", message: `Pay period marked ${nextStatus.replace("_", " ")}.` };
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function revalidatePayrollPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/time");
  revalidatePath("/admin/payroll");
}
