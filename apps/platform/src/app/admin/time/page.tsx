import Link from "next/link";
import { Clock3, Filter, ShieldCheck, TimerReset, UsersRound } from "lucide-react";
import { PermissionToggleForm } from "@/components/time-clock";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { canReviewTimeClock } from "@/lib/auth/time-clock";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getJobOptions } from "@/lib/data/jobs";
import {
  getTimeClockOverview,
  getTimeEntryHours,
} from "@/lib/data/time-clock";

type AdminTimePageProps = {
  searchParams: Promise<{
    from?: string;
    job_id?: string;
    to?: string;
    user_id?: string;
  }>;
};

export default async function AdminTimePage({ searchParams }: AdminTimePageProps) {
  const context = await getAuthenticatedPlatformContext("/admin/time");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening time review" />;
  }

  const params = await searchParams;

  if (!canReviewTimeClock(context.roles)) {
    return (
      <PlatformFrame active="admin-time" roles={context.roles} userEmail={context.user.email}>
        <div className="shell app-content">
          <section className="page-heading">
            <p className="surface-label">
              <Clock3 aria-hidden="true" size={18} />
              Time review
            </p>
            <h1>Time</h1>
            <p>This route is reserved for owners, admins, and payroll admins.</p>
          </section>
        </div>
      </PlatformFrame>
    );
  }

  const [overview, jobs] = await Promise.all([
    getTimeClockOverview({
      from: getDateFilterStart(params.from),
      jobId: params.job_id,
      to: getDateFilterEnd(params.to),
      userId: params.user_id,
    }),
    getJobOptions(),
  ]);

  return (
    <PlatformFrame active="admin-time" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content time-admin-page">
        <section className="page-heading">
          <p className="surface-label">
            <Clock3 aria-hidden="true" size={18} />
            Payroll time
          </p>
          <h1>Time</h1>
          <p>Review active timers, enable the clock for employees, and prepare entries for payroll review.</p>
          <div className="action-row">
            <Link className="secondary-action" href="/admin/payroll">
              <ShieldCheck aria-hidden="true" size={16} />
              Open payroll review
            </Link>
          </div>
        </section>

        {[overview.error, jobs.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="commerce-summary-strip" aria-label="Time summary">
          <SummaryChip label="Active timers" value={overview.data.activeEntries.length} />
          <SummaryChip label="Need review" value={overview.data.entriesNeedingReview.length} />
          <SummaryChip label="Enabled users" value={overview.data.users.filter((user) => user.time_clock_permission?.is_enabled).length} />
          <SummaryChip emphasis label="Hours in view" value={`${overview.data.totalHours.toFixed(2)}h`} />
        </section>

        <section className="panel time-filter-panel">
          <div className="panel-header">
            <h2>Filters</h2>
            <span>Limit the current review window</span>
          </div>
          <form className="schedule-filter-form time-filter-form">
            <label>
              <span>From</span>
              <input defaultValue={params.from ?? ""} name="from" type="date" />
            </label>
            <label>
              <span>To</span>
              <input defaultValue={params.to ?? ""} name="to" type="date" />
            </label>
            <label>
              <span>Employee</span>
              <select defaultValue={params.user_id ?? ""} name="user_id">
                <option value="">All employees</option>
                {overview.data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email || "Unnamed employee"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Job</span>
              <select defaultValue={params.job_id ?? ""} name="job_id">
                <option value="">All jobs</option>
                {jobs.data.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.service_type?.replace("_", " ") || "job"} - {job.status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">
              <Filter aria-hidden="true" size={16} />
              Apply
            </button>
          </form>
        </section>

        <section className="time-admin-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>Today's active timers</h2>
              <span>Who is currently clocked in</span>
            </div>
            {overview.data.activeEntries.length ? (
              <div className="time-entry-list">
                {overview.data.activeEntries.map((entry) => (
                  <article className="time-entry-row" key={entry.id}>
                    <div>
                      <strong>{entry.profiles?.full_name || entry.profiles?.email || "Employee"}</strong>
                      <span>{entry.entry_type.replace("_", " ")} - {entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
                    </div>
                    <div>
                      <b>Since {formatTime(entry.clock_in_at)}</b>
                      <small>{formatDate(entry.clock_in_at)}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyInline title="No one is clocked in right now." body="Active timers will appear here as soon as someone starts one." />
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Entries needing review</h2>
              <span>Completed entries without approval</span>
            </div>
            {overview.data.entriesNeedingReview.length ? (
              <div className="time-entry-list">
                {overview.data.entriesNeedingReview.slice(0, 8).map((entry) => (
                  <Link className="time-entry-row link-row" href={`/admin/time/${entry.user_id}`} key={entry.id}>
                    <div>
                      <strong>{entry.profiles?.full_name || entry.profiles?.email || "Employee"}</strong>
                      <span>{entry.entry_type.replace("_", " ")} - {entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
                    </div>
                    <div>
                      <b>{entry.clock_out_at ? `${getTimeEntryHours(entry).toFixed(2)}h` : "Active"}</b>
                      <small>Review</small>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyInline title="Nothing is waiting for review." body="Approved or active entries will stay out of this lane." />
            )}
          </section>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Time clock access</h2>
            <span>Enable or disable the timer per employee</span>
          </div>
          <div className="time-user-list">
            {overview.data.users.map((user) => (
              <article className="time-user-row" key={user.id}>
                <div>
                  <strong>{user.full_name || user.email || "Unnamed employee"}</strong>
                  <span>{user.role_names.join(", ") || "No role assigned"}</span>
                </div>
                <div className="time-user-actions">
                  <small>{user.time_clock_permission?.is_enabled ? "Enabled" : "Disabled"}</small>
                  <PermissionToggleForm permission={user.time_clock_permission} user={user} />
                  <Link className="secondary-action" href={`/admin/time/${user.id}`}>
                    <UsersRound aria-hidden="true" size={16} />
                    Open
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Time entries</h2>
            <span>Recent entries in the current filter window</span>
          </div>
          {overview.data.entries.length ? (
            <div className="time-entry-table">
              <div className="time-entry-table-header" aria-hidden="true">
                <span>Employee</span>
                <span>Type</span>
                <span>Linked work</span>
                <span>Clock</span>
                <span>Hours</span>
                <span>Review</span>
              </div>
              <div className="time-entry-table-body">
                {overview.data.entries.slice(0, 30).map((entry) => (
                  <article className="time-entry-table-row" key={entry.id}>
                    <span>{entry.profiles?.full_name || entry.profiles?.email || "Employee"}</span>
                    <span>{entry.entry_type.replace("_", " ")}</span>
                    <span>{entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
                    <span>{formatTimeRange(entry.clock_in_at, entry.clock_out_at)}</span>
                    <span>{entry.clock_out_at ? `${getTimeEntryHours(entry).toFixed(2)}h` : "Active"}</span>
                    <span>
                      <Link href={`/admin/time/${entry.user_id}`}>Open</Link>
                    </span>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <EmptyInline title="No time entries found." body="Clock-ins will appear here once the timer is in use." />
          )}
        </section>
      </div>
    </PlatformFrame>
  );
}

function SummaryChip({ emphasis, label, value }: { emphasis?: boolean; label: string; value: number | string }) {
  return (
    <div className={emphasis ? "commerce-summary-chip emphasis" : "commerce-summary-chip"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyInline({ body, title }: { body: string; title: string }) {
  return (
    <div className="crew-empty-inline">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function getDateFilterStart(value?: string) {
  return value ? `${value}T00:00:00.000Z` : undefined;
}

function getDateFilterEnd(value?: string) {
  return value ? `${value}T23:59:59.999Z` : undefined;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTimeRange(clockInAt: string, clockOutAt: string | null) {
  return `${formatTime(clockInAt)} - ${clockOutAt ? formatTime(clockOutAt) : "active"}`;
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
