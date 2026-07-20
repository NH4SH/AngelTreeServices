"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import type { ReactNode } from "react";
import { CheckCircle2, FilePlus2, MessageSquareWarning, Send, XCircle } from "lucide-react";
import Link from "next/link";
import {
  createInvoiceFromJob,
  createInvoiceFromQuote,
  markInvoiceSentManually,
  markQuoteSentManually,
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

export function CreateInvoiceFromQuoteAction({ quoteId }: { quoteId: string }) {
  const [state, formAction, pending] = useReliableActionState(createInvoiceFromQuote, initialState);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form action={formAction} className="inline-action-form">
        <input name="quote_id" type="hidden" value={quoteId} />
        <button disabled={pending} type="submit">
          <FilePlus2 aria-hidden="true" size={18} />
          Create invoice from quote
        </button>
      </form>
    </WorkflowActionPanel>
  );
}

export function CreateInvoiceFromJobAction({ jobId, operationalStatus }: { jobId: string; operationalStatus?: string }) {
  const [state, formAction, pending] = useReliableActionState(createInvoiceFromJob, initialState);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form
        action={formAction}
        className="inline-action-form"
        onSubmit={(event) => {
          if (operationalStatus && !window.confirm(`This job is currently ${operationalStatus.toLowerCase()}. Create a draft invoice now? The invoice will not be sent automatically.`)) {
            event.preventDefault();
          }
        }}
      >
        <input name="job_id" type="hidden" value={jobId} />
        <button disabled={pending} type="submit">
          <FilePlus2 aria-hidden="true" size={18} />
          {pending ? "Creating invoice..." : "Create invoice"}
        </button>
      </form>
      {state.invoiceId ? (
        <Link className="secondary-action" href={`/admin/invoices/${state.invoiceId}`}>
          Open existing invoice
        </Link>
      ) : null}
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
  const [state, formAction, pending] = useReliableActionState(updateInvoiceStatus, initialState);

  if (["paid", "void"].includes(status)) {
    return null;
  }

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-button-row">
        <InvoiceStatusButton disabled={pending} formAction={formAction} invoiceId={invoiceId} status="void" />
      </div>
    </WorkflowActionPanel>
  );
}

const manualInvoiceSentConfirmation =
  "Mark this invoice as sent? Use this only if you already sent it outside the CRM. This will not email the customer.";

export function ManualInvoiceSentAction({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: InvoiceStatus;
}) {
  const [state, formAction, pending] = useReliableActionState(markInvoiceSentManually, initialState);

  if (status !== "draft") {
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
    <form action={formAction} className="inline-action-form">
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <input name="next_status" type="hidden" value={status} />
      <button disabled={disabled} type="submit">
        <Icon aria-hidden="true" size={18} />
        Mark {status}
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
