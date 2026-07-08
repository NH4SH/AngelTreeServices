"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { approveQuoteAndEnsureWorkOrder } from "@/lib/quotes/workflow";
import type { InvoiceStatus, JobStatus, QuoteLineItem, QuoteStatus } from "@/lib/types/database";

type WorkflowActionState = {
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
    in_progress: ["completed"],
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

  const updatePayload: { status: JobStatus; completed_at?: string } = { status: nextStatus };
  if (nextStatus === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("jobs").update(updatePayload).eq("id", jobId);

  if (error) {
    return { status: "error", message: error.message };
  }

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
    const result = await approveQuoteAndEnsureWorkOrder(supabase, quoteId);

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
  }

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { status: "success", message };
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

  if (!["sent", "void"].includes(nextStatus)) {
    return { status: "error", message: "That invoice status action is not allowed here." };
  }

  const updatePayload: { status: InvoiceStatus; sent_at?: string } = { status: nextStatus };
  if (nextStatus === "sent") {
    updatePayload.sent_at = new Date().toISOString();
  }

  const { error } = await supabase.from("invoices").update(updatePayload).eq("id", invoiceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { status: "success", message: `Invoice marked ${nextStatus}.` };
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

  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id")
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (existingError) {
    return { status: "error", message: existingError.message };
  }

  if (existingInvoice) {
    return { status: "error", message: "This quote already has an invoice." };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*, quote_line_items(*)")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Quote not found or no access." };
  }

  const typedQuote = quote as {
    id: string;
    job_id: string | null;
    customer_id: string;
    status: QuoteStatus;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    quote_line_items?: QuoteLineItem[];
  };
  const lineItems = (typedQuote.quote_line_items ?? []) as QuoteLineItem[];

  if (lineItems.length === 0) {
    return { status: "error", message: "Add at least one quote line item before creating an invoice." };
  }

  if (typedQuote.status !== "approved") {
    return { status: "error", message: "Approve the quote before creating an invoice." };
  }

  const approvalResult = await approveQuoteAndEnsureWorkOrder(supabase, quoteId);

  if (!approvalResult.ok) {
    return { status: "error", message: approvalResult.message };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      job_id: approvalResult.jobId,
      quote_id: typedQuote.id,
      customer_id: typedQuote.customer_id,
      status: "draft",
      subtotal_cents: typedQuote.subtotal_cents,
      tax_cents: typedQuote.tax_cents,
      total_cents: typedQuote.total_cents,
      balance_due_cents: typedQuote.total_cents,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { status: "error", message: invoiceError?.message ?? "Could not create invoice." };
  }

  const { error: lineItemError } = await supabase.from("invoice_line_items").insert(
    lineItems.map((item) => ({
      invoice_id: invoice.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_cents: item.total_cents,
      sort_order: item.sort_order,
    })),
  );

  if (lineItemError) {
    return {
      status: "error",
      message: `Invoice created, but line items failed: ${lineItemError.message}`,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoice.id}`);
  return { status: "success", message: "Invoice created from quote." };
}
