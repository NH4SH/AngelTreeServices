"use client";

import { ManualReminderForm } from "@/components/manual-reminder-form";
import { RecordReminderSummary } from "@/components/record-reminder-summary";
import type { RecordReminderSummary as Summary } from "@/lib/communications/record-summary";
import { formatBusinessDateTime } from "@/lib/business-time";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { useMemo, useState } from "react";
import { PauseCircle } from "lucide-react";
import {
  cancelScheduledCommunication,
  updateRecordAutomation,
  type CommunicationActionState,
} from "@/lib/actions/communications";
import type { CommunicationType, CustomerCommunication } from "@/lib/types/database";

const initialState: CommunicationActionState = { status: "idle", message: "" };

type RecipientOption = {
  email: string;
  label: string;
  source: "customer" | "organization";
};

export function CommunicationControls({
  actorId,
  actionsEnabled = true,
  automaticEnabled,
  automaticVersion,
  communicationType,
  communications,
  summary,
  recordId,
  recordType,
  recipientOptions,
  unavailableMessage,
}: {
  actorId: string;
  actionsEnabled?: boolean;
  automaticEnabled?: boolean;
  automaticVersion?: string;
  communicationType: CommunicationType;
  communications: CustomerCommunication[];
  summary: Summary | null;
  recordId: string;
  recordType: "appointment" | "invoice" | "job" | "quote" | "schedule_event";
  recipientOptions: RecipientOption[];
  unavailableMessage?: string;
}) {
  const [automationState, automationAction, changingAutomation] = useReliableActionState(updateRecordAutomation, initialState);
  const availableRecipients = useMemo(
    () => recipientOptions.filter((option, index, all) => option.email && all.findIndex((candidate) => candidate.email === option.email) === index),
    [recipientOptions],
  );
  const [recipientKey, setRecipientKey] = useState(availableRecipients[0] ? "0" : "");
  const selectedRecipient = availableRecipients[Number(recipientKey)] ?? null;
  const pending = communications.filter((item) => item.status === "pending").sort(byScheduledDate);
  const history = communications.filter((item) => item.status !== "pending").slice(0, 8);

  return (
    <div className="communication-control-stack">
      <RecordReminderSummary summary={summary} />

      {!actionsEnabled && unavailableMessage ? (
        <p className="inline-empty">{unavailableMessage}</p>
      ) : null}

      {actionsEnabled && availableRecipients.length ? (
        <label className="communication-recipient-field">
          Send to
          <select value={recipientKey} onChange={(event) => setRecipientKey(event.target.value)}>
            {availableRecipients.map((option, index) => (
              <option key={`${option.source}-${option.email}`} value={index}>
                {option.label}: {option.email}
              </option>
            ))}
          </select>
          <small>Only the current customer or linked organization email can be used.</small>
        </label>
      ) : actionsEnabled ? (
        <p className="form-message error" role="status">Add a valid customer or organization email before sending reminders.</p>
      ) : null}

      <div className="communication-action-grid">
        {(["send", "schedule"] as const).map(mode => <ManualReminderForm
          actorId={actorId} communicationType={communicationType} enabled={actionsEnabled}
          key={`${actorId}.${recordType}.${recordId}.${communicationType}.${mode}`} mode={mode}
          recipient={selectedRecipient} recordId={recordId} recordType={recordType}
        />)}
      </div>

      {actionsEnabled && typeof automaticEnabled === "boolean" ? (
        <form action={automationAction} className="communication-automation-row">
          <input name="record_id" type="hidden" value={recordId} />
          <input name="record_type" type="hidden" value={recordType} />
          <input name="enabled" type="hidden" value={automaticEnabled ? "0" : "1"} />
          <input name="expected_updated_at" type="hidden" value={automaticVersion ?? ""} />
          <div>
            <strong>Automatic {recordType === "quote" ? "quote follow-ups" : "invoice reminders"}</strong>
            <span>{automaticEnabled ? "Enabled for this record" : "Disabled for this record"}</span>
          </div>
          <button className="secondary-action" disabled={changingAutomation || !automaticVersion} type="submit">
            <PauseCircle aria-hidden="true" size={17} />
            {changingAutomation ? "Saving..." : automaticEnabled ? "Disable" : "Enable"}
          </button>
          <ActionMessage state={automationState} />
        </form>
      ) : null}

      {pending.length ? (
        <div className="communication-list">
          <h3>Scheduled reminders</h3>
          {pending.map((item) => (
            <article className="communication-row" key={item.id}>
              <div>
                <strong>{formatType(item.communication_type)}</strong>
                <span>{formatDateTime(item.scheduled_for)} to {item.recipient_email}</span>
              </div>
              <ReminderCancellation communication={item} />
            </article>
          ))}
        </div>
      ) : null}

      <div className="communication-list">
        <h3>Communication history</h3>
        {history.length ? history.map((item) => (
          <article className={`communication-row status-${item.status}`} key={item.id}>
            <div>
              <strong>{formatType(item.communication_type)}</strong>
              <span>{formatStatus(item.status)} {formatDateTime(item.sent_at ?? item.updated_at)}</span>
              {item.skip_reason || item.last_error ? <small>{item.skip_reason || item.last_error}</small> : null}
            </div>
          </article>
        )) : <p className="inline-empty">No reminder history yet.</p>}
      </div>
    </div>
  );
}

function ReminderCancellation({ communication }: { communication: CustomerCommunication }) {
  const [state, action, pending] = useReliableActionState(cancelScheduledCommunication, initialState);
  return (
    <form action={action}>
      <input name="communication_id" type="hidden" value={communication.id} />
      <input name="expected_updated_at" type="hidden" value={communication.updated_at} />
      <button
        aria-label={`Cancel ${formatType(communication.communication_type)} scheduled ${formatDateTime(communication.scheduled_for)}`}
        className="secondary-action"
        disabled={pending || !communication.updated_at}
        type="submit"
      >{pending ? "Cancelling..." : "Cancel"}</button>
      <ActionMessage state={state} />
    </form>
  );
}

function ActionMessage({ state }: { state: CommunicationActionState }) {
  return state.message ? (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
  ) : null;
}

function byScheduledDate(left: CustomerCommunication, right: CustomerCommunication) {
  return new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime();
}

function formatType(value: CommunicationType) {
  return value.replaceAll("_", " ");
}

function formatStatus(value: CustomerCommunication["status"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateTime(value: string) {
  return formatBusinessDateTime(new Date(value), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
