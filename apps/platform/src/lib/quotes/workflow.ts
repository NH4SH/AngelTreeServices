import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobStatus } from "@/lib/types/database";

type QuoteWorkflowResult =
  | { ok: true; jobId: string; createdJob: boolean }
  | { ok: false; message: string };

type QuoteForApproval = {
  id: string;
  job_id: string | null;
  customer_id: string;
  service_location_id: string | null;
  customer_message: string | null;
  status: string;
  quote_line_items?: {
    name: string;
    description: string | null;
    sort_order: number;
  }[];
};

export async function approveQuoteAndEnsureWorkOrder(
  supabase: SupabaseClient<any, "public", any>,
  quoteId: string,
  approvedAt = new Date().toISOString(),
): Promise<QuoteWorkflowResult> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, job_id, customer_id, service_location_id, customer_message, status, quote_line_items(name, description, sort_order)")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { ok: false, message: quoteError?.message ?? "Quote not found or no access." };
  }

  const typedQuote = quote as QuoteForApproval;

  if (typedQuote.job_id) {
    const updateResult = await markQuoteApproved(supabase, typedQuote.id, typedQuote.job_id, approvedAt);
    if (!updateResult.ok) {
      return updateResult;
    }

    await moveLinkedJobToAccepted(supabase, typedQuote.job_id);
    return { ok: true, jobId: typedQuote.job_id, createdJob: false };
  }

  const { data: existingJob, error: existingJobError } = await supabase
    .from("jobs")
    .select("id")
    .eq("source_quote_id", typedQuote.id)
    .maybeSingle();

  if (existingJobError) {
    return { ok: false, message: existingJobError.message };
  }

  if (existingJob) {
    const updateResult = await markQuoteApproved(supabase, typedQuote.id, existingJob.id, approvedAt);
    return updateResult.ok ? { ok: true, jobId: existingJob.id, createdJob: false } : updateResult;
  }

  if (!typedQuote.service_location_id) {
    return { ok: false, message: "Add a service location before approving this quote." };
  }

  const { data: createdJob, error: createJobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: typedQuote.customer_id,
      service_location_id: typedQuote.service_location_id,
      source_quote_id: typedQuote.id,
      status: "accepted",
      service_type: "other",
      priority: "normal",
      requested_scope: getWorkOrderScope(typedQuote),
    })
    .select("id")
    .single();

  if (createJobError || !createdJob) {
    if (createJobError?.code === "23505") {
      const { data: duplicateGuardJob, error: duplicateGuardError } = await supabase
        .from("jobs")
        .select("id")
        .eq("source_quote_id", typedQuote.id)
        .single();

      if (duplicateGuardError || !duplicateGuardJob) {
        return { ok: false, message: duplicateGuardError?.message ?? "Could not find the existing work order for this quote." };
      }

      const updateResult = await markQuoteApproved(supabase, typedQuote.id, duplicateGuardJob.id, approvedAt);
      return updateResult.ok ? { ok: true, jobId: duplicateGuardJob.id, createdJob: false } : updateResult;
    }

    return { ok: false, message: createJobError?.message ?? "Could not create the work order from this quote." };
  }

  const updateResult = await markQuoteApproved(supabase, typedQuote.id, createdJob.id, approvedAt);
  return updateResult.ok ? { ok: true, jobId: createdJob.id, createdJob: true } : updateResult;
}

async function markQuoteApproved(
  supabase: SupabaseClient<any, "public", any>,
  quoteId: string,
  jobId: string,
  approvedAt: string,
): Promise<QuoteWorkflowResult> {
  const { error } = await supabase
    .from("quotes")
    .update({ status: "approved", approved_at: approvedAt, job_id: jobId })
    .eq("id", quoteId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, jobId, createdJob: false };
}

async function moveLinkedJobToAccepted(supabase: SupabaseClient<any, "public", any>, jobId: string) {
  const statusesToAccept: JobStatus[] = ["new_lead", "estimate_scheduled", "quoted"];

  await supabase
    .from("jobs")
    .update({ status: "accepted" })
    .eq("id", jobId)
    .in("status", statusesToAccept);
}

function getWorkOrderScope(quote: QuoteForApproval) {
  const lineItems = (quote.quote_line_items ?? [])
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => item.description || item.name)
    .filter(Boolean);

  return [quote.customer_message, ...lineItems].filter(Boolean).join("\n\n") || "Approved quote scope pending work order details.";
}
