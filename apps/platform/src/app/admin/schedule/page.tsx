import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Navigation, UserRound } from "lucide-react";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { AppointmentEditForm } from "@/components/appointment-edit-form";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddAppointmentForm } from "./AppointmentForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getAppointments, getAssignableUsers } from "@/lib/data/appointments";
import { getJobOptions } from "@/lib/data/jobs";
import { getDirectionsUrl } from "@/lib/maps";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations } from "@/lib/types/database";

const appointmentTypes: (AppointmentType | "all")[] = ["all", "estimate", "job", "follow_up", "maintenance"];
const appointmentStatuses: (AppointmentStatus | "all")[] = [
  "all",
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

type SchedulePageProps = {
  searchParams: Promise<{
    appointment_type?: string;
    date?: string;
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
  const view = params.view === "day" ? "day" : "week";
  const date = getDateAnchor(params.date);
  const type = appointmentTypes.includes(params.appointment_type as AppointmentType) ? params.appointment_type as AppointmentType : "all";
  const status = appointmentStatuses.includes(params.status as AppointmentStatus) ? params.status as AppointmentStatus : "all";
  const range = getScheduleRange(date, view);
  const [appointments, jobs, assignedUsers] = await Promise.all([
    getAppointments({
      appointmentType: type,
      status,
      startsAtOrAfter: range.start.toISOString(),
      startsBefore: range.end.toISOString(),
    }),
    getJobOptions(),
    getAssignableUsers(),
  ]);
  const groupedAppointments = groupAppointmentsByDay(appointments.data);

  return (
    <PlatformFrame active="schedule" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <CalendarDays aria-hidden="true" size={18} />
            Schedule
          </p>
          <h1>Plan estimates, field work, and follow-ups without calendar clutter.</h1>
          <p>Use the day or week list to keep the office moving. External calendar sync can wait until the workflow is proven.</p>
        </section>

        {[appointments.error, jobs.error, assignedUsers.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="schedule-toolbar" aria-label="Schedule filters">
          <div className="schedule-view-toggle" aria-label="Schedule view">
            <Link aria-current={view === "day" ? "page" : undefined} href={buildScheduleHref(params, { view: "day" })}>Day</Link>
            <Link aria-current={view === "week" ? "page" : undefined} href={buildScheduleHref(params, { view: "week" })}>Week</Link>
          </div>
          <div className="schedule-date-nav">
            <Link aria-label={`Previous ${view}`} href={buildScheduleHref(params, { date: formatDateInput(shiftDate(date, view === "day" ? -1 : -7)) })}>
              <ChevronLeft aria-hidden="true" size={18} />
            </Link>
            <strong>{formatRange(range.start, range.end, view)}</strong>
            <Link aria-label={`Next ${view}`} href={buildScheduleHref(params, { date: formatDateInput(shiftDate(date, view === "day" ? 1 : 7)) })}>
              <ChevronRight aria-hidden="true" size={18} />
            </Link>
          </div>
          <form className="schedule-filter-form">
            <input name="view" type="hidden" value={view} />
            <label>
              <span>Anchor date</span>
              <input defaultValue={formatDateInput(date)} name="date" type="date" />
            </label>
            <label>
              <span>Type</span>
              <select defaultValue={type} name="appointment_type">
                {appointmentTypes.map((appointmentType) => (
                  <option key={appointmentType} value={appointmentType}>{appointmentType.replace("_", " ")}</option>
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
            <button type="submit">Apply filters</button>
          </form>
        </section>

        <section className="crm-layout">
          <div className="crm-main">
            {groupedAppointments.length === 0 ? (
              <EmptyState title="No scheduled work in this view" body="Try another date or add an estimate, job, maintenance visit, or follow-up." />
            ) : (
              <div className="schedule-day-list">
                {groupedAppointments.map(([day, dayAppointments]) => (
                  <section className="schedule-day-group" key={day}>
                    <h2>{formatDayHeading(day)}</h2>
                    <div className="record-list">
                      {dayAppointments.map((appointment) => (
                        <AppointmentCard appointment={appointment} assignedUsers={assignedUsers.data} key={appointment.id} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <aside className="crm-side">
            <section className="form-panel">
              <h2>Add appointment</h2>
              <AddAppointmentForm assignedUsers={assignedUsers.data} jobs={jobs.data} />
            </section>
            <section className="notice-panel">
              <strong>Lightweight by design</strong>
              <p>Estimate, job, maintenance, and follow-up records stay simple until external calendar sync is justified.</p>
            </section>
          </aside>
        </section>
      </div>
    </PlatformFrame>
  );
}

function AppointmentCard({ appointment, assignedUsers }: { appointment: AppointmentWithRelations; assignedUsers: Awaited<ReturnType<typeof getAssignableUsers>>["data"] }) {
  const directionsUrl = getDirectionsUrl(appointment.service_locations);

  return (
    <article className="record-card appointment-card">
      <div className="record-card-header">
        <div>
          <h3>{appointment.appointment_type.replace("_", " ")}</h3>
          <p>{formatDateTime(appointment.starts_at)}{appointment.ends_at ? ` to ${formatTime(appointment.ends_at)}` : ""}</p>
        </div>
        <span className="status-pill">{appointment.status.replace("_", " ")}</span>
      </div>
      {appointment.service_locations ? (
        <p className="inline-icon-line">
          <MapPin aria-hidden="true" size={15} />
          {appointment.service_locations.street}, {appointment.service_locations.city}
        </p>
      ) : null}
      <p className="inline-icon-line">
        <UserRound aria-hidden="true" size={15} />
        {appointment.profiles?.full_name || appointment.profiles?.email || "Unassigned"}
      </p>
      <p>{appointment.calendar_notes || appointment.jobs?.requested_scope || "No notes yet."}</p>
      <div className="record-actions">
        <Link href={`/admin/jobs/${appointment.job_id}`}>Open job</Link>
        {directionsUrl ? (
          <a href={directionsUrl} rel="noreferrer" target="_blank">
            <Navigation aria-hidden="true" size={15} />
            Directions
          </a>
        ) : null}
      </div>
      <AppointmentStatusActions appointmentId={appointment.id} currentStatus={appointment.status} jobId={appointment.job_id} />
      <details className="appointment-edit-details">
        <summary>Edit appointment</summary>
        <AppointmentEditForm appointment={appointment} assignedUsers={assignedUsers} />
      </details>
    </article>
  );
}

function getDateAnchor(value?: string) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getScheduleRange(anchor: Date, view: "day" | "week") {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  if (view === "week") {
    start.setDate(start.getDate() - start.getDay());
  }

  const end = new Date(start);
  end.setDate(end.getDate() + (view === "day" ? 1 : 7));
  return { start, end };
}

function shiftDate(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function buildScheduleHref(
  current: SchedulePageProps["searchParams"] extends Promise<infer T> ? T : never,
  updates: Record<string, string>,
) {
  const params = new URLSearchParams();
  Object.entries({ ...current, ...updates }).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return `/admin/schedule?${params.toString()}`;
}

function groupAppointmentsByDay(appointments: AppointmentWithRelations[]) {
  return Object.entries(
    appointments.reduce<Record<string, AppointmentWithRelations[]>>((groups, appointment) => {
      const key = formatDateInput(new Date(appointment.starts_at));
      groups[key] = [...(groups[key] ?? []), appointment];
      return groups;
    }, {}),
  );
}

function formatDateInput(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatRange(start: Date, end: Date, view: "day" | "week") {
  if (view === "day") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(start);
  }

  const inclusiveEnd = new Date(end);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start)} - ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(inclusiveEnd)}`;
}

function formatDayHeading(day: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state"><h2>{title}</h2><p>{body}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
