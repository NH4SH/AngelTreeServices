import "server-only";

import { recordActivity } from "@/lib/activity-log";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

type InvoiceableJob = {
  id: string;
  status: string;
  completed_at: string | null;
  completed_by_user_id: string | null;
};

type CompletionResult =
  | { completed: true; warning: null }
  | { completed: false; warning: string };

export async function completeJobAfterInvoice({
  actorUserId,
  invoiceId,
  job,
  supabase,
}: {
  actorUserId: string;
  invoiceId: string;
  job: InvoiceableJob;
  supabase: SupabaseClient;
}): Promise<CompletionResult> {
  const completedAt = job.completed_at ?? new Date().toISOString();

  if (job.status !== "completed") {
    const { data: updatedJob, error } = await supabase
      .from("jobs")
      .update({
        status: "completed",
        completed_at: completedAt,
        completed_by_user_id: job.completed_by_user_id ?? actorUserId,
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Invoice created, but linked job completion failed", {
        invoiceId,
        jobId: job.id,
        error,
      });
      return {
        completed: false,
        warning: "The invoice was created, but the linked work order could not be marked complete.",
      };
    }

    if (!updatedJob) {
      const { data: currentJob } = await supabase
        .from("jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();

      if (currentJob?.status !== "completed") {
        return {
          completed: false,
          warning: "The invoice was created, but the work order changed before it could be marked complete.",
        };
      }
    }
  }

  const { error: scheduleError } = await supabase
    .from("schedule_events")
    .update({ status: "completed" })
    .eq("job_id", job.id)
    .in("status", ["scheduled", "confirmed", "in_progress"]);

  if (scheduleError) {
    console.error("Job completed from invoice, but linked schedule sessions were not updated", {
      invoiceId,
      jobId: job.id,
      scheduleError,
    });
  }

  if (job.status !== "completed") {
    await recordActivity(supabase, {
      actorUserId,
      eventType: "job_completed_from_invoice",
      metadata: {
        from_status: job.status,
        invoice_id: invoiceId,
        to_status: "completed",
      },
      subjectId: job.id,
      subjectType: "job",
    });
  }

  return { completed: true, warning: null };
}
