"use client";

import { reviewLatestCompletion } from "@/lib/actions/job-completion";
import { completionFingerprint, getCompletionRequest, parseCompletionContext, type JobCompletionContext } from "@/lib/jobs/completion-request";
import { formatBusinessDateTime } from "@/lib/business-time";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Play,
  Save,
  Send,
  UserRoundCheck,
} from "lucide-react";
import {
  saveCrewCloseout,
  startCrewJob,
  submitCrewCloseout,
  type CrewCloseoutActionState,
} from "@/app/crew/jobs/[jobId]/actions";
import type {
  CloseoutChecklistStatus,
  CloseoutScopeState,
  CustomerAcknowledgmentStatus,
  JobCloseoutBundle,
  JobStatus,
} from "@/lib/types/database";

const initialActionState: CrewCloseoutActionState = { status: "idle", message: "" };

type ChecklistDraft = {
  id: string;
  completion_status: CloseoutChecklistStatus;
  explanation: string;
};

type ScopeDraft = {
  id: string;
  completion_state: CloseoutScopeState | "";
  exception_note: string;
};

type CloseoutDraft = {
  checklist: ChecklistDraft[];
  scopeItems: ScopeDraft[];
  crewInternalNotes: string;
  customerSummary: string;
  incidentOccurred: "" | "yes" | "no";
  incidentDescription: string;
  additionalWorkRequested: "" | "yes" | "no";
  additionalWorkDescription: string;
  acknowledgmentStatus: CustomerAcknowledgmentStatus | "";
  acknowledgmentName: string;
};

export function CrewJobCloseoutForm({
  actorId,
  initialContext,
  bundle,
  hasActiveJobTimer,
  jobId,
  jobStatus,
}: {
  actorId: string;
  initialContext: JobCompletionContext;
  bundle: JobCloseoutBundle;
  hasActiveJobTimer: boolean;
  jobId: string;
  jobStatus: JobStatus;
}) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(initialContext);
  const [futureConfirmed, setFutureConfirmed] = useState(false);
  const [lastIntent, setLastIntent] = useState("save");
  const [storageError, setStorageError] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [startState, startAction, startPending] = useReliableActionState(startCrewJob, initialActionState);
  const [saveState, saveAction, savePending] = useReliableActionState(saveCrewCloseout, initialActionState);
  const [submitState, submitAction, submitPending] = useReliableActionState(async (previous: CrewCloseoutActionState, form: FormData) => {
    try {
      const fingerprint = await completionFingerprint(JSON.stringify(Array.from(form.entries()).filter(([key]) => key !== "request_id").sort(([a], [b]) => a.localeCompare(b))));
      form.set("request_id", getCompletionRequest(localStorage, actorId, jobId, "crew_closeout", fingerprint, () => crypto.randomUUID()));
    } catch { return { status: "error" as const, message: "Browser storage is unavailable. Enable it and retry so your submission request can be saved safely." }; }
    return submitCrewCloseout(previous, form);
  }, initialActionState);
  const [draft, setDraft] = useState<CloseoutDraft>(() => makeInitialDraft(bundle));
  const [dirty, setDirty] = useState(false);
  const storageKey = `crew-closeout:${jobId}`;
  const editable = ["draft", "returned"].includes(bundle.closeout.status)
    && ["in_progress", "returned_for_correction"].includes(jobStatus);
  const [reviewState, reviewAction, reviewing] = useReliableActionState(async (previous: CrewCloseoutActionState, form: FormData) => {
    const result = await reviewLatestCompletion(previous, form);
    if (result.context) { setReviewed(result.context); setFutureConfirmed(false); }
    return result as CrewCloseoutActionState;
  }, initialActionState);
  const busy = savePending || submitPending || reviewing;

  useEffect(() => {
    if (!editable) return;
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { updatedAt?: string; draft?: CloseoutDraft; context?: JobCompletionContext };
      if (parsed.draft && parsed.updatedAt && parsed.updatedAt > bundle.closeout.updated_at) {
        setDraft(parsed.draft);
        const cachedContext = parseCompletionContext(parsed.context);
        if (cachedContext?.job_id === jobId) setReviewed(cachedContext);
        setDirty(true);
      }
    } catch {
      setStorageError("Your local draft could not be restored. Keep this page open until progress is saved.");
    }
  }, [bundle.closeout.updated_at, editable, storageKey, jobId]);

  useEffect(() => {
    if (!editable || !dirty) return;
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ draft, context: reviewed, updatedAt: new Date().toISOString() })); }
    catch { setStorageError("Browser draft storage is unavailable. Keep this page open until progress is saved."); }
  }, [draft, reviewed, dirty, editable, storageKey]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    if (saveState.status === "success" && saveState.context) {
      setReviewed(saveState.context);
      setFutureConfirmed(false);
      setDirty(false);
      try { window.sessionStorage.removeItem(storageKey); } catch { /* Server acknowledgment already confirmed the save. */ }
      router.refresh();
    }
  }, [router, saveState, storageKey]);

  useEffect(() => {
    if (submitState.submitted) {
      setDirty(false);
      try { window.sessionStorage.removeItem(storageKey); } catch { /* Server acknowledgment already confirmed the save. */ }
      router.refresh();
    }
  }, [router, storageKey, submitState]);

  const progress = useMemo(() => getProgress(draft, bundle), [bundle, draft]);

  if (jobStatus === "scheduled") {
    return (
      <section className="crew-panel closeout-start-panel">
        <div className="crew-panel-heading">
          <span className="crew-panel-icon" aria-hidden="true"><Play size={19} /></span>
          <div>
            <h2>Ready to begin?</h2>
            <p>Start the work order before filling out the closeout.</p>
          </div>
        </div>
        <form action={startAction} className="crew-status-form">
          <input name="job_id" type="hidden" value={jobId} />
          <button disabled={startPending} type="submit">
            <Play aria-hidden="true" size={20} />
            {startPending ? "Starting work..." : "Start work"}
          </button>
        </form>
        <ActionMessage state={startState} />
        <p className="field-note">
          Starting work does not automatically start a timer. Use Time Clock if hours need to be tracked.
        </p>
      </section>
    );
  }

  if (!editable) {
    return <SubmittedCloseout bundle={bundle} hasActiveJobTimer={hasActiveJobTimer} />;
  }

  return (
    <form
      className="crew-closeout-form"
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const intent = submitter?.value === "submit" ? "submit" : "save";
        if (intent === "submit" && reviewed.future_count > 0 && !futureConfirmed) { setConfirmationError("Confirm that all remaining visits, including future dates, are finished before submitting."); return; }
        setConfirmationError("");
        if (intent === "submit" && !window.confirm("Finish all remaining work visits and submit this closeout for office review? Running timers stay open. The office must reopen it before further changes.")) return;
        setLastIntent(intent);
        const form = new FormData(event.currentTarget);
        void (intent === "submit" ? submitAction(form) : saveAction(form));
      }}
    >
      <fieldset className="closeout-fields" disabled={busy} aria-label="Job closeout details">
      <input name="job_id" type="hidden" value={jobId} />
      <input name="expected_revision" type="hidden" value={reviewed.revision} />
      <input name="expected_snapshot" type="hidden" value={JSON.stringify(reviewed.snapshot)} />
      <input name="checklist_json" type="hidden" value={JSON.stringify(draft.checklist)} />
      <input name="scope_items_json" type="hidden" value={JSON.stringify(draft.scopeItems)} />

      <nav className="closeout-progress-nav" aria-label="Closeout progress">
        {[
          ["scope", "Scope"],
          ["photos", "Photos"],
          ["checklist", "Checklist"],
          ["notes", "Notes"],
          ["submit-closeout", "Submit"],
        ].map(([anchor, label], index) => (
          <a href={`#${anchor}`} key={anchor}>
            <span>{index + 1}</span>{label}
          </a>
        ))}
      </nav>

      <section className="crew-panel closeout-overview">
        <div className="crew-panel-heading">
          <span className="crew-panel-icon" aria-hidden="true"><ClipboardCheck size={19} /></span>
          <div>
            <h2>Job closeout</h2>
            <p>{progress.complete} of {progress.total} required steps ready</p>
          </div>
        </div>
        <div aria-label={`${progress.percent}% complete`} className="checklist-progress" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress.percent}>
          <div style={{ width: `${progress.percent}%` }} />
        </div>
        {bundle.closeout.status === "returned" && bundle.closeout.review_notes ? (
          <div className="closeout-return-note" role="status">
            <AlertTriangle aria-hidden="true" size={19} />
            <div><strong>Office requested a correction</strong><p>{bundle.closeout.review_notes}</p></div>
          </div>
        ) : null}
      </section>

      <section className="crew-panel" id="scope">
        <SectionHeading icon={<FileCheck2 size={19} />} title="Scope completion" subtitle="Mark each approved item. Explain anything that changed or was not fully completed." />
        <div className="closeout-scope-list">
          {bundle.scopeItems.map((item) => {
            const value = draft.scopeItems.find((entry) => entry.id === item.id) ?? { id: item.id, completion_state: "" as const, exception_note: "" };
            return (
              <fieldset className="closeout-scope-item" key={item.id}>
                <legend>{item.title}</legend>
                {item.description ? <p className="pre-wrap-copy">{item.description}</p> : null}
                <div className="closeout-choice-grid">
                  {scopeChoices.map((choice) => (
                    <label key={choice.value}>
                      <input
                        checked={value.completion_state === choice.value}
                        name={`scope-${item.id}`}
                        onChange={() => updateScope(item.id, { completion_state: choice.value })}
                        type="radio"
                        value={choice.value}
                      />
                      <span>{choice.label}</span>
                    </label>
                  ))}
                </div>
                {value.completion_state && value.completion_state !== "completed" ? (
                  <label className="closeout-explanation">
                    What happened? <span>Required</span>
                    <textarea
                      onChange={(event) => updateScope(item.id, { exception_note: event.target.value })}
                      placeholder="Example: Access prevented stump grinding. Office follow-up is needed."
                      rows={3}
                      value={value.exception_note}
                    />
                  </label>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="crew-panel" id="checklist">
        <SectionHeading icon={<CheckCircle2 size={19} />} title="Completion checklist" subtitle="Complete every required item. Not applicable items need a short reason." />
        <div className="closeout-checklist-list">
          {bundle.checklist.map((item) => {
            const value = draft.checklist.find((entry) => entry.id === item.id) ?? { id: item.id, completion_status: "pending" as const, explanation: "" };
            return (
              <fieldset className="closeout-checklist-item" key={item.id}>
                <legend>{item.label}</legend>
                <div className="closeout-choice-grid checklist-choice-grid">
                  <label>
                    <input checked={value.completion_status === "complete"} name={`checklist-${item.id}`} onChange={() => updateChecklist(item.id, { completion_status: "complete" })} type="radio" />
                    <span>Complete</span>
                  </label>
                  {item.allow_not_applicable ? (
                    <label>
                      <input checked={value.completion_status === "not_applicable"} name={`checklist-${item.id}`} onChange={() => updateChecklist(item.id, { completion_status: "not_applicable" })} type="radio" />
                      <span>Not applicable</span>
                    </label>
                  ) : null}
                </div>
                {value.completion_status === "not_applicable" ? (
                  <label className="closeout-explanation">
                    Why is this not applicable? <span>Required</span>
                    <input onChange={(event) => updateChecklist(item.id, { explanation: event.target.value })} value={value.explanation} />
                  </label>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="crew-panel" id="notes">
        <SectionHeading icon={<ClipboardCheck size={19} />} title="Completion notes" subtitle="Internal notes stay private. The customer summary may appear on customer documents." />
        <div className="closeout-note-fields">
          <label>
            Crew and office notes
            <textarea name="crew_internal_notes" onChange={(event) => setField("crewInternalNotes", event.target.value)} placeholder="Hazards, equipment issues, follow-up needs, or operational details" rows={5} value={draft.crewInternalNotes} />
            <small>Private. Never shown automatically to the customer.</small>
          </label>
          <label>
            Customer-facing work summary
            <textarea name="customer_summary" onChange={(event) => setField("customerSummary", event.target.value)} placeholder="Describe the completed work in clear, professional language" rows={5} value={draft.customerSummary} />
            <small>Do not include incidents, private crew notes, or pricing changes.</small>
          </label>
        </div>
      </section>

      <section className="crew-panel closeout-safety-panel">
        <SectionHeading icon={<AlertTriangle size={19} />} title="Safety and exceptions" subtitle="These answers are private and help the office review the work correctly." />
        <QuestionBlock
          legend="Was there any property damage, injury, near miss, or unexpected incident?"
          name="incident_occurred"
          onChange={(value) => setField("incidentOccurred", value)}
          value={draft.incidentOccurred}
        />
        {draft.incidentOccurred === "yes" ? (
          <label className="closeout-explanation">
            Describe the incident <span>Required</span>
            <textarea name="incident_description" onChange={(event) => setField("incidentDescription", event.target.value)} rows={4} value={draft.incidentDescription} />
            <small>Upload at least one Issue photo in the photo section. This report remains staff-only.</small>
          </label>
        ) : <input name="incident_description" type="hidden" value="" />}

        <QuestionBlock
          legend="Did the customer request additional work?"
          name="additional_work_requested"
          onChange={(value) => setField("additionalWorkRequested", value)}
          value={draft.additionalWorkRequested}
        />
        {draft.additionalWorkRequested === "yes" ? (
          <label className="closeout-explanation">
            Describe the requested work <span>Required</span>
            <textarea name="additional_work_description" onChange={(event) => setField("additionalWorkDescription", event.target.value)} rows={4} value={draft.additionalWorkDescription} />
            <small>This creates an office follow-up flag. It does not change the accepted quote or add charges.</small>
          </label>
        ) : <input name="additional_work_description" type="hidden" value="" />}
      </section>

      <section className="crew-panel">
        <SectionHeading icon={<UserRoundCheck size={19} />} title="Customer acknowledgment" subtitle="Optional when the customer is present. This is not proof of payment." />
        <fieldset className="acknowledgment-options">
          <legend>Choose one before submitting</legend>
          {acknowledgmentChoices.map((choice) => (
            <label key={choice.value}>
              <input checked={draft.acknowledgmentStatus === choice.value} name="acknowledgment_status" onChange={() => setField("acknowledgmentStatus", choice.value)} type="radio" value={choice.value} />
              <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
            </label>
          ))}
        </fieldset>
        {draft.acknowledgmentStatus === "acknowledged" ? (
          <div className="acknowledgment-copy">
            <p>I acknowledge that the crew has completed the work described above. This acknowledgment confirms completion and does not waive any rights or alter the agreed terms.</p>
            <label>
              Customer or contact name
              <input name="acknowledgment_name" onChange={(event) => setField("acknowledgmentName", event.target.value)} required value={draft.acknowledgmentName} />
            </label>
          </div>
        ) : <input name="acknowledgment_name" type="hidden" value="" />}
      </section>

      <section className="closeout-submit-panel" id="submit-closeout">
        <div>
          <strong>{dirty ? "Unsaved closeout changes" : "Closeout progress is current"}</strong>
          <p>Save anytime. Submit only after photos, scope, checklist, notes, and required answers are complete.</p>
        </div>
        <div>
          <p>Submitting also completes these remaining work visits:</p>
          {reviewed.visits.length ? <ul className="completion-visits">{reviewed.visits.map(v => <li key={`${v.kind}-${v.id}`}>{formatBusinessDateTime(new Date(v.starts_at))}</li>)}</ul> : <p>No open work visits.</p>}
          {reviewed.future_count > 0 ? <label className="completion-confirm"><input type="checkbox" name="confirm_future" checked={futureConfirmed} onChange={e => setFutureConfirmed(e.target.checked)} />All remaining visits, including future dates, are finished.</label> : null}
        </div>
        {storageError ? <p className="form-message error" role="status">{storageError}</p> : null}
        <div className="closeout-submit-actions">
          <button disabled={busy} formNoValidate type="submit" value="save">
            <Save aria-hidden="true" size={20} />
            {savePending ? "Saving..." : "Save progress"}
          </button>
          <button className="primary-closeout-submit" disabled={busy} name="intent" type="submit" value="submit">
            <Send aria-hidden="true" size={20} />
            {submitPending ? "Submitting..." : "Submit job closeout"}
          </button>
        </div>
        {confirmationError ? <p className="form-message error" role="alert">{confirmationError}</p> : null}
        {lastIntent !== "review" ? <ActionMessage state={lastIntent === "submit" ? submitState : saveState} /> : null}
        {lastIntent !== "review" && (lastIntent === "submit" ? submitState : saveState).status === "error" ? <button className="secondary-action" disabled={busy} type="button" onClick={() => { setLastIntent("review"); const form = new FormData(); form.set("job_id", jobId); void reviewAction(form); }}>Review latest visits</button> : null}
        {lastIntent === "review" ? <ActionMessage state={reviewState} /> : null}
      </section>
      </fieldset>
    </form>
  );

  function setField<Key extends keyof CloseoutDraft>(key: Key, value: CloseoutDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function updateChecklist(id: string, patch: Partial<ChecklistDraft>) {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
    setDirty(true);
  }

  function updateScope(id: string, patch: Partial<ScopeDraft>) {
    setDraft((current) => ({
      ...current,
      scopeItems: current.scopeItems.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
    setDirty(true);
  }
}

function SubmittedCloseout({ bundle, hasActiveJobTimer }: { bundle: JobCloseoutBundle; hasActiveJobTimer: boolean }) {
  const statusLabel = bundle.closeout.status === "ready_to_invoice"
    ? "Ready to invoice"
    : bundle.closeout.status === "approved"
      ? "Office approved"
      : "Awaiting office review";

  return (
    <section className="crew-panel submitted-closeout-panel">
      <div className="crew-panel-heading">
        <span className="crew-panel-icon" aria-hidden="true"><CheckCircle2 size={19} /></span>
        <div><h2>{statusLabel}</h2><p>The submitted closeout is locked to protect the job record.</p></div>
      </div>
      <dl className="crew-detail-list">
        <div><dt>Submitted</dt><dd>{bundle.closeout.submitted_at ? formatBusinessDateTime(new Date(bundle.closeout.submitted_at)) : "Not submitted"}</dd></div>
        <div><dt>Submission revision</dt><dd>{bundle.submissions[0]?.revision_number ?? 0}</dd></div>
      </dl>
      {hasActiveJobTimer ? (
        <div className="closeout-timer-warning" role="status">
          <AlertTriangle aria-hidden="true" size={19} />
          <div><strong>Your job timer is still running</strong><p>Clock out when paid work time ends.</p></div>
          <Link href="/crew/time">Open Time Clock</Link>
        </div>
      ) : null}
      <p className="field-note">Contact the office if a correction is needed. Office staff can reopen the closeout with a recorded reason.</p>
    </section>
  );
}

function SectionHeading({ icon, subtitle, title }: { icon: React.ReactNode; subtitle: string; title: string }) {
  return (
    <div className="crew-panel-heading">
      <span className="crew-panel-icon" aria-hidden="true">{icon}</span>
      <div><h2>{title}</h2><p>{subtitle}</p></div>
    </div>
  );
}

function QuestionBlock({
  legend,
  name,
  onChange,
  value,
}: {
  legend: string;
  name: string;
  onChange: (value: "yes" | "no") => void;
  value: "" | "yes" | "no";
}) {
  return (
    <fieldset className="closeout-question">
      <legend>{legend}</legend>
      <div className="closeout-choice-grid yes-no-grid">
        {(["no", "yes"] as const).map((choice) => (
          <label key={choice}>
            <input checked={value === choice} name={name} onChange={() => onChange(choice)} type="radio" value={choice} />
            <span>{choice === "yes" ? "Yes" : "No"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ActionMessage({ state }: { state: CrewCloseoutActionState }) {
  return state.message ? (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
  ) : null;
}

function makeInitialDraft(bundle: JobCloseoutBundle): CloseoutDraft {
  const closeout = bundle.closeout;
  return {
    checklist: bundle.checklist.map((item) => ({
      id: item.id,
      completion_status: item.completion_status,
      explanation: item.explanation ?? "",
    })),
    scopeItems: bundle.scopeItems.map((item) => ({
      id: item.id,
      completion_state: item.completion_state ?? "",
      exception_note: item.exception_note ?? "",
    })),
    crewInternalNotes: closeout.crew_internal_notes ?? "",
    customerSummary: closeout.customer_summary ?? "",
    incidentOccurred: closeout.incident_occurred === null ? "" : closeout.incident_occurred ? "yes" : "no",
    incidentDescription: closeout.incident_description ?? "",
    additionalWorkRequested: closeout.additional_work_requested === null ? "" : closeout.additional_work_requested ? "yes" : "no",
    additionalWorkDescription: closeout.additional_work_description ?? "",
    acknowledgmentStatus: closeout.acknowledgment_status ?? "",
    acknowledgmentName: closeout.acknowledgment_name ?? "",
  };
}

function getProgress(draft: CloseoutDraft, bundle: JobCloseoutBundle) {
  const requiredChecklist = bundle.checklist.filter((item) => item.is_required);
  const checklistComplete = requiredChecklist.filter((item) => {
    const value = draft.checklist.find((entry) => entry.id === item.id);
    return value?.completion_status === "complete"
      || (value?.completion_status === "not_applicable" && Boolean(value.explanation.trim()));
  }).length;
  const scopeComplete = draft.scopeItems.filter((item) => item.completion_state && (item.completion_state === "completed" || item.exception_note.trim())).length;
  const answersComplete = Number(Boolean(draft.incidentOccurred))
    + Number(Boolean(draft.additionalWorkRequested))
    + Number(Boolean(draft.acknowledgmentStatus));
  const total = requiredChecklist.length + draft.scopeItems.length + 3;
  const complete = checklistComplete + scopeComplete + answersComplete;
  return { complete, total, percent: total ? Math.round((complete / total) * 100) : 0 };
}

const scopeChoices: { label: string; value: CloseoutScopeState }[] = [
  { label: "Completed", value: "completed" },
  { label: "Partially completed", value: "partially_completed" },
  { label: "Not completed", value: "not_completed" },
  { label: "Change required", value: "change_required" },
];

const acknowledgmentChoices: { value: CustomerAcknowledgmentStatus; label: string; detail: string }[] = [
  { value: "acknowledged", label: "Customer acknowledged", detail: "Enter the contact name below." },
  { value: "customer_not_present", label: "Customer not present", detail: "No acknowledgment was collected." },
  { value: "customer_declined", label: "Customer declined", detail: "Continue without pressuring the customer." },
];
