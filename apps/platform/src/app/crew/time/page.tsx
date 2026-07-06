import Link from "next/link";
import { AlertTriangle, Clock3, PlayCircle, ShieldCheck, TimerReset } from "lucide-react";
import { CrewClockInForm, CrewClockOutForm, LiveTimerCard } from "@/components/time-clock";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { canUseTimeClock, getTimeClockPermissionForUser } from "@/lib/auth/time-clock";
import { getCrewJobs } from "@/lib/data/crew-jobs";
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

  const [permission, activeEntry, recentEntries, jobs, scheduleEvents] = await Promise.all([
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
  ]);
  const timerEnabled = canUseTimeClock({
    permission: permission.data,
    roles: context.roles,
  });

  return (
    <PlatformFrame active="crew-time" roles={context.roles} userEmail={context.user.email}>
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

        {!timerEnabled ? (
          <section className="crew-panel time-access-panel">
            <div className="crew-panel-heading">
              <span className="crew-panel-icon" aria-hidden="true">
                <ShieldCheck size={19} />
              </span>
              <div>
                <h2>Time clock not enabled</h2>
                <p>This account can sign in to the platform, but the timer has not been turned on yet.</p>
              </div>
            </div>
            <p className="field-note">
              An owner, admin, or payroll admin can enable time clock access from the internal time page.
            </p>
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
                <RecentTimeEntries entries={recentEntries.data.filter((entry) => entry.id !== activeEntry.data?.id).slice(0, 6)} />
              </section>
            </aside>
          </section>
        ) : (
          <section className="time-clock-layout">
            <div className="time-clock-main">
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
                    <strong>Use Job time</strong>
                    <p>Best when you are on site and the work should tie back to a customer job.</p>
                  </div>
                  <div>
                    <strong>Use Drive or Shop</strong>
                    <p>Keep non-job time separate so payroll review stays clear later.</p>
                  </div>
                </div>
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
                <RecentTimeEntries entries={recentEntries.data.slice(0, 8)} />
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

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
