"use client";

import { Save } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  updateNotificationPreferences,
  type NotificationActionState,
} from "@/lib/actions/notifications";

const initialState: NotificationActionState = { message: "", status: "idle" };

type Preferences = {
  daily_summary_email_enabled: boolean;
  handoff_email_enabled: boolean;
  daily_summary_hour: number;
  change_order_email_enabled: boolean;
  customer_update_email_enabled: boolean;
  file_email_enabled: boolean;
  message_email_enabled: boolean;
  payment_email_enabled: boolean;
  quote_email_enabled: boolean;
};

export function NotificationPreferencesForm({ preferences, disabled = false, recipientEmail }: { preferences: Preferences; disabled?: boolean; recipientEmail?: string }) {
  const [state, action, pending] = useReliableActionState(updateNotificationPreferences, initialState);
  return (
    <form onSubmit={event => { event.preventDefault(); void action(new FormData(event.currentTarget)); }} className="notification-preferences-form">
      <p>Manager emails go to your verified sign-in address{recipientEmail ? `: ${recipientEmail}` : ""}. Saving preferences does not send an email.</p>
      <fieldset disabled={disabled || pending}>
      <legend>Management handoff</legend>
      <Preference checked={preferences.daily_summary_email_enabled} description="A daily overview of new leads, today's work, scheduling, invoicing, and due handoffs, with a link to the dashboard." label="Morning operations summary" name="daily_summary_email_enabled" />
      <label className="review-field">Summary time (Eastern)<select name="daily_summary_hour" defaultValue={preferences.daily_summary_hour}>{[7, 8, 9, 10, 11].map(hour => <option key={hour} value={hour}>{hour}:00 AM</option>)}</select></label>
      <Preference checked={preferences.handoff_email_enabled} description="A short email when a new Next Action is assigned to you. Existing assignments are not emailed retroactively." label="Assigned handoff emails" name="handoff_email_enabled" />
      <p className="field-note">These two email types are held overnight from 8 PM to 7 AM Eastern. Summaries may arrive later in the morning if processing is delayed.</p>
      </fieldset>
      <fieldset disabled={disabled || pending}><legend>Customer activity</legend>
      <Preference checked={preferences.quote_email_enabled} description="Approvals, declines, and change requests submitted through quote links." label="Quote activity" name="quote_email_enabled" />
      <Preference checked={preferences.change_order_email_enabled} description="Approvals, declines, and responses to additional-work requests." label="Change-order activity" name="change_order_email_enabled" />
      <Preference checked={preferences.message_email_enabled} description="Customer messages that need an office response." label="Customer messages" name="message_email_enabled" />
      <Preference checked={preferences.file_email_enabled} description="Customer-facing file or photo uploads when supported by a workflow." label="Files and photos" name="file_email_enabled" />
      <Preference checked={preferences.customer_update_email_enabled} description="Customer, contact, or property changes submitted through a customer-facing workflow." label="Customer updates" name="customer_update_email_enabled" />
      <Preference checked={preferences.payment_email_enabled} description="Payment choices, successful payments, failures, refunds, and disputes." label="Payment activity" name="payment_email_enabled" />
      </fieldset>
      <div className="sticky-form-actions">
        <button disabled={pending || disabled} type="submit"><Save size={17} />{pending ? "Saving…" : "Save preferences"}</button>
        {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`form-message ${state.status}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}

function Preference({ checked, description, label, name }: { checked: boolean; description: string; label: string; name: string }) {
  return (
    <label className="notification-preference-row">
      <input defaultChecked={checked} name={name} type="checkbox" value="1" />
      <span><strong>{label}</strong><small>{description}</small></span>
    </label>
  );
}
