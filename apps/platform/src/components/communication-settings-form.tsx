"use client";

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
  const [state, formAction, pending] = useReliableActionState(updateCommunicationSettings, initialState);

  return (
    <form action={formAction} className="communication-settings-form crm-form">
      <label className="communication-master-toggle">
        <input defaultChecked={settings.automated_sending_enabled} name="automated_sending_enabled" type="checkbox" value="1" />
        <span>
          <strong>Automated sending</strong>
          <small>Master switch. Keep this off until the migration, environment variables, templates, and test records are verified.</small>
        </span>
      </label>

      <label>
        Business timezone
        <input defaultValue={settings.business_timezone} name="business_timezone" required />
      </label>
      <label>
        Minimum hours between matching reminders
        <input defaultValue={settings.minimum_send_interval_hours} max={168} min={1} name="minimum_send_interval_hours" required type="number" />
      </label>

      <fieldset className="communication-setting-group">
        <legend>Estimate appointments</legend>
        <CheckSetting defaultChecked={settings.estimate_confirmation_enabled} label="Send confirmations" name="estimate_confirmation_enabled" />
        <CheckSetting defaultChecked={settings.estimate_reminder_enabled} label="Send reminders" name="estimate_reminder_enabled" />
        <label>Hours before appointment<input defaultValue={settings.estimate_reminder_hours_before} max={336} min={1} name="estimate_reminder_hours_before" required type="number" /></label>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Scheduled work</legend>
        <CheckSetting defaultChecked={settings.work_confirmation_enabled} label="Send confirmations" name="work_confirmation_enabled" />
        <CheckSetting defaultChecked={settings.work_reminder_enabled} label="Send reminders" name="work_reminder_enabled" />
        <label>Hours before work<input defaultValue={settings.work_reminder_hours_before} max={336} min={1} name="work_reminder_hours_before" required type="number" /></label>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Quote follow-ups</legend>
        <CheckSetting defaultChecked={settings.quote_follow_up_enabled} label="Schedule automatic follow-ups" name="quote_follow_up_enabled" />
        <div className="form-grid-two">
          <label>First follow-up, days after send<input defaultValue={settings.quote_first_follow_up_days} max={90} min={1} name="quote_first_follow_up_days" required type="number" /></label>
          <label>Second follow-up, days after send<input defaultValue={settings.quote_second_follow_up_days} max={180} min={1} name="quote_second_follow_up_days" required type="number" /></label>
        </div>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Invoice reminders</legend>
        <CheckSetting defaultChecked={settings.invoice_reminder_enabled} label="Schedule automatic invoice reminders" name="invoice_reminder_enabled" />
        <div className="form-grid-two">
          <label>First reminder, days after due<input defaultValue={settings.invoice_first_reminder_days} max={90} min={0} name="invoice_first_reminder_days" required type="number" /></label>
          <label>Second reminder, days after due<input defaultValue={settings.invoice_second_reminder_days} max={180} min={1} name="invoice_second_reminder_days" required type="number" /></label>
        </div>
      </fieldset>

      <fieldset className="communication-setting-group">
        <legend>Payments</legend>
        <CheckSetting defaultChecked={settings.payment_confirmation_enabled} label="Send one platform payment confirmation per successful payment" name="payment_confirmation_enabled" />
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

function CheckSetting({ defaultChecked, label, name }: { defaultChecked: boolean; label: string; name: string }) {
  return (
    <label className="form-checkbox">
      <input defaultChecked={defaultChecked} name={name} type="checkbox" value="1" />
      <span>{label}</span>
    </label>
  );
}

function ActionMessage({ state }: { state: CommunicationActionState }) {
  return state.message ? <p className={`form-message ${state.status}`} role="status">{state.message}</p> : null;
}
