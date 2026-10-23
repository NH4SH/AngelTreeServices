"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, ShieldCheck } from "lucide-react";
import { customerQuoteState } from "@/lib/portal/customer-states";
import { proposalResponseOutcome } from "@/lib/portal/proposal-response-outcome";
import { PortalContact } from "@/components/portal-contact";
import { prepareQuoteChangeAttempt, forgetQuoteChangeAttempt, type QuoteChangeAttempt } from "@/lib/portal/quote-change-attempt";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { approveQuoteByPortalToken, requestQuoteChangesByPortalToken, type PortalTokenActionState } from "@/lib/actions/portal-tokens";
import type { PortalWorkSummary } from "@/lib/portal/quote-presentation";
import "./portal-quote-actions.css";

const initialState: PortalTokenActionState = { ok: false, status: "idle", message: "" };

export function PortalQuoteActions({ quoteStatus, expirationLabel, expectedRevision, rawToken, statusLabel, totalLabel, workSummary }: {
  quoteStatus: string; expirationLabel: string; expectedRevision: number; rawToken: string;
  statusLabel: string; totalLabel: string; workSummary: PortalWorkSummary | null;
}) {
  const id = useId();
  const attemptRef = useRef<QuoteChangeAttempt | undefined>(undefined);
  const submittingRef = useRef(false);
  const interactedRef = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [activeAction, setActiveAction] = useState<"approval" | "changes">("approval");
  const [message, setMessage] = useState("");
  const response = customerQuoteState(quoteStatus);

  const [approvalState, approvalAction, approvalPending] = useReliableActionState(async (previous: PortalTokenActionState, form: FormData) => {
    if (submittingRef.current) return previous;
    submittingRef.current = true;
    interactedRef.current = true;
    setActiveAction("approval");
    try { return await approveQuoteByPortalToken(previous, form); }
    catch { return unconfirmedResponse(); }
    finally { submittingRef.current = false; }
  }, initialState);

  const [changeState, changeAction, changePending] = useReliableActionState(async (previous: PortalTokenActionState, form: FormData) => {
    if (submittingRef.current) return previous;
    submittingRef.current = true;
    interactedRef.current = true;
    setActiveAction("changes");
    setMessage(String(form.get("message") ?? ""));
    try {
      let storage: Storage | null = null;
      try { storage = window.sessionStorage; } catch { /* Keep page-local retry identity. */ }
      const { key, attempt } = await prepareQuoteChangeAttempt(rawToken, String(form.get("message") ?? ""), expectedRevision, storage, attemptRef.current);
      attemptRef.current = attempt;
      form.set("request_id", attempt.requestId);
      form.set("expected_revision", String(attempt.revision));
      const result = await requestQuoteChangesByPortalToken(previous, form);
      if (result.ok || result.requestRejected) {
        forgetQuoteChangeAttempt(key, storage);
        attemptRef.current = undefined;
      }
      return result;
    } catch { return unconfirmedResponse(); }
    finally { submittingRef.current = false; }
  }, initialState);

  const pending = approvalPending || changePending;
  const feedback = activeAction === "approval" ? approvalState : changeState;
  // A freshly loaded closed state is authoritative over any earlier receipt.
  const outcome = proposalResponseOutcome(quoteStatus, approvalState, changeState);
  useEffect(() => {
    if (interactedRef.current && !pending && (outcome || feedback.status === "error")) feedbackRef.current?.focus();
  }, [pending, outcome?.title, feedback]);

  const feedbackId = !pending && feedback.status === "error" ? `${id}-feedback` : undefined;
  return <section className="customer-quote-actions customer-proposal-actions" aria-label="Proposal response">
    <DecisionPanelHeader id={id} expirationLabel={expirationLabel} statusLabel={outcome?.statusLabel ?? statusLabel} totalLabel={totalLabel} workSummary={workSummary} />
    {outcome ? <div className={`customer-quote-confirmation customer-proposal-outcome ${outcome.kind}`} ref={feedbackRef} tabIndex={-1} role="status" aria-atomic="true" aria-labelledby={`${id}-outcome`}>
      <ShieldCheck aria-hidden="true" size={24} /><div><h2 id={`${id}-outcome`}>{outcome.title}</h2><p>{outcome.message}</p><a href={`/portal/quote/${rawToken}`}>View current proposal</a></div>
    </div> : <>
      {response.kind === "changes" ? <section className="customer-quote-waiting"><h2>We have your change request</h2><p>Our office will review it and follow up. You can still review and approve the current proposal using the options below.</p></section> : null}
      <details className="customer-quote-response-options" open={response.kind === "open" || Boolean(feedbackId) || pending}>
        <summary>{response.kind === "changes" ? "Review current proposal options" : "Respond to this proposal"}</summary>
        <div className="customer-quote-actions-intro"><h2>Ready to move forward?</h2><p>Approve the current scope, price and terms, or tell us what needs to change.</p></div>
        {/* Dispatch outside React's form transition so saving controls update immediately. */}
        <form action={approvalAction} onSubmit={event => { event.preventDefault(); void approvalAction(new FormData(event.currentTarget)); }} aria-busy={approvalPending}>
          <input name="token" type="hidden" value={rawToken} /><input name="expected_revision" type="hidden" value={expectedRevision} />
          <button className="customer-approve-button" disabled={pending} type="submit"><CheckCircle2 aria-hidden="true" size={20} />{approvalPending ? "Confirming approval…" : "Approve proposal"}</button>
        </form>
        <p className="customer-quote-next-step">After approval, our office will contact you to confirm scheduling and any final details.</p>
        <form action={changeAction} onSubmit={event => { event.preventDefault(); void changeAction(new FormData(event.currentTarget)); }} className="customer-change-form" aria-busy={changePending} aria-labelledby={`${id}-changes`}>
          <input name="token" type="hidden" value={rawToken} />
          <div className="customer-change-form-copy"><h3 id={`${id}-changes`}>Need an adjustment?</h3></div>
          <label htmlFor={`${id}-message`}>Your request</label>
          <p id={`${id}-help`} className="customer-proposal-help">Tell us what to update (3–1,000 characters). Requesting a change does not approve the work.</p>
          <textarea id={`${id}-message`} maxLength={1000} minLength={3} name="message" required rows={4} value={message} onChange={event => setMessage(event.target.value)} aria-describedby={[`${id}-help`, activeAction === "changes" ? feedbackId : undefined].filter(Boolean).join(" ")} />
          <button className="customer-secondary-button" disabled={pending} type="submit"><MessageSquareText aria-hidden="true" size={18} />{changePending ? "Saving request…" : "Request a change"}</button>
        </form>
      </details>
      <p className="customer-proposal-progress" role="status" aria-atomic="true">{pending ? "Saving your response. Please wait before trying again." : ""}</p>
      {feedbackId ? <div className="customer-proposal-feedback" id={feedbackId} ref={feedbackRef} tabIndex={-1} role="alert" aria-atomic="true">
        <h2>{feedback.requestRejected ? "Please review before responding" : "Your response isn’t confirmed yet"}</h2><p>{feedback.message}</p>
        {!feedback.requestRejected ? <p>{activeAction === "changes" ? "Keep the same message when retrying so we can confirm your earlier request." : "You can retry the same approval to confirm whether it was saved."} You can also check the saved status below or call our office.</p> : null}
        <a href={`/portal/quote/${rawToken}`}>{feedback.requestRejected ? "Refresh and review this proposal" : "Check current proposal status"}</a>
      </div> : null}
    </>}
    {outcome && !response.canRespond ? <PortalContact /> : null}
  </section>;
}

function DecisionPanelHeader({ id, expirationLabel, statusLabel, totalLabel, workSummary }: {
  id: string; expirationLabel: string; statusLabel: string; totalLabel: string; workSummary: PortalWorkSummary | null;
}) {
  return <>
    <dl className="customer-quote-decision-facts"><div><dt>Total</dt><dd>{totalLabel}</dd></div><div><dt>Status</dt><dd>{statusLabel}</dd></div><div><dt>Valid through</dt><dd>{expirationLabel}</dd></div></dl>
    {workSummary ? <section className="customer-quote-work-summary" aria-labelledby={`${id}-scope`}><h2 id={`${id}-scope`}>Work summary</h2>{workSummary.mode === "short" ? <ul>{workSummary.items.map(item => <li key={item}>{item}</li>)}</ul> : <p>{workSummary.message}</p>}<a href="#proposal-scope">View full scope below</a></section> : null}
  </>;
}
function unconfirmedResponse(): PortalTokenActionState {
  return { ok: false, status: "error", message: "We couldn’t confirm the saved response. Your previous click may already have been saved.", requestRejected: false };
}
