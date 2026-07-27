"use client";

import { Save } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  updateNotificationPreferences,
  type NotificationActionState,
} from "@/lib/actions/notifications";

const initialState: NotificationActionState = { message: "", status: "idle" };

type Preferences = {
  change_order_email_enabled: boolean;
  customer_update_email_enabled: boolean;
  file_email_enabled: boolean;
  message_email_enabled: boolean;
  payment_email_enabled: boolean;
  quote_email_enabled: boolean;
};

export function NotificationPreferencesForm({ preferences }: { preferences: Preferences }) {
  const [state, action, pending] = useReliableActionState(updateNotificationPreferences, initialState);
  return (
    <form action={action} className="notification-preferences-form">
      <Preference checked={preferences.quote_email_enabled} description="Approvals, declines, and change requests submitted through quote links." label="Quote activity" name="quote_email_enabled" />
      <Preference checked={preferences.change_order_email_enabled} description="Approvals, declines, and responses to additional-work requests." label="Change-order activity" name="change_order_email_enabled" />
      <Preference checked={preferences.message_email_enabled} description="Customer messages that need an office response." label="Customer messages" name="message_email_enabled" />
      <Preference checked={preferences.file_email_enabled} description="Customer-facing file or photo uploads when supported by a workflow." label="Files and photos" name="file_email_enabled" />
      <Preference checked={preferences.customer_update_email_enabled} description="Customer, contact, or property changes submitted through a customer-facing workflow." label="Customer updates" name="customer_update_email_enabled" />
      <Preference checked={preferences.payment_email_enabled} description="Payment choices, successful payments, failures, refunds, and disputes." label="Payment activity" name="payment_email_enabled" />
      <div className="sticky-form-actions">
        <button disabled={pending} type="submit"><Save size={17} />{pending ? "Saving…" : "Save preferences"}</button>
        {state.message ? <p className={`form-message ${state.status}`}>{state.message}</p> : null}
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
