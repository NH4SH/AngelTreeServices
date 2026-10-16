"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { completeJobWork, reviewLatestCompletion } from "@/lib/actions/job-completion";
import { completionFingerprint, getCompletionRequest, type JobCompletionContext } from "@/lib/jobs/completion-request";
import { formatBusinessDateTime } from "@/lib/business-time";

type State = { status: string; message: string; context?: JobCompletionContext };
export function ExplicitJobCompletionActions({ actorId, initialContext }: { actorId: string; initialContext: JobCompletionContext }) {
  // Keep the version the person reviewed, including while server revalidation rerenders the page.
  const [reviewed, setReviewed] = useState(initialContext);
  const [lastAction, setLastAction] = useState("complete");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, dispatch, pending] = useReliableActionState<State, FormData>(async (previous, form) => {
    try {
      const fingerprint = await completionFingerprint(JSON.stringify([reviewed.revision, reviewed.snapshot, form.get("mode"), form.get("confirm_future"), form.get("reason")]));
      form.set("request_id", getCompletionRequest(localStorage, actorId, reviewed.job_id, String(form.get("mode")), fingerprint, () => crypto.randomUUID()));
    } catch { return { status: "error", message: "Browser storage is unavailable. Enable it and retry so this completion request can be saved safely." }; }
    return completeJobWork(previous, form);
  }, { status: "idle", message: "" });
  const [reviewState, review, reviewing] = useReliableActionState<State, FormData>(async (previous, form) => {
    const result = await reviewLatestCompletion(previous, form);
    if (result.context) { setReviewed(result.context); setConfirmed(false); }
    return result;
  }, { status: "idle", message: "" });
  const busy = pending || reviewing;
  const context = state.status === "success" && state.context ? state.context : reviewed;
  if (context.completed_at && context.visits.length === 0) return <p id="job-completion" className="job-completion-date" role="status"><CheckCircle2 aria-hidden="true" size={18} />Work completed {formatBusinessDateTime(new Date(context.completed_at))}</p>;
  if (["cancelled", "lost", "new_lead", "estimate_scheduled", "quoted", "returned_for_correction"].includes(context.status) || context.closeout_status === "returned")
    return context.closeout_status === "returned" ? <Link className="secondary-action" href={`/admin/jobs/${context.job_id}/closeout`}>Review returned closeout</Link> : null;
  return <details className="job-completion-review" id="job-completion">
    <summary><CheckCircle2 aria-hidden="true" size={18} />Complete work</summary>
    <form aria-busy={busy} onSubmit={event => {
      event.preventDefault();
      const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const form = new FormData(event.currentTarget);
      form.set("mode", button?.value ?? "complete");
      setLastAction("complete");
      void dispatch(form);
    }}>
      <h3>Finish this work order?</h3>
      <p>This closes the remaining work visits. Crew closeout review stays separate. Running timers stay open.</p>
      {context.visits.length ? <ul className="completion-visits">{context.visits.map(visit => <li key={`${visit.kind}-${visit.id}`}><strong>{visit.title}</strong><span>{formatBusinessDateTime(new Date(visit.starts_at))}</span></li>)}</ul> : <p>No open work visits.</p>}
      {context.future_count > 0 ? <label className="completion-confirm"><input disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} name="confirm_future" type="checkbox" required />All remaining visits, including future dates, are finished.</label> : null}
      <label className="completion-note">Office note (optional)<textarea disabled={busy} maxLength={1000} name="reason" onChange={e => setReason(e.target.value)} rows={2} value={reason} /></label>
      <input type="hidden" name="job_id" value={context.job_id} />
      <input type="hidden" name="expected_revision" value={reviewed.revision} />
      <input type="hidden" name="expected_snapshot" value={JSON.stringify(reviewed.snapshot)} />
      <div className="workflow-button-row">
        <button className="primary-action" disabled={busy} name="mode" value="complete" type="submit">{pending ? "Completing…" : "Complete work"}</button>
        {!context.has_invoice ? <button className="secondary-action" disabled={busy} name="mode" value="complete_and_invoice" type="submit">Complete &amp; prepare invoice</button> : null}
      </div>
      <p className="field-note">{context.has_invoice ? "This action creates no invoice and sends nothing to the customer." : "Complete work creates no invoice. Complete & prepare invoice also saves a draft for review. Neither action sends anything to the customer."}</p>
      {lastAction === "complete" && state.status === "error" ? <button className="secondary-action" disabled={busy} type="button" onClick={() => { setLastAction("review"); const form = new FormData(); form.set("job_id", context.job_id); void review(form); }}>{reviewing ? "Loading visits…" : "Review latest visits"}</button> : null}
      {lastAction === "review" && reviewState.message ? <p className={`form-message ${reviewState.status}`} role="status">{reviewState.message}</p> : null}
      {lastAction === "complete" && state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  </details>;
}
