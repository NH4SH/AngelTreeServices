import type { JobStatus } from "@/lib/types/database";

export type LinkedJobApprovalState = {
  archived_at: string | null;
  lead_disposition: "active" | "spam" | "archived";
  source_quote_id: string | null;
  status: JobStatus;
  website_submission_id: string | null;
};

type LinkedJobApprovalPlan =
  | { ok: true; restoreArchivedLead: boolean; moveToAccepted: boolean; linkSourceQuote: boolean }
  | { ok: false; message: string };

const preApprovalStatuses: JobStatus[] = ["new_lead", "estimate_scheduled", "quoted"];
const activeWorkOrderStatuses: JobStatus[] = [
  "accepted",
  "scheduled",
  "in_progress",
  "returned_for_correction",
  "completed_pending_review",
  "ready_to_invoice",
  "completed",
  "invoiced",
  "paid",
];

export function getLinkedJobApprovalPlan(
  job: LinkedJobApprovalState,
  quoteId: string,
): LinkedJobApprovalPlan {
  if (job.source_quote_id && job.source_quote_id !== quoteId) {
    return { ok: false, message: "The linked work order already belongs to another approved quote." };
  }

  const moveToAccepted = preApprovalStatuses.includes(job.status);
  const alreadyWorkOrder = activeWorkOrderStatuses.includes(job.status);
  if (!moveToAccepted && !alreadyWorkOrder) {
    return { ok: false, message: "The linked work order is cancelled, lost, or otherwise unavailable for approval." };
  }

  if (!job.archived_at) {
    return {
      ok: true,
      restoreArchivedLead: false,
      moveToAccepted,
      linkSourceQuote: !job.source_quote_id,
    };
  }

  const isAutomaticallyArchivedLead = Boolean(job.website_submission_id)
    && job.lead_disposition === "archived"
    && moveToAccepted;
  if (!isAutomaticallyArchivedLead) {
    return { ok: false, message: "The linked work order is archived. Restore it before approving this quote." };
  }

  return {
    ok: true,
    restoreArchivedLead: true,
    moveToAccepted: true,
    linkSourceQuote: !job.source_quote_id,
  };
}

export const linkedJobPreApprovalStatuses = preApprovalStatuses;
