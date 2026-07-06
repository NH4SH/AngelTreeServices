"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CalendarCheck2,
  Link2,
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

const crewTimeEntryTypes = [
  { value: "job", label: "Job", description: "On-site work tied to a job or scheduled event." },
  { value: "drive", label: "Drive", description: "Travel between yard, shop, and job sites." },
  { value: "shop", label: "Shop", description: "Shop cleanup, sharpening, and loading." },
  { value: "maintenance", label: "Maintenance", description: "Equipment service or yard upkeep." },
  { value: "admin", label: "Admin", description: "Office, paperwork, or supply runs." },
  { value: "training", label: "Training", description: "Safety meetings or supervised practice." },
  { value: "other", label: "Other", description: "Anything valid that does not fit above." },
] as const;

export function CrewClockInForm({
  jobs,
  scheduleEvents,
}: {
  jobs: CrewJob[];
  scheduleEvents: ScheduleEventWithRelations[];
}) {
  const [state, formAction, pending] = useActionState(clockIn, initialState);
  const [selectedEntryType, setSelectedEntryType] = useState<string>("job");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedScheduleEventId, setSelectedScheduleEventId] = useState("");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedScheduleEvent = scheduleEvents.find((event) => event.id === selectedScheduleEventId) ?? null;
  const needsLinkedWork = selectedEntryType === "job" && !selectedJobId && !selectedScheduleEventId;

  return (
    <form action={formAction} className="crm-form time-clock-form">
      <FormMessage state={state} />
      <fieldset className="time-type-fieldset">
        <legend>Time type</legend>
        <div className="time-type-grid">
          {crewTimeEntryTypes.map((entryType) => (
            <label className="time-type-option" key={entryType.value}>
              <input
                defaultChecked={entryType.value === "job"}
                onChange={() => setSelectedEntryType(entryType.value)}
                name="entry_type"
                type="radio"
                value={entryType.value}
              />
              <span className="time-type-copy">
                <strong>{entryType.label}</strong>
                <small>{entryType.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="time-link-grid">
        <label>
          Job
          <select defaultValue="" name="job_id" onChange={(event) => setSelectedJobId(event.target.value)}>
            <option value="">No linked job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {(job.customers?.display_name || "Customer")} - {job.service_type?.replace("_", " ") || "work"}
              </option>
            ))}
          </select>
          <small className="form-help">
            Pick a job when your time belongs to a customer stop. Leave blank for shop, admin, training, or other work.
          </small>
        </label>
        <label>
          Scheduled event
          <select defaultValue="" name="schedule_event_id" onChange={(event) => setSelectedScheduleEventId(event.target.value)}>
            <option value="">No linked schedule event</option>
            {scheduleEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} - {formatDateTime(event.starts_at)}
              </option>
            ))}
          </select>
          <small className="form-help">Pick this when dispatch already put the work on the calendar.</small>
        </label>
      </div>
      <div className="time-clock-selection-card" role="status">
        <strong>Current timer setup</strong>
        <p>
          {selectedEntryType === "job"
            ? selectedJob
              ? `Job time linked to ${selectedJob.customers?.display_name || "a customer job"}.`
              : selectedScheduleEvent
                ? `Job time linked to the schedule event "${selectedScheduleEvent.title}".`
                : "Job time works best when it is linked to a job or scheduled event."
            : `${crewTimeEntryTypes.find((entryType) => entryType.value === selectedEntryType)?.label || "Time"} can stay unlinked if needed.`}
        </p>
        {needsLinkedWork ? (
          <small className="time-inline-feedback">
            This will still work, but payroll review is easier when job time points to a job or schedule event.
          </small>
        ) : null}
      </div>
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

export function QuickClockInEventForm({ event }: { event: ScheduleEventWithRelations }) {
  const [state, formAction, pending] = useActionState(clockIn, initialState);
  const customer = event.jobs?.customers?.display_name;

  return (
    <form action={formAction} className="quick-clock-event-form">
      <input name="entry_type" type="hidden" value="job" />
      <input name="schedule_event_id" type="hidden" value={event.id} />
      {event.job_id ? <input name="job_id" type="hidden" value={event.job_id} /> : null}
      <input
        name="notes"
        type="hidden"
        value={`Clocked in from today's schedule event: ${event.title}`}
      />
      <button disabled={pending} type="submit">
        <CalendarCheck2 aria-hidden="true" size={20} />
        <span>
          <strong>{pending ? "Clocking in..." : "Clock into this event"}</strong>
          <small>
            {event.title}
            {customer ? `, ${customer}` : ""}
          </small>
        </span>
      </button>
      <FormMessage state={state} />
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
        <small className="form-help">Add unpaid break time before you stop the timer. Leave this at 0 if you did not take a break.</small>
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
      <span className="time-live-status">Clocked in</span>
      <strong>{elapsed}</strong>
      <span>
        {entry.entry_type.replace("_", " ")}
        {entry.jobs?.customers?.display_name ? ` - ${entry.jobs.customers.display_name}` : ""}
      </span>
      <div className="time-live-context">
        {entry.jobs?.service_type ? (
          <p>
            <Link2 aria-hidden="true" size={15} />
            {entry.jobs.service_type.replace("_", " ")}
          </p>
        ) : null}
        {entry.schedule_events?.title ? (
          <p>
            <Link2 aria-hidden="true" size={15} />
            {entry.schedule_events.title}
          </p>
        ) : null}
      </div>
      <small>
        Clocked in at {formatTime(entry.clock_in_at)}
        {entry.jobs?.service_type ? ` for ${entry.jobs.service_type.replace("_", " ")}` : ""}
      </small>
    </section>
  );
}

export function PermissionToggleForm({
  disabled = false,
  disabledReason,
  permission,
  user,
}: {
  disabled?: boolean;
  disabledReason?: string;
  permission: TimeClockPermission | null | undefined;
  user: TimeClockUserSummary;
}) {
  const [state, formAction, pending] = useActionState(setTimeClockPermission, initialState);
  const nextEnabled = !(permission?.is_enabled ?? false);

  return (
    <form action={formAction} className="time-permission-form">
      <input name="user_id" type="hidden" value={user.id} />
      <input name="enabled" type="hidden" value={String(nextEnabled)} />
      <button
        className={nextEnabled ? "secondary-action button-reset" : "secondary-action button-reset destructive-soft"}
        disabled={pending || disabled}
        type="submit"
      >
        <ShieldCheck aria-hidden="true" size={16} />
        {nextEnabled ? "Enable" : "Disable"}
      </button>
      {state.message ? (
        <small className={state.status === "error" ? "time-inline-feedback error" : "time-inline-feedback"}>
          {state.message}
        </small>
      ) : disabledReason ? (
        <small className="time-inline-feedback">{disabledReason}</small>
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
