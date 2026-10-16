"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { completionInputs, parseCompletionContext, type JobCompletionContext } from "@/lib/jobs/completion-request";
import { isGenerationRequestId, parseGeneratedInvoice } from "@/lib/invoices/generation-request";
import { safeStaffMessage } from "@/lib/security/errors";
type WorkflowActionState = { status: string; message: string; context?: JobCompletionContext };
function getString(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

export async function completeJobWork(_previousState: WorkflowActionState, formData: FormData): Promise<WorkflowActionState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Work completion is unavailable." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in before completing work." };
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) return { status: "error", message: "Only active office staff may complete work." };
  const jobId = getString(formData, "job_id"), requestId = getString(formData, "request_id");
  const inputs = completionInputs(formData), mode = getString(formData, "mode");
  if (!isGenerationRequestId(jobId) || !isGenerationRequestId(requestId) || !inputs || !["complete", "complete_and_invoice"].includes(mode))
    return { status: "error", message: "Open the work completion review and reload before continuing." };
  const { data, error } = await supabase.rpc("complete_job_work", { p_job_id: jobId, p_request_id: requestId,
    ...inputs, p_mode: mode, p_reason: getString(formData, "reason") || null });
  if (error) return { status: "error", message: safeStaffMessage(error.message) };
  const context = parseCompletionContext(data?.context);
  if (!context || data?.job_completed !== true) return { status: "error", message: "Completion could not be confirmed. Retry the saved request safely." };
  for (const path of ["/admin", "/admin/jobs", `/admin/jobs/${jobId}`, `/admin/jobs/${jobId}/closeout`, "/admin/jobs/closeouts",
    "/admin/schedule", "/admin/invoices", "/crew/jobs", `/crew/jobs/${jobId}`]) revalidatePath(path);
  if (mode === "complete_and_invoice") {
    const invoice = parseGeneratedInvoice(data);
    if (!invoice) return { status: "error", message: "Review the invoice on this work order before continuing." };
    revalidatePath(`/admin/invoices/${invoice.invoice_id}`);
    redirect(`/admin/invoices/${invoice.invoice_id}?created=1&job_completed=1`);
  }
  return { status: "success", message: "Work completed. No invoice was created or sent.", context };
}

/** A read-only, deliberate refresh. The client keeps notes and asks the user to review again. */
export async function reviewLatestCompletion(_previousState: WorkflowActionState, formData: FormData): Promise<WorkflowActionState> {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Work completion is unavailable." };
  const jobId = getString(formData, "job_id");
  if (!isGenerationRequestId(jobId)) return { status: "error", message: "Choose a work order before reviewing completion." };
  const { data, error } = await supabase.rpc("get_job_completion_context", { p_job_id: jobId });
  const context = parseCompletionContext(data);
  return error || !context ? { status: "error", message: "The latest visits could not be loaded. Your entries are still here. Try again." }
    : { status: "success", message: "Latest work and visits loaded. Review them and confirm future dates again before submitting.", context };
}
