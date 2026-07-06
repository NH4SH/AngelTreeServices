"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import {
  adjustTimeEntry,
  clockIn,
  clockOut,
  reviewTimeEntry,
  setTimeClockPermission,
  type TimeClockActionState,
} from "@/lib/actions/time-clock";
import type {
  CrewJob,
  ScheduleEventWithRelations,
  TimeClockPermission,
  TimeClockUserSummary,
  TimeEntryWithRelations,
} from "@/lib/types/database";

const initialState: TimeClockActionState = {
  status: "idle",
  message: "",
};

const timeEntryTypes = [
  "job",
  "drive",
  "shop",
  "maintenance",
  "admin",
  "training",
  "break",
  "other",
] as const;

export function CrewClockInForm({
  jobs,
  scheduleEvents,
}: {
  jobs: CrewJob[];
  scheduleEvents: ScheduleEventWithRelations[];
}) {
  const [state, formAction, pending] = useActionState(clockIn, initialState);

  return (
    <form action={formAction} className="crm-form time-clock-form">
      <FormMessage state={state} />
      <label>
        Time type
        <select defaultValue="job" name="entry_type">
          {timeEntryTypes.map((entryType) => (
            <option key={entryType} value={entryType}>
              {entryType.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assigned job
        <select defaultValue="" name="job_id">
          <option value="">No linked job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {(job.customers?.display_name || "Customer")} - {job.service_type?.replace("_", " ") || "work"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Scheduled event
        <select defaultValue="" name="schedule_event_id">
          <option value="">No linked schedule event</option>
          {scheduleEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title} - {formatDateTime(event.starts_at)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea name="notes" placeholder="Optional note for the day, stop, or task." rows={3} />
      </label>
      <button className="time-clock-primary-button" disabled={pending} type="submit">
        <PlayCircle aria-hidden="true" size={20} />
        {pending ? "Clocking in..." : "Clock In"}
      </button>
    </form>
  );
}

export function CrewClockOutForm({ activeEntry }: { activeEntry: TimeEntryWithRelations }) {
  const [state, formAction, pending] = useActionState(clockOut, initialState);

  return (
    <form action={formAction} className="crm-form time-clock-form">
      <input name="time_entry_id" type="hidden" value={activeEntry.id} />
      <FormMessage state={state} />
      <label>
        Break minutes
        <input defaultValue={activeEntry.break_minutes} min={0} name="break_minutes" step={1} type="number" />
      </label>
      <label>
        Notes
        <textarea
          defaultValue={activeEntry.notes ?? ""}
          name="notes"
          placeholder="Add wrap-up notes before you clock out."
          rows={3}
        />
      </label>
      <button className="time-clock-stop-button" disabled={pending} type="submit">
        <PauseCircle aria-hidden="true" size={20} />
        {pending ? "Clocking out..." : "Clock Out"}
      </button>
    </form>
  );
}

export function LiveTimerCard({ entry }: { entry: TimeEntryWithRelations }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    const started = new Date(entry.clock_in_at).getTime();
    const diff = Math.max(0, now - started);
    return formatDuration(diff);
  }, [entry.clock_in_at, now]);

  return (
    <section className="time-clock-live-card">
      <p className="surface-label">
        <Clock3 aria-hidden="true" size={18} />
        Active timer
      </p>
      <strong>{elapsed}</strong>
      <span>
        {entry.entry_type.replace("_", " ")}
        {entry.jobs?.customers?.display_name ? ` - ${entry.jobs.customers.display_name}` : ""}
      </span>
      <small>
        Clocked in at {formatTime(entry.clock_in_at)}
        {entry.jobs?.service_type ? ` for ${entry.jobs.service_type.replace("_", " ")}` : ""}
      </small>
    </section>
  );
}

export function PermissionToggleForm({
  permission,
  user,
}: {
  permission: TimeClockPermission | null | undefined;
  user: TimeClockUserSummary;
}) {
  const [state, formAction, pending] = useActionState(setTimeClockPermission, initialState);
  const nextEnabled = !(permission?.is_enabled ?? false);

  return (
    <form action={formAction} className="time-permission-form">
      <input name="user_id" type="hidden" value={user.id} />
      <input name="enabled" type="hidden" value={String(nextEnabled)} />
      <button className={nextEnabled ? "secondary-action button-reset" : "secondary-action button-reset destructive-soft"} disabled={pending} type="submit">
        <ShieldCheck aria-hidden="true" size={16} />
        {nextEnabled ? "Enable" : "Disable"}
      </button>
      {state.message ? (
        <small className={state.status === "error" ? "time-inline-feedback error" : "time-inline-feedback"}>
          {state.message}
        </small>
      ) : null}
    </form>
  );
}

export function TimeEntryApprovalForm({
  timeEntry,
  userId,
}: {
  timeEntry: TimeEntryWithRelations;
  userId: string;
}) {
  const [state, formAction, pending] = useActionState(reviewTimeEntry, initialState);

  return (
    <form action={formAction} className="crm-form compact-form time-review-form">
      <input name="time_entry_id" type="hidden" value={timeEntry.id} />
      <input name="user_id" type="hidden" value={userId} />
      <label>
        Review note
        <input name="approval_note" placeholder="Optional context for payroll review" />
      </label>
      <div className="time-review-button-row">
        <button disabled={pending} name="review_status" type="submit" value="approved">
          <CheckCircle2 aria-hidden="true" size={16} />
          {pending ? "Saving..." : "Approve"}
        </button>
        <button className="secondary-action button-reset" disabled={pending} name="review_status" type="submit" value="needs_correction">
          <Clock3 aria-hidden="true" size={16} />
          Needs correction
        </button>
        <button className="secondary-action button-reset destructive-soft" disabled={pending} name="review_status" type="submit" value="rejected">
          <PauseCircle aria-hidden="true" size={16} />
          Reject
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function TimeEntryAdjustmentForm({
  timeEntry,
  userId,
}: {
  timeEntry: TimeEntryWithRelations;
  userId: string;
}) {
  const [state, formAction, pending] = useActionState(adjustTimeEntry, initialState);

  return (
    <form action={formAction} className="crm-form compact-form time-review-form">
      <input name="time_entry_id" type="hidden" value={timeEntry.id} />
      <input name="user_id" type="hidden" value={userId} />
      <div className="form-grid-two">
        <label>
          Clock in
          <input defaultValue={toLocalDateTime(timeEntry.clock_in_at)} name="clock_in_at" required type="datetime-local" />
        </label>
        <label>
          Clock out
          <input
            defaultValue={timeEntry.clock_out_at ? toLocalDateTime(timeEntry.clock_out_at) : ""}
            name="clock_out_at"
            type="datetime-local"
          />
        </label>
      </div>
      <label>
        Break minutes
        <input defaultValue={timeEntry.break_minutes} min={0} name="break_minutes" step={1} type="number" />
      </label>
      <label>
        Adjustment reason
        <textarea name="reason" placeholder="Why this entry needed a change" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <TimerReset aria-hidden="true" size={16} />
        {pending ? "Saving..." : "Log adjustment"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function FormMessage({ state }: { state: TimeClockActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
