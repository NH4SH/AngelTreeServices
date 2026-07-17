"use server";

import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type ReportingActionState = { status: "idle" | "success" | "error"; message: string };

const costCategories = ["materials", "disposal", "subcontractor", "equipment_rental", "crane", "fuel", "permit", "travel", "other"];

export async function saveReportingSettings(_state: ReportingActionState, formData: FormData): Promise<ReportingActionState> {
  const auth = await authorize("admin");
  if (!auth.ok) return fail(auth.message);
  const timezone = text(formData, "business_timezone", 80);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch { return fail("Enter a valid IANA business timezone, such as America/New_York."); }
  const values = {
    business_timezone: timezone,
    lead_stale_business_days: positiveInteger(formData, "lead_stale_business_days", 1),
    draft_quote_stale_days: positiveInteger(formData, "draft_quote_stale_days", 3),
    sent_quote_stale_days: positiveInteger(formData, "sent_quote_stale_days", 7),
    default_labor_burden_percent: optionalNumber(formData, "default_labor_burden_percent", 0, 500),
    blended_labor_cost_cents: optionalMoneyCents(formData, "blended_labor_cost"),
    updated_by_user_id: auth.userId,
  };
  const { error } = await auth.supabase.from("reporting_settings").update(values).eq("singleton_key", true);
  if (error) return fail(error.message);
  revalidatePath("/admin/reports"); revalidatePath("/admin");
  return ok("Reporting settings saved.");
}

export async function addLaborCostRate(_state: ReportingActionState, formData: FormData): Promise<ReportingActionState> {
  const auth = await authorize("financial");
  if (!auth.ok) return fail(auth.message);
  const employeeId = text(formData, "employee_id", 80); const effectiveFrom = date(formData, "effective_from"); const effectiveTo = date(formData, "effective_to"); const hourlyCostCents = moneyCents(formData, "hourly_cost");
  if (!employeeId || !effectiveFrom || hourlyCostCents == null) return fail("Employee, effective date, and a nonnegative hourly cost are required.");
  if (effectiveTo && effectiveTo < effectiveFrom) return fail("End date cannot be before the effective date.");
  const existing = await auth.supabase.from("employee_labor_cost_rates").select("effective_from, effective_to").eq("employee_id", employeeId);
  if (existing.error) return fail(existing.error.message);
  const overlaps = (existing.data ?? []).some((rate) => effectiveFrom <= (rate.effective_to ?? "9999-12-31") && (effectiveTo ?? "9999-12-31") >= rate.effective_from);
  if (overlaps) return fail("This effective period overlaps an existing labor cost rate. End the prior period before adding the new rate.");
  const { error } = await auth.supabase.from("employee_labor_cost_rates").insert({ employee_id: employeeId, effective_from: effectiveFrom, effective_to: effectiveTo, hourly_cost_cents: hourlyCostCents, burden_percent: optionalNumber(formData, "burden_percent", 0, 500), notes: optional(formData, "notes", 1000), created_by_user_id: auth.userId });
  if (error) return fail(error.code === "23505" ? "That employee already has a rate beginning on this date." : error.message);
  revalidatePath("/admin/reports");
  return ok("Historical labor cost rate added. Existing rates were not overwritten.");
}

export async function addJobCost(_state: ReportingActionState, formData: FormData): Promise<ReportingActionState> {
  const auth = await authorize("job_cost");
  if (!auth.ok) return fail(auth.message);
  const jobId = text(formData, "job_id", 80); const category = text(formData, "category", 40); const description = text(formData, "description", 500); const amountCents = moneyCents(formData, "amount");
  if (!jobId || !costCategories.includes(category) || !description || amountCents == null) return fail("Job, category, description, and a nonnegative amount are required.");
  const canApprove = hasAllowedRole(auth.roles, platformRoleGroups.financialReporting);
  let receiptStoragePath: string | null = null;
  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    if (receipt.size > 10 * 1024 * 1024) return fail("Receipt files must be 10 MB or smaller.");
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(receipt.type)) return fail("Receipt must be a JPG, PNG, WebP, or PDF.");
    receiptStoragePath = `${jobId}/${auth.userId}/${crypto.randomUUID()}-${safeFileName(receipt.name)}`;
    const upload = await auth.supabase.storage.from("job-cost-receipts").upload(receiptStoragePath, receipt, { contentType: receipt.type, upsert: false });
    if (upload.error) return fail(`Receipt could not be uploaded: ${upload.error.message}`);
  }
  const reviewStatus = canApprove && formData.get("approve_now") === "on" ? "approved" : "pending";
  const { error } = await auth.supabase.from("job_cost_entries").insert({
    job_id: jobId, category, description, vendor_name: optional(formData, "vendor_name", 200), amount_cents: amountCents,
    incurred_on: date(formData, "incurred_on") ?? new Date().toISOString().slice(0, 10), notes: optional(formData, "notes", 2000), receipt_storage_path: receiptStoragePath,
    review_status: reviewStatus, submitted_by_user_id: auth.userId, reviewed_by_user_id: reviewStatus === "approved" ? auth.userId : null, reviewed_at: reviewStatus === "approved" ? new Date().toISOString() : null,
  });
  if (error) { if (receiptStoragePath) await auth.supabase.storage.from("job-cost-receipts").remove([receiptStoragePath]); return fail(error.message); }
  revalidatePath(`/admin/jobs/${jobId}`); revalidatePath(`/crew/jobs/${jobId}`); revalidatePath("/admin/reports");
  return ok(reviewStatus === "approved" ? "Direct job cost added and approved." : "Cost submitted for office review.");
}

export async function reviewJobCost(formData: FormData) {
  const auth = await authorize("financial"); if (!auth.ok) return;
  const costId = text(formData, "cost_id", 80); const jobId = text(formData, "job_id", 80); const decision = text(formData, "decision", 20);
  if (!costId || !["approved", "rejected"].includes(decision)) return;
  const { error } = await auth.supabase.from("job_cost_entries").update({ review_status: decision, reviewed_by_user_id: auth.userId, reviewed_at: new Date().toISOString(), review_notes: optional(formData, "review_notes", 1000) }).eq("id", costId).eq("job_id", jobId).eq("review_status", "pending");
  if (error) console.error("Job cost review failed", error);
  revalidatePath(`/admin/jobs/${jobId}`); revalidatePath("/admin/reports");
}

async function authorize(scope: "admin" | "financial" | "job_cost") {
  const supabase = await createClient(); if (!supabase) return { ok: false as const, message: "Supabase is not configured." };
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { ok: false as const, message: "Sign in before changing reporting records." };
  const roles = await getUserRoles(supabase, user.id);
  if (scope === "admin" && !hasAllowedRole(roles, platformRoleGroups.accessApproval)) return { ok: false as const, message: "Only owners and admins can change reporting settings." };
  if (scope === "financial" && !hasAllowedRole(roles, platformRoleGroups.financialReporting)) return { ok: false as const, message: "Financial reporting access is required." };
  if (scope === "job_cost" && !hasAllowedRole(roles, platformRoleGroups.crewApp)) return { ok: false as const, message: "This account cannot submit job costs." };
  return { ok: true as const, supabase, userId: user.id, roles };
}

function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function date(formData: FormData, key: string) { const value = text(formData, key, 20); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function positiveInteger(formData: FormData, key: string, fallback: number) { const value = Number(text(formData, key, 10)); return Number.isInteger(value) && value > 0 ? value : fallback; }
function optionalNumber(formData: FormData, key: string, min: number, max: number) { const raw = text(formData, key, 30); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) && value >= min && value <= max ? value : null; }
function moneyCents(formData: FormData, key: string) { const raw = text(formData, key, 30); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null; }
function optionalMoneyCents(formData: FormData, key: string) { return text(formData, key, 30) ? moneyCents(formData, key) : null; }
function safeFileName(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "receipt"; }
function fail(message: string): ReportingActionState { return { status: "error", message }; }
function ok(message: string): ReportingActionState { return { status: "success", message }; }
