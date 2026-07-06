import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Lock,
  ReceiptText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { CreatePayPeriodForm, formatPayPeriodStatus, PayPeriodStatusForm } from "@/components/payroll";
import { TimeEntryApprovalForm } from "@/components/time-clock";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { canReviewTimeClock } from "@/lib/auth/time-clock";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getPayrollReviewData } from "@/lib/data/payroll";
import {
  getLatestTimeEntryReviewStatus,
  getTimeEntryHours,
} from "@/lib/data/time-clock";

type AdminPayrollPageProps = {
  searchParams: Promise<{
    pay_period_id?: string;
  }>;
};

export default async function AdminPayrollPage({ searchParams }: AdminPayrollPageProps) {
  const context = await getAuthenticatedPlatformContext("/admin/payroll");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening payroll review" />;
  }

  if (!canReviewTimeClock(context.roles)) {
    return (
      <PlatformFrame active="payroll" roles={context.roles} userEmail={context.user.email}>
        <div className="shell app-content">
          <section className="page-heading">
            <p className="surface-label">
              <ReceiptText aria-hidden="true" size={18} />
              Payroll review
            </p>
            <h1>Payroll</h1>
            <p>This route is reserved for owners, admins, and payroll admins.</p>
          </section>
        </div>
      </PlatformFrame>
    );
  }

  const params = await searchParams;
  const payroll = await getPayrollReviewData(params.pay_period_id);
  const selectedPayPeriod = payroll.data.selected_pay_period;

  return (
    <PlatformFrame active="payroll" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content payroll-page">
        <section className="page-heading">
          <p className="surface-label">
            <ReceiptText aria-hidden="true" size={18} />
            Payroll review
          </p>
          <h1>Payroll</h1>
          <p>Review hours by pay period, flag problems before export, and keep approval notes inside the platform.</p>
        </section>

        {payroll.error ? <DataWarning message={payroll.error} /> : null}

        <section className="commerce-summary-strip" aria-label="Payroll summary">
          <SummaryChip label="Employees" value={payroll.data.employee_summaries.length} />
          <SummaryChip label="Hours" value={`${payroll.data.summary.total_hours.toFixed(2)}h`} />
          <SummaryChip label="Pending review" value={payroll.data.summary.pending_review_count} />
          <SummaryChip emphasis label="Warnings" value={payroll.data.warnings.length} />
        </section>

        <section className="payroll-top-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>Pay period</h2>
              <span>Select the review window and export scaffold</span>
            </div>
            {payroll.data.pay_periods.length ? (
              <div className="payroll-period-stack">
                <form className="schedule-filter-form payroll-picker-form">
                  <label>
                    <span>Active pay period</span>
                    <select defaultValue={selectedPayPeriod?.id ?? ""} name="pay_period_id">
                      {payroll.data.pay_periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {formatPayPeriodLabel(period.starts_at, period.ends_at)} - {formatPayPeriodStatus(period.status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Open</button>
                </form>

                {selectedPayPeriod ? (
                  <>
                    <div className="payroll-period-card">
                      <div>
                        <strong>{formatPayPeriodLabel(selectedPayPeriod.starts_at, selectedPayPeriod.ends_at)}</strong>
                        <span>Status: {formatPayPeriodStatus(selectedPayPeriod.status)}</span>
                      </div>
                      <div className="payroll-period-meta">
                        <small>{selectedPayPeriod.notes || "No internal note on this period yet."}</small>
                        <Link className="secondary-action" href={`/admin/payroll/export?pay_period_id=${selectedPayPeriod.id}`}>
                          <Download aria-hidden="true" size={16} />
                          Export CSV
                        </Link>
                      </div>
                    </div>
                    <PayPeriodStatusForm payPeriod={selectedPayPeriod} />
                    <p className="field-note">
                      Locking is a workflow scaffold for review state right now. It does not yet block every edit path elsewhere in the app.
                    </p>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="crew-empty-inline">
                <strong>No pay periods yet.</strong>
                <p>Create the first review window below to start grouping time for payroll review.</p>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Create pay period</h2>
              <span>Internal review windows only</span>
            </div>
            <CreatePayPeriodForm />
          </section>
        </section>

        <section className="payroll-summary-grid">
          <SummaryPanel icon={<Clock3 aria-hidden="true" size={17} />} label="Regular hours" value={`${payroll.data.summary.regular_hours.toFixed(2)}h`} />
          <SummaryPanel icon={<ShieldCheck aria-hidden="true" size={17} />} label="Approved entries" value={payroll.data.summary.approved_count} />
          <SummaryPanel icon={<AlertTriangle aria-hidden="true" size={17} />} label="Missing clock out" value={payroll.data.summary.entries_missing_clock_out} />
          <SummaryPanel icon={<Lock aria-hidden="true" size={17} />} label="Adjusted entries" value={payroll.data.summary.adjusted_count} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Warnings</h2>
            <span>Things to clean up before payroll export</span>
          </div>
          {payroll.data.warnings.length ? (
            <div className="payroll-warning-list">
              {payroll.data.warnings.map((warning) => (
                <article className="payroll-warning-card" key={warning.id}>
                  <AlertTriangle aria-hidden="true" size={16} />
                  <div>
                    <strong>{warning.title}</strong>
                    <p>{warning.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="crew-empty-inline">
              <strong>No payroll warnings in this period.</strong>
              <p>Overlaps, missing clock-outs, and suspicious durations will surface here.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Employees</h2>
            <span>Hours and review state by employee</span>
          </div>
          {payroll.data.employee_summaries.length ? (
            <div className="payroll-employee-grid">
              {payroll.data.employee_summaries.map((employee) => (
                <article className="payroll-employee-card" key={employee.user_id}>
                  <div className="payroll-employee-card-top">
                    <div>
                      <strong>{employee.employee_label}</strong>
                      <span>{employee.entry_count} entries in this period</span>
                    </div>
                    <Link className="secondary-action compact-action" href={`/admin/time/${employee.user_id}`}>
                      <UsersRound aria-hidden="true" size={16} />
                      Open time
                    </Link>
                  </div>
                  <dl className="record-details">
                    <div>
                      <dt>Total hours</dt>
                      <dd>{employee.total_hours.toFixed(2)}h</dd>
                    </div>
                    <div>
                      <dt>Job hours</dt>
                      <dd>{employee.job_hours.toFixed(2)}h</dd>
                    </div>
                    <div>
                      <dt>Drive / shop / admin</dt>
                      <dd>{employee.drive_hours.toFixed(2)} / {employee.shop_hours.toFixed(2)} / {employee.admin_hours.toFixed(2)}h</dd>
                    </div>
                    <div>
                      <dt>Maintenance</dt>
                      <dd>{employee.maintenance_hours.toFixed(2)}h</dd>
                    </div>
                    <div>
                      <dt>Pending review</dt>
                      <dd>{employee.pending_review_count}</dd>
                    </div>
                    <div>
                      <dt>Needs correction</dt>
                      <dd>{employee.needs_correction_count}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="crew-empty-inline">
              <strong>No time entries in this pay period.</strong>
              <p>Once the crew starts using the timer, entries will group here for review.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Entry review queue</h2>
            <span>Approve, reject, or request correction before export</span>
          </div>
          {payroll.data.entries.length ? (
            <div className="time-detail-list">
              {payroll.data.entries.slice(0, 40).map((entry) => (
                <article className="time-detail-card payroll-entry-card" key={entry.id}>
                  <div className="time-detail-card-header">
                    <div>
                      <strong>{entry.profiles?.full_name || entry.profiles?.email || "Employee"}</strong>
                      <span>
                        {entry.entry_type.replace("_", " ")} - {entry.jobs?.customers?.display_name || entry.schedule_events?.title || "No linked work"}
                      </span>
                    </div>
                    <b>{entry.clock_out_at ? `${getTimeEntryHours(entry).toFixed(2)}h` : "Active"}</b>
                  </div>
                  <dl className="record-details">
                    <div>
                      <dt>Date</dt>
                      <dd>{formatDate(entry.clock_in_at)}</dd>
                    </div>
                    <div>
                      <dt>Clock</dt>
                      <dd>{formatRange(entry.clock_in_at, entry.clock_out_at)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{entry.status.replace("_", " ")}</dd>
                    </div>
                    <div>
                      <dt>Review</dt>
                      <dd>{formatReviewStatus(getLatestTimeEntryReviewStatus(entry))}</dd>
                    </div>
                  </dl>
                  {entry.notes ? <p className="field-note">{entry.notes}</p> : null}
                  <div className="payroll-entry-actions">
                    <TimeEntryApprovalForm timeEntry={entry} userId={entry.user_id} />
                    <Link className="secondary-action compact-action" href={`/admin/time/${entry.user_id}`}>
                      <CheckCircle2 aria-hidden="true" size={16} />
                      Full history
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="crew-empty-inline">
              <strong>No entries to review yet.</strong>
              <p>Select another pay period or wait for time to be clocked this cycle.</p>
            </div>
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

function SummaryPanel({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <article className="payroll-summary-panel">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRange(clockInAt: string, clockOutAt: string | null) {
  return `${formatTime(clockInAt)} - ${clockOutAt ? formatTime(clockOutAt) : "active"}`;
}

function formatPayPeriodLabel(startsAt: string, endsAt: string) {
  return `${startsAt.slice(0, 10)} to ${endsAt.slice(0, 10)}`;
}

function formatReviewStatus(status: ReturnType<typeof getLatestTimeEntryReviewStatus>) {
  return status === "pending" ? "Pending review" : status.replace("_", " ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
