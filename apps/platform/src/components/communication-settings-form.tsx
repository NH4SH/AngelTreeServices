"use client";

import { useState, type ChangeEvent } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { Play, Save } from "lucide-react";
import {
  runCommunicationWorkerNow,
  updateCommunicationSettings,
  type CommunicationActionState,
} from "@/lib/actions/communications";
import type { CommunicationSettings } from "@/lib/types/database";

const initialState: CommunicationActionState = { status: "idle", message: "" };

export function CommunicationSettingsForm({ settings }: { settings: CommunicationSettings }) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, typeof value === "boolean" ? value : String(value ?? "")])));
  // Keep the version paired with the values being edited, even if another
  // server action refreshes this page while the form has unsaved changes.
  const [version, setVersion] = useState(settings.updated_at);
  const [state, formAction, pending] = useReliableActionState(async (previous: CommunicationActionState, form: FormData) => {
    const result = await updateCommunicationSettings(previous, form);
    if (result.status === "success" && result.settingsVersion) setVersion(result.settingsVersion);
    return result;
  }, initialState);
  const field = (name: string) => ({ value: String(draft[name] ?? ""), onChange: (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setDraft(current => ({ ...current, [name]: value }));
  } });
  const toggle = (name: string) => ({ checked: draft[name] === true, onChange: (event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setDraft(current => ({ ...current, [name]: checked }));
  } });

  return (
    <form action={formAction} className="communication-settings-form crm-form">
      <input name="expected_updated_at" type="hidden" value={version} />
      <label className="communication-master-toggle">
        <input {...toggle("automated_sending_enabled")} name="automated_sending_enabled" type="checkbox" value="1" />
        <span>
          <strong>Automated sending</strong>
          <small>Master switch. Keep this off until the migration, environment variables, templates, and test records are verified.</small>
        </span>
      </label>

      <label>
        Business timezone
        <input {...field("business_timezone")} name="business_timezone" required />
      </label>
      <label>
        Minimum hours between matching reminders
        <input {...field("minimum_send_interval_hours")} max={168} min={1} name="minimum_send_interval_hours" required type="number" />
      </label>

      <fieldset className="communication-setting-group">
        <legend>Estimate appointments</legend>
        <CheckSetting {...toggle("estimate_confirmation_enabled")} label="Send confirmations" name="estimate_confirmation_enabled" />
        <CheckSetting {...toggle("estimate_reminder_enabled")} label="Send reminders" name="estimate_reminder_enabled" />
        <label>Hours before appointment<input {...field("estimate_reminder_hours_before")} max={336} min={1} name="estimate_reminder_hours_before" required type="number" /></label>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Scheduled work</legend>
        <CheckSetting {...toggle("work_confirmation_enabled")} label="Send confirmations" name="work_confirmation_enabled" />
        <CheckSetting {...toggle("work_reminder_enabled")} label="Send reminders" name="work_reminder_enabled" />
        <label>Hours before work<input {...field("work_reminder_hours_before")} max={336} min={1} name="work_reminder_hours_before" required type="number" /></label>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Visit updates</legend>
        <CheckSetting {...toggle("appointment_change_notices_enabled")} label="Send appointment changes and cancellations" name="appointment_change_notices_enabled" />
        <p className="field-help">Sends the latest update after a short pause. Cancellation applies to the affected visit only. Earlier changes are not sent when this is turned on.</p>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Quote follow-ups</legend>
        <CheckSetting {...toggle("quote_follow_up_enabled")} label="Schedule automatic follow-ups" name="quote_follow_up_enabled" />
        <div className="form-grid-two">
          <label>First follow-up, days after send<input {...field("quote_first_follow_up_days")} max={90} min={1} name="quote_first_follow_up_days" required type="number" /></label>
          <label>Second follow-up, days after send<input {...field("quote_second_follow_up_days")} max={180} min={1} name="quote_second_follow_up_days" required type="number" /></label>
        </div>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Invoice reminders</legend>
        <CheckSetting {...toggle("invoice_reminder_enabled")} label="Schedule automatic invoice reminders" name="invoice_reminder_enabled" />
        <div className="form-grid-two">
          <label>First reminder, days after due<input {...field("invoice_first_reminder_days")} max={90} min={0} name="invoice_first_reminder_days" required type="number" /></label>
          <label>Second reminder, days after due<input {...field("invoice_second_reminder_days")} max={180} min={1} name="invoice_second_reminder_days" required type="number" /></label>
        </div>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Payments</legend>
        <CheckSetting {...toggle("payment_confirmation_enabled")} label="Send one platform payment confirmation per successful payment" name="payment_confirmation_enabled" />
      </fieldset>

      <button disabled={pending} type="submit">
        <Save aria-hidden="true" size={17} />
        {pending ? "Saving..." : "Save communication defaults"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function RunCommunicationWorkerForm() {
  const [state, formAction, pending] = useReliableActionState(runCommunicationWorkerNow, initialState);
  return (
    <form action={formAction} className="run-communication-worker-form">
      <button className="secondary-action" disabled={pending} type="submit">
        <Play aria-hidden="true" size={17} />
        {pending ? "Checking queue..." : "Process due reminders now"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function CheckSetting({ checked, onChange, label, name }: { checked: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void; label: string; name: string }) {
  return (
    <label className="form-checkbox">
      <input checked={checked} onChange={onChange} name={name} type="checkbox" value="1" />
      <span>{label}</span>
    </label>
  );
}

function ActionMessage({ state }: { state: CommunicationActionState }) {
  return state.message ? <p className={`form-message ${state.status}`} role="status">{state.message}</p> : null;
}
