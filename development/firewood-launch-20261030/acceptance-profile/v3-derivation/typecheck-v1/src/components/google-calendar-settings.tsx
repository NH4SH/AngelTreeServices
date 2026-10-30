"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Link2, RefreshCw, Save, ShieldCheck, Unplug } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import {
  disconnectGoogleCalendarConnection,
  saveGoogleCalendarPreferences,
  syncGoogleCalendarConnectionNow,
} from "@/lib/actions/google-calendar";
import { initialGoogleCalendarActionState } from "@/lib/integrations/google-calendar/action-state";
import type { PublicGoogleCalendarConnection, GoogleCalendarWritableCalendar } from "@/lib/integrations/google-calendar/types";

type Props = {
  calendars: GoogleCalendarWritableCalendar[];
  canSyncCompany: boolean;
  configured: boolean;
  connection: PublicGoogleCalendarConnection | null;
  databaseNotice: string | null;
  notice: { message: string; status: "success" | "warning" } | null;
};

export function GoogleCalendarSettings({ calendars, canSyncCompany, configured, connection, databaseNotice, notice }: Props) {
  const hasConnection = Boolean(connection && connection.status !== "disconnected");
  const active = Boolean(connection?.syncEnabled && ["active", "error"].includes(connection.status));

  return (
    <div className="google-calendar-settings">
      {notice ? <p className={`integration-notice ${notice.status}`} role="status">{notice.message}</p> : null}
      {databaseNotice ? <section className="data-warning"><strong>Database setup required</strong><p>{databaseNotice}</p></section> : null}

      {!configured ? (
        <section className="integration-empty-state">
          <CalendarDays aria-hidden="true" size={28} />
          <div><h2>Google Calendar integration is not configured</h2><p>Add the server-only Google OAuth and encryption environment values before connecting an account.</p></div>
        </section>
      ) : !hasConnection ? (
        <section className="integration-connect-panel">
          <div className="integration-heading-icon"><CalendarDays aria-hidden="true" size={24} /></div>
          <div>
            <h2>Connect your Google Calendar</h2>
            <p>Mirror assigned estimates and workdays without changing where Angel Tree scheduling is managed.</p>
          </div>
          <Link className="primary-action" href="/api/integrations/google-calendar/connect"><Link2 aria-hidden="true" size={18} />Connect Google Calendar</Link>
        </section>
      ) : connection ? (
        <>
          <ConnectionSummary connection={connection} />
          {active ? (
            <>
              <GoogleCalendarPreferenceForm calendars={calendars} canSyncCompany={canSyncCompany} connection={connection} />
              <section className="integration-sync-actions">
                <div><h2>Reconcile calendar</h2><p>Sync today through the next 90 days. Existing managed events are updated in place.</p></div>
                <SyncNowForm />
              </section>
            </>
          ) : connection.status === "revoked" ? (
            <section className="integration-sync-actions">
              <div><h2>Reconnect required</h2><p>Reconnect the same Google account to restore one-way mirroring.</p></div>
              <Link className="primary-action" href="/api/integrations/google-calendar/connect"><Link2 aria-hidden="true" size={18} />Reconnect Google Calendar</Link>
            </section>
          ) : null}
          <section className="integration-boundary-note">
            <ShieldCheck aria-hidden="true" size={20} />
            <div><strong>Angel Tree remains authoritative</strong><p>Google Calendar is a one-way mirror. Editing an event in Google does not reschedule the crew. The next reconciliation may restore Angel Tree dates, times, titles, and locations.</p></div>
          </section>
          <DisconnectForm retryCleanup={connection.status === "cleanup_failed"} />
        </>
      ) : null}
    </div>
  );
}

function ConnectionSummary({ connection }: { connection: PublicGoogleCalendarConnection }) {
  const needsAttention = connection.status !== "active" || connection.lastSyncStatus === "error";
  return (
    <section className="integration-connection-summary">
      <div className={`integration-status-icon ${needsAttention ? "attention" : "connected"}`}>
        {needsAttention ? <AlertTriangle aria-hidden="true" size={22} /> : <CheckCircle2 aria-hidden="true" size={22} />}
      </div>
      <div>
        <span className="integration-kicker">Connected account</span>
        <h2>{connection.googleAccountEmail}</h2>
        <p>{needsAttention ? statusMessage(connection) : `Mirroring to ${connection.selectedCalendarSummary}.`}</p>
      </div>
      <dl>
        <div><dt>Calendar</dt><dd>{connection.selectedCalendarSummary}</dd></div>
        <div><dt>Last successful sync</dt><dd>{formatDateTime(connection.lastSyncSucceededAt)}</dd></div>
        <div><dt>Status</dt><dd>{humanize(connection.status)}</dd></div>
      </dl>
    </section>
  );
}

function GoogleCalendarPreferenceForm({ calendars, canSyncCompany, connection }: {
  calendars: GoogleCalendarWritableCalendar[];
  canSyncCompany: boolean;
  connection: PublicGoogleCalendarConnection;
}) {
  const [state, action, pending] = useReliableActionState(saveGoogleCalendarPreferences, initialGoogleCalendarActionState);
  const options = calendars.length ? calendars : [{
    accessRole: "writer" as const,
    id: connection.selectedCalendarId,
    primary: false,
    summary: connection.selectedCalendarSummary,
  }];
  return (
    <form action={action} className="google-calendar-preference-form">
      <div className="integration-section-heading"><div><h2>Mirror preferences</h2><p>Choose one writable calendar and the work that belongs there.</p></div></div>
      <label className="integration-calendar-select">Google calendar<select defaultValue={connection.selectedCalendarId} name="calendar_id">{options.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (Primary)" : ""}</option>)}</select></label>
      <fieldset>
        <legend>Assigned work</legend>
        <PreferenceCheckbox defaultChecked={connection.syncEstimates} description="Scheduled estimate appointments assigned to your employee record." label="Estimates assigned to me" name="sync_estimates" />
        <PreferenceCheckbox defaultChecked={connection.syncJobs} description="Each active scheduled workday, including separate days of multi-day jobs." label="Jobs and workdays assigned to me" name="sync_jobs" />
      </fieldset>
      {canSyncCompany ? <fieldset><legend>Owner and admin</legend><PreferenceCheckbox defaultChecked={connection.syncCompanyAll} description="Mirror all qualifying company estimates and workdays, even when you are not assigned." label="All company scheduled work" name="sync_company_all" /></fieldset> : null}
      <button disabled={pending} type="submit"><Save aria-hidden="true" size={17} />{pending ? "Saving..." : "Save preferences"}</button>
      <ActionMessage message={state.message} status={state.status} />
    </form>
  );
}

function PreferenceCheckbox({ defaultChecked, description, label, name }: { defaultChecked: boolean; description: string; label: string; name: string }) {
  return <label className="integration-preference-row"><input defaultChecked={defaultChecked} name={name} type="checkbox" value="1" /><span><strong>{label}</strong><small>{description}</small></span></label>;
}

function SyncNowForm() {
  const [state, action, pending] = useReliableActionState(syncGoogleCalendarConnectionNow, initialGoogleCalendarActionState);
  return <form action={action} className="integration-inline-action"><button className="secondary-action" disabled={pending} type="submit"><RefreshCw aria-hidden="true" size={17} />{pending ? "Syncing..." : "Sync now"}</button><ActionMessage message={state.message} status={state.status} /></form>;
}

function DisconnectForm({ retryCleanup = false }: { retryCleanup?: boolean }) {
  const [state, action, pending] = useReliableActionState(disconnectGoogleCalendarConnection, initialGoogleCalendarActionState);
  return (
    <details className="integration-disconnect" open={retryCleanup || undefined}>
      <summary><Unplug aria-hidden="true" size={17} />{retryCleanup ? "Retry disconnect cleanup" : "Disconnect Google Calendar"}</summary>
      <form action={action}>
        <p>Disconnecting never changes Angel Tree schedule records or unrelated Google events.</p>
        <label className="integration-preference-row"><input name="remove_future_events" type="checkbox" value="1" /><span><strong>Remove future Angel Tree events from Google</strong><small>Only events created and mapped by this integration are removed.</small></span></label>
        <button className="danger-action" disabled={pending} type="submit">{pending ? "Disconnecting..." : retryCleanup ? "Retry disconnect" : "Disconnect account"}</button>
        <ActionMessage message={state.message} status={state.status} />
      </form>
    </details>
  );
}

function ActionMessage({ message, status }: { message: string; status: string }) {
  return message ? <p className={`form-message ${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null;
}

function statusMessage(connection: PublicGoogleCalendarConnection) {
  if (connection.status === "revoked") return "Google access was revoked. Reconnect to resume mirroring.";
  if (connection.status === "cleanup_failed") return "Disconnect cleanup needs another attempt. Automatic syncing is off.";
  if (connection.lastSyncErrorCode === "calendar_not_writable") return "The selected Google calendar is no longer writable. Choose another calendar or restore access.";
  if (connection.lastSyncErrorCode === "temporarily_unavailable" || connection.lastSyncErrorCode === "network_unavailable") return "Google Calendar was temporarily unavailable. Angel Tree scheduling is safe and retry remains available.";
  return "The latest sync needs attention. Angel Tree scheduling is unaffected.";
}

function formatDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value)) : "Never";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
