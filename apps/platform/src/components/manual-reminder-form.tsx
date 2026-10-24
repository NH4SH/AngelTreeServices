"use client";

import { useEffect, useRef, useState } from "react";
import { MailPlus, Send } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { formatBusinessDateTime, parseBusinessDateTime } from "@/lib/business-time";
import { checkManualReminder, scheduleCommunication, sendCommunicationNow, type CommunicationActionState } from "@/lib/actions/communications";
import {
  canPrepareAnotherReminder, captureManualReminder, isReminderUuid, loadManualReminderAttempt, manualReminderForm,
  manualReminderStatuses, manualReminderStorageKey, type ManualReminderAttempt, type ManualReminderMode,
} from "@/lib/communications/manual-reminder-request";

const initial: CommunicationActionState = { status: "idle", message: "" };
export function ManualReminderForm({ actorId, communicationType, enabled, mode, recipient, recordId, recordType }: {
  actorId: string; communicationType: string; enabled: boolean; mode: ManualReminderMode;
  recipient: { email: string; source: "customer" | "organization" } | null; recordId: string; recordType: string;
}) {
  const key = manualReminderStorageKey(actorId, recordType, recordId, communicationType, mode);
  const [attempt, setAttempt] = useState<ManualReminderAttempt | null>(null), attemptRef = useRef<ManualReminderAttempt | null>(null);
  const [ready, setReady] = useState(false), [editing, setEditing] = useState(false), [problem, setProblem] = useState("");
  const submitting = useRef(false);
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    try {
      const saved = loadManualReminderAttempt(localStorage.getItem(key), { record_type: recordType, record_id: recordId, communication_type: communicationType }, mode);
      attemptRef.current = saved; setAttempt(saved); setReady(true);
    } catch { setProblem("Saved reminder details are unavailable. Check browser storage and the reminder list before creating another reminder."); }
  }, [key, recordType, recordId, communicationType, mode]);
  function remember(value: ManualReminderAttempt) {
    localStorage.setItem(key, JSON.stringify(value)); attemptRef.current = value; setAttempt(value);
  }
  const [state, dispatch, pending] = useReliableActionState(async (_previous: CommunicationActionState, form: FormData) => {
    const result = form.get("check_only") === "1" ? await checkManualReminder(_previous, form)
      : mode === "send" ? await sendCommunicationNow(_previous, form) : await scheduleCommunication(_previous, form);
    const current = attemptRef.current;
    if (current && result.requestRecorded && result.requestId === current.requestId && isReminderUuid(result.reminderId)
      && result.reminderStatus && manualReminderStatuses.includes(result.reminderStatus)) {
      remember({ ...current, reminderId: result.reminderId, reminderStatus: result.reminderStatus });
    }
    setShowResult(true); return result;
  }, initial);
  async function submit(form: FormData) {
    if (!ready || submitting.current || !enabled) return;
    if (mode === "send" && !window.confirm("Send this customer reminder now? Retrying checks the saved request and existing delivery status before sending.")) return;
    submitting.current = true;
    try {
      const previous = attemptRef.current;
      const saved: ManualReminderAttempt = previous && !editing ? previous : {
        version: 1, requestId: previous?.requestId ?? crypto.randomUUID(), fields: captureManualReminder(form),
      };
      if (mode === "schedule" && (!previous || editing)) {
        const date = parseBusinessDateTime(saved.fields.scheduled_for);
        if (!date || date.getTime() < Date.now() - 60_000) { setProblem("Choose a future date and time before scheduling."); return; }
      }
      // Save before dispatch; editing an uncertain request keeps its identity.
      remember(saved); setEditing(false); setProblem(""); setShowResult(false);
      await dispatch(manualReminderForm(saved));
    } catch { setProblem("Keep this reminder request. Its result could not be confirmed; check storage and the reminder list before retrying."); }
    finally { submitting.current = false; }
  }
  async function check() {
    if (submitting.current || !attemptRef.current) return;
    submitting.current = true;
    try {
      setShowResult(false); const form = manualReminderForm(attemptRef.current); form.set("manual_mode", mode); form.set("check_only", "1"); await dispatch(form);
    } finally { submitting.current = false; }
  }
  function another() {
    if (!attemptRef.current || !canPrepareAnotherReminder(attemptRef.current, mode) || pending) return;
    try { localStorage.removeItem(key); attemptRef.current = null; setAttempt(null); setEditing(false); setProblem(""); setShowResult(false); }
    catch { setProblem("The saved request could not be cleared. Reload before preparing another reminder."); }
  }
  if (!enabled && !attempt && !problem) return null;
  const saved = !!attempt && !editing;
  const canRetry = !attempt?.reminderId || mode === "send" && attempt.reminderStatus === "pending";
  const canStart = !!attempt && enabled && canPrepareAnotherReminder(attempt, mode);
  const checkButton = attempt && !editing ? <button className="secondary-action" disabled={pending || !ready} onClick={() => void check()} type="button">Check saved reminder</button> : null;
  return <form action={submit} className="communication-action-card manual-reminder-form" aria-busy={pending}>
    <strong>{mode === "send" ? "Send now" : "Schedule reminder"}</strong>
    {mode === "send" ? <p>Rechecks status, email, balance, schedule, and customer link before sending.</p> : null}
    {saved ? <div>
      <p>This request is saved on this device.{canRetry ? " Retrying checks the same reminder." : ""}</p>
      <p>Requested recipient: {attempt.fields.recipient_email}</p>
      {mode === "schedule" ? <p>Requested time: {formatBusinessDateTime(parseBusinessDateTime(attempt.fields.scheduled_for) ?? attempt.fields.scheduled_for)}</p> : null}
    </div> : <>
      <input name="communication_type" type="hidden" value={communicationType} />
      <input name="record_id" type="hidden" value={recordId} />
      <input name="record_type" type="hidden" value={recordType} />
      <input name="recipient_email" type="hidden" value={recipient?.email ?? ""} />
      <input name="recipient_source" type="hidden" value={recipient?.source ?? "customer"} />
      {mode === "schedule" ? <label>Date and time<input defaultValue={attempt?.fields.scheduled_for ?? ""} disabled={pending} name="scheduled_for" required type="datetime-local" /></label> : null}
    </>}
    {canRetry ? <button disabled={!ready || pending || !enabled || (!saved && !recipient) || !canRetry} type="submit">
      {mode === "send" ? <Send aria-hidden="true" size={17} /> : <MailPlus aria-hidden="true" size={17} />}
      {pending ? "Checking…" : saved ? "Retry saved request" : mode === "send" ? "Send reminder now" : "Schedule reminder"}
    </button> : null}
    {canStart ? <details><summary>Saved request options</summary>{checkButton}</details> : checkButton}
    {attempt && !attempt.reminderId && enabled && !editing ? <button className="secondary-action" disabled={pending} onClick={() => { setEditing(true); setProblem(""); }} type="button">Edit request details</button> : null}
    {editing ? <button className="secondary-action" disabled={pending} onClick={() => { setEditing(false); setProblem(""); }} type="button">Keep saved details</button> : null}
    {editing ? <p>If earlier details were saved, they will be shown without replacing them or creating a second reminder.</p> : null}
    {canStart ? <button disabled={pending} onClick={another} type="button">Prepare another reminder</button> : null}
    {showResult && state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    {problem ? <p className="form-message error" role="alert">{problem}</p> : null}
  </form>;
}
