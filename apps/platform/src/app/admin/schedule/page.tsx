import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  MapPinned,
  Navigation,
  Plus,
  UsersRound,
  X,
} from "lucide-react";
import { AppointmentEditForm } from "@/components/appointment-edit-form";
import { CommunicationControls } from "@/components/communication-controls";
import { PlatformFrame } from "@/components/PlatformFrame";
import { MarkJobCompleteAction } from "@/components/workflow-actions";
import { SetupRequired } from "@/components/SetupRequired";
import { DailyCrewScheduleActions } from "./DailyCrewScheduleActions";
import { ScheduleEventDrawerContent, ScheduleEventEditForm } from "./ScheduleEventForm";
import {
  updateAppointmentStatusFromForm,
  updateScheduleEventStatusFromForm,
} from "./actions";
import {
  appointmentStatuses,
  buildScheduleHref,
  formatDateInput,
  formatDateTimeLabel,
  formatEntryLocation,
  formatDayLabel,
  formatDayNumber,
  formatRangeTitle,
  formatTime,
  getDateAnchor,
  getEntrySummary,
  getEntryTone,
  getEventTypeLabel,
  getStatusLabel,
  getScheduleRange,
  getVisibleDays,
  groupEntriesByDate,
  isSameDay,
  isSameMonth,
  scheduleEventTypes,
  shiftDate,
  type ScheduleView,
} from "./schedule-utils";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getScheduleJobOptions } from "@/lib/data/jobs";
import { getScheduleCustomerOptions } from "@/lib/data/customers";
import { getScheduleCalendarData } from "@/lib/data/schedule";
import { getCommunicationRecipientOptions, getCustomerCommunications } from "@/lib/data/communications";
import { getDirectionsUrl } from "@/lib/maps";
import type {
  AppointmentStatus,
  AppointmentWithRelations,
  AssignableUser,
  CalendarEntry,
  ScheduleJobOption,
  ScheduleConflict,
  ScheduleEventStatus,
  ScheduleEventWithRelations,
  ScheduleUser,
} from "@/lib/types/database";

type SchedulePageProps = {
  searchParams: Promise<{
    appointment?: string;
    assigned_user_id?: string;
    date?: string;
    event?: string;
    event_type?: string;
    job?: string;
    new?: string;
    status?: string;
    view?: string;
  }>;
};

type ScheduleQuery = {
  assigned_user_id: string;
  date: string;
  event_type: (typeof scheduleEventTypes)[number];
  status: (typeof appointmentStatuses)[number];
  view: ScheduleView;
};

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const context = await getAuthenticatedPlatformContext("/admin/schedule");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening schedule" />;
  }

  const params = await searchParams;
  const view = getScheduleView(params.view);
  const date = getDateAnchor(params.date);
  const eventType = getEventTypeFilter(params.event_type);
  const assignedUserId = getAssignedUserFilter(params.assigned_user_id);
  const status = getStatusFilter(params.status);
  const range = getScheduleRange(date, view);
  const [schedule, jobs, customers] = await Promise.all([
    getScheduleCalendarData({
      assignedUserId,
      eventType,
      status,
      startsAtOrAfter: range.start.toISOString(),
      startsBefore: range.end.toISOString(),
    }),
    getScheduleJobOptions(),
    getScheduleCustomerOptions(),
  ]);
  const days = getVisibleDays(date, view);
  const groupedEntries = groupEntriesByDate(schedule.data.entries);
  const selectedAppointment =
    schedule.data.appointments.find((appointment) => appointment.id === params.appointment) ?? null;
  const selectedEvent =
    schedule.data.scheduleEvents.find((event) => event.id === params.event) ?? null;
  const selectedCustomerId = selectedEvent?.jobs?.customer_id ?? selectedAppointment?.jobs?.customer_id ?? null;
  const selectedOrganizationId = selectedEvent?.jobs?.organization_id ?? selectedAppointment?.jobs?.organization_id ?? null;
  const selectedCommunications = selectedEvent
    ? await getCustomerCommunications({ scheduleEventId: selectedEvent.id, limit: 20 })
    : selectedAppointment
      ? await getCustomerCommunications({ appointmentId: selectedAppointment.id, limit: 20 })
      : { data: [], error: null };
  const selectedRecipients = selectedCustomerId || selectedOrganizationId
    ? await getCommunicationRecipientOptions({ customerId: selectedCustomerId, organizationId: selectedOrganizationId })
    : { data: [], error: null };
  const query: ScheduleQuery = {
    assigned_user_id: assignedUserId,
    date: formatDateInput(date),
    event_type: eventType,
    status,
    view,
  };
  const summary = buildScheduleSummary(schedule.data.entries, schedule.data.users);
  const attention = buildScheduleAttention(schedule.data.entries, schedule.data.conflicts);
  const dayEntries = groupedEntries[formatDateInput(date)] ?? [];
  const crewDayGroups = buildCrewAssignmentsForDay(dayEntries, schedule.data.users);
  const dayShareText = buildCrewShareText(date, crewDayGroups);

  return (
    <PlatformFrame active="schedule" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content calendar-page company-calendar-page">
        <section className="page-heading calendar-page-heading">
          <p className="surface-label">
            <CalendarDays aria-hidden="true" size={15} />
            Employee calendar
          </p>
          <h1>Schedule</h1>
          <p>Jobs, estimates, follow-ups, PTO, internal events, and crew assignments in one place.</p>
        </section>

        {[schedule.error, jobs.error, customers.error, selectedCommunications.error, selectedRecipients.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="calendar-shell company-calendar-shell">
          <ScheduleToolbar
            assignedUserId={assignedUserId}
            current={query}
            date={date}
            range={range}
            status={status}
            summary={summary}
            users={schedule.data.users}
            eventType={eventType}
            view={view}
          />

          <section className="calendar-summary-strip" aria-label="Visible calendar summary">
            <SummaryChip label="Visible events" value={summary.totalEvents} />
            <SummaryChip label="Assigned staff" value={summary.visibleStaffCount} />
            <SummaryChip label="Unassigned" value={summary.unassignedCount} />
            <SummaryChip label="Open jobs" value={summary.jobEventCount} />
          </section>

          <section className="schedule-attention-lane" aria-label="Schedule attention lane">
            <AttentionPanel
              emptyCopy="No visible conflicts right now."
              eyebrow="Dispatch check"
              items={attention.conflicts}
              title="Schedule conflicts"
              tone="warning"
            />
            <AttentionPanel
              emptyCopy="Every visible crew job has someone attached."
              eyebrow="Assignment check"
              items={attention.unassigned}
              title="Unassigned events"
              tone="neutral"
            />
            <AttentionPanel
              emptyCopy="No visible follow-ups need attention in this range."
              eyebrow="Customer check"
              items={attention.followUps}
              title="Needs follow-up"
              tone="calm"
            />
          </section>

          {view === "day" ? (
            <CalendarDayView current={query} date={date} entries={dayEntries} />
          ) : view === "month" ? (
            <CalendarMonthView
              anchor={date}
              current={query}
              days={days}
              entriesByDate={groupedEntries}
            />
          ) : (
            <>
              <CalendarWeekView current={query} days={days} entriesByDate={groupedEntries} />
              <CalendarMobileAgenda current={query} date={date} entries={groupedEntries[formatDateInput(date)] ?? []} />
            </>
          )}
        </section>

        <section className="crew-day-sheet" aria-label="Daily crew schedule">
          <div className="crew-day-sheet-header">
            <div>
              <h2>Daily crew schedule</h2>
              <p>
                A simple day sheet for dispatch, printing, or copying into a text thread later.
              </p>
            </div>
            <DailyCrewScheduleActions shareText={dayShareText} />
          </div>
          {crewDayGroups.length ? (
            <div className="crew-day-sheet-grid">
              {crewDayGroups.map((group) => (
                <article className="crew-day-sheet-card" key={group.user.id}>
                  <header>
                    <strong>{group.user.full_name || group.user.email || "Crew member"}</strong>
                    <span>{group.entries.length} assigned</span>
                  </header>
                  <div className="crew-day-sheet-list">
                    {group.entries.map((entry) => (
                      <Link
                        className="crew-day-sheet-row"
                        href={entry.source === "schedule_event" ? `/admin/schedule?event=${entry.id}` : `/admin/schedule?appointment=${entry.id}`}
                        key={`${entry.source}-${entry.id}`}
                      >
                        <b>{entry.all_day ? "All day" : formatTime(entry.starts_at)}</b>
                        <span>{entry.title}</span>
                        <small>{entry.location_label || "No location"}</small>
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="calendar-empty-agenda">
              <h2>No crew work assigned for this day</h2>
              <p>Use PTO or unavailable blocks for time off, or add job events when the day is ready to dispatch.</p>
            </section>
          )}
        </section>

        <section className="schedule-team-strip" aria-label="Employee workload">
          <div className="schedule-team-strip-header">
            <div>
              <h2>Employee workload</h2>
              <p>Filter the calendar to a person, spot unassigned work, or focus on crew coverage.</p>
            </div>
            <Link className="secondary-action" href={buildScheduleHref(query, { assigned_user_id: "crew" })}>
              Crew assignments
            </Link>
          </div>
          <div className="schedule-team-grid">
            <EmployeeSummaryCard current={query} isActive={assignedUserId === "all"} label="All employees" value={summary.totalEvents} />
            <EmployeeSummaryCard current={query} isActive={assignedUserId === "crew"} label="Crew role users" value={summary.crewEventCount} valueKey="crew" />
            <EmployeeSummaryCard current={query} isActive={assignedUserId === "unassigned"} label="Unassigned events" value={summary.unassignedCount} valueKey="unassigned" />
            {schedule.data.users.map((user) => (
              <EmployeeSummaryCard
                current={query}
                isActive={assignedUserId === user.id}
                key={user.id}
                label={user.full_name || user.email || "Unnamed team member"}
                subtitle={user.role_names.join(", ") || "No role assigned"}
                value={summary.eventsByUser[user.id] ?? 0}
                valueKey={user.id}
              />
            ))}
          </div>
        </section>

        {params.new === "1" ? (
          <ScheduleEventFormDrawer
            current={query}
            initialJobId={params.job}
            customers={customers.data}
            jobs={jobs.data}
            users={schedule.data.users}
          />
        ) : null}

        {selectedEvent ? (
          <ScheduleEventDetailPanel
            current={query}
            event={selectedEvent}
            jobs={jobs.data}
            communications={selectedCommunications.data}
            recipientOptions={selectedRecipients.data}
            users={schedule.data.users}
          />
        ) : null}

        {selectedAppointment ? (
          <AppointmentDetailPanel
            appointment={selectedAppointment}
            communications={selectedCommunications.data}
            current={query}
            recipientOptions={selectedRecipients.data}
            users={schedule.data.users}
          />
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function ScheduleToolbar({
  assignedUserId,
  current,
  date,
  eventType,
  range,
  status,
  summary,
  users,
  view,
}: {
  assignedUserId: string;
  current: ScheduleQuery;
  date: Date;
  eventType: (typeof scheduleEventTypes)[number];
  range: { start: Date; end: Date };
  status: (typeof appointmentStatuses)[number];
  summary: ReturnType<typeof buildScheduleSummary>;
  users: ScheduleUser[];
  view: ScheduleView;
}) {
  const today = new Date();

  return (
    <header className="calendar-toolbar company-calendar-toolbar">
      <div className="calendar-toolbar-primary">
        <Link className="calendar-nav-button" href={buildScheduleHref(current, { date: formatDateInput(today) })}>
          Today
        </Link>
        <Link
          aria-label={`Previous ${view}`}
          className="calendar-icon-button"
          href={buildScheduleHref(current, { date: formatDateInput(shiftDate(date, view, -1)) })}
        >
          <ChevronLeft aria-hidden="true" size={17} />
          <span>Back</span>
        </Link>
        <strong>{formatRangeTitle(date, range, view)}</strong>
        <Link
          aria-label={`Next ${view}`}
          className="calendar-icon-button"
          href={buildScheduleHref(current, { date: formatDateInput(shiftDate(date, view, 1)) })}
        >
          <span>Next</span>
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
            Filters and menus
          </summary>
          <form className="schedule-filter-form">
            <div className="schedule-filter-heading">
              <strong>Schedule filters</strong>
              <span>Pick a date, employee, event type, or status.</span>
            </div>
            <input name="view" type="hidden" value={view} />
            <label>
              <span>Date</span>
              <input defaultValue={formatDateInput(date)} name="date" type="date" />
            </label>
            <label>
              <span>Employee</span>
              <select defaultValue={assignedUserId} name="assigned_user_id">
                <option value="all">All employees</option>
                <option value="crew">Crew role users</option>
                <option value="unassigned">Unassigned events</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email || "Unnamed team member"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Event type</span>
              <select defaultValue={eventType} name="event_type">
                {scheduleEventTypes.map((type) => (
                  <option key={type} value={type}>
                    {getEventTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select defaultValue={status} name="status">
                {appointmentStatuses.map((eventStatus) => (
                  <option key={eventStatus} value={eventStatus}>
                    {eventStatus === "all" ? "All statuses" : eventStatus.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Apply</button>
          </form>
        </details>

        <Link className="calendar-add-button" href={buildScheduleHref(current, { new: "1" })}>
          <Plus aria-hidden="true" size={16} />
          Add event
        </Link>
      </div>

      <div className="calendar-toolbar-meta">
        <span>
          <UsersRound aria-hidden="true" size={14} />
          {summary.visibleStaffCount} people assigned in this view
        </span>
        <span>
          <Clock3 aria-hidden="true" size={14} />
          {summary.totalEvents} total visible events
        </span>
      </div>

      <div className="calendar-active-filters" aria-label="Active filters">
        <span>Employee: {formatAssignedUserFilter(assignedUserId, users)}</span>
        <span>Type: {getEventTypeLabel(eventType)}</span>
        <span>Status: {status === "all" ? "All statuses" : getStatusLabel(status)}</span>
      </div>
    </header>
  );
}

function CalendarWeekView({
  current,
  days,
  entriesByDate,
}: {
  current: ScheduleQuery;
  days: Date[];
  entriesByDate: Record<string, CalendarEntry[]>;
}) {
  const today = new Date();

  return (
    <section className="calendar-grid calendar-week-grid" aria-label="Week calendar">
      {days.map((day) => {
        const key = formatDateInput(day);
        const entries = entriesByDate[key] ?? [];

        return (
          <article className={`calendar-day-column ${isSameDay(day, today) ? "is-today" : ""}`} key={key}>
            <Link className="calendar-day-heading" href={buildScheduleHref(current, { date: key, view: "day" })}>
              <span>{formatDayLabel(day)}</span>
              <strong>{formatDayNumber(day)}</strong>
            </Link>
            <div className="calendar-day-stack">
              {entries.length > 0 ? (
                entries.map((entry) => <CalendarEntryCard current={current} entry={entry} key={`${entry.source}-${entry.id}`} compact />)
              ) : (
                <Link className="calendar-inline-create" href={buildScheduleHref(current, { date: key, new: "1" })}>
                  Add event
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function CalendarDayView({
  current,
  date,
  entries,
}: {
  current: ScheduleQuery;
  date: Date;
  entries: CalendarEntry[];
}) {
  return (
    <section className="calendar-day-view" aria-label="Day agenda">
      <div className="calendar-agenda-heading">
        <span>{new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date)}</span>
        <strong>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date)}</strong>
      </div>
      {entries.length > 0 ? (
        <div className="calendar-agenda-list">
          {entries.map((entry) => (
            <CalendarEntryCard current={current} entry={entry} key={`${entry.source}-${entry.id}`} />
          ))}
        </div>
      ) : (
        <section className="calendar-empty-agenda">
          <h2>No events on this day</h2>
          <p>This day is clear. Add a job visit, estimate, PTO block, or internal reminder when it is ready.</p>
          <Link className="primary-action compact-action" href={buildScheduleHref(current, { new: "1", date: formatDateInput(date) })}>
            <Plus aria-hidden="true" size={16} />
            Add event
          </Link>
        </section>
      )}
    </section>
  );
}

function CalendarMobileAgenda({
  current,
  date,
  entries,
}: {
  current: ScheduleQuery;
  date: Date;
  entries: CalendarEntry[];
}) {
  return (
    <section className="calendar-mobile-agenda" aria-label="Mobile agenda">
      <CalendarDayView current={current} date={date} entries={entries} />
    </section>
  );
}

function CalendarMonthView({
  anchor,
  current,
  days,
  entriesByDate,
}: {
  anchor: Date;
  current: ScheduleQuery;
  days: Date[];
  entriesByDate: Record<string, CalendarEntry[]>;
}) {
  const today = new Date();

  return (
    <section className="calendar-month-grid" aria-label="Month calendar">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
        <span className="calendar-month-weekday" key={weekday}>
          {weekday}
        </span>
      ))}
      {days.map((day) => {
        const key = formatDateInput(day);
        const entries = entriesByDate[key] ?? [];

        return (
          <Link
            className={`calendar-month-cell ${isSameDay(day, today) ? "is-today" : ""} ${!isSameMonth(day, anchor) ? "is-outside-month" : ""}`}
            href={buildScheduleHref(current, { date: key, view: "day" })}
            key={key}
          >
            <span>{formatDayNumber(day)}</span>
            {entries.length > 0 ? <small>{entries.length} event{entries.length === 1 ? "" : "s"}</small> : null}
            <div className="calendar-month-snippets">
              {entries.slice(0, 2).map((entry) => (
                <i className={`calendar-month-snippet ${getEntryTone(entry)}`} key={`${entry.source}-${entry.id}`}>
                  <strong>{entry.all_day ? "All day" : formatTime(entry.starts_at)}</strong>
                  <span>{entry.customer_label || entry.title}{entry.workday_count && entry.workday_count > 1 ? ` · Day ${entry.workday_number} of ${entry.workday_count}` : ""}</span>
                </i>
              ))}
              {entries.length > 2 ? <b className="calendar-month-more">+{entries.length - 2} more</b> : null}
            </div>
            <div className="calendar-month-dots" aria-hidden="true">
              {entries.slice(0, 4).map((entry) => (
                <i className={`appointment-dot ${getEntryTone(entry)}`} key={`${entry.source}-${entry.id}`} />
              ))}
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function CalendarEntryCard({
  compact = false,
  current,
  entry,
}: {
  compact?: boolean;
  current: ScheduleQuery;
  entry: CalendarEntry;
}) {
  const tone = getEntryTone(entry);
  const href = buildScheduleHref(
    current,
    entry.source === "schedule_event" ? { event: entry.id } : { appointment: entry.id },
  );
  const assigneeLabel = getAssigneeSummary(entry.assignees);
  const locationLabel = formatEntryLocation(entry);
  const typeLabel = getEventTypeLabel(entry.event_type);
  const statusLabel = getStatusLabel(entry.status);
  const titleLine = `${entry.title}${entry.workday_count && entry.workday_count > 1 ? ` · Day ${entry.workday_number} of ${entry.workday_count}` : ""}`;
  const linkedWorkLabel = entry.job_id ? "Linked to job record" : "No linked job record";
  const contextSummary = [entry.customer_label, locationLabel].filter(Boolean).join(" • ");
  const contextLine = [entry.customer_label, locationLabel].filter(Boolean).join(" • ");

  return (
    <Link className={`calendar-appointment ${tone} ${compact ? "is-compact" : ""}`} href={href}>
      <div className="calendar-appointment-topline">
        <span className="appointment-time">
          <Clock3 aria-hidden="true" size={compact ? 12 : 14} />
          {entry.all_day ? "All day" : formatTime(entry.starts_at)}
          {entry.ends_at && !entry.all_day ? ` to ${formatTime(entry.ends_at)}` : ""}
        </span>
        <span className={`calendar-status-chip ${tone}`}>{statusLabel}</span>
      </div>
      <div className="calendar-appointment-header">
        <strong>{titleLine}</strong>
        <span className={`calendar-type-chip ${tone}`}>{typeLabel}</span>
      </div>
      <span className="calendar-appointment-context">{contextSummary || contextLine || locationLabel}</span>
      {!compact ? <span>{getEntrySummary(entry)}</span> : null}
      <small className="calendar-appointment-meta">
        <span>
          <UsersRound aria-hidden="true" size={12} />
          {assigneeLabel}
        </span>
        <span>
          <MapPinned aria-hidden="true" size={12} />
          {locationLabel}
        </span>
        {!compact ? <span>{linkedWorkLabel}</span> : null}
      </small>
    </Link>
  );
}

function ScheduleEventFormDrawer({
  customers,
  current,
  initialJobId,
  jobs,
  users,
}: {
  customers: import("@/lib/types/database").ScheduleCustomerOption[];
  current: ScheduleQuery;
  initialJobId?: string;
  jobs: ScheduleJobOption[];
  users: ScheduleUser[];
}) {
  const selectedDate = getDateAnchor(current.date);
  const closeHref = buildScheduleHref(current, { new: undefined, job: undefined });

  return (
    <div className="appointment-overlay" role="dialog" aria-labelledby="add-schedule-event-title" aria-modal="true">
      <div className="appointment-backdrop" />
      <aside className="appointment-drawer schedule-event-drawer">
        <ScheduleEventDrawerContent
          closeHref={closeHref}
          customers={customers}
          defaultDate={formatDateInput(selectedDate)}
          defaultStartsAt={toDrawerDateTime(selectedDate)}
          initialJobId={initialJobId}
          jobs={jobs}
          users={users}
        />
      </aside>
    </div>
  );
}

function ScheduleEventDetailPanel({
  communications,
  current,
  event,
  jobs,
  recipientOptions,
  users,
}: {
  communications: import("@/lib/types/database").CustomerCommunication[];
  current: ScheduleQuery;
  event: ScheduleEventWithRelations;
  jobs: ScheduleJobOption[];
  recipientOptions: { email: string; label: string; source: "customer" | "organization" }[];
  users: ScheduleUser[];
}) {
  const directionsUrl = getDirectionsUrl(event.service_locations);
  const assignees = (event.schedule_event_assignments ?? [])
    .map((assignment) => assignment.profiles?.full_name || assignment.profiles?.email || "Unnamed team member")
    .filter(Boolean);
  const detailWarnings = [
    !event.ends_at && !event.all_day ? "This event needs an end time to improve conflict checks." : null,
    requiresAssignedEmployee(event.event_type) && assignees.length === 0
      ? "This event is scheduled without an assigned employee."
      : null,
    event.event_type === "job" && !event.job_id
      ? "This job event is not linked to a CRM job yet."
      : null,
  ].filter(Boolean);
  const locationSummary = event.service_locations
    ? [
        event.service_locations.label,
        event.service_locations.street,
        event.service_locations.city,
        event.service_locations.state,
      ]
        .filter(Boolean)
        .join(", ")
    : (event.location_label || "No location yet.");
  const customerSummary = event.jobs?.organizations?.name || event.jobs?.customers?.display_name || "No linked contracting party";

  return (
    <div className="appointment-overlay" role="dialog" aria-labelledby="schedule-event-detail-title" aria-modal="true">
      <div className="appointment-backdrop" />
      <aside className="appointment-popover">
        <div className="appointment-drawer-header">
          <div>
            <span>{event.event_type.replace("_", " ")}</span>
            <h2 id="schedule-event-detail-title">{event.title}</h2>
            <p>{event.jobs?.service_type?.replace("_", " ") || "Internal schedule event"}</p>
          </div>
          <Link aria-label="Close event details" href={buildScheduleHref(current, { event: undefined })}>
            <X aria-hidden="true" size={17} />
          </Link>
        </div>

        {detailWarnings.length ? (
          <div className="schedule-detail-warning-list">
            {detailWarnings.map((warning) => (
              <p className="schedule-detail-warning" key={warning}>
                <AlertTriangle aria-hidden="true" size={15} />
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <div className="schedule-detail-chip-row" aria-label="Event summary">
          <span className={`calendar-type-chip ${getEntryTone({ event_type: event.event_type, status: event.status })}`}>
            {getEventTypeLabel(event.event_type)}
          </span>
          <span className={`calendar-status-chip ${getEntryTone({ event_type: event.event_type, status: event.status })}`}>
            {getStatusLabel(event.status)}
          </span>
          <span className="schedule-detail-chip">
            <UsersRound aria-hidden="true" size={14} />
            {assignees.length ? `${assignees.length} assigned` : "Unassigned"}
          </span>
        </div>

        <dl className="appointment-detail-list">
          <div>
            <dt>Time</dt>
            <dd>
              {event.all_day
                ? `${formatDateTimeLabel(event.starts_at, { dateStyle: "medium" })} • All day`
                : `${formatDateTimeLabel(event.starts_at)}${event.ends_at ? ` to ${formatDateTimeLabel(event.ends_at)}` : ""}`}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{event.status.replace("_", " ")}</dd>
          </div>
          <div>
            <dt>Assigned employees</dt>
            <dd>{assignees.length ? assignees.join(", ") : "Unassigned"}</dd>
          </div>
          <div>
            <dt>Assigned equipment</dt>
            <dd>
              {event.equipment_assignments?.length
                ? event.equipment_assignments.map((assignment) => `${assignment.equipment_assets?.asset_number ?? "Asset"} - ${assignment.equipment_assets?.name ?? "Equipment"}`).join(", ")
                : "No equipment assigned"}
            </dd>
          </div>
          <div>
            <dt>Linked job</dt>
            <dd>{event.job_id ? `Job ${event.job_id.slice(0, 8)}` : "No linked job"}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>{customerSummary}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{locationSummary}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{event.jobs?.requested_scope || event.description || "No scope entered yet."}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{event.calendar_notes || "No notes yet."}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{event.service_locations?.access_notes || event.service_locations?.service_notes || "No special access notes."}</dd>
          </div>
        </dl>

        <div className="appointment-detail-actions">
          {event.event_type === "job" && event.job_id && event.jobs ? (
            <MarkJobCompleteAction jobId={event.job_id} status={event.jobs.status} />
          ) : null}
          {event.event_type === "job" && event.job_id ? (
            <Link className="primary-action" href={buildScheduleHref(current, { event: undefined, job: event.job_id, new: "1" })}>Edit job schedule</Link>
          ) : null}
          {event.job_id ? <Link href={`/admin/jobs/${event.job_id}`}>Open job</Link> : null}
          <Link href="/admin/equipment">Assign equipment</Link>
          {directionsUrl ? (
            <a href={directionsUrl} rel="noreferrer" target="_blank">
              <Navigation aria-hidden="true" size={15} />
              Directions
            </a>
          ) : null}
          <QuickScheduleStatusButton event={event} label="Mark confirmed" nextStatus="confirmed" />
          <QuickScheduleStatusButton event={event} label="Mark complete" nextStatus="completed" />
          <QuickScheduleStatusButton event={event} label="Cancel" nextStatus="cancelled" />
        </div>

        {event.job_id && ["estimate", "job", "maintenance", "emergency"].includes(event.event_type) ? (
          <section className="schedule-communication-panel">
            <h3>Customer reminder</h3>
            <p>Messages use the current appointment window and service address. Internal calendar, access, gate, crew, and service notes stay private.</p>
            <CommunicationControls
              communicationType={event.event_type === "estimate" ? "estimate_reminder" : "work_reminder"}
              communications={communications}
              recipientOptions={recipientOptions}
              recordId={event.id}
              recordType="schedule_event"
            />
          </section>
        ) : null}

        {event.event_type !== "job" ? <details className="appointment-edit-details">
          <summary>Edit event details</summary>
          <ScheduleEventEditForm event={event} jobs={jobs} users={users} />
        </details> : null}
      </aside>
    </div>
  );
}

function AppointmentDetailPanel({
  appointment,
  communications,
  current,
  recipientOptions,
  users,
}: {
  appointment: AppointmentWithRelations;
  communications: import("@/lib/types/database").CustomerCommunication[];
  current: ScheduleQuery;
  recipientOptions: { email: string; label: string; source: "customer" | "organization" }[];
  users: ScheduleUser[];
}) {
  const directionsUrl = getDirectionsUrl(appointment.service_locations);

  return (
    <div className="appointment-overlay" role="dialog" aria-labelledby="appointment-detail-title" aria-modal="true">
      <div className="appointment-backdrop" />
      <aside className="appointment-popover">
        <div className="appointment-drawer-header">
          <div>
            <span>Legacy appointment</span>
            <h2 id="appointment-detail-title">{appointment.jobs?.service_type?.replace("_", " ") || appointment.appointment_type.replace("_", " ")}</h2>
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
            <dd>{formatAppointmentLocation(appointment)}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{appointment.calendar_notes || appointment.jobs?.requested_scope || "No notes yet."}</dd>
          </div>
        </dl>

        <div className="appointment-detail-actions">
          <Link href={`/admin/jobs/${appointment.job_id}`}>Open job</Link>
          {directionsUrl ? (
            <a href={directionsUrl} rel="noreferrer" target="_blank">
              <Navigation aria-hidden="true" size={15} />
              Directions
            </a>
          ) : null}
          <QuickAppointmentStatusButton appointment={appointment} label="Mark confirmed" nextStatus="confirmed" />
          <QuickAppointmentStatusButton appointment={appointment} label="Mark complete" nextStatus="completed" />
          <QuickAppointmentStatusButton appointment={appointment} label="Cancel" nextStatus="cancelled" />
        </div>

        {["estimate", "job", "maintenance"].includes(appointment.appointment_type) ? (
          <section className="schedule-communication-panel">
            <h3>Customer reminder</h3>
            <p>Messages use the current appointment window and service address. Internal calendar, access, gate, crew, and service notes stay private.</p>
            <CommunicationControls
              communicationType={appointment.appointment_type === "estimate" ? "estimate_reminder" : "work_reminder"}
              communications={communications}
              recipientOptions={recipientOptions}
              recordId={appointment.id}
              recordType="appointment"
            />
          </section>
        ) : null}

        <details className="appointment-edit-details">
          <summary>Edit legacy appointment</summary>
          <AppointmentEditForm appointment={appointment} assignedUsers={users} />
        </details>
      </aside>
    </div>
  );
}

function QuickScheduleStatusButton({
  event,
  label,
  nextStatus,
}: {
  event: ScheduleEventWithRelations;
  label: string;
  nextStatus: ScheduleEventStatus;
}) {
  return (
    <form action={updateScheduleEventStatusFromForm}>
      <input name="event_id" type="hidden" value={event.id} />
      <input name="next_status" type="hidden" value={nextStatus} />
      <button disabled={event.status === nextStatus} type="submit">
        {label}
      </button>
    </form>
  );
}

function QuickAppointmentStatusButton({
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
      <button disabled={appointment.status === nextStatus} type="submit">
        {label}
      </button>
    </form>
  );
}

function EmployeeSummaryCard({
  current,
  isActive,
  label,
  subtitle,
  value,
  valueKey,
}: {
  current: ScheduleQuery;
  isActive: boolean;
  label: string;
  subtitle?: string;
  value: number;
  valueKey?: string;
}) {
  const href = buildScheduleHref(current, { assigned_user_id: valueKey ?? "all" });

  return (
    <Link className={isActive ? "schedule-team-card is-active" : "schedule-team-card"} href={href}>
      <strong>{label}</strong>
      {subtitle ? <span>{subtitle}</span> : null}
      <b>{value}</b>
    </Link>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="calendar-summary-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: ScheduleConflict }) {
  return (
    <Link className="schedule-conflict-card" href={conflict.href}>
      <span aria-hidden="true">
        <AlertTriangle size={16} />
      </span>
      <div>
        <strong>{conflict.title}</strong>
        <small>{conflict.detail}</small>
      </div>
    </Link>
  );
}

function AttentionPanel({
  eyebrow,
  emptyCopy,
  items,
  title,
  tone,
}: {
  eyebrow: string;
  emptyCopy: string;
  items: AttentionItem[];
  title: string;
  tone: "warning" | "neutral" | "calm";
}) {
  return (
    <section className={`schedule-attention-panel tone-${tone}`}>
      <div className="schedule-attention-panel-header">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <b>{items.length}</b>
      </div>
      {items.length ? (
        <div className="schedule-attention-list">
          {items.slice(0, 5).map((item) => (
            <Link className="schedule-attention-card" href={item.href} key={item.id}>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </Link>
          ))}
        </div>
      ) : (
        <p className="schedule-attention-empty">{emptyCopy}</p>
      )}
    </section>
  );
}

function buildScheduleSummary(entries: CalendarEntry[], users: ScheduleUser[]) {
  const eventsByUser = entries.reduce<Record<string, number>>((counts, entry) => {
    entry.assignees.forEach((assignee) => {
      counts[assignee.id] = (counts[assignee.id] ?? 0) + 1;
    });
    return counts;
  }, {});

  return {
    totalEvents: entries.length,
    visibleStaffCount: Object.keys(eventsByUser).length,
    unassignedCount: entries.filter((entry) => entry.assignees.length === 0).length,
    jobEventCount: entries.filter((entry) => entry.event_type === "job" || entry.event_type === "emergency").length,
    crewEventCount: users
      .filter((user) => user.role_names.includes("crew"))
      .reduce((sum, user) => sum + (eventsByUser[user.id] ?? 0), 0),
    eventsByUser,
  };
}

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

function buildScheduleAttention(entries: CalendarEntry[], conflicts: ScheduleConflict[]) {
  const activeEntries = entries.filter((entry) => !isClosedScheduleEntry(entry));
  const now = Date.now();

  return {
    conflicts: conflicts.map((conflict) => ({
      id: conflict.id,
      title: conflict.title,
      detail: conflict.detail,
      href: conflict.href,
    })),
    unassigned: activeEntries
      .filter((entry) => requiresAssignment(entry) && entry.assignees.length === 0)
      .map((entry) => ({
        id: `attention-unassigned-${entry.source}-${entry.id}`,
        title: entry.title,
        detail: `${getEventTypeLabel(entry.event_type)} at ${formatEntryLocation(entry)}`,
        href:
          entry.source === "schedule_event"
            ? buildScheduleHref({}, { event: entry.id })
            : buildScheduleHref({}, { appointment: entry.id }),
      })),
    followUps: activeEntries
      .filter((entry) => {
        if (entry.event_type !== "follow_up") {
          return false;
        }

        if (entry.status === "no_show") {
          return true;
        }

        return new Date(entry.starts_at).getTime() <= now;
      })
      .map((entry) => ({
        id: `attention-follow-up-${entry.source}-${entry.id}`,
        title: entry.customer_label || entry.title,
        detail: `${entry.all_day ? "All day" : formatTime(entry.starts_at)} • ${formatEntryLocation(entry)}`,
        href:
          entry.source === "schedule_event"
            ? buildScheduleHref({}, { event: entry.id })
            : buildScheduleHref({}, { appointment: entry.id }),
      })),
  };
}

function buildCrewAssignmentsForDay(entries: CalendarEntry[], users: ScheduleUser[]) {
  return users
    .filter((user) => user.role_names.includes("crew"))
    .map((user) => ({
      user,
      entries: entries.filter((entry) => entry.assignees.some((assignee) => assignee.id === user.id)),
    }))
    .filter((group) => group.entries.length > 0);
}

function buildCrewShareText(
  date: Date,
  groups: { user: ScheduleUser; entries: CalendarEntry[] }[],
) {
  const heading = `Angel Tree crew schedule for ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date)}`;

  if (!groups.length) {
    return `${heading}\n\nNo crew work is assigned yet.`;
  }

  return [
    heading,
    ...groups.map((group) => {
      const name = group.user.full_name || group.user.email || "Crew member";
      const lines = group.entries.map((entry) => {
        const time = entry.all_day ? "All day" : formatTime(entry.starts_at);
        return `- ${time}: ${entry.title} (${entry.location_label || "No location"})`;
      });

      return `${name}\n${lines.join("\n")}`;
    }),
  ].join("\n\n");
}

function getScheduleView(value?: string): ScheduleView {
  return value === "day" || value === "month" ? value : "week";
}

function getEventTypeFilter(value?: string): (typeof scheduleEventTypes)[number] {
  return scheduleEventTypes.includes(value as (typeof scheduleEventTypes)[number])
    ? ((value ?? "all") as (typeof scheduleEventTypes)[number])
    : "all";
}

function getStatusFilter(value?: string): (typeof appointmentStatuses)[number] {
  return appointmentStatuses.includes(value as (typeof appointmentStatuses)[number])
    ? ((value ?? "all") as (typeof appointmentStatuses)[number])
    : "all";
}

function getAssignedUserFilter(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "all" || trimmed === "unassigned" || trimmed === "crew") {
    return trimmed || "all";
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : "all";
}

function formatAssignedUserFilter(value: string, users: ScheduleUser[]) {
  if (value === "all") {
    return "All employees";
  }

  if (value === "crew") {
    return "Crew role users";
  }

  if (value === "unassigned") {
    return "Unassigned events";
  }

  const user = users.find((item) => item.id === value);
  return user?.full_name || user?.email || "Selected employee";
}

function toDrawerDateTime(date: Date) {
  const seeded = new Date(date);
  seeded.setHours(8, 0, 0, 0);
  const offset = seeded.getTimezoneOffset();
  return new Date(seeded.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatAppointmentLocation(appointment: AppointmentWithRelations) {
  const location = appointment.service_locations;
  return location ? `${location.street}, ${location.city}` : "No location";
}

function getAssigneeSummary(assignees: AssignableUser[]) {
  if (assignees.length === 0) {
    return "Unassigned";
  }

  if (assignees.length === 1) {
    return assignees[0].full_name || assignees[0].email || "1 assigned";
  }

  const leadName = assignees[0].full_name || assignees[0].email || "Assigned crew";
  return `${leadName} +${assignees.length - 1}`;
}

function isCrewWorkEntry(entry: CalendarEntry) {
  return entry.event_type === "job" || entry.event_type === "emergency";
}

function requiresAssignment(entry: CalendarEntry) {
  return (
    entry.event_type === "estimate" ||
    entry.event_type === "job" ||
    entry.event_type === "follow_up" ||
    entry.event_type === "maintenance" ||
    entry.event_type === "emergency"
  );
}

function requiresAssignedEmployee(eventType: CalendarEntry["event_type"]) {
  return (
    eventType === "estimate" ||
    eventType === "job" ||
    eventType === "follow_up" ||
    eventType === "maintenance" ||
    eventType === "emergency"
  );
}

function isClosedScheduleEntry(entry: CalendarEntry) {
  return entry.status === "completed" || entry.status === "cancelled";
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
