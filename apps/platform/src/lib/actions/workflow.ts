"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { approveQuoteAndEnsureWorkOrder } from "@/lib/quotes/workflow";
import { reviewInvoiceCheckout, voidInvoiceSafely } from "@/lib/payments/invoice-void";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { cancelPendingCommunications } from "@/lib/communications/queue";
import { reconcileInvoiceBalance } from "@/lib/payments/reconciliation";
import { existingInvoiceMessage, isGenerationRequestId } from "@/lib/invoices/generation-request";
import { generateInvoiceConfirmed } from "@/lib/invoices/generation-confirmation";
import { safeStaffMessage } from "@/lib/security/errors";
import type { InvoiceStatus, JobStatus, QuoteStatus } from "@/lib/types/database";

type WorkflowActionState = {
  invoiceId?: string;
  status: string;
  message: string;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateJobStatus(_previousState: WorkflowActionState, formData: FormData) {
  if (getString(formData, "next_status") === "completed") return { status: "error", message: "Open Complete work on the work order to review its remaining visits." };
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating jobs." };
  }

  const jobId = getString(formData, "job_id");
  const nextStatus = getString(formData, "next_status") as JobStatus;
  const allowedTransitions: Partial<Record<JobStatus, JobStatus[]>> = {
    new_lead: ["estimate_scheduled"],
    estimate_scheduled: ["quoted"],
    accepted: ["scheduled"],
    scheduled: ["in_progress"],
  };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, completed_at, completed_by_user_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Job not found or no access." };
  }

  if (!allowedTransitions[job.status as JobStatus]?.includes(nextStatus)) {
    return { status: "error", message: "That job status transition is not allowed here." };
  }
  const updatePayload = { status: nextStatus };

  const { data: updatedJob, error } = await supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .eq("status", job.status)
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  if (!updatedJob) {
    const { data: currentJob } = await supabase.from("jobs").select("status").eq("id", jobId).maybeSingle();
    return currentJob?.status === nextStatus
      ? { status: "success", message: `Job already marked ${nextStatus.replace("_", " ")}.` }
      : { status: "error", message: "The job changed before this action finished. Refresh and try again." };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "work_order_status_changed",
    metadata: { from_status: job.status, to_status: nextStatus },
    subjectId: jobId,
    subjectType: "job",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/schedule");
  revalidatePath("/crew/jobs");
  revalidatePath(`/crew/jobs/${jobId}`);
  return { status: "success", message: `Job marked ${nextStatus.replace("_", " ")}.` };
}

export async function updateQuoteStatus(_previousState: WorkflowActionState, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating quotes." };
  }

  const quoteId = getString(formData, "quote_id");
  const nextStatus = getString(formData, "next_status") as QuoteStatus;
  const allowedTargets: QuoteStatus[] = ["approved", "change_requested", "declined"];

  if (!allowedTargets.includes(nextStatus)) {
    return { status: "error", message: "That quote status action is not allowed here." };
  }

  let message = `Quote marked ${nextStatus.replace("_", " ")}.`;

  if (nextStatus === "approved") {
    const result = await approveQuoteAndEnsureWorkOrder(supabase, quoteId, Number(formData.get("expected_revision")));

    if (!result.ok) {
      return { status: "error", message: safeStaffMessage(result.message) };
    }

    message = result.createdJob
      ? "Quote approved and work order created."
      : "Quote approved and linked to the existing work order.";
  } else {
    const { error } = await supabase
      .from("quotes")
      .update({
        status: nextStatus,
        approved_at: null,
      })
      .eq("id", quoteId);

    if (error) {
      return { status: "error", message: safeStaffMessage(error.message) };
    }

    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: nextStatus === "change_requested" ? "quote_change_requested" : "quote_declined",
      subjectId: quoteId,
      subjectType: "quote",
    });
  }

  await cancelPendingCommunications(supabase, { quoteId }, `Quote status changed to ${nextStatus.replaceAll("_", " ")}.`);

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { status: "success", message };
}

export async function markQuoteSentManually(
  _previousState: WorkflowActionState,
  formData: FormData,
) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating quotes." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can manually mark a quote as sent." };
  }

  const quoteId = getString(formData, "quote_id");
  if (!quoteId) {
    return { status: "error", message: "Quote is required." };
  }

  const sentAt = new Date().toISOString();
  const { data: quote, error } = await supabase
    .from("quotes")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_method: "manual",
      sent_by_user_id: user.id,
    })
    .eq("id", quoteId)
    .in("status", ["draft", "change_requested"])
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }

  if (!quote) {
    return { status: "error", message: "Only draft or change-requested quotes can be manually marked sent." };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "quote_marked_sent_manually",
    subjectId: quoteId,
    subjectType: "quote",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { status: "success", message: "Marked as sent manually. No email was sent." };
}

export async function updateInvoiceStatus(_previousState: WorkflowActionState, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating invoices." };
  }

  const invoiceId = getString(formData, "invoice_id");
  const nextStatus = getString(formData, "next_status") as InvoiceStatus;

  if (nextStatus !== "void") {
    return { status: "error", message: "That invoice status action is not allowed here." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can void invoices." };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
    return { status: "error", message: "Invoice details are missing. Reload and try again." };
  }
  const result = await voidInvoiceSafely({ invoiceId, staffSupabase: supabase,
    getPaymentContext: invoicePaymentContext, correlationId: crypto.randomUUID() });
  if (result.ok) refreshInvoice(invoiceId);
  return { status: result.ok ? "success" : "error", message: result.message };
}

export async function reviewInvoicePaymentCheckout(_previousState: WorkflowActionState, formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in before reviewing payments." };
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can review payment checkouts." };
  }
  const invoiceId = getString(formData, "invoice_id");
  const reservationId = getString(formData, "reservation_id");
  const providerReference = getString(formData, "provider_reference");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(invoiceId) || !uuid.test(reservationId) || (providerReference && !/^(?:cs_(?:test_|live_)?|pi_)[A-Za-z0-9]{1,240}$/.test(providerReference))) {
    return { status: "error", message: "Choose a payment attempt and, if needed, a valid Stripe reference." };
  }
  const result = await reviewInvoiceCheckout({ invoiceId, reservationId, providerReference,
    staffSupabase: supabase, getPaymentContext: invoicePaymentContext, correlationId: crypto.randomUUID() });
  refreshInvoice(invoiceId);
  return { status: result.ok ? "success" : "error", message: result.message };
}

function invoicePaymentContext() {
  const supabase = getServiceRoleClient();
  if (!supabase) return null;
  const config = getStripeServerConfig();
  return { supabase, stripe: config.configured ? config.stripe : null, livemode: config.configured ? config.livemode : false };
}

function refreshInvoice(invoiceId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

export async function restoreVoidedInvoice(
  _previousState: WorkflowActionState,
  formData: FormData,
) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before restoring invoices." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can restore voided invoices." };
  }

  const invoiceId = getString(formData, "invoice_id");
  if (!invoiceId) {
    return { status: "error", message: "Invoice details are missing. Reload and try again." };
  }

  const { data: restoredStatus, error } = await supabase.rpc("restore_voided_invoice", {
    p_invoice_id: invoiceId,
  });

  if (error) {
    return {
      status: "error",
      message: safeStaffMessage(error.message, "The voided invoice could not be restored."),
    };
  }

  const reconciliation = await reconcileInvoiceBalance(supabase, invoiceId);
  if (!reconciliation.ok) {
    return {
      status: "error",
      message: `Invoice restored, but follow-up processing needs attention: ${reconciliation.message}`,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/invoices/${invoiceId}/edit`);
  return {
    status: "success",
    message: `Invoice restored to ${String(restoredStatus ?? reconciliation.status).replaceAll("_", " ")}. No email was sent.`,
  };
}

export async function markInvoiceSentManually(
  _previousState: WorkflowActionState,
  formData: FormData,
) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before updating invoices." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can manually mark an invoice as sent." };
  }

  const invoiceId = getString(formData, "invoice_id");
  const { error } = await supabase.rpc("record_invoice_delivery", { p_invoice_id: invoiceId, p_manual: true });
  if (error) {
    return { status: "error", message: safeStaffMessage(error.message) };
  }
  const reconciliation = await reconcileInvoiceBalance(supabase, invoiceId);
  if (!reconciliation.ok) {
    return { status: "error", message: `Delivery was recorded, but payment state could not be reconciled: ${reconciliation.message}` };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { status: "success", message: "Marked as sent manually. No email was sent." };
}

export async function createInvoiceFromQuote(_previousState: WorkflowActionState, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before creating invoices." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { status: "error", message: "Only authorized office staff can create invoices." };
  }

  return generateInvoice(supabase, formData, "quote");
}

export async function createInvoiceFromJob(_previousState: WorkflowActionState, formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before generating an invoice." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { status: "error", message: "Only authorized office staff can create invoices." };
  }

  return generateInvoice(supabase, formData, "job");
}

async function generateInvoice(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  formData: FormData,
  source: "job" | "quote",
): Promise<WorkflowActionState> {
  const requestId = getString(formData, "request_id");
  const sourceId = getString(formData, `${source}_id`);
  if (!isGenerationRequestId(requestId) || !isGenerationRequestId(sourceId)) {
    return { status: "error", message: "Refresh this page to prepare the saved invoice request." };
  }
  const confirmation = await generateInvoiceConfirmed(supabase, {
    p_request_id: requestId, p_job_id: source === "job" ? sourceId : null,
    p_quote_id: source === "quote" ? sourceId : null,
  });
  if (!confirmation.ok) return { status: "error", message: confirmation.message };
  const result = confirmation.value;
  for (const path of ["/admin", "/admin/jobs", `/admin/jobs/${result.job_id}`, "/admin/quotes", "/admin/invoices",
    `/admin/invoices/${result.invoice_id}`, "/admin/schedule", "/crew/jobs", `/crew/jobs/${result.job_id}`]) revalidatePath(path);
  if (source === "quote") revalidatePath(`/admin/quotes/${sourceId}`);
  if (result.existing || result.replayed) return {
    invoiceId: result.invoice_id, status: "success", message: existingInvoiceMessage(result.invoice_status),
  };
  redirect(`/admin/invoices/${result.invoice_id}?created=1${result.job_completed ? "&job_completed=1" : ""}`);
}
