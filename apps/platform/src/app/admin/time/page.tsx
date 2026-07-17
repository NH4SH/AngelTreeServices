import Link from "next/link";
import { AlertTriangle, Clock3, Filter, ShieldCheck, TimerReset, UsersRound } from "lucide-react";
import { PermissionToggleForm } from "@/components/time-clock";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { canReviewTimeClock } from "@/lib/auth/time-clock";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getEmployeeAccessRequests } from "@/lib/data/access-requests";
import { getJobOptions } from "@/lib/data/jobs";
import {
  getLatestTimeEntryReviewStatus,
  getOpenTimeEntryHours,
  getTimeClockOverview,
  getTimeEntryHours,
} from "@/lib/data/time-clock";

type AdminTimePageProps = {
  searchParams: Promise<{
    from?: string;
    job_id?: string;
    status?: string;
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

  const canReviewAccess = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const [overview, jobs, accessRequests] = await Promise.all([
    getTimeClockOverview({
      from: getDateFilterStart(params.from),
      jobId: params.job_id,
      status: getStatusFilter(params.status),
      to: getDateFilterEnd(params.to),
      userId: params.user_id,
    }),
    getJobOptions(),
    canReviewAccess ? getEmployeeAccessRequests() : Promise.resolve({ data: [], error: null }),
  ]);
  const pendingAccessRequests = accessRequests.data.filter((request) => request.status === "pending");
  const accessUsers = [...overview.data.users].sort((left, right) => {
    const leftRank = left.active_timer_entry_id ? 0 : left.time_clock_permission?.is_enabled ? 1 : 2;
    const rightRank = right.active_timer_entry_id ? 0 : right.time_clock_permission?.is_enabled ? 1 : 2;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (left.full_name || left.email || "").localeCompare(right.full_name || right.email || "");
  });
  const enabledCount = overview.data.users.filter((user) => user.time_clock_permission?.is_enabled).length;
  const disabledCount = Math.max(overview.data.users.length - enabledCount, 0);
  const crewRoleDisabledCount = overview.data.users.filter(
    (user) => user.role_names.includes("crew") && !user.time_clock_permission?.is_enabled,
  ).length;

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

        {[overview.error, jobs.error, accessRequests.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="commerce-summary-strip" aria-label="Time summary">
          <SummaryChip label="Active timers" value={overview.data.activeEntries.length} />
          <SummaryChip label="Need review" value={overview.data.entriesNeedingReview.length} />
          <SummaryChip label="Missing clock-out" value={overview.data.warnings.filter((warning) => warning.kind === "missing_clock_out").length} />
          <SummaryChip emphasis label="Hours in view" value={`${overview.data.totalHours.toFixed(2)}h`} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Warnings</h2>
            <span>Catch issues before payroll review gets messy</span>
          </div>
          {overview.data.warnings.length ? (
            <div className="payroll-warning-list">
              {overview.data.warnings.slice(0, 8).map((warning) => (
                <Link className="payroll-warning-card" href={warning.user_id ? `/admin/time/${warning.user_id}` : "/admin/time"} key={warning.id}>
                  <AlertTriangle aria-hidden="true" size={16} />
                  <div>
                    <strong>{warning.title}</strong>
                    <p>{warning.detail}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyInline title="No time warnings in this window." body="Active timers, overlaps, and missing links will surface here." />
          )}
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
              <span>Status</span>
              <select defaultValue={params.status ?? ""} name="status">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="adjusted">Adjusted</option>
                <option value="void">Void</option>
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
                      <span>{entry.entry_type.replace("_", " ")} - {entry.jobs?.organizations?.name || entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
                      {entry.entry_type === "job" && !entry.job_id && !entry.schedule_event_id ? (
                        <small className="time-row-warning">Missing linked job or schedule event.</small>
                      ) : null}
                    </div>
                    <div>
                      <b>{getOpenTimeEntryHours(entry).toFixed(2)}h live</b>
                      <small>Since {formatTime(entry.clock_in_at)} · {formatDate(entry.clock_in_at)}</small>
                      {getOpenTimeEntryHours(entry) > 12 ? (
                        <small className="time-row-warning">Over 12 hours</small>
                      ) : null}
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
                      <span>{entry.entry_type.replace("_", " ")} - {entry.jobs?.organizations?.name || entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
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
            <span>Enable or disable the timer per eligible employee</span>
          </div>
          <p className="time-access-copy">
            Timer access controls whether this employee can clock in/out. It does not change their pay rate or payroll status.
          </p>
          <div className="commerce-summary-strip time-access-strip" aria-label="Time clock access summary">
            <SummaryChip label="Eligible employees" value={overview.data.users.length} />
            <SummaryChip label="Enabled" value={enabledCount} />
            <SummaryChip label="Disabled" value={disabledCount} />
            <SummaryChip label="Crew disabled" value={crewRoleDisabledCount} />
            <SummaryChip emphasis label="Pending access" value={pendingAccessRequests.length} />
          </div>
          {pendingAccessRequests.length ? (
            <div className="time-pending-access-list" aria-label="Pending employee access requests">
              {pendingAccessRequests.slice(0, 4).map((request) => (
                <Link className="time-pending-access-card" href="/admin/access" key={request.id}>
                  <strong>{request.full_name}</strong>
                  <span>{request.email}</span>
                  <small>
                    Pending {request.requested_role?.replace("_", " ") || "access"} request. Time clock access can be enabled during approval.
                  </small>
                </Link>
              ))}
            </div>
          ) : null}
          {accessUsers.length ? (
            <div className="time-user-list">
              {accessUsers.map((user) => (
              <article className={user.role_names.includes("crew") && !user.time_clock_permission?.is_enabled ? "time-user-row needs-access" : "time-user-row"} key={user.id}>
                <div>
                  <strong>{user.full_name || user.email || "Unnamed employee"}</strong>
                  <span>{user.role_names.join(", ") || "No role assigned"}</span>
                  {user.role_names.includes("crew") && !user.time_clock_permission?.is_enabled ? (
                    <small className="time-row-warning">Crew role but timer disabled.</small>
                  ) : null}
                  {user.active_timer_entry_id ? (
                    <small className="time-row-warning">
                      Clocked in on {user.active_timer_entry_type?.replace("_", " ") || "active time"} since {formatDateTime(user.active_timer_started_at || "")}
                      {user.active_timer_work_label ? ` · ${user.active_timer_work_label}` : ""}
                    </small>
                  ) : null}
                  {user.time_clock_permission ? (
                    <small className="time-permission-meta">
                      {user.time_clock_permission.is_enabled ? "Enabled" : "Disabled"}{" "}
                      {user.time_clock_permission_changed_at ? `· ${formatDateTime(user.time_clock_permission_changed_at)}` : ""}
                      {user.time_clock_permission_set_by_label ? ` · ${user.time_clock_permission_set_by_label}` : ""}
                    </small>
                  ) : (
                    <small className="time-permission-meta">No timer permission row yet.</small>
                  )}
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
          ) : (
            <EmptyInline title="No eligible employees found." body="Add owner, admin, estimator, payroll, or crew roles before enabling the timer." />
          )}
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
                <span>Status</span>
              </div>
              <div className="time-entry-table-body">
                {overview.data.entries.slice(0, 30).map((entry) => (
                  <article className="time-entry-table-row" key={entry.id}>
                    <span>
                      <strong>{entry.profiles?.full_name || entry.profiles?.email || "Employee"}</strong>
                      {entry.notes ? <small>{entry.notes}</small> : null}
                    </span>
                    <span>{entry.entry_type.replace("_", " ")}</span>
                    <span>{entry.jobs?.organizations?.name || entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
                    <span>{formatTimeRange(entry.clock_in_at, entry.clock_out_at)}</span>
                    <span>{entry.clock_out_at ? `${getTimeEntryHours(entry).toFixed(2)}h` : "Active"}</span>
                    <span>
                      <b>{entry.status.replace("_", " ")}</b>
                      <small>{formatReviewStatus(getLatestTimeEntryReviewStatus(entry))}</small>
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

function getStatusFilter(value?: string) {
  return value === "active" || value === "completed" || value === "adjusted" || value === "void"
    ? value
    : undefined;
}

function formatReviewStatus(value: ReturnType<typeof getLatestTimeEntryReviewStatus>) {
  return value === "pending" ? "Pending review" : value.replace("_", " ");
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
