"use client";

import { useEffect, useState } from "react";
import { createFollowUpTask } from "@/lib/actions/recurring";
import { initialRecurringActionState } from "@/lib/action-states/recurring";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import type { NextActionSubject } from "@/lib/next-actions";

type NextActionFormProps = { subject: NextActionSubject; id: string; staff: { id: string; full_name: string | null; email: string | null }[] };

export function NextActionForm(props: NextActionFormProps) {
  const [attempt, setAttempt] = useState(0);
  return <NextActionFields {...props} key={attempt} onNew={() => setAttempt(value => value + 1)} />;
}

function NextActionFields({ subject, id, staff, onNew }: NextActionFormProps & { onNew: () => void }) {
  const [requestId, setRequestId] = useState("");
  const [fields, setFields] = useState({ title: "", description: "", due_at: "", assigned_to_user_id: "" });
  const field = (name: keyof typeof fields) => ({ value: fields[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setFields(current => ({ ...current, [name]: event.target.value })) });
  const [state, action, pending] = useReliableActionState(createFollowUpTask, initialRecurringActionState);
  useEffect(() => setRequestId(crypto.randomUUID()), []);
  if (state.status === "success") return <div><p role="status">Next action saved. It is available in Follow-ups and on this record.</p><button type="button" className="secondary-action" onClick={onNew}>Add another next action</button></div>;
  return <form onSubmit={event => { event.preventDefault(); void action(new FormData(event.currentTarget)); }} className="crm-form">
    <input type="hidden" name={subject} value={id} />
    <input type="hidden" name="request_id" value={requestId} />
    <input type="hidden" name="task_type" value="internal_review" />
    {state.message ? <p role="alert">{state.message}</p> : null}
    <label>Next action<input {...field("title")} name="title" maxLength={180} required placeholder="Call after 4 PM about access" /></label>
    <label>Internal handoff notes<textarea {...field("description")} name="description" maxLength={3000} rows={3} /></label>
    <div className="form-grid-two">
      <label>Due (Eastern time)<input {...field("due_at")} type="datetime-local" name="due_at" required /></label>
      <label>Assigned to<select {...field("assigned_to_user_id")} name="assigned_to_user_id"><option value="">Shared office queue</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email || "Office account"}</option>)}</select></label>
    </div>
    {!staff.length ? <p className="field-note">The office assignee list is empty or unavailable. You can still save to the shared office queue.</p> : null}
    <button disabled={pending || !requestId} type="submit">{pending ? "Saving..." : "Save next action"}</button>
  </form>;
}
