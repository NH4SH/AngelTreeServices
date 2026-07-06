"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, FilePlus2, Send, XCircle } from "lucide-react";
import {
  createInvoiceFromQuote,
  updateInvoiceStatus,
  updateJobStatus,
  updateQuoteStatus,
} from "@/lib/actions/workflow";
import type { InvoiceStatus, JobStatus, QuoteStatus } from "@/lib/types/database";

type ActionState = {
  status: string;
  message: string;
};

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function JobStatusActions({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [state, formAction, pending] = useActionState(updateJobStatus, initialState);
  const next = getNextJobStatus(status);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <form action={formAction} className="inline-action-form">
        <input name="job_id" type="hidden" value={jobId} />
        <input name="next_status" type="hidden" value={next ?? ""} />
        <button disabled={pending || !next} type="submit">
          <CheckCircle2 aria-hidden="true" size={18} />
          {next ? `Move to ${next.replace("_", " ")}` : "No status action"}
        </button>
      </form>
    </WorkflowActionPanel>
  );
}

export function QuoteStatusActions({ quoteId }: { quoteId: string }) {
  const [state, formAction, pending] = useActionState(updateQuoteStatus, initialState);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-button-row">
        <QuoteStatusButton disabled={pending} formAction={formAction} icon="send" quoteId={quoteId} status="sent" />
        <QuoteStatusButton disabled={pending} formAction={formAction} icon="check" quoteId={quoteId} status="approved" />
        <QuoteStatusButton
          disabled={pending}
          formAction={formAction}
          icon="change"
          quoteId={quoteId}
          status="change_requested"
        />
      </div>
    </WorkflowActionPanel>
  );
}

export function CreateInvoiceFromQuoteAction({ quoteId }: { quoteId: string }) {
  const [state, formAction, pending] = useActionState(createInvoiceFromQuote, initialState);

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

export function InvoiceStatusActions({ invoiceId }: { invoiceId: string }) {
  const [state, formAction, pending] = useActionState(updateInvoiceStatus, initialState);

  return (
    <WorkflowActionPanel message={state.message} status={state.status}>
      <div className="workflow-button-row">
        <InvoiceStatusButton disabled={pending} formAction={formAction} invoiceId={invoiceId} status="sent" />
        <InvoiceStatusButton disabled={pending} formAction={formAction} invoiceId={invoiceId} status="void" />
        <button disabled type="button">
          <FilePlus2 aria-hidden="true" size={18} />
          Record payment later
        </button>
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
  icon: "send" | "check" | "change";
  quoteId: string;
  status: QuoteStatus;
}) {
  const Icon = icon === "send" ? Send : icon === "check" ? CheckCircle2 : XCircle;
  return (
    <form action={formAction} className="inline-action-form">
      <input name="quote_id" type="hidden" value={quoteId} />
      <input name="next_status" type="hidden" value={status} />
      <button disabled={disabled} type="submit">
        <Icon aria-hidden="true" size={18} />
        {status === "approved" ? "Mark accepted" : status.replace("_", " ")}
      </button>
    </form>
  );
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
  const Icon = status === "sent" ? Send : XCircle;
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
