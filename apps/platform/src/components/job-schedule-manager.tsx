"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Plus, Save, Trash2, UsersRound } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { saveJobWorkSessions, type JobScheduleActionState } from "@/app/admin/jobs/actions";
import type { AssignableUser, ScheduleEventWithRelations } from "@/lib/types/database";

const timezone = "America/New_York";
const initialState: JobScheduleActionState = { status: "idle", message: "" };
const startPresets = ["07:00", "07:30", "08:00", "08:30", "09:00"];
const durationPresets = [2, 4, 6, 8];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SessionDraft = {
  clientId: string;
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  assigned_user_ids: string[];
  notes: string;
  status: "scheduled" | "confirmed" | "in_progress";
};

export function JobScheduleManager({
  events,
  jobId,
  users,
}: {
  events: ScheduleEventWithRelations[];
  jobId: string;
  users: AssignableUser[];
}) {
  const activeEvents = events.filter((event) => ["scheduled", "confirmed", "in_progress"].includes(event.status));
  const initialSessions = activeEvents.map(fromEvent).sort(byDate);
  const initialCrewIds = [...new Set(initialSessions.flatMap((session) => session.assigned_user_ids))];
  const [state, action, pending] = useReliableActionState(saveJobWorkSessions, initialState);
  const [open, setOpen] = useState(initialSessions.length === 0);
  const [mode, setMode] = useState<"single" | "multiple">(initialSessions.length > 1 ? "multiple" : "single");
  const [sessions, setSessions] = useState<SessionDraft[]>(initialSessions.length ? initialSessions : [newSession(quickDate(1))]);
  const [savedSessions, setSavedSessions] = useState<SessionDraft[]>(initialSessions);
  const [defaultStart, setDefaultStart] = useState(initialSessions[0]?.start_time ?? "08:00");
  const [defaultEnd, setDefaultEnd] = useState(initialSessions[0]?.end_time ?? "16:00");
  const [calendarMonth, setCalendarMonth] = useState(monthStart(initialSessions[0]?.date ?? quickDate(0)));
  const [bulkCrewIds, setBulkCrewIds] = useState<string[]>(initialCrewIds);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [rangeStart, setRangeStart] = useState(initialSessions[0]?.date ?? quickDate(1));
  const [rangeEnd, setRangeEnd] = useState(initialSessions.at(-1)?.date ?? quickDate(1));
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const lastCalendarDateRef = useRef<string | null>(null);
  const assignedIds = useMemo(() => [...new Set(sessions.flatMap((session) => session.assigned_user_ids))], [sessions]);
  const activeCount = savedSessions.length;
  const selectedRowSet = useMemo(() => new Set(selectedRows), [selectedRows]);
  const sessionDates = useMemo(() => new Set(sessions.map((session) => session.date)), [sessions]);
  const clientErrors = useMemo(() => new Map(sessions.map((session) => [session.clientId, validateSession(session)])), [sessions]);
  const hasClientErrors = [...clientErrors.values()].some((errors) => errors.length > 0);

  useEffect(() => {
    if (state.status !== "success") return;
    const nextSavedSessions = state.sessionCount === 0 ? [] : sessions;
    setSavedSessions(nextSavedSessions);
    setSessions(nextSavedSessions.length ? nextSavedSessions : [newSession(quickDate(1))]);
    setSelectedRows([]);
    setOpen(false);
    // Each completed action produces a new state object; capture that submitted draft once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function updateSession(clientId: string, patch: Partial<SessionDraft>) {
    setSessions((current) => current.map((session) => session.clientId === clientId ? { ...session, ...patch } : session).sort(byDate));
  }

  function applyDuration(clientId: string, hours: number) {
    const session = sessions.find((item) => item.clientId === clientId);
    if (session) updateSession(clientId, { end_time: addHours(session.start_time, hours) });
  }

  function applyCrew(userIds: string[], scope: "all" | "selected" = "all") {
    setSessions((current) => current.map((session) => scope === "all" || selectedRowSet.has(session.clientId)
      ? { ...session, assigned_user_ids: userIds }
      : session));
  }

  function applyDefaultHours(scope: "all" | "selected") {
    setSessions((current) => current.map((session) => scope === "all" || selectedRowSet.has(session.clientId)
      ? { ...session, start_time: defaultStart, end_time: defaultEnd }
      : session));
  }

  function toggleCalendarDate(date: string, event: MouseEvent<HTMLButtonElement>) {
    if (!event.shiftKey && sessionDates.has(date)) {
      removeDate(date);
      lastCalendarDateRef.current = date;
      return;
    }

    const dates = event.shiftKey && lastCalendarDateRef.current
      ? datesBetween(lastCalendarDateRef.current, date)
      : [date];
    addDates(dates);
    lastCalendarDateRef.current = date;
  }

  function addDates(dates: string[]) {
    setSessions((current) => {
      const existing = new Set(current.map((session) => session.date));
      const additions = dates
        .filter((date) => !existing.has(date))
        .map((date) => newSession(date, defaultStart, defaultEnd, bulkCrewIds));
      return [...current, ...additions].sort(byDate);
    });
  }

  function removeDate(date: string) {
    setSessions((current) => current.filter((session) => session.date !== date));
    setSelectedRows((current) => current.filter((clientId) => sessions.find((session) => session.clientId === clientId)?.date !== date));
  }

  function addRange() {
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return;
    addDates(datesBetween(rangeStart, rangeEnd).filter((date) => !excludeWeekends || !isWeekend(date)));
    setCalendarMonth(monthStart(rangeStart));
  }

  function toggleRow(clientId: string) {
    setSelectedRows((current) => current.includes(clientId)
      ? current.filter((value) => value !== clientId)
      : [...current, clientId]);
  }

  function removeSelectedRows() {
    setSessions((current) => current.filter((session) => !selectedRowSet.has(session.clientId)));
    setSelectedRows([]);
  }

  function copyFirstHoursToAll() {
    const first = sessions[0];
    if (!first) return;
    setSessions((current) => current.map((session) => ({ ...session, start_time: first.start_time, end_time: first.end_time })));
  }

  function closeEditor() {
    const restored = savedSessions.length ? savedSessions : [newSession(quickDate(1))];
    setSessions(restored);
    setMode(savedSessions.length > 1 ? "multiple" : "single");
    setRangeStart(restored[0]?.date ?? quickDate(1));
    setRangeEnd(restored.at(-1)?.date ?? quickDate(1));
    setSelectedRows([]);
    setOpen(false);
  }

  const summary = scheduleSummary(savedSessions);

  return (
    <section className="job-schedule-manager">
      <div className="job-schedule-summary">
        <div>
          <p className="surface-label"><CalendarDays size={17} />Schedule and crew</p>
          <h2>{activeCount ? activeCount === 1 ? "Scheduled for 1 workday" : `Scheduled for ${activeCount} workdays` : "To be scheduled"}</h2>
          <p>{summary}</p>
        </div>
        <button aria-expanded={open} className="secondary-action" onClick={() => open ? closeEditor() : setOpen(true)} type="button">
          <CalendarDays size={17} />{activeCount ? "Edit schedule" : "Schedule job"}<ChevronDown className={open ? "disclosure-open" : ""} size={17} />
        </button>
      </div>

      {activeCount ? <div className="job-workday-summary-list">{savedSessions.map((session, index) => (
        <div className={isToday(session.date) ? "today" : ""} key={session.clientId}>
          <strong>{isToday(session.date) ? "Today, " : ""}{formatDate(session.date)}</strong>
          <span>{formatTime(session.start_time)}-{formatTime(session.end_time)}</span>
          <small>Day {index + 1} of {activeCount}</small>
        </div>
      ))}</div> : null}

      {open ? (
        <form action={action} className="job-schedule-form">
          <input name="job_id" type="hidden" value={jobId} />
          <input name="save_mode" type="hidden" value="replace" />
          <input name="sessions_json" type="hidden" value={JSON.stringify(sessions.map(toPayload))} />

          {state.message ? <div className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}><strong>{state.message}</strong>{state.conflicts?.map((conflict) => <span key={conflict}>{conflict}</span>)}</div> : null}

          <fieldset className="schedule-mode-control">
            <legend>Scheduling mode</legend>
            <button aria-pressed={mode === "single"} onClick={() => { setMode("single"); setSessions((current) => [current[0] ?? newSession(quickDate(1))]); }} type="button">Single day</button>
            <button aria-pressed={mode === "multiple"} onClick={() => { setMode("multiple"); setCalendarMonth(monthStart(sessions[0]?.date ?? quickDate(0))); }} type="button">Multiple days</button>
          </fieldset>

          {mode === "single" ? (
            <section className="single-day-scheduler">
              <QuickDates onChoose={(date) => updateSession(sessions[0].clientId, { date })} />
              <SessionEditor index={0} onDuration={(hours) => applyDuration(sessions[0].clientId, hours)} onUpdate={(patch) => updateSession(sessions[0].clientId, patch)} session={sessions[0]} />
            </section>
          ) : (
            <section className="multi-select-scheduler">
              <div className="schedule-default-hours">
                <div><strong>Default hours</strong><span>Newly selected workdays start with these hours.</span></div>
                <label>Default start<input onChange={(event) => setDefaultStart(event.target.value)} type="time" value={defaultStart} /></label>
                <label>Default end<input min={defaultStart} onChange={(event) => setDefaultEnd(event.target.value)} type="time" value={defaultEnd} /></label>
                <button className="secondary-action" disabled={!sessions.length} onClick={() => applyDefaultHours("all")} type="button">Apply default hours to all selected days</button>
              </div>

              <div className="workday-calendar" aria-label="Select workdays">
                <div className="workday-calendar-heading">
                  <div><span>Select workdays</span><strong>{sessions.length} {sessions.length === 1 ? "workday" : "workdays"} selected</strong></div>
                  <div className="calendar-month-actions">
                    <button aria-label="Previous month" className="icon-action" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))} title="Previous month" type="button"><ChevronLeft size={19} /></button>
                    <button className="secondary-action" onClick={() => setCalendarMonth(monthStart(quickDate(0)))} type="button">Today</button>
                    <button aria-label="Next month" className="icon-action" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))} title="Next month" type="button"><ChevronRight size={19} /></button>
                  </div>
                </div>
                <div className="calendar-month-label" aria-live="polite">{formatMonth(calendarMonth)}</div>
                <div className="workday-calendar-grid" role="grid">
                  {weekdayLabels.map((label) => <span aria-hidden="true" className="calendar-weekday" key={label}>{label}</span>)}
                  {calendarCells(calendarMonth).map((cell, index) => cell ? (
                    <button
                      aria-label={`${formatDateLong(cell)}${sessionDates.has(cell) ? ", selected" : ""}`}
                      aria-pressed={sessionDates.has(cell)}
                      className={`${sessionDates.has(cell) ? "selected" : ""}${isToday(cell) ? " today" : ""}`}
                      key={cell}
                      onClick={(event) => toggleCalendarDate(cell, event)}
                      role="gridcell"
                      type="button"
                    ><span>{Number(cell.slice(-2))}</span>{isToday(cell) ? <small>Today</small> : null}</button>
                  ) : <span aria-hidden="true" className="calendar-empty" key={`empty-${index}`} />)}
                </div>
                <div className="calendar-selection-actions">
                  <span>Click dates individually. Shift-click selects the dates between two choices.</span>
                  <button className="secondary-action" disabled={!sessions.length} onClick={() => { setSessions([]); setSelectedRows([]); }} type="button">Clear selection</button>
                </div>
              </div>

              <details className="schedule-range-shortcut">
                <summary>Select a date range</summary>
                <div className="schedule-range-controls">
                  <label>Start date<input max={rangeEnd || undefined} onChange={(event) => setRangeStart(event.target.value)} type="date" value={rangeStart} /></label>
                  <label>End date<input min={rangeStart || undefined} onChange={(event) => setRangeEnd(event.target.value)} type="date" value={rangeEnd} /></label>
                  <label className="checkbox-field"><input checked={excludeWeekends} onChange={(event) => setExcludeWeekends(event.target.checked)} type="checkbox" />Exclude weekends</label>
                  <button className="secondary-action" onClick={addRange} type="button"><Plus size={16} />Add range to selected days</button>
                </div>
              </details>

              {sessions.length > 1 ? (
                <details className="workday-bulk-editor" aria-label="Bulk workday actions" open={sessions.length > 2 ? true : undefined}>
                  <summary className="bulk-editor-heading"><div><strong>Bulk actions</strong><span>{selectedRows.length ? `${selectedRows.length} rows selected` : sessions.length === 2 ? "Open when you want to change both days together." : "Select rows below to edit only those days."}</span></div></summary>
                  <div className="bulk-hour-actions">
                    <button className="secondary-action" onClick={() => applyDefaultHours("all")} type="button">Apply hours to all days</button>
                    <button className="secondary-action" disabled={!selectedRows.length} onClick={() => applyDefaultHours("selected")} type="button">Apply hours to selected days</button>
                    <button className="secondary-action" onClick={copyFirstHoursToAll} type="button"><Copy size={15} />Copy first day's hours to all</button>
                  </div>
                  {users.length ? <div className="bulk-crew-actions">
                    <label><UsersRound size={16} />Crew for bulk assignment<select multiple onChange={(event) => setBulkCrewIds(Array.from(event.target.selectedOptions, (option) => option.value))} size={Math.min(Math.max(users.length, 2), 4)} value={bulkCrewIds}>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Employee"}</option>)}</select></label>
                    <button className="secondary-action" disabled={!bulkCrewIds.length} onClick={() => applyCrew(bulkCrewIds, "all")} type="button">Assign crew to all days</button>
                    <button className="secondary-action" disabled={!bulkCrewIds.length || !selectedRows.length} onClick={() => applyCrew(bulkCrewIds, "selected")} type="button">Assign crew to selected days</button>
                  </div> : null}
                  <button className="danger-secondary-action" disabled={!selectedRows.length} onClick={removeSelectedRows} type="button"><Trash2 size={16} />Remove selected days</button>
                </details>
              ) : null}

              <div className="selected-workday-heading">
                <div><strong>Selected workdays</strong><span>Adjust each shift directly. Changes stay with the date while you browse other months.</span></div>
                {sessions.length ? <label className="checkbox-field"><input checked={selectedRows.length === sessions.length} onChange={(event) => setSelectedRows(event.target.checked ? sessions.map((session) => session.clientId) : [])} type="checkbox" />Select all rows</label> : null}
              </div>

              {sessions.length ? <div className="selected-workday-list">{sessions.map((session, index) => {
                const errors = clientErrors.get(session.clientId) ?? [];
                const conflicts = state.conflicts?.filter((conflict) => conflict.includes(session.date)) ?? [];
                return <article className={`selected-workday-row${errors.length ? " has-error" : ""}`} key={session.clientId}>
                  <div className="selected-workday-title">
                    <label className="row-selection"><input aria-label={`Select ${formatDateLong(session.date)}`} checked={selectedRowSet.has(session.clientId)} onChange={() => toggleRow(session.clientId)} type="checkbox" /></label>
                    <div><strong>{formatDateLong(session.date)}</strong><span>Day {index + 1} of {sessions.length}</span></div>
                    <button aria-label={`Remove ${formatDateLong(session.date)}`} className="icon-action" onClick={() => removeDate(session.date)} title="Remove workday" type="button"><Trash2 size={17} /></button>
                  </div>
                  <div className="selected-workday-fields">
                    <label>Start time<input onChange={(event) => updateSession(session.clientId, { start_time: event.target.value })} required type="time" value={session.start_time} /></label>
                    <span className="time-separator">to</span>
                    <label>End time<input min={session.start_time} onChange={(event) => updateSession(session.clientId, { end_time: event.target.value })} required type="time" value={session.end_time} /></label>
                    <strong className="workday-duration"><Clock3 size={16} />{formatDuration(session.start_time, session.end_time)}</strong>
                    {users.length ? <label className="workday-crew">Assigned crew<select multiple onChange={(event) => updateSession(session.clientId, { assigned_user_ids: Array.from(event.target.selectedOptions, (option) => option.value) })} size={Math.min(Math.max(users.length, 2), 3)} value={session.assigned_user_ids}>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Employee"}</option>)}</select></label> : null}
                  </div>
                  <div className="workday-time-presets" aria-label={`Time shortcuts for ${formatDateLong(session.date)}`}>
                    <button onClick={() => updateSession(session.clientId, { start_time: "08:00", end_time: "16:00" })} type="button">Full day</button>
                    <button onClick={() => updateSession(session.clientId, { start_time: "08:00", end_time: "12:00" })} type="button">Morning</button>
                    <button onClick={() => updateSession(session.clientId, { start_time: "12:00", end_time: "16:00" })} type="button">Afternoon</button>
                    <button disabled={index === 0} onClick={() => { const previous = sessions[index - 1]; if (previous) updateSession(session.clientId, { start_time: previous.start_time, end_time: previous.end_time }); }} type="button"><Copy size={14} />Copy previous day</button>
                    <button onClick={(event) => event.currentTarget.closest("article")?.querySelector<HTMLInputElement>('input[type="time"]')?.focus()} type="button">Custom</button>
                  </div>
                  {errors.map((error) => <p className="workday-row-error" key={error} role="alert">{error}</p>)}
                  {conflicts.map((conflict) => <p className="workday-row-warning" key={conflict}>{conflict}</p>)}
                </article>;
              })}</div> : <div className="schedule-empty-selection"><CalendarDays size={24} /><strong>No workdays selected</strong><span>Choose dates in the calendar above. Each date will appear here with editable hours.</span></div>}
            </section>
          )}

          <div className={`schedule-crew-controls${mode === "multiple" ? " multi-day-options" : ""}`}>
            {mode === "single" ? <label>Assigned crew<select multiple onChange={(event) => applyCrew(Array.from(event.target.selectedOptions, (option) => option.value))} size={Math.min(Math.max(users.length, 3), 6)} value={assignedIds}>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Employee"}</option>)}</select></label> : null}
            <label>Scheduling status<select onChange={(event) => setSessions((current) => current.map((session) => ({ ...session, status: event.target.value as SessionDraft["status"] })))} value={sessions[0]?.status ?? "scheduled"}><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="in_progress">In progress</option></select></label>
            <label>Internal scheduling note<textarea onChange={(event) => setSessions((current) => current.map((session) => ({ ...session, notes: event.target.value })))} rows={3} value={sessions[0]?.notes ?? ""} /></label>
          </div>

          {state.status === "warning" ? <label className="checkbox-field schedule-conflict-override"><input name="allow_conflicts" type="checkbox" value="1" />I reviewed the crew conflicts and want to save this schedule.</label> : null}

          <div className="job-schedule-actions">
            <button disabled={pending || sessions.length === 0 || hasClientErrors} type="submit"><Save size={17} />{pending ? "Saving schedule..." : "Save schedule"}</button>
            {savedSessions.length ? <button className="danger-secondary-action" disabled={pending} name="clear_schedule" onClick={(event) => { if (!window.confirm("Clear the entire job schedule? Work records, photos, time, and payroll data will remain unchanged.")) event.preventDefault(); }} type="submit" value="1">Clear schedule</button> : null}
            <button className="secondary-action" onClick={closeEditor} type="button">Close</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function SessionEditor({ index, onDuration, onUpdate, session }: { index: number; onDuration: (hours: number) => void; onUpdate: (patch: Partial<SessionDraft>) => void; session: SessionDraft }) {
  const errors = validateSession(session);
  return <div className="job-session-fields">
    <label>Date<input aria-label={`Workday ${index + 1} date`} onChange={(event) => onUpdate({ date: event.target.value })} required type="date" value={session.date} /></label>
    <label>Start time<input aria-label={`Workday ${index + 1} start time`} onChange={(event) => onUpdate({ start_time: event.target.value })} required type="time" value={session.start_time} /></label>
    <label>End time<input aria-label={`Workday ${index + 1} end time`} min={session.start_time} onChange={(event) => onUpdate({ end_time: event.target.value })} required type="time" value={session.end_time} /></label>
    <div className="schedule-time-shortcuts" aria-label="Common start times">{startPresets.map((time) => <button aria-pressed={session.start_time === time} key={time} onClick={() => onUpdate({ start_time: time })} type="button">{formatTime(time)}</button>)}</div>
    <div className="schedule-duration-shortcuts" aria-label="Duration shortcuts"><Clock3 size={15} />{durationPresets.map((hours) => <button key={hours} onClick={() => onDuration(hours)} type="button">{hours} hr</button>)}</div>
    {errors.map((error) => <p className="workday-row-error" key={error} role="alert">{error}</p>)}
  </div>;
}

function QuickDates({ onChoose }: { onChoose: (date: string) => void }) {
  return <div className="schedule-quick-dates"><span>Quick date</span><button onClick={() => onChoose(quickDate(0))} type="button">Today</button><button onClick={() => onChoose(quickDate(1))} type="button">Tomorrow</button><button onClick={() => onChoose(nextMonday())} type="button">Next Monday</button></div>;
}

function newSession(date: string, start = "08:00", end = "16:00", crewIds: string[] = []): SessionDraft { return { clientId: `new-${date}`, date, start_time: start, end_time: end, assigned_user_ids: [...crewIds], notes: "", status: "scheduled" }; }
function fromEvent(event: ScheduleEventWithRelations): SessionDraft { return { clientId: event.id, id: event.id, date: zonedPart(event.starts_at, "date"), start_time: zonedPart(event.starts_at, "time"), end_time: zonedPart(event.ends_at ?? event.starts_at, "time"), assigned_user_ids: (event.schedule_event_assignments ?? []).map((assignment) => assignment.user_id), notes: event.calendar_notes ?? "", status: ["confirmed", "in_progress"].includes(event.status) ? event.status as SessionDraft["status"] : "scheduled" }; }
function toPayload(session: SessionDraft) { const { clientId: _, ...payload } = session; return payload; }
function byDate(a: SessionDraft, b: SessionDraft) { return a.date.localeCompare(b.date); }
function addHours(time: string, hours: number) { const [hour, minute] = time.split(":").map(Number); return `${String(Math.min(hour + hours, 23)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }
function quickDate(offset: number) { const date = new Date(); date.setDate(date.getDate() + offset); return localDateValue(date); }
function nextMonday() { const date = new Date(); const offset = ((8 - date.getDay()) % 7) || 7; date.setDate(date.getDate() + offset); return localDateValue(date); }
function localDateValue(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function datesBetween(start: string, end: string) { const [first, last] = start <= end ? [start, end] : [end, start]; const dates: string[] = []; const cursor = new Date(`${first}T12:00:00Z`); const finalDate = new Date(`${last}T12:00:00Z`); while (cursor <= finalDate) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
function isWeekend(date: string) { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day === 0 || day === 6; }
function isToday(date: string) { return date === quickDate(0); }
function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shiftMonth(month: string, amount: number) { const date = new Date(`${month}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function calendarCells(month: string) { const date = new Date(`${month}T12:00:00Z`); const firstDay = date.getUTCDay(); const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate(); const cells: (string | null)[] = Array.from({ length: firstDay }, () => null); for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${month.slice(0, 8)}${String(day).padStart(2, "0")}`); while (cells.length % 7) cells.push(null); return cells; }
function formatMonth(date: string) { return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }
function formatDate(date: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }
function formatDateLong(date: string) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }
function formatTime(time: string) { const [hour, minute] = time.split(":").map(Number); return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour, minute))); }
function formatDuration(start: string, end: string) { const duration = minutes(end) - minutes(start); if (duration <= 0) return "Invalid duration"; const hours = Math.floor(duration / 60); const remainder = duration % 60; return `${hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : ""}${hours && remainder ? " " : ""}${remainder ? `${remainder} min` : ""}`; }
function minutes(time: string) { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; }
function validateSession(session: SessionDraft) { const errors: string[] = []; if (!session.start_time) errors.push(`${formatDateLong(session.date)} needs a start time.`); if (!session.end_time) errors.push(`${formatDateLong(session.date)} needs an end time.`); if (session.start_time && session.end_time && session.end_time <= session.start_time) errors.push(`End time must be after start time on ${formatDateLong(session.date)}.`); return errors; }
function zonedPart(value: string, part: "date" | "time") { const date = new Date(value); if (part === "date") { const pieces = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(date); const get = (type: string) => pieces.find((piece) => piece.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}`; } const pieces = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).formatToParts(date); const get = (type: string) => pieces.find((piece) => piece.type === type)?.value ?? "00"; return `${get("hour")}:${get("minute")}`; }
function scheduleSummary(sessions: SessionDraft[]) { if (!sessions.length) return "Choose one day or build a multi-day work schedule."; if (sessions.length === 1) return `${formatDate(sessions[0].date)} · ${formatTime(sessions[0].start_time)}-${formatTime(sessions[0].end_time)}`; return `${formatDate(sessions[0].date)} through ${formatDate(sessions.at(-1)!.date)}`; }
