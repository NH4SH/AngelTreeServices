import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordActivity } from "@/lib/activity-log";
import { cancelPendingCommunications } from "@/lib/communications/queue";
import type { JobStatus } from "@/lib/types/database";

type QuoteWorkflowResult =
  | { ok: true; jobId: string; createdJob: boolean }
  | { ok: false; message: string };

type QuoteForApproval = {
  id: string;
  job_id: string | null;
  customer_id: string | null;
  organization_id: string | null;
  approval_contact_id: string | null;
  recipient_contact_id: string | null;
  service_location_id: string | null;
  customer_message: string | null;
  debris_handling: string | null;
  debris_handling_notes: string | null;
  recurring_service_plan_id: string | null;
  recurring_occurrence_id: string | null;
  status: string;
  quote_line_items?: {
    name: string;
    description: string | null;
    id: string;
    material_id: string | null;
    quantity: number;
    sort_order: number;
  }[];
};

export async function approveQuoteAndEnsureWorkOrder(
  supabase: SupabaseClient<any, "public", any>,
  quoteId: string,
  approvedAt = new Date().toISOString(),
  actorUserId: string | null = null,
): Promise<QuoteWorkflowResult> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, job_id, customer_id, organization_id, approval_contact_id, recipient_contact_id, service_location_id, customer_message, debris_handling, debris_handling_notes, recurring_service_plan_id, recurring_occurrence_id, status, quote_line_items(id, name, description, material_id, quantity, sort_order)")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { ok: false, message: quoteError?.message ?? "Quote not found or no access." };
  }

  const typedQuote = quote as QuoteForApproval;
  const approvableStatuses = ["draft", "sent", "change_requested", "approved"];

  if (!approvableStatuses.includes(typedQuote.status)) {
    return { ok: false, message: "Only an open quote can be approved." };
  }

  if (typedQuote.job_id) {
    const updateResult = await markQuoteApproved(supabase, typedQuote.id, typedQuote.job_id, approvedAt);
    if (!updateResult.ok) {
      return updateResult;
    }

    await moveLinkedJobToAccepted(supabase, typedQuote.job_id);
    await logQuoteApproval(supabase, typedQuote, actorUserId, false);
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
    if (updateResult.ok) {
      await logQuoteApproval(supabase, typedQuote, actorUserId, false);
    }
    return updateResult.ok ? { ok: true, jobId: existingJob.id, createdJob: false } : updateResult;
  }

  if (!typedQuote.service_location_id) {
    return { ok: false, message: "Add a service location before approving this quote." };
  }

  const { data: createdJob, error: createJobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: typedQuote.customer_id,
      organization_id: typedQuote.organization_id,
      property_manager_contact_id: typedQuote.approval_contact_id ?? typedQuote.recipient_contact_id,
      service_location_id: typedQuote.service_location_id,
      source_quote_id: typedQuote.id,
      status: "accepted",
      service_type: "other",
      priority: "normal",
      requested_scope: getWorkOrderScope(typedQuote),
      debris_handling: typedQuote.debris_handling,
      debris_handling_notes: typedQuote.debris_handling_notes,
      recurring_service_plan_id: typedQuote.recurring_service_plan_id,
      recurring_occurrence_id: typedQuote.recurring_occurrence_id,
      recurring_authorization_source: typedQuote.recurring_occurrence_id ? "approved_renewal_quote" : null,
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
      if (updateResult.ok) {
        await logQuoteApproval(supabase, typedQuote, actorUserId, false);
      }
      return updateResult.ok ? { ok: true, jobId: duplicateGuardJob.id, createdJob: false } : updateResult;
    }

    return { ok: false, message: createJobError?.message ?? "Could not create the work order from this quote." };
  }

  const updateResult = await markQuoteApproved(supabase, typedQuote.id, createdJob.id, approvedAt);
  if (updateResult.ok) {
    await recordActivity(supabase, {
      actorUserId,
      eventType: "work_order_created",
      metadata: { source_quote_id: typedQuote.id },
      subjectId: createdJob.id,
      subjectType: "job",
    });
    await logQuoteApproval(supabase, typedQuote, actorUserId, true);
  }
  return updateResult.ok ? { ok: true, jobId: createdJob.id, createdJob: true } : updateResult;
}

async function markQuoteApproved(
  supabase: SupabaseClient<any, "public", any>,
  quoteId: string,
  jobId: string,
  approvedAt: string,
): Promise<QuoteWorkflowResult> {
  const { data, error } = await supabase
    .from("quotes")
    .update({ status: "approved", approved_at: approvedAt, job_id: jobId })
    .eq("id", quoteId)
    .in("status", ["draft", "sent", "change_requested", "approved"])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Only an open quote can be approved." };
  }

  await cancelPendingCommunications(supabase, { quoteId }, "Quote was approved and converted to a work order.");
  const materialSyncError = await syncQuoteOperationsToJob(supabase, quoteId, jobId);
  if (materialSyncError) {
    console.error("Approved quote material plan could not fully copy to work order", { quoteId, jobId, error: materialSyncError });
  }

  return { ok: true, jobId, createdJob: false };
}

async function syncQuoteOperationsToJob(
  supabase: SupabaseClient<any, "public", any>,
  quoteId: string,
  jobId: string,
) {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("debris_handling, debris_handling_notes, recurring_service_plan_id, recurring_occurrence_id, quote_line_items(id, material_id, quantity)")
    .eq("id", quoteId)
    .single();
  if (error || !quote) return error?.message ?? "Quote operations were unavailable.";

  const { error: jobError } = await supabase.from("jobs").update({
    debris_handling: quote.debris_handling,
    debris_handling_notes: quote.debris_handling_notes,
    recurring_service_plan_id: quote.recurring_service_plan_id,
    recurring_occurrence_id: quote.recurring_occurrence_id,
    recurring_authorization_source: quote.recurring_occurrence_id ? "approved_renewal_quote" : null,
  }).eq("id", jobId);
  if (jobError) return jobError.message;

  if (quote.recurring_occurrence_id) {
    const { error: occurrenceError } = await supabase.from("recurring_service_occurrences").update({ status: "approved", work_order_id: jobId, renewal_quote_id: quoteId }).eq("id", quote.recurring_occurrence_id);
    if (occurrenceError) return occurrenceError.message;
  }

  const lines = (quote.quote_line_items ?? []).filter((line: any) => line.material_id);
  if (!lines.length) return null;
  const materialIds = [...new Set(lines.map((line: any) => line.material_id as string))];
  const { data: materials, error: materialsError } = await supabase.from("material_catalog").select("id, default_unit").in("id", materialIds);
  if (materialsError) return materialsError.message;

  for (const line of lines as any[]) {
    const unit = materials?.find((material: any) => material.id === line.material_id)?.default_unit;
    if (!unit) continue;
    const { data: existingQuoteRequirement, error: quoteRequirementError } = await supabase
      .from("quote_material_requirements")
      .select("id")
      .eq("quote_id", quoteId)
      .eq("quote_line_item_id", line.id)
      .maybeSingle();
    if (quoteRequirementError) return quoteRequirementError.message;
    let quoteRequirementId = existingQuoteRequirement?.id;
    if (!quoteRequirementId) {
      const { data: created, error: createError } = await supabase.from("quote_material_requirements").insert({
        quote_id: quoteId,
        quote_line_item_id: line.id,
        material_id: line.material_id,
        planned_quantity: line.quantity,
        unit,
        is_estimated: true,
        notes: "Copied from the approved quote line. Review before reserving inventory.",
      }).select("id").single();
      if (createError || !created) return createError?.message ?? "Could not create quote material plan.";
      quoteRequirementId = created.id;
    }
    const { error: jobRequirementError } = await supabase.from("job_material_requirements").upsert({
      job_id: jobId,
      material_id: line.material_id,
      source_quote_requirement_id: quoteRequirementId,
      planned_quantity: line.quantity,
      unit,
      is_estimated: true,
      notes: "Copied from approved quote; no stock was used or reserved automatically.",
    }, { onConflict: "job_id,source_quote_requirement_id" });
    if (jobRequirementError) return jobRequirementError.message;
  }
  return null;
}

async function logQuoteApproval(
  supabase: SupabaseClient<any, "public", any>,
  quote: QuoteForApproval,
  actorUserId: string | null,
  createdWorkOrder: boolean,
) {
  if (quote.status === "approved") {
    return;
  }

  await recordActivity(supabase, {
    actorUserId,
    eventType: "quote_approved",
    metadata: { work_order_created: createdWorkOrder },
    subjectId: quote.id,
    subjectType: "quote",
  });
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
