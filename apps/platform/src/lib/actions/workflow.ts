"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { approveQuoteAndEnsureWorkOrder } from "@/lib/quotes/workflow";
import { cancelOutstandingInvoiceCheckouts } from "@/lib/stripe/invoice-checkout";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { cancelPendingCommunications, syncAutomatedCommunications } from "@/lib/communications/queue";
import type { InvoiceStatus, JobStatus, QuoteLineItem, QuoteStatus } from "@/lib/types/database";

type WorkflowActionState = {
  invoiceId?: string;
  status: string;
  message: string;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateJobStatus(_previousState: WorkflowActionState, formData: FormData) {
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
    .select("id, status")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Job not found or no access." };
  }

  if (!allowedTransitions[job.status as JobStatus]?.includes(nextStatus)) {
    return { status: "error", message: "That job status transition is not allowed here." };
  }

  const updatePayload: { status: JobStatus } = { status: nextStatus };

  const { error } = await supabase.from("jobs").update(updatePayload).eq("id", jobId);

  if (error) {
    return { status: "error", message: error.message };
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
    const result = await approveQuoteAndEnsureWorkOrder(supabase, quoteId, new Date().toISOString(), user.id);

    if (!result.ok) {
      return { status: "error", message: result.message };
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
      return { status: "error", message: error.message };
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
    return { status: "error", message: error.message };
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

  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);

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

  const paymentSupabase = getServiceRoleClient();
  if (!paymentSupabase) {
    return { status: "error", message: "Could not confirm whether this invoice has an active customer checkout." };
  }

  const stripeConfig = getStripeServerConfig();
  const cancellation = await cancelOutstandingInvoiceCheckouts({
    invoiceId,
    stripe: stripeConfig.configured ? stripeConfig.stripe : null,
    supabase: paymentSupabase,
  });
  if (!cancellation.ok) {
    return { status: "error", message: cancellation.message };
  }

  const { error } = await supabase.from("invoices").update({ status: nextStatus }).eq("id", invoiceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  await cancelPendingCommunications(supabase, { invoiceId }, "Invoice was voided.");

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "invoice_voided",
    subjectId: invoiceId,
    subjectType: "invoice",
  });

  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { status: "success", message: `Invoice marked ${nextStatus}.` };
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
  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: error.message };
  }

  if (!invoice) {
    return { status: "error", message: "Only an unsent invoice can be manually marked sent." };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "invoice_marked_sent_manually",
    subjectId: invoiceId,
    subjectType: "invoice",
  });

  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) await syncAutomatedCommunications(communicationSupabase);

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

  const quoteId = getString(formData, "quote_id");
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Quote not found or no access." };
  }

  if (quote.status !== "approved") {
    return { status: "error", message: "Approve the quote before creating an invoice." };
  }

  const approvalResult = await approveQuoteAndEnsureWorkOrder(supabase, quoteId, new Date().toISOString(), user.id);

  if (!approvalResult.ok) {
    return { status: "error", message: approvalResult.message };
  }

  const result = await createInvoiceForCompletedJob({
    actorUserId: user.id,
    jobId: approvalResult.jobId,
    sourceQuoteId: quote.id,
    supabase,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${result.invoiceId}`);
  redirect(`/admin/invoices/${result.invoiceId}`);
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

  const jobId = getString(formData, "job_id");
  if (!jobId) {
    return { status: "error", message: "Choose a completed work order before generating an invoice." };
  }

  const result = await createInvoiceForCompletedJob({ actorUserId: user.id, jobId, supabase });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${result.invoiceId}`);

  if (result.existing) {
    return {
      invoiceId: result.invoiceId,
      status: "success",
      message: "An invoice already exists for this work order.",
    };
  }

  redirect(`/admin/invoices/${result.invoiceId}`);
}

type InvoiceGenerationResult =
  | { ok: true; invoiceId: string; existing: boolean }
  | { ok: false; message: string };

async function createInvoiceForCompletedJob({
  actorUserId,
  jobId,
  sourceQuoteId,
  supabase,
}: {
  actorUserId: string;
  jobId: string;
  sourceQuoteId?: string;
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
}): Promise<InvoiceGenerationResult> {
  const existingInvoice = await findInvoiceForJob(supabase, jobId);
  if (existingInvoice.error) {
    return { ok: false, message: existingInvoice.error };
  }

  if (existingInvoice.invoiceId) {
    return { ok: true, invoiceId: existingInvoice.invoiceId, existing: true };
  }

  const { data: invoiceableJob, error: invoiceableJobError } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  if (invoiceableJobError || !invoiceableJob) {
    return { ok: false, message: invoiceableJobError?.message ?? "Could not find this work order." };
  }

  if (!["completed", "ready_to_invoice"].includes(invoiceableJob.status)) {
    return { ok: false, message: "Complete office closeout review before generating an invoice." };
  }

  const previousJobStatus = invoiceableJob.status as JobStatus;

  const { data: claimedJob, error: claimError } = await supabase
    .from("jobs")
    .update({ status: "invoiced" })
    .eq("id", jobId)
    .eq("status", previousJobStatus)
    .select("id, customer_id, source_quote_id, service_type, requested_scope")
    .maybeSingle();

  if (claimError) {
    return { ok: false, message: claimError.message };
  }

  if (!claimedJob) {
    const claimedInvoice = await findInvoiceForJob(supabase, jobId);
    if (claimedInvoice.error) {
      return { ok: false, message: claimedInvoice.error };
    }

    if (claimedInvoice.invoiceId) {
      return { ok: true, invoiceId: claimedInvoice.invoiceId, existing: true };
    }

    return { ok: false, message: "Complete this work order before generating an invoice." };
  }

  const linkedQuoteId = sourceQuoteId ?? claimedJob.source_quote_id ?? null;
  const quoteResult = await getInvoiceSourceQuote(supabase, linkedQuoteId, jobId);
  if (!quoteResult.ok) {
    await restoreInvoiceableJob(supabase, jobId, previousJobStatus);
    return quoteResult;
  }

  const lines = quoteResult.lineItems.length > 0
    ? quoteResult.lineItems
    : [{
        description: claimedJob.requested_scope,
        name: formatServiceType(claimedJob.service_type),
        service_category_id: null,
        quantity: 1,
        sort_order: 0,
        total_cents: 0,
        unit_price_cents: 0,
      }];
  const subtotalCents = lines.reduce((sum, line) => sum + line.total_cents, 0);
  const taxCents = quoteResult.taxCents;
  const totalCents = subtotalCents + taxCents;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      balance_due_cents: totalCents,
      customer_id: claimedJob.customer_id,
      job_id: claimedJob.id,
      quote_id: quoteResult.quoteId,
      status: "draft",
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    await restoreInvoiceableJob(supabase, jobId, previousJobStatus);
    return { ok: false, message: invoiceError?.message ?? "Could not create invoice." };
  }

  const { error: lineItemError } = await supabase.from("invoice_line_items").insert(
    lines.map((line, index) => ({
      description: line.description,
      service_category_id: line.service_category_id,
      invoice_id: invoice.id,
      name: line.name,
      quantity: line.quantity,
      sort_order: index,
      total_cents: line.total_cents,
      unit_price_cents: line.unit_price_cents,
    })),
  );

  if (lineItemError) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    await restoreInvoiceableJob(supabase, jobId, previousJobStatus);
    return { ok: false, message: `Invoice was not created because line items failed: ${lineItemError.message}` };
  }

  await recordActivity(supabase, {
    actorUserId,
    eventType: "invoice_generated",
    metadata: { source_quote_id: quoteResult.quoteId },
    subjectId: invoice.id,
    subjectType: "invoice",
  });
  await recordActivity(supabase, {
    actorUserId,
    eventType: "work_order_invoiced",
    metadata: { invoice_id: invoice.id },
    subjectId: jobId,
    subjectType: "job",
  });

  return { ok: true, invoiceId: invoice.id, existing: false };
}

async function findInvoiceForJob(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  jobId: string,
) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { error: error?.message ?? null, invoiceId: data?.id ?? null };
}

async function getInvoiceSourceQuote(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  quoteId: string | null,
  jobId: string,
): Promise<
  | { ok: true; quoteId: string | null; taxCents: number; lineItems: Pick<QuoteLineItem, "name" | "description" | "service_category_id" | "quantity" | "unit_price_cents" | "total_cents" | "sort_order">[] }
  | { ok: false; message: string }
> {
  if (!quoteId) {
    return { ok: true, quoteId: null, taxCents: 0, lineItems: [] };
  }

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, job_id, status, tax_cents, quote_line_items(name, description, service_category_id, quantity, unit_price_cents, total_cents, sort_order)")
    .eq("id", quoteId)
    .maybeSingle();

  if (error || !quote) {
    return { ok: false, message: error?.message ?? "Could not find the source quote for this work order." };
  }

  if (quote.job_id && quote.job_id !== jobId) {
    return { ok: false, message: "The source quote is linked to a different work order." };
  }

  return {
    ok: true,
    quoteId: quote.id,
    taxCents: quote.tax_cents ?? 0,
    lineItems: ((quote.quote_line_items ?? []) as QuoteLineItem[])
      .sort((left, right) => left.sort_order - right.sort_order),
  };
}

async function restoreInvoiceableJob(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  jobId: string,
  status: JobStatus,
) {
  await supabase.from("jobs").update({ status }).eq("id", jobId).eq("status", "invoiced");
}

function formatServiceType(serviceType: string | null) {
  return serviceType?.replaceAll("_", " ") || "Completed service";
}
