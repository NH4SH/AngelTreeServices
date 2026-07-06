import Link from "next/link";
import { CheckCircle2, Clock3, ShieldCheck, TimerReset, UsersRound } from "lucide-react";
import {
  PermissionToggleForm,
  TimeEntryAdjustmentForm,
  TimeEntryApprovalForm,
} from "@/components/time-clock";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { canReviewTimeClock } from "@/lib/auth/time-clock";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import {
  getLatestTimeEntryReviewStatus,
  getTimeClockUserDetail,
  getTimeEntryHours,
} from "@/lib/data/time-clock";

type AdminTimeUserPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function AdminTimeUserPage({ params }: AdminTimeUserPageProps) {
  const { userId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/time/${userId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening time review" />;
  }

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

  const detail = await getTimeClockUserDetail(userId);

  return (
    <PlatformFrame active="admin-time" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <UsersRound aria-hidden="true" size={18} />
            Employee time
          </p>
          <h1>{detail.data.user?.full_name || detail.data.user?.email || "Employee time"}</h1>
          <p>Review one employee's entries, approval history, and adjustment log.</p>
        </section>

        {detail.error ? <DataWarning message={detail.error} /> : null}

        <section className="commerce-summary-strip" aria-label="Employee time summary">
          <SummaryChip label="Entries" value={detail.data.entries.length} />
          <SummaryChip label="Approved" value={detail.data.entries.filter((entry) => getLatestTimeEntryReviewStatus(entry) === "approved").length} />
          <SummaryChip label="Adjusted" value={detail.data.entries.filter((entry) => entry.status === "adjusted").length} />
          <SummaryChip emphasis label="Hours" value={`${detail.data.totalHours.toFixed(2)}h`} />
        </section>

        <section className="time-admin-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>Access</h2>
              <span>Clock enablement for this account</span>
            </div>
            {detail.data.user ? (
              <div className="time-user-actions detail-user-actions">
                <small>{detail.data.user.time_clock_permission?.is_enabled ? "Enabled" : "Disabled"}</small>
                <PermissionToggleForm permission={detail.data.user.time_clock_permission} user={detail.data.user} />
                <Link className="secondary-action" href="/admin/time">
                  <ShieldCheck aria-hidden="true" size={16} />
                  Back to time
                </Link>
              </div>
            ) : (
              <p className="field-note">User not found or no access.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Current state</h2>
              <span>Active timer visibility</span>
            </div>
            {detail.data.activeEntry ? (
              <div className="time-entry-row">
                <div>
                  <strong>{detail.data.activeEntry.entry_type.replace("_", " ")}</strong>
                  <span>{detail.data.activeEntry.jobs?.customers?.display_name || detail.data.activeEntry.schedule_events?.title || "No linked record"}</span>
                </div>
                <div>
                  <b>Since {formatTime(detail.data.activeEntry.clock_in_at)}</b>
                  <small>Active</small>
                </div>
              </div>
            ) : (
              <div className="crew-empty-inline">
                <strong>No active timer.</strong>
                <p>This employee is currently clocked out.</p>
              </div>
            )}
          </section>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Entries</h2>
            <span>Approve or adjust without losing original history</span>
          </div>
          {detail.data.entries.length ? (
            <div className="time-detail-list">
              {detail.data.entries.map((entry) => (
                <article className="time-detail-card" key={entry.id}>
                  <div className="time-detail-card-header">
                    <div>
                      <strong>{entry.entry_type.replace("_", " ")}</strong>
                      <span>{entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked record"}</span>
                    </div>
                    <b>{entry.clock_out_at ? `${getTimeEntryHours(entry).toFixed(2)}h` : "Active"}</b>
                  </div>
                  <dl className="record-details">
                    <div>
                      <dt>Status</dt>
                      <dd>{entry.status}</dd>
                    </div>
                    <div>
                      <dt>Clock</dt>
                      <dd>{formatRange(entry.clock_in_at, entry.clock_out_at)}</dd>
                    </div>
                    <div>
                      <dt>Break</dt>
                      <dd>{entry.break_minutes} min</dd>
                    </div>
                    <div>
                      <dt>Approvals</dt>
                      <dd>{formatReviewStatus(getLatestTimeEntryReviewStatus(entry))}</dd>
                    </div>
                  </dl>
                  {entry.notes ? <p className="field-note">{entry.notes}</p> : null}

                  <div className="time-review-grid">
                    <section className="panel">
                      <div className="panel-header">
                        <h2>Approve</h2>
                        <span>Scaffold for payroll review</span>
                      </div>
                      <TimeEntryApprovalForm timeEntry={entry} userId={userId} />
                      {(entry.time_entry_approvals?.length ?? 0) > 0 ? (
                        <ul className="mini-list">
                          {entry.time_entry_approvals?.map((approval) => (
                            <li key={approval.id}>
                              <CheckCircle2 aria-hidden="true" size={14} />
                              {formatReviewStatus(approval.approval_status)} - {formatDateTime(approval.approved_at)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>

                    <section className="panel">
                      <div className="panel-header">
                        <h2>Adjust</h2>
                        <span>Preserves original values in history</span>
                      </div>
                      <TimeEntryAdjustmentForm timeEntry={entry} userId={userId} />
                      {(entry.time_entry_adjustments?.length ?? 0) > 0 ? (
                        <ul className="mini-list">
                          {entry.time_entry_adjustments?.map((adjustment) => (
                            <li key={adjustment.id}>
                              <TimerReset aria-hidden="true" size={14} />
                              {formatDateTime(adjustment.created_at)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="crew-empty-inline">
              <strong>No time entries yet.</strong>
              <p>Once this employee starts using the timer, entries will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </PlatformFrame>
  );
}

function formatReviewStatus(value: ReturnType<typeof getLatestTimeEntryReviewStatus>) {
  return value === "pending" ? "Pending review" : value.replace("_", " ");
}

function SummaryChip({ emphasis, label, value }: { emphasis?: boolean; label: string; value: number | string }) {
  return (
    <div className={emphasis ? "commerce-summary-chip emphasis" : "commerce-summary-chip"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRange(clockInAt: string, clockOutAt: string | null) {
  return `${formatTime(clockInAt)} - ${clockOutAt ? formatTime(clockOutAt) : "active"}`;
}

function formatDateTime(value: string) {
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
