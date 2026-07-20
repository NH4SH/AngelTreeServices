"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, Copy, Plus, Save, Trash2 } from "lucide-react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { saveJobWorkSessions, type JobScheduleActionState } from "@/app/admin/jobs/actions";
import type { AssignableUser, ScheduleEventWithRelations } from "@/lib/types/database";

const timezone = "America/New_York";
const initialState: JobScheduleActionState = { status: "idle", message: "" };
const startPresets = ["07:00", "07:30", "08:00", "08:30", "09:00"];
const durationPresets = [2, 4, 6, 8];

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
  const initialSessions = activeEvents.map(fromEvent);
  const [state, action, pending] = useReliableActionState(saveJobWorkSessions, initialState);
  const [open, setOpen] = useState(initialSessions.length === 0);
  const [mode, setMode] = useState<"single" | "multiple">(initialSessions.length > 1 ? "multiple" : "single");
  const [sessions, setSessions] = useState<SessionDraft[]>(initialSessions.length ? initialSessions : [newSession(quickDate(1))]);
  const [savedSessions, setSavedSessions] = useState<SessionDraft[]>(initialSessions);
  const [rangeStart, setRangeStart] = useState(sessions[0]?.date ?? quickDate(1));
  const [rangeEnd, setRangeEnd] = useState(sessions.at(-1)?.date ?? quickDate(1));
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [additionalDate, setAdditionalDate] = useState("");
  const [dateMoveScope, setDateMoveScope] = useState<"one" | "following">("one");
  const [shiftDays, setShiftDays] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);
  const assignedIds = useMemo(() => [...new Set(sessions.flatMap((session) => session.assigned_user_ids))], [sessions]);
  const activeCount = savedSessions.length;

  useEffect(() => {
    if (state.status !== "success") return;
    const nextSavedSessions = state.sessionCount === 0 ? [] : sessions;
    setSavedSessions(nextSavedSessions);
    setSessions(nextSavedSessions.length ? nextSavedSessions : [newSession(quickDate(1))]);
    setOpen(false);
    // Each server action result is a new state object; capture that submitted draft once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function updateSession(clientId: string, patch: Partial<SessionDraft>) {
    setSessions((current) => current.map((session) => session.clientId === clientId ? { ...session, ...patch } : session));
  }

  function applyCrew(userIds: string[]) {
    setSessions((current) => current.map((session) => ({ ...session, assigned_user_ids: userIds })));
  }

  function applyDuration(clientId: string, hours: number) {
    const session = sessions.find((item) => item.clientId === clientId);
    if (!session) return;
    updateSession(clientId, { end_time: addHours(session.start_time, hours) });
  }

  function generateRange() {
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return;
    const dates = datesBetween(rangeStart, rangeEnd).filter((date) => !excludeWeekends || !isWeekend(date));
    const template = sessions[0] ?? newSession(rangeStart);
    setSessions(dates.map((date, index) => ({
      ...template,
      clientId: sessions[index]?.clientId ?? crypto.randomUUID(),
      id: sessions[index]?.id,
      date,
    })));
  }

  function addDate() {
    if (!additionalDate || sessions.some((session) => session.date === additionalDate)) return;
    const previous = sessions.at(-1) ?? newSession(additionalDate);
    setSessions((current) => [...current, { ...previous, clientId: crypto.randomUUID(), id: undefined, date: additionalDate }].sort(byDate));
    setAdditionalDate("");
  }

  function changeSessionDate(clientId: string, date: string) {
    setSessions((current) => {
      const targetIndex = current.findIndex((session) => session.clientId === clientId);
      if (targetIndex < 0) return current;
      const difference = calendarDayDifference(current[targetIndex].date, date);
      return current
        .map((session, index) => index === targetIndex
          ? { ...session, date }
          : dateMoveScope === "following" && index > targetIndex
            ? { ...session, date: shiftDateValue(session.date, difference) }
            : session)
        .sort(byDate);
    });
  }

  function shiftSchedule() {
    if (!Number.isFinite(shiftDays) || shiftDays === 0) return;
    setSessions((current) => current
      .map((session) => ({ ...session, date: shiftDateValue(session.date, shiftDays) }))
      .sort(byDate));
  }

  function closeEditor() {
    const restored = savedSessions.length ? savedSessions : [newSession(quickDate(1))];
    setSessions(restored);
    setMode(savedSessions.length > 1 ? "multiple" : "single");
    setRangeStart(restored[0]?.date ?? quickDate(1));
    setRangeEnd(restored.at(-1)?.date ?? quickDate(1));
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

      {activeCount ? (
        <div className="job-workday-summary-list">
          {savedSessions.map((session, index) => (
            <div className={isToday(session.date) ? "today" : ""} key={session.clientId}>
              <strong>{isToday(session.date) ? "Today, " : ""}{formatDate(session.date)}</strong>
              <span>{formatTime(session.start_time)}–{formatTime(session.end_time)}</span>
              <small>Day {index + 1} of {activeCount}</small>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <form action={action} className="job-schedule-form" ref={formRef}>
          <input name="job_id" type="hidden" value={jobId} />
          <input name="save_mode" type="hidden" value="replace" />
          <input name="sessions_json" type="hidden" value={JSON.stringify(sessions.map(toPayload))} />

          {state.message ? <div className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}><strong>{state.message}</strong>{state.conflicts?.map((conflict) => <span key={conflict}>{conflict}</span>)}</div> : null}

          <fieldset className="schedule-mode-control">
            <legend>Scheduling mode</legend>
            <button aria-pressed={mode === "single"} onClick={() => { setMode("single"); setSessions((current) => [current[0] ?? newSession(quickDate(1))]); }} type="button">Single day</button>
            <button aria-pressed={mode === "multiple"} onClick={() => setMode("multiple")} type="button">Multiple days</button>
          </fieldset>

          {mode === "single" ? (
            <section className="single-day-scheduler">
              <QuickDates onChoose={(date) => updateSession(sessions[0].clientId, { date })} />
              <SessionEditor
                index={0}
                onDuration={(hours) => applyDuration(sessions[0].clientId, hours)}
                onUpdate={(patch) => updateSession(sessions[0].clientId, patch)}
                session={sessions[0]}
              />
            </section>
          ) : (
            <section className="multi-day-scheduler">
              <div className="schedule-range-controls">
                <label>Start date<input max={rangeEnd || undefined} onChange={(event) => setRangeStart(event.target.value)} type="date" value={rangeStart} /></label>
                <label>End date<input min={rangeStart || undefined} onChange={(event) => setRangeEnd(event.target.value)} type="date" value={rangeEnd} /></label>
                <label className="checkbox-field"><input checked={excludeWeekends} onChange={(event) => setExcludeWeekends(event.target.checked)} type="checkbox" />Exclude weekends</label>
                <button className="secondary-action" onClick={generateRange} type="button">Build workdays</button>
              </div>

              <div className="schedule-bulk-controls">
                <label>Daily start<input onChange={(event) => setSessions((current) => current.map((session) => ({ ...session, start_time: event.target.value })))} type="time" value={sessions[0]?.start_time ?? "08:00"} /></label>
                <label>Daily end<input onChange={(event) => setSessions((current) => current.map((session) => ({ ...session, end_time: event.target.value })))} type="time" value={sessions[0]?.end_time ?? "16:00"} /></label>
                <button className="secondary-action" onClick={() => { const first = sessions[0]; if (first) setSessions((current) => current.map((session) => ({ ...session, start_time: first.start_time, end_time: first.end_time }))); }} type="button">Apply hours to all</button>
              </div>

              <div className="schedule-reschedule-controls">
                <fieldset className="schedule-mode-control compact">
                  <legend>When changing a workday date</legend>
                  <button aria-pressed={dateMoveScope === "one"} onClick={() => setDateMoveScope("one")} type="button">Move only this day</button>
                  <button aria-pressed={dateMoveScope === "following"} onClick={() => setDateMoveScope("following")} type="button">Move this and following</button>
                </fieldset>
                <label>Shift entire schedule
                  <span className="schedule-shift-input"><input inputMode="numeric" onChange={(event) => setShiftDays(Number(event.target.value))} type="number" value={shiftDays} /><span>days</span></span>
                </label>
                <button className="secondary-action" disabled={!shiftDays} onClick={shiftSchedule} type="button">Shift schedule</button>
              </div>

              <div className="job-session-editor-list">
                {sessions.map((session, index) => (
                  <article className="job-session-editor" key={session.clientId}>
                    <div className="job-session-editor-heading"><strong>{formatDate(session.date)}</strong><span>Day {index + 1} of {sessions.length}</span></div>
                    <SessionEditor index={index} onDateChange={(date) => changeSessionDate(session.clientId, date)} onDuration={(hours) => applyDuration(session.clientId, hours)} onUpdate={(patch) => updateSession(session.clientId, patch)} session={session} />
                    <div className="job-session-row-actions">
                      {index > 0 ? <button className="secondary-action" onClick={() => updateSession(session.clientId, { start_time: sessions[index - 1].start_time, end_time: sessions[index - 1].end_time })} type="button"><Copy size={15} />Copy previous hours</button> : null}
                      <button aria-label={`Remove ${formatDate(session.date)}`} className="icon-action" onClick={() => setSessions((current) => current.filter((item) => item.clientId !== session.clientId))} title="Remove workday" type="button"><Trash2 size={17} /></button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="schedule-add-date">
                <label>Add another date<input min={quickDate(0)} onChange={(event) => setAdditionalDate(event.target.value)} type="date" value={additionalDate} /></label>
                <button className="secondary-action" disabled={!additionalDate} onClick={addDate} type="button"><Plus size={16} />Add workday</button>
              </div>
            </section>
          )}

          <div className="schedule-crew-controls">
            <label>Assigned crew<select multiple onChange={(event) => applyCrew(Array.from(event.target.selectedOptions, (option) => option.value))} size={Math.min(Math.max(users.length, 3), 6)} value={assignedIds}>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Employee"}</option>)}</select></label>
            <label>Scheduling status<select onChange={(event) => setSessions((current) => current.map((session) => ({ ...session, status: event.target.value as SessionDraft["status"] })))} value={sessions[0]?.status ?? "scheduled"}><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="in_progress">In progress</option></select></label>
            <label>Internal scheduling note<textarea onChange={(event) => setSessions((current) => current.map((session) => ({ ...session, notes: event.target.value })))} rows={3} value={sessions[0]?.notes ?? ""} /></label>
          </div>

          {state.status === "warning" ? <label className="checkbox-field schedule-conflict-override"><input name="allow_conflicts" type="checkbox" value="1" />I reviewed the crew conflicts and want to save this schedule.</label> : null}

          <div className="job-schedule-actions">
            <button disabled={pending || sessions.length === 0} type="submit"><Save size={17} />{pending ? "Saving schedule..." : "Save schedule"}</button>
            {savedSessions.length ? <button className="danger-secondary-action" disabled={pending} name="clear_schedule" onClick={(event) => { if (!window.confirm("Clear the entire job schedule? Work records, photos, time, and payroll data will remain unchanged.")) event.preventDefault(); }} type="submit" value="1">Clear schedule</button> : null}
            <button className="secondary-action" onClick={closeEditor} type="button">Close</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function SessionEditor({ index, onDateChange, onDuration, onUpdate, session }: { index: number; onDateChange?: (date: string) => void; onDuration: (hours: number) => void; onUpdate: (patch: Partial<SessionDraft>) => void; session: SessionDraft }) {
  return <div className="job-session-fields">
    <label>Date<input aria-label={`Workday ${index + 1} date`} onChange={(event) => onDateChange ? onDateChange(event.target.value) : onUpdate({ date: event.target.value })} required type="date" value={session.date} /></label>
    <label>Start time<input aria-label={`Workday ${index + 1} start time`} onChange={(event) => onUpdate({ start_time: event.target.value })} required type="time" value={session.start_time} /></label>
    <label>End time<input aria-label={`Workday ${index + 1} end time`} min={session.start_time} onChange={(event) => onUpdate({ end_time: event.target.value })} required type="time" value={session.end_time} /></label>
    <div className="schedule-time-shortcuts" aria-label="Common start times">{startPresets.map((time) => <button aria-pressed={session.start_time === time} key={time} onClick={() => onUpdate({ start_time: time })} type="button">{formatTime(time)}</button>)}</div>
    <div className="schedule-duration-shortcuts" aria-label="Duration shortcuts"><Clock3 size={15} />{durationPresets.map((hours) => <button key={hours} onClick={() => onDuration(hours)} type="button">{hours} hr</button>)}</div>
  </div>;
}

function QuickDates({ onChoose }: { onChoose: (date: string) => void }) {
  return <div className="schedule-quick-dates"><span>Quick date</span><button onClick={() => onChoose(quickDate(0))} type="button">Today</button><button onClick={() => onChoose(quickDate(1))} type="button">Tomorrow</button><button onClick={() => onChoose(nextMonday())} type="button">Next Monday</button></div>;
}

function newSession(date: string): SessionDraft { return { clientId: `new-${date}`, date, start_time: "08:00", end_time: "16:00", assigned_user_ids: [], notes: "", status: "scheduled" }; }
function fromEvent(event: ScheduleEventWithRelations): SessionDraft { return { clientId: event.id, id: event.id, date: zonedPart(event.starts_at, "date"), start_time: zonedPart(event.starts_at, "time"), end_time: zonedPart(event.ends_at ?? event.starts_at, "time"), assigned_user_ids: (event.schedule_event_assignments ?? []).map((assignment) => assignment.user_id), notes: event.calendar_notes ?? "", status: ["confirmed", "in_progress"].includes(event.status) ? event.status as SessionDraft["status"] : "scheduled" }; }
function toPayload(session: SessionDraft) { const { clientId: _, ...payload } = session; return payload; }
function byDate(a: SessionDraft, b: SessionDraft) { return a.date.localeCompare(b.date); }
function calendarDayDifference(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }
function shiftDateValue(date: string, days: number) { const shifted = new Date(`${date}T12:00:00Z`); shifted.setUTCDate(shifted.getUTCDate() + days); return shifted.toISOString().slice(0, 10); }
function addHours(time: string, hours: number) { const [hour, minute] = time.split(":").map(Number); return `${String(Math.min(hour + hours, 23)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }
function quickDate(offset: number) { const date = new Date(); date.setDate(date.getDate() + offset); return localDateValue(date); }
function nextMonday() { const date = new Date(); const offset = ((8 - date.getDay()) % 7) || 7; date.setDate(date.getDate() + offset); return localDateValue(date); }
function localDateValue(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function datesBetween(start: string, end: string) { const dates: string[] = []; const cursor = new Date(`${start}T12:00:00Z`); const last = new Date(`${end}T12:00:00Z`); while (cursor <= last) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
function isWeekend(date: string) { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return day === 0 || day === 6; }
function isToday(date: string) { return date === quickDate(0); }
function formatDate(date: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }
function formatTime(time: string) { const [hour, minute] = time.split(":").map(Number); return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour, minute))); }
function zonedPart(value: string, part: "date" | "time") { const date = new Date(value); if (part === "date") { const pieces = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(date); const get = (type: string) => pieces.find((piece) => piece.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}`; } const pieces = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).formatToParts(date); const get = (type: string) => pieces.find((piece) => piece.type === type)?.value ?? "00"; return `${get("hour")}:${get("minute")}`; }
function scheduleSummary(sessions: SessionDraft[]) { if (!sessions.length) return "Choose one day or build a multi-day work schedule."; if (sessions.length === 1) return `${formatDate(sessions[0].date)} · ${formatTime(sessions[0].start_time)}–${formatTime(sessions[0].end_time)}`; return `${formatDate(sessions[0].date)} through ${formatDate(sessions.at(-1)!.date)}`; }
