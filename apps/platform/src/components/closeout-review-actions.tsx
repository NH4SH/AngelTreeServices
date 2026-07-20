"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CheckCircle2, FileCheck2, RotateCcw, Undo2 } from "lucide-react";
import {
  reviewJobCloseout,
  type CloseoutReviewActionState,
} from "@/lib/actions/job-closeouts";
import type { JobCloseoutStatus } from "@/lib/types/database";

const initialState: CloseoutReviewActionState = { status: "idle", message: "" };

export function CloseoutReviewActions({ jobId, status }: { jobId: string; status: JobCloseoutStatus }) {
  const [state, formAction, pending] = useReliableActionState(reviewJobCloseout, initialState);
  const needsReason = status === "submitted" || ["approved", "ready_to_invoice"].includes(status);

  return (
    <section className="closeout-review-actions">
      <div>
        <h2>Office decision</h2>
        <p>Approval confirms the closeout review. Invoice readiness is a separate action.</p>
      </div>
      <form action={formAction}>
        <input name="job_id" type="hidden" value={jobId} />
        {needsReason ? (
          <label>
            Review note or correction reason
            <textarea name="reason" placeholder="Required when returning or reopening" rows={3} />
          </label>
        ) : null}
        <div className="closeout-review-button-row">
          {status === "submitted" ? (
            <>
              <button disabled={pending} name="review_action" type="submit" value="approve">
                <CheckCircle2 aria-hidden="true" size={19} />
                Approve closeout
              </button>
              <button className="secondary-review-action" disabled={pending} name="review_action" type="submit" value="return">
                <Undo2 aria-hidden="true" size={19} />
                Return to crew
              </button>
            </>
          ) : null}
          {status === "approved" ? (
            <button disabled={pending} name="review_action" type="submit" value="ready">
              <FileCheck2 aria-hidden="true" size={19} />
              Mark ready to invoice
            </button>
          ) : null}
          {["approved", "ready_to_invoice"].includes(status) ? (
            <button
              className="secondary-review-action"
              disabled={pending}
              name="review_action"
              onClick={(event) => {
                if (!window.confirm("Reopen this closeout? The crew will be able to edit it again and the reason will be logged.")) {
                  event.preventDefault();
                }
              }}
              type="submit"
              value="reopen"
            >
              <RotateCcw aria-hidden="true" size={19} />
              Reopen closeout
            </button>
          ) : null}
        </div>
      </form>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}
    </section>
  );
}
