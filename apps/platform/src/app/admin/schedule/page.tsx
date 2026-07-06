import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Navigation,
  Plus,
  X,
} from "lucide-react";
import { AppointmentEditForm } from "@/components/appointment-edit-form";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddAppointmentForm } from "./AppointmentForm";
import { updateAppointmentStatusFromForm } from "./actions";
import {
  appointmentStatuses,
  appointmentTypes,
  buildScheduleHref,
  formatDateInput,
  formatDayLabel,
  formatDayNumber,
  formatRangeTitle,
  formatShortLocation,
  formatTime,
  getAppointmentSummary,
  getAppointmentTone,
  getDateAnchor,
  getScheduleRange,
  getVisibleDays,
  groupAppointmentsByDate,
  isSameDay,
  isSameMonth,
  shiftDate,
  type ScheduleView,
} from "./schedule-utils";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getAppointments, getAssignableUsers } from "@/lib/data/appointments";
import { getJobOptions } from "@/lib/data/jobs";
import { getDirectionsUrl } from "@/lib/maps";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations, AssignableUser, Job } from "@/lib/types/database";

type SchedulePageProps = {
  searchParams: Promise<{
    appointment?: string;
    appointment_type?: string;
    assigned_user_id?: string;
    date?: string;
    new?: string;
    status?: string;
    view?: string;
  }>;
};

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const context = await getAuthenticatedPlatformContext("/admin/schedule");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening schedule" />;
  }

  const params = await searchParams;
  const view = getScheduleView(params.view);
  const date = getDateAnchor(params.date);
  const appointmentType = getAppointmentTypeFilter(params.appointment_type);
  const assignedUserId = getAssignedUserFilter(params.assigned_user_id);
  const status = getStatusFilter(params.status);
  const range = getScheduleRange(date, view);
  const [appointments, jobs, assignedUsers] = await Promise.all([
    getAppointments({
      assignedUserId,
      appointmentType,
      status,
      startsAtOrAfter: range.start.toISOString(),
      startsBefore: range.end.toISOString(),
    }),
    getJobOptions(),
    getAssignableUsers(),
  ]);
  const days = getVisibleDays(date, view);
  const groupedAppointments = groupAppointmentsByDate(appointments.data);
  const selectedAppointment = appointments.data.find((appointment) => appointment.id === params.appointment) ?? null;
  const query = {
    appointment_type: appointmentType,
    assigned_user_id: assignedUserId,
    date: formatDateInput(date),
    status,
    view,
  };

  return (
    <PlatformFrame active="schedule" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content calendar-page">
        <section className="page-heading calendar-page-heading">
          <p className="surface-label">
            <CalendarDays aria-hidden="true" size={15} />
            Schedule
          </p>
          <h1>Schedule</h1>
          <p>Estimates, field work, and follow-ups.</p>
        </section>

        {[appointments.error, jobs.error, assignedUsers.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="calendar-shell">
          <ScheduleToolbar
            appointmentType={appointmentType}
            assignedUserId={assignedUserId}
            assignedUsers={assignedUsers.data}
            current={query}
            date={date}
            range={range}
            status={status}
            view={view}
          />

          {view === "day" ? (
            <CalendarDayView appointments={groupedAppointments[formatDateInput(date)] ?? []} current={query} date={date} />
          ) : view === "month" ? (
            <CalendarMonthView anchor={date} appointmentsByDate={groupedAppointments} current={query} days={days} />
          ) : (
            <>
              <CalendarWeekView appointmentsByDate={groupedAppointments} current={query} days={days} />
              <CalendarMobileAgenda appointments={groupedAppointments[formatDateInput(date)] ?? []} current={query} date={date} />
            </>
          )}
        </section>

        {params.new === "1" ? (
          <AppointmentFormDrawer
            assignedUsers={assignedUsers.data}
            current={query}
            jobs={jobs.data}
          />
        ) : null}

        {selectedAppointment ? (
          <AppointmentDetailPanel
            appointment={selectedAppointment}
            assignedUsers={assignedUsers.data}
            current={query}
          />
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function ScheduleToolbar({
  appointmentType,
  assignedUserId,
  assignedUsers,
  current,
  date,
  range,
  status,
  view,
}: {
  appointmentType: AppointmentType | "all";
  assignedUserId: string;
  assignedUsers: AssignableUser[];
  current: Record<string, string>;
  date: Date;
  range: { start: Date; end: Date };
  status: AppointmentStatus | "all";
  view: ScheduleView;
}) {
  const today = new Date();

  return (
    <header className="calendar-toolbar">
      <div className="calendar-toolbar-primary">
        <Link className="calendar-nav-button" href={buildScheduleHref(current, { date: formatDateInput(today) })}>Today</Link>
        <Link className="calendar-icon-button" aria-label={`Previous ${view}`} href={buildScheduleHref(current, { date: formatDateInput(shiftDate(date, view, -1)) })}>
          <ChevronLeft aria-hidden="true" size={17} />
        </Link>
        <strong>{formatRangeTitle(date, range, view)}</strong>
        <Link className="calendar-icon-button" aria-label={`Next ${view}`} href={buildScheduleHref(current, { date: formatDateInput(shiftDate(date, view, 1)) })}>
          <ChevronRight aria-hidden="true" size={17} />
        </Link>
      </div>

      <div className="calendar-toolbar-actions">
        <nav className="segmented-control" aria-label="Calendar view">
          {(["day", "week", "month"] as const).map((calendarView) => (
            <Link
              aria-current={view === calendarView ? "page" : undefined}
              href={buildScheduleHref(current, { view: calendarView })}
              key={calendarView}
            >
              {calendarView}
            </Link>
          ))}
        </nav>

        <details className="schedule-filters">
          <summary>
            <Filter aria-hidden="true" size={15} />
            Filters
          </summary>
          <form className="schedule-filter-form">
            <input name="view" type="hidden" value={view} />
            <label>
              <span>Date</span>
              <input defaultValue={formatDateInput(date)} name="date" type="date" />
            </label>
            <label>
              <span>Assigned staff</span>
              <select defaultValue={assignedUserId} name="assigned_user_id">
                <option value="all">All staff</option>
                <option value="unassigned">Unassigned</option>
                {assignedUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email || "Unnamed staff user"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Type</span>
              <select defaultValue={appointmentType} name="appointment_type">
                {appointmentTypes.map((type) => (
                  <option key={type} value={type}>{type.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select defaultValue={status} name="status">
                {appointmentStatuses.map((appointmentStatus) => (
                  <option key={appointmentStatus} value={appointmentStatus}>{appointmentStatus.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <button type="submit">Apply</button>
          </form>
        </details>

        <Link className="calendar-add-button" href={buildScheduleHref(current, { new: "1" })}>
          <Plus aria-hidden="true" size={16} />
          Add appointment
        </Link>
      </div>
    </header>
  );
}

function CalendarWeekView({
  appointmentsByDate,
  current,
  days,
}: {
  appointmentsByDate: Record<string, AppointmentWithRelations[]>;
  current: Record<string, string>;
  days: Date[];
}) {
  const today = new Date();

  return (
    <section className="calendar-grid calendar-week-grid" aria-label="Week calendar">
      {days.map((day) => {
        const key = formatDateInput(day);
        const appointments = appointmentsByDate[key] ?? [];

        return (
          <article className={`calendar-day-column ${isSameDay(day, today) ? "is-today" : ""}`} key={key}>
            <Link className="calendar-day-heading" href={buildScheduleHref(current, { date: key, view: "day" })}>
              <span>{formatDayLabel(day)}</span>
              <strong>{formatDayNumber(day)}</strong>
            </Link>
            <div className="calendar-day-stack">
              {appointments.length > 0 ? (
                appointments.map((appointment) => (
                  <AppointmentCard appointment={appointment} compact current={current} key={appointment.id} />
                ))
              ) : (
                <p className="calendar-quiet-empty">No appointments</p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function CalendarDayView({
  appointments,
  current,
  date,
}: {
  appointments: AppointmentWithRelations[];
  current: Record<string, string>;
  date: Date;
}) {
  return (
    <section className="calendar-day-view" aria-label="Day agenda">
      <div className="calendar-agenda-heading">
        <span>{new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date)}</span>
        <strong>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date)}</strong>
      </div>
      {appointments.length > 0 ? (
        <div className="calendar-agenda-list">
          {appointments.map((appointment) => (
            <AppointmentCard appointment={appointment} current={current} key={appointment.id} />
          ))}
        </div>
      ) : (
        <section className="calendar-empty-agenda">
          <h2>No appointments today</h2>
          <p>This day is clear. Add an appointment when an estimate, field visit, or follow-up is ready.</p>
        </section>
      )}
    </section>
  );
}

function CalendarMobileAgenda({
  appointments,
  current,
  date,
}: {
  appointments: AppointmentWithRelations[];
  current: Record<string, string>;
  date: Date;
}) {
  return (
    <section className="calendar-mobile-agenda" aria-label="Mobile agenda">
      <CalendarDayView appointments={appointments} current={current} date={date} />
    </section>
  );
}

function CalendarMonthView({
  anchor,
  appointmentsByDate,
  current,
  days,
}: {
  anchor: Date;
  appointmentsByDate: Record<string, AppointmentWithRelations[]>;
  current: Record<string, string>;
  days: Date[];
}) {
  const today = new Date();

  return (
    <section className="calendar-month-grid" aria-label="Month calendar">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
        <span className="calendar-month-weekday" key={weekday}>{weekday}</span>
      ))}
      {days.map((day) => {
        const key = formatDateInput(day);
        const appointments = appointmentsByDate[key] ?? [];

        return (
          <Link
            className={`calendar-month-cell ${isSameDay(day, today) ? "is-today" : ""} ${!isSameMonth(day, anchor) ? "is-outside-month" : ""}`}
            href={buildScheduleHref(current, { date: key, view: "day" })}
            key={key}
          >
            <span>{formatDayNumber(day)}</span>
            {appointments.length > 0 ? (
              <small>{appointments.length} appointment{appointments.length === 1 ? "" : "s"}</small>
            ) : null}
            <div className="calendar-month-dots" aria-hidden="true">
              {appointments.slice(0, 4).map((appointment) => (
                <i className={`appointment-dot ${getAppointmentTone(appointment)}`} key={appointment.id} />
              ))}
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function AppointmentCard({
  appointment,
  compact = false,
  current,
}: {
  appointment: AppointmentWithRelations;
  compact?: boolean;
  current: Record<string, string>;
}) {
  const tone = getAppointmentTone(appointment);
  const location = formatShortLocation(appointment);

  return (
    <Link
      className={`calendar-appointment ${tone} ${compact ? "is-compact" : ""}`}
      href={buildScheduleHref(current, { appointment: appointment.id })}
    >
      <span className="appointment-time">
        <Clock3 aria-hidden="true" size={compact ? 12 : 14} />
        {formatTime(appointment.starts_at)}
        {appointment.ends_at ? ` to ${formatTime(appointment.ends_at)}` : ""}
      </span>
      <strong>{appointment.appointment_type.replace("_", " ")}</strong>
      <span>{getAppointmentSummary(appointment)}</span>
      <small>{appointment.status.replace("_", " ")} - {location}</small>
    </Link>
  );
}

function AppointmentFormDrawer({
  assignedUsers,
  current,
  jobs,
}: {
  assignedUsers: AssignableUser[];
  current: Record<string, string>;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
}) {
  return (
    <div className="appointment-overlay" role="dialog" aria-modal="true" aria-labelledby="add-appointment-title">
      <div className="appointment-backdrop" />
      <aside className="appointment-drawer">
        <div className="appointment-drawer-header">
          <div>
            <span>New appointment</span>
            <h2 id="add-appointment-title">Add appointment</h2>
            <p>Choose the job, timing, and staff assignment for this estimate, visit, or follow-up.</p>
          </div>
          <Link aria-label="Close add appointment" href={buildScheduleHref(current, { new: undefined })}>
            <X aria-hidden="true" size={17} />
          </Link>
        </div>
        <AddAppointmentForm assignedUsers={assignedUsers} jobs={jobs} />
        <Link className="drawer-cancel-link" href={buildScheduleHref(current, { new: undefined })}>Cancel</Link>
      </aside>
    </div>
  );
}

function AppointmentDetailPanel({
  appointment,
  assignedUsers,
  current,
}: {
  appointment: AppointmentWithRelations;
  assignedUsers: AssignableUser[];
  current: Record<string, string>;
}) {
  const directionsUrl = getDirectionsUrl(appointment.service_locations);

  return (
    <div className="appointment-overlay" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title">
      <div className="appointment-backdrop" />
      <aside className="appointment-popover">
        <div className="appointment-drawer-header">
          <div>
            <span>{appointment.appointment_type.replace("_", " ")}</span>
            <h2 id="appointment-detail-title">{getAppointmentSummary(appointment)}</h2>
          </div>
          <Link aria-label="Close appointment details" href={buildScheduleHref(current, { appointment: undefined })}>
            <X aria-hidden="true" size={17} />
          </Link>
        </div>

        <dl className="appointment-detail-list">
          <div>
            <dt>Time</dt>
            <dd>{formatTime(appointment.starts_at)}{appointment.ends_at ? ` to ${formatTime(appointment.ends_at)}` : ""}</dd>
          </div>
          <div>
            <dt>Type and status</dt>
            <dd>{appointment.appointment_type.replace("_", " ")} - {appointment.status.replace("_", " ")}</dd>
          </div>
          <div>
            <dt>Staff</dt>
            <dd>{appointment.profiles?.full_name || appointment.profiles?.email || "Unassigned"}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{formatShortLocation(appointment)}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{appointment.calendar_notes || appointment.jobs?.requested_scope || "No notes yet."}</dd>
          </div>
        </dl>

        <div className="appointment-detail-actions">
          <Link href={`/admin/jobs/${appointment.job_id}`}>Open job</Link>
          {directionsUrl ? <a href={directionsUrl} rel="noreferrer" target="_blank"><Navigation aria-hidden="true" size={15} />Directions</a> : null}
          <QuickStatusButton appointment={appointment} label="Mark confirmed" nextStatus="confirmed" />
          <QuickStatusButton appointment={appointment} label="Mark complete" nextStatus="completed" />
          <QuickStatusButton appointment={appointment} label="Cancel" nextStatus="cancelled" />
        </div>

        <details className="appointment-edit-details">
          <summary>Edit time, staff, or notes</summary>
          <AppointmentEditForm appointment={appointment} assignedUsers={assignedUsers} />
        </details>
      </aside>
    </div>
  );
}

function QuickStatusButton({
  appointment,
  label,
  nextStatus,
}: {
  appointment: AppointmentWithRelations;
  label: string;
  nextStatus: AppointmentStatus;
}) {
  return (
    <form action={updateAppointmentStatusFromForm}>
      <input name="appointment_id" type="hidden" value={appointment.id} />
      <input name="job_id" type="hidden" value={appointment.job_id} />
      <input name="next_status" type="hidden" value={nextStatus} />
      <button disabled={appointment.status === nextStatus} type="submit">{label}</button>
    </form>
  );
}

function getScheduleView(value?: string): ScheduleView {
  return value === "day" || value === "month" ? value : "week";
}

function getAppointmentTypeFilter(value?: string) {
  return appointmentTypes.includes(value as (typeof appointmentTypes)[number])
    ? value as AppointmentType | "all"
    : "all";
}

function getStatusFilter(value?: string) {
  return appointmentStatuses.includes(value as (typeof appointmentStatuses)[number])
    ? value as AppointmentStatus | "all"
    : "all";
}

function getAssignedUserFilter(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "all" || trimmed === "unassigned") {
    return trimmed || "all";
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : "all";
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
