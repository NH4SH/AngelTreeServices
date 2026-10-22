"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, XCircle } from "lucide-react";
import {
  prepareChangeOrderApprovalAttempt,
  prepareChangeOrderResponseAttempt,
  forgetChangeOrderResponseAttempt,
  type ChangeOrderApprovalAttempt,
  type ChangeOrderResponseAttempt,
} from "@/lib/portal/change-order-response-attempt";
import { changeOrderResponseOutcome } from "@/lib/portal/change-order-response-outcome";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { approveChangeOrderByPortal, respondToChangeOrderByPortal } from "@/lib/actions/change-orders";
import { initialChangeOrderActionState } from "@/lib/action-states/change-orders";
import "./portal-change-order-actions.css";

type ResponseAction = "approval" | "request_changes" | "decline";

export function PortalChangeOrderActions({ token, expectedUpdatedAt, reviewHash, closedState }: { token: string; expectedUpdatedAt: string; reviewHash: string; closedState?: { title: string; message: string } }) {
  const id = useId();
  const approvalRef = useRef<ChangeOrderApprovalAttempt | undefined>(undefined);
  const attemptRef = useRef<ChangeOrderResponseAttempt | undefined>(undefined);
  const submittingRef = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const interactedRef = useRef(false);
  const [activeAction, setActiveAction] = useState<ResponseAction>("approval");
  const [approverName, setApproverName] = useState("");
  const [message, setMessage] = useState("");

  const [approvalState, approvalAction, approvalPending] = useReliableActionState(async (previous: typeof initialChangeOrderActionState, form: FormData) => {
    // Both forms share this immediate guard, before either pending flag renders.
    if (submittingRef.current) return previous;
    submittingRef.current = true;
    interactedRef.current = true;
    setActiveAction("approval");
    setApproverName(String(form.get("approver_name") ?? ""));
    try {
      const storage = sessionStorageOrNull();
      const { key, attempt } = await prepareChangeOrderApprovalAttempt(token, String(form.get("approver_name") ?? ""), expectedUpdatedAt, reviewHash, storage, approvalRef.current);
      approvalRef.current = attempt;
      form.set("request_id", attempt.requestId);
      form.set("expected_updated_at", attempt.reviewedAt);
      form.set("review_hash", attempt.reviewHash);
      const result = await approveChangeOrderByPortal(previous, form);
      if (result.status === "success" || result.responseRejected) {
        forgetChangeOrderResponseAttempt(key, storage);
        approvalRef.current = undefined;
      }
      return result;
    } catch {
      return unconfirmedResponse();
    } finally {
      submittingRef.current = false;
    }
  }, initialChangeOrderActionState);

  const [responseState, responseAction, responsePending] = useReliableActionState(async (previous: typeof initialChangeOrderActionState, form: FormData) => {
    if (submittingRef.current) return previous;
    submittingRef.current = true;
    interactedRef.current = true;
    setActiveAction(form.get("response_intent") === "decline" ? "decline" : "request_changes");
    setMessage(String(form.get("message") ?? ""));
    try {
      const storage = sessionStorageOrNull();
      const { key, attempt } = await prepareChangeOrderResponseAttempt(token, String(form.get("response_intent") ?? ""), String(form.get("message") ?? ""), expectedUpdatedAt, storage, attemptRef.current);
      attemptRef.current = attempt;
      form.set("request_id", attempt.requestId);
      form.set("expected_updated_at", attempt.reviewedAt);
      const result = await respondToChangeOrderByPortal(previous, form);
      if (result.status === "success" || result.responseRejected) {
        forgetChangeOrderResponseAttempt(key, storage);
        attemptRef.current = undefined;
      }
      return result;
    } catch {
      return unconfirmedResponse();
    } finally {
      submittingRef.current = false;
    }
  }, initialChangeOrderActionState);

  const pending = approvalPending || responsePending;
  const feedback = activeAction === "approval" ? approvalState : responseState;
  // A refreshed server status takes precedence over an older action receipt.
  const outcome = closedState ? { kind: "saved", ...closedState, nextStep: null } : changeOrderResponseOutcome(approvalState, responseState);
  useEffect(() => {
    if (interactedRef.current && !pending && (outcome || feedback.status === "error")) feedbackRef.current?.focus();
  }, [pending, outcome?.title, feedback]);

  if (outcome) return <div className={`customer-quote-confirmation customer-change-order-outcome ${outcome.kind}`} ref={feedbackRef} tabIndex={-1} role="status" aria-atomic="true" aria-labelledby={`${id}-outcome`}>
    <CheckCircle2 size={24} aria-hidden="true" />
    <div><h2 id={`${id}-outcome`}>{outcome.title}</h2><p>{outcome.message}</p>{outcome.nextStep ? <p>{outcome.nextStep}</p> : null}<a href={`/portal/change-order/${token}`}>View current change order</a></div>
  </div>;

  const feedbackId = feedback.status === "error" && !pending ? `${id}-feedback` : undefined;
  return <section className="customer-quote-actions customer-change-order-actions" aria-labelledby={`${id}-decision`}>
    <div className="customer-quote-actions-intro"><h2 id={`${id}-decision`}>Authorize this additional work?</h2><p>Approval adds only the work shown here. Your original approved quote stays unchanged.</p></div>
    {/* Dispatch outside the form transition so saving/disabled feedback renders immediately. */}
    <form action={approvalAction} onSubmit={event => {
      event.preventDefault();
      void approvalAction(new FormData(event.currentTarget));
    }} className="crm-form" aria-busy={approvalPending}>
      <input name="token" type="hidden" value={token} />
      <label htmlFor={`${id}-name`}>Name of person authorizing</label>
      <input id={`${id}-name`} autoComplete="name" maxLength={160} name="approver_name" required value={approverName} onChange={event => setApproverName(event.target.value)} aria-describedby={activeAction === "approval" ? feedbackId : undefined} />
      <button className="customer-approve-button" disabled={pending} type="submit"><CheckCircle2 size={20} aria-hidden="true" />{approvalPending ? "Confirming approval…" : "Approve additional work"}</button>
    </form>
    <form action={responseAction} onSubmit={event => {
      event.preventDefault();
      void responseAction(new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter));
    }} className="customer-change-form" aria-busy={responsePending} aria-labelledby={`${id}-alternatives`}>
      <input name="token" type="hidden" value={token} />
      <h3 id={`${id}-alternatives`}>Need a change or prefer to decline?</h3>
      <label htmlFor={`${id}-message`}>Your message</label>
      <p id={`${id}-message-help`} className="customer-response-help">For changes, tell us what to update (at least 3 characters). A reason is optional when declining.</p>
      <textarea id={`${id}-message`} maxLength={1000} name="message" rows={4} value={message} onChange={event => setMessage(event.target.value)} aria-describedby={[`${id}-message-help`, activeAction !== "approval" ? feedbackId : undefined].filter(Boolean).join(" ")} />
      <div className="customer-response-buttons">
        <button className="customer-secondary-button" disabled={pending} name="response_intent" type="submit" value="request_changes"><MessageSquareText size={18} aria-hidden="true" />{responsePending && activeAction === "request_changes" ? "Saving request…" : "Request changes"}</button>
        <button className="customer-decline-button" disabled={pending} name="response_intent" type="submit" value="decline"><XCircle size={18} aria-hidden="true" />{responsePending && activeAction === "decline" ? "Saving response…" : "Decline additional work"}</button>
      </div>
    </form>
    <p className="customer-response-progress" role="status" aria-atomic="true">{pending ? "Saving your response. Please wait before trying again." : ""}</p>
    {feedbackId ? <div className="customer-response-feedback" id={feedbackId} ref={feedbackRef} tabIndex={-1} role="alert" aria-atomic="true">
      <h3>{feedback.responseRejected ? "Please review before responding" : "Your response isn’t confirmed yet"}</h3>
      <p>{feedback.message}</p>
      {!feedback.responseRejected ? <p>If you retry, keep the same name or message and choose the same response. You can also check its saved status below, or call our office.</p> : null}
      <a href={`/portal/change-order/${token}`}>{feedback.responseRejected ? "Refresh and review this addition" : "Check current status"}</a>
    </div> : null}
  </section>;
}

function sessionStorageOrNull(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

function unconfirmedResponse(): typeof initialChangeOrderActionState {
  return { status: "error", message: "We couldn’t confirm the saved response. Your previous click may already have been saved.", responseRejected: false };
}
