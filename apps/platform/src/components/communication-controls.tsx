"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarClock, MailCheck, MailPlus, PauseCircle, Send } from "lucide-react";
import {
  cancelScheduledCommunication,
  scheduleCommunication,
  sendCommunicationNow,
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
  automaticEnabled,
  communicationType,
  communications,
  recordId,
  recordType,
  recipientOptions,
}: {
  automaticEnabled?: boolean;
  communicationType: CommunicationType;
  communications: CustomerCommunication[];
  recordId: string;
  recordType: "appointment" | "invoice" | "job" | "quote" | "schedule_event";
  recipientOptions: RecipientOption[];
}) {
  const [sendState, sendAction, sending] = useActionState(sendCommunicationNow, initialState);
  const [scheduleState, scheduleAction, scheduling] = useActionState(scheduleCommunication, initialState);
  const [automationState, automationAction, changingAutomation] = useActionState(updateRecordAutomation, initialState);
  const availableRecipients = useMemo(
    () => recipientOptions.filter((option, index, all) => option.email && all.findIndex((candidate) => candidate.email === option.email) === index),
    [recipientOptions],
  );
  const [recipientKey, setRecipientKey] = useState(availableRecipients[0] ? "0" : "");
  const selectedRecipient = availableRecipients[Number(recipientKey)] ?? null;
  const pending = communications.filter((item) => item.status === "pending").sort(byScheduledDate);
  const history = communications.filter((item) => item.status !== "pending").slice(0, 8);
  const lastSent = communications.find((item) => item.status === "sent");

  return (
    <div className="communication-control-stack">
      <div className="communication-summary-row">
        <span>
          <MailCheck aria-hidden="true" size={17} />
          <strong>Last sent</strong>
          {lastSent ? formatDateTime(lastSent.sent_at ?? lastSent.updated_at) : "None yet"}
        </span>
        <span>
          <CalendarClock aria-hidden="true" size={17} />
          <strong>Next scheduled</strong>
          {pending[0] ? formatDateTime(pending[0].scheduled_for) : "None"}
        </span>
      </div>

      {availableRecipients.length ? (
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
      ) : (
        <p className="form-message error" role="status">Add a valid customer or organization email before sending reminders.</p>
      )}

      <div className="communication-action-grid">
        <form
          action={sendAction}
          className="communication-action-card"
          onSubmit={(event) => {
            if (!window.confirm("Send this customer reminder now? The current record will be checked again before email is sent.")) {
              event.preventDefault();
            }
          }}
        >
          <CommunicationHiddenFields
            communicationType={communicationType}
            recordId={recordId}
            recordType={recordType}
            recipient={selectedRecipient}
          />
          <strong>Send now</strong>
          <p>Rechecks status, email, balance, schedule, and customer link before sending.</p>
          <button disabled={!selectedRecipient || sending} type="submit">
            <Send aria-hidden="true" size={17} />
            {sending ? "Sending..." : "Send reminder now"}
          </button>
          <ActionMessage state={sendState} />
        </form>

        <form action={scheduleAction} className="communication-action-card">
          <CommunicationHiddenFields
            communicationType={communicationType}
            recordId={recordId}
            recordType={recordType}
            recipient={selectedRecipient}
          />
          <strong>Schedule reminder</strong>
          <label>
            Date and time
            <input name="scheduled_for" required type="datetime-local" />
          </label>
          <button disabled={!selectedRecipient || scheduling} type="submit">
            <MailPlus aria-hidden="true" size={17} />
            {scheduling ? "Scheduling..." : "Schedule reminder"}
          </button>
          <ActionMessage state={scheduleState} />
        </form>
      </div>

      {typeof automaticEnabled === "boolean" ? (
        <form action={automationAction} className="communication-automation-row">
          <input name="record_id" type="hidden" value={recordId} />
          <input name="record_type" type="hidden" value={recordType} />
          <input name="enabled" type="hidden" value={automaticEnabled ? "0" : "1"} />
          <div>
            <strong>Automatic {recordType === "quote" ? "quote follow-ups" : "invoice reminders"}</strong>
            <span>{automaticEnabled ? "Enabled for this record" : "Disabled for this record"}</span>
          </div>
          <button className="secondary-action" disabled={changingAutomation} type="submit">
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
              <form action={cancelScheduledCommunication}>
                <input name="communication_id" type="hidden" value={item.id} />
                <button className="secondary-action" type="submit">Cancel</button>
              </form>
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

function CommunicationHiddenFields({
  communicationType,
  recipient,
  recordId,
  recordType,
}: {
  communicationType: CommunicationType;
  recipient: RecipientOption | null;
  recordId: string;
  recordType: string;
}) {
  return (
    <>
      <input name="communication_type" type="hidden" value={communicationType} />
      <input name="record_id" type="hidden" value={recordId} />
      <input name="record_type" type="hidden" value={recordType} />
      <input name="recipient_email" type="hidden" value={recipient?.email ?? ""} />
      <input name="recipient_source" type="hidden" value={recipient?.source ?? "customer"} />
    </>
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
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
