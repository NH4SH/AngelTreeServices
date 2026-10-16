"use client";

import { formatBusinessDateTime } from "@/lib/business-time";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { getInvoiceGenerationRequest } from "@/lib/invoices/generation-request";
import type { ReactNode } from "react";
import { CheckCircle2, FilePlus2, MessageSquareWarning, RotateCcw, Send, XCircle } from "lucide-react";
import Link from "next/link";
import {
  createInvoiceFromJob,
  createInvoiceFromQuote,
  markInvoiceSentManually,
  markQuoteSentManually,
  restoreVoidedInvoice,
  reviewInvoicePaymentCheckout,
  updateInvoiceStatus,
  updateJobStatus,
  updateQuoteStatus,
} from "@/lib/actions/workflow";
import type { InvoiceStatus, JobStatus, QuoteStatus } from "@/lib/types/database";

type ActionState = {
  invoiceId?: string;
  status: string;
  message: string;
};

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function JobStatusActions({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [state, formAction, pending] = useReliableActionState(updateJobStatus, initialState);
  const next = getNextJobStatus(status);

  if (!next) {
    return null;
  }

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form action={formAction} className="inline-action-form">
        <input name="job_id" type="hidden" value={jobId} />
        <input name="next_status" type="hidden" value={next ?? ""} />
        <button disabled={pending} type="submit">
          <CheckCircle2 aria-hidden="true" size={18} />
          {next === "completed" ? "Mark work complete" : `Move to ${next.replace("_", " ")}`}
        </button>
      </form>
    </WorkflowActionPanel>
  );
}

const completeJobConfirmation =
  "Mark this job complete? This records the completion time and updates its active schedule sessions. It will not create or send an invoice.";

export function MarkJobCompleteAction({
  completedAt,
  jobId,
  status,
}: {
  completedAt?: string | null;
  jobId: string;
  status: JobStatus;
}) {
  const [state, formAction, pending] = useReliableActionState(updateJobStatus, initialState);

  if (["completed", "completed_pending_review", "ready_to_invoice", "invoiced", "paid"].includes(status)) {
    return <p className="job-completion-date"><CheckCircle2 aria-hidden="true" size={18} />Completed {completedAt ? formatBusinessDateTime(new Date(completedAt)) : "recently"}</p>;
  }

  if (!["scheduled", "in_progress"].includes(status)) {
    return null;
  }

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form
        action={formAction}
        className="inline-action-form"
        onSubmit={(event) => {
          if (!window.confirm(completeJobConfirmation)) event.preventDefault();
        }}
      >
        <input name="job_id" type="hidden" value={jobId} />
        <input name="next_status" type="hidden" value="completed" />
        <button className="job-complete-action" disabled={pending} type="submit">
          <CheckCircle2 aria-hidden="true" size={18} />
          {pending ? "Completing..." : "Mark complete"}
        </button>
      </form>
    </WorkflowActionPanel>
  );
}

export function QuoteStatusActions({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const [state, formAction, pending] = useReliableActionState(updateQuoteStatus, initialState);
  const isClosed = ["approved", "declined", "expired", "cancelled"].includes(status);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-button-row">
        <QuoteStatusButton disabled={pending || status === "approved"} formAction={formAction} icon="check" quoteId={quoteId} status="approved" />
        <QuoteStatusButton
          disabled={pending || isClosed}
          formAction={formAction}
          icon="change"
          quoteId={quoteId}
          status="change_requested"
        />
        <QuoteStatusButton disabled={pending || isClosed} formAction={formAction} icon="decline" quoteId={quoteId} status="declined" />
      </div>
    </WorkflowActionPanel>
  );
}

const manualSentConfirmation =
  "Mark this quote as sent? Use this only if you already sent the quote outside the CRM. This will not email the customer.";

export function ManualQuoteSentAction({
  quoteId,
  status,
}: {
  quoteId: string;
  status: QuoteStatus;
}) {
  const [state, formAction, pending] = useReliableActionState(markQuoteSentManually, initialState);
  const canMarkSent = status === "draft" || status === "change_requested";

  if (!canMarkSent) {
    return null;
  }

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-override">
        <div>
          <strong>Manual override</strong>
          <p>Use this only when the quote was delivered outside the CRM.</p>
        </div>
        <form
          action={formAction}
          className="inline-action-form"
          onSubmit={(event) => {
            if (!window.confirm(manualSentConfirmation)) {
              event.preventDefault();
            }
          }}
        >
          <input name="quote_id" type="hidden" value={quoteId} />
          <button disabled={pending} type="submit">
            <Send aria-hidden="true" size={18} />
            {pending ? "Marking sent..." : "Mark as sent"}
          </button>
        </form>
      </div>
    </WorkflowActionPanel>
  );
}

export function CreateInvoiceFromQuoteAction({ quoteId, actorId }: { quoteId: string; actorId: string }) {
  return <GenerateInvoiceAction actorId={actorId} source="quote" sourceId={quoteId} />;
}

export function CreateInvoiceFromJobAction({ jobId, actorId, operationalStatus, approvedAdditionCount = 0 }: {
  jobId: string; actorId: string; operationalStatus?: string; approvedAdditionCount?: number;
}) {
  return <GenerateInvoiceAction actorId={actorId} source="job" sourceId={jobId} operationalStatus={operationalStatus} approvedAdditionCount={approvedAdditionCount} />;
}

function GenerateInvoiceAction({ actorId, source, sourceId, operationalStatus, approvedAdditionCount = 0 }: {
  actorId: string; source: "job" | "quote"; sourceId: string; operationalStatus?: string; approvedAdditionCount?: number;
}) {
  const [state, dispatch, pending] = useReliableActionState(async (previous: ActionState, form: FormData) => {
    try {
      form.set("request_id", getInvoiceGenerationRequest(localStorage, actorId, `${source}.${sourceId}`, () => crypto.randomUUID()));
    } catch {
      return { status: "error", message: "Browser storage is unavailable. Enable it and retry so this invoice request can be saved safely." };
    }
    return source === "job" ? createInvoiceFromJob(previous, form) : createInvoiceFromQuote(previous, form);
  }, initialState);
  const preview = `Create a draft invoice${approvedAdditionCount ? ` including ${approvedAdditionCount} approved addition${approvedAdditionCount === 1 ? "" : "s"}` : " and any approved additions"} and mark the work order complete. It will not be sent automatically.`;
  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form action={dispatch} className="inline-action-form" aria-busy={pending} onSubmit={(event) => {
        if (!window.confirm(`${operationalStatus ? `This job is currently ${operationalStatus.toLowerCase()}. ` : ""}${preview} Continue?`)) event.preventDefault();
      }}>
        <input name={`${source}_id`} type="hidden" value={sourceId} />
        <button disabled={pending} type="submit">
          <FilePlus2 aria-hidden="true" size={18} />
          {pending ? "Creating invoice…" : source === "quote" ? "Create invoice from quote" : "Create invoice"}
        </button>
      </form>
      {state.invoiceId ? <Link className="secondary-action" href={`/admin/invoices/${state.invoiceId}`}>Open existing invoice</Link> : null}
    </WorkflowActionPanel>
  );
}

export function InvoiceStatusActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: InvoiceStatus;
}) {
  if (status === "void") {
    return <RestoreVoidedInvoiceAction invoiceId={invoiceId} />;
  }

  if (status === "paid") {
    return null;
  }

  return <VoidInvoiceAction invoiceId={invoiceId} />;
}

function VoidInvoiceAction({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useReliableActionState(updateInvoiceStatus, initialState);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-button-row">
        <InvoiceStatusButton disabled={pending} formAction={formAction} invoiceId={invoiceId} status="void" />
      </div>
    </WorkflowActionPanel>
  );
}

export type InvoiceCheckoutReviewRow = {
  id: string;
  payment_channel: string;
  status: string;
  provider_reference: string | null;
};

export function InvoiceCheckoutReview({ invoiceId, attempts }: { invoiceId: string; attempts: InvoiceCheckoutReviewRow[] }) {
  const [state, formAction, pending] = useReliableActionState(reviewInvoicePaymentCheckout, initialState);
  if (!attempts.length) return null;
  return (
    <details className="workflow-override">
      <summary>Payment checkout needs review?</summary>
      <p>Verify and close an unpaid checkout before retrying an invoice action. Payments already submitted or recorded will stay protected.</p>
      <WorkflowActionPanel message={state.message} status={state.status}>
        <form action={formAction} className="invoice-checkout-review-form" onSubmit={(event) => {
          if (!window.confirm("Verify this payment attempt and close it only if it is unpaid? The invoice and payment history will be retained. No email will be sent.")) event.preventDefault();
        }}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <label className="review-field">Payment attempt
            <select name="reservation_id" required disabled={pending}>
              {attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>
                {attempt.payment_channel.toUpperCase()} · {attempt.status.replaceAll("_", " ")} · {attempt.id.slice(0, 8)}
              </option>)}
            </select>
          </label>
          <label className="review-field">Missing Stripe reference (optional)
            <input name="provider_reference" disabled={pending} autoComplete="off" maxLength={250} placeholder="cs_… or pi_…" aria-describedby="checkout-review-help" />
          </label>
          <p id="checkout-review-help">Leave this blank when the reference is already saved. For an interrupted payment, copy its reference from Stripe. It must match this exact payment attempt; older attempts without a matching reference need manual investigation.</p>
          <button className="secondary-action" disabled={pending} type="submit">{pending ? "Verifying payment…" : "Verify unpaid checkout"}</button>
        </form>
      </WorkflowActionPanel>
    </details>
  );
}

function RestoreVoidedInvoiceAction({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useReliableActionState(restoreVoidedInvoice, initialState);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form
        action={formAction}
        className="inline-action-form"
        onSubmit={(event) => {
          if (!window.confirm("Unvoid this invoice? Its remaining balance will become active again. No email will be sent.")) {
            event.preventDefault();
          }
        }}
      >
        <input name="invoice_id" type="hidden" value={invoiceId} />
        <button className="secondary-action" disabled={pending} type="submit">
          <RotateCcw aria-hidden="true" size={18} />
          {pending ? "Restoring invoice..." : "Unvoid invoice"}
        </button>
      </form>
    </WorkflowActionPanel>
  );
}

const manualInvoiceSentConfirmation =
  "Mark this invoice as sent? Use this only if you already sent it outside the CRM. This will not email the customer.";

export function ManualInvoiceSentAction({
  invoiceId,
  sentAt,
  status,
}: {
  invoiceId: string;
  sentAt: string | null;
  status: InvoiceStatus;
}) {
  const [state, formAction, pending] = useReliableActionState(markInvoiceSentManually, initialState);

  if (sentAt || status === "void") {
    return null;
  }

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-override">
        <div>
          <strong>Sent outside the CRM?</strong>
          <p>Record delivery without sending another email.</p>
        </div>
        <form
          action={formAction}
          className="inline-action-form"
          onSubmit={(event) => {
            if (!window.confirm(manualInvoiceSentConfirmation)) {
              event.preventDefault();
            }
          }}
        >
          <input name="invoice_id" type="hidden" value={invoiceId} />
          <button disabled={pending} type="submit">
            <Send aria-hidden="true" size={18} />
            {pending ? "Marking sent..." : "Mark as sent"}
          </button>
        </form>
      </div>
    </WorkflowActionPanel>
  );
}

function WorkflowActionPanel({
  children,
  message,
  status,
}: {
  children: ReactNode;
  message?: string;
  status?: string;
}) {
  return (
    <div className="workflow-action-panel">
      {children}
      {message ? (
        <p className={`form-message ${status}`} role={status === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

function QuoteStatusButton({
  disabled,
  formAction,
  icon,
  quoteId,
  status,
}: {
  disabled: boolean;
  formAction: (payload: FormData) => void;
  icon: "check" | "change" | "decline";
  quoteId: string;
  status: QuoteStatus;
}) {
  const Icon = icon === "check" ? CheckCircle2 : icon === "change" ? MessageSquareWarning : XCircle;
  return (
    <form action={formAction} className="inline-action-form">
      <input name="quote_id" type="hidden" value={quoteId} />
      <input name="next_status" type="hidden" value={status} />
      <button disabled={disabled} type="submit">
        <Icon aria-hidden="true" size={18} />
        {getQuoteActionLabel(status)}
      </button>
    </form>
  );
}

function getQuoteActionLabel(status: QuoteStatus) {
  if (status === "approved") {
    return "Approve and create work order";
  }

  if (status === "change_requested") {
    return "Mark change requested";
  }

  if (status === "declined") {
    return "Mark declined";
  }

  return status.replace("_", " ");
}

function InvoiceStatusButton({
  disabled,
  formAction,
  invoiceId,
  status,
}: {
  disabled: boolean;
  formAction: (payload: FormData) => void;
  invoiceId: string;
  status: InvoiceStatus;
}) {
  const Icon = XCircle;
  return (
    <form action={formAction} className="inline-action-form" onSubmit={(event) => {
      if (!window.confirm("Void this invoice? Unpaid checkouts will be closed and pending reminders cancelled. History will be kept. Payments already submitted or recorded will block voiding.")) event.preventDefault();
    }}>
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <input name="next_status" type="hidden" value={status} />
      <button disabled={disabled} type="submit">
        <Icon aria-hidden="true" size={18} />
        {disabled ? "Checking payments…" : "Void invoice"}
      </button>
    </form>
  );
}

function getNextJobStatus(status: JobStatus) {
  const transitions: Partial<Record<JobStatus, JobStatus>> = {
    new_lead: "estimate_scheduled",
    estimate_scheduled: "quoted",
    accepted: "scheduled",
    scheduled: "in_progress",
    in_progress: "completed",
  };

  return transitions[status] ?? null;
}
