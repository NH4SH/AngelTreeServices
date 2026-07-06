import Link from "next/link";
import { AlertTriangle, Clock3, PlayCircle, ShieldCheck, TimerReset } from "lucide-react";
import { CrewViewResetWatcher } from "@/components/crew-view-reset-watcher";
import {
  CrewClockInForm,
  CrewClockOutForm,
  LiveTimerCard,
  QuickClockInEventForm,
} from "@/components/time-clock";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { canUseTimeClock, getTimeClockPermissionForUser } from "@/lib/auth/time-clock";
import { getCrewJobs } from "@/lib/data/crew-jobs";
import { getCurrentCrewViewResetTimestamp } from "@/lib/data/profiles";
import {
  getActiveTimeEntryForUser,
  getAssignedScheduleEventsForUser,
  getOpenTimeEntryHours,
  getTimeEntries,
  getTimeEntryHours,
} from "@/lib/data/time-clock";

export default async function CrewTimePage() {
  const context = await getAuthenticatedPlatformContext("/crew/time");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the time clock" />;
  }

  const [permission, activeEntry, recentEntries, jobs, scheduleEvents, resetRequestedAt] = await Promise.all([
    getTimeClockPermissionForUser(context.user.id, context.supabase),
    getActiveTimeEntryForUser(context.user.id),
    getTimeEntries({
      userId: context.user.id,
      from: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    }),
    getCrewJobs({
      roles: context.roles,
      supabase: context.supabase,
      userId: context.user.id,
    }),
    getAssignedScheduleEventsForUser(context.user.id, context.roles),
    getCurrentCrewViewResetTimestamp(),
  ]);
  const timerEnabled = canUseTimeClock({
    permission: permission.data,
    roles: context.roles,
  });
  const todaysScheduleEvents = scheduleEvents.data.filter((event) => isToday(event.starts_at));
  const recentCompletedEntries = recentEntries.data.filter((entry) => !activeEntry.data || entry.id !== activeEntry.data.id).slice(0, 8);

  return (
    <PlatformFrame active="crew-time" roles={context.roles} userEmail={context.user.email}>
      <CrewViewResetWatcher resetRequestedAt={resetRequestedAt} />
      <div className="crew-shell app-content">
        <section className="crew-hero time-clock-hero">
          <p className="surface-label">
            <Clock3 aria-hidden="true" size={18} />
            Time clock
          </p>
          <h1>Clock in and out</h1>
          <p>Track job time, drive time, shop work, or training with one clear timer.</p>
          <div className="crew-hero-actions">
            <Link className="secondary-action" href="/crew/jobs">
              <ShieldCheck aria-hidden="true" size={18} />
              Back to jobs
            </Link>
          </div>
        </section>

        {[permission.error, activeEntry.error, recentEntries.error, jobs.error, scheduleEvents.error]
          .filter(Boolean)
          .map((message) => (
            <DataWarning key={message} message={message ?? ""} />
          ))}

        <section className="commerce-summary-strip" aria-label="Time clock summary">
          <div className="commerce-summary-chip emphasis">
            <span>Status</span>
            <strong>{activeEntry.data ? "Clocked in" : timerEnabled ? "Clocked out" : "Disabled"}</strong>
          </div>
          <div className="commerce-summary-chip">
            <span>Available jobs</span>
            <strong>{jobs.data.length}</strong>
          </div>
          <div className="commerce-summary-chip">
            <span>Scheduled events</span>
            <strong>{scheduleEvents.data.length}</strong>
          </div>
        </section>

        {!timerEnabled ? (
          <section className="time-clock-layout">
            <div className="time-clock-main">
              <section className="time-clock-live-card time-clock-disabled-card">
                <p className="surface-label">
                  <ShieldCheck aria-hidden="true" size={18} />
                  Current status
                </p>
                <span className="time-live-status">Disabled</span>
                <strong>Clock off</strong>
                <span>Your account can open the app, but timer access has not been turned on.</span>
                <small>Ask an owner, admin, or payroll admin to enable time clock access.</small>
              </section>
            </div>
            <aside className="time-clock-side">
              <section className="crew-panel time-access-panel">
                <div className="crew-panel-heading">
                  <span className="crew-panel-icon" aria-hidden="true">
                    <ShieldCheck size={19} />
                  </span>
                  <div>
                    <h2>Why this is disabled</h2>
                    <p>Timer access is separate from your employee login and role.</p>
                  </div>
                </div>
                <p className="field-note">
                  You can still review jobs and schedule details if your role allows it. Clock in/out stays locked until timer access is enabled.
                </p>
              </section>
            </aside>
          </section>
        ) : activeEntry.data ? (
          <section className="time-clock-layout">
            <div className="time-clock-main">
              <LiveTimerCard entry={activeEntry.data} />
              <section className="crew-panel">
                <div className="crew-panel-heading">
                  <span className="crew-panel-icon" aria-hidden="true">
                    <TimerReset size={19} />
                  </span>
                  <div>
                    <h2>Active work</h2>
                    <p>Finish the current timer before starting another one.</p>
                  </div>
                </div>
                <p className="field-note">
                  When you are done with this work, add any break minutes or notes, then press the Clock Out button.
                </p>
                {getOpenTimeEntryHours(activeEntry.data) > 12 ? (
                  <p className="time-clock-alert" role="status">
                    <AlertTriangle aria-hidden="true" size={16} />
                    This timer has been running more than 12 hours and should be reviewed soon.
                  </p>
                ) : null}
                <dl className="time-clock-meta">
                  <div>
                    <dt>Type</dt>
                    <dd>{activeEntry.data.entry_type.replace("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Job</dt>
                    <dd>{activeEntry.data.jobs?.customers?.display_name || "No linked job"}</dd>
                  </div>
                  <div>
                    <dt>Schedule</dt>
                    <dd>{activeEntry.data.schedule_events?.title || "No linked schedule event"}</dd>
                  </div>
                  <div>
                    <dt>Elapsed</dt>
                    <dd>{getOpenTimeEntryHours(activeEntry.data).toFixed(2)} hours</dd>
                  </div>
                </dl>
                {activeEntry.data.entry_type === "job" && !activeEntry.data.job_id && !activeEntry.data.schedule_event_id ? (
                  <p className="time-clock-alert" role="status">
                    <AlertTriangle aria-hidden="true" size={16} />
                    This timer is marked as job time without a linked job or schedule event.
                  </p>
                ) : null}
                <CrewClockOutForm activeEntry={activeEntry.data} />
              </section>
            </div>
            <aside className="time-clock-side">
              <section className="crew-panel">
                <div className="crew-panel-heading">
                  <span className="crew-panel-icon" aria-hidden="true">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <h2>Recent entries</h2>
                    <p>Your latest completed time for quick review.</p>
                  </div>
                </div>
                <RecentTimeEntries entries={recentCompletedEntries.slice(0, 6)} />
              </section>
            </aside>
          </section>
        ) : (
          <section className="time-clock-layout">
            <div className="time-clock-main">
              <section className="time-clock-live-card time-clock-ready-card">
                <p className="surface-label">
                  <TimerReset aria-hidden="true" size={18} />
                  Current status
                </p>
                <span className="time-live-status">Clocked out</span>
                <strong>Ready</strong>
                <span>Pick the work type, link the job or schedule event if you have one, and start the timer.</span>
                <small>Your next clock-in becomes the active timer until you stop it.</small>
              </section>
              <section className="crew-panel">
                <div className="crew-panel-heading">
                  <span className="crew-panel-icon" aria-hidden="true">
                    <PlayCircle size={19} />
                  </span>
                  <div>
                    <h2>Start a timer</h2>
                    <p>Pick the kind of work, link the job or schedule event if you have one, then clock in.</p>
                  </div>
                </div>
                <div className="time-clock-helper-grid">
                  <div>
                    <strong>Customer work</strong>
                    <p>Pick Job time and link the job or schedule event when you are working at a customer stop.</p>
                  </div>
                  <div>
                    <strong>Non-job work</strong>
                    <p>Use Drive, Shop, Maintenance, Admin, Training, or Other even if no job is assigned.</p>
                  </div>
                </div>
                {todaysScheduleEvents.length ? (
                  <section className="quick-clock-event-list" aria-label="Today schedule clock-in shortcuts">
                    <div>
                      <strong>Scheduled for today</strong>
                      <p>One tap starts job time for the event dispatch assigned to you.</p>
                    </div>
                    {todaysScheduleEvents.slice(0, 4).map((event) => (
                      <QuickClockInEventForm event={event} key={event.id} />
                    ))}
                  </section>
                ) : (
                  <div className="time-clock-selection-card">
                    <strong>No assigned calendar event today</strong>
                    <p>You can still clock into shop, maintenance, drive, admin, training, other, or link a job manually.</p>
                  </div>
                )}
                <CrewClockInForm jobs={jobs.data} scheduleEvents={scheduleEvents.data} />
              </section>
            </div>
            <aside className="time-clock-side">
              <section className="crew-panel">
                <div className="crew-panel-heading">
                  <span className="crew-panel-icon" aria-hidden="true">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <h2>Recent entries</h2>
                    <p>See the last two weeks of your time.</p>
                  </div>
                </div>
                <RecentTimeEntries entries={recentCompletedEntries} />
              </section>
            </aside>
          </section>
        )}
      </div>
    </PlatformFrame>
  );
}

function RecentTimeEntries({ entries }: { entries: Awaited<ReturnType<typeof getTimeEntries>>["data"] }) {
  if (entries.length === 0) {
    return (
      <div className="crew-empty-inline">
        <strong>No time entries yet.</strong>
        <p>Your recent clock-ins and clock-outs will show up here.</p>
      </div>
    );
  }

  return (
    <div className="time-entry-list">
      {entries.map((entry) => (
        <article className="time-entry-row" key={entry.id}>
          <div>
            <strong>{entry.entry_type.replace("_", " ")}</strong>
            <span>{entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
          </div>
          <div>
            <b>{entry.clock_out_at ? `${getTimeEntryHours(entry).toFixed(2)}h` : "Active"}</b>
            <small>{formatDate(entry.clock_in_at)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
