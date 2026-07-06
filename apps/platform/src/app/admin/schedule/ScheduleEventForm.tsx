"use client";

import { useActionState } from "react";
import { CalendarPlus, Save } from "lucide-react";
import {
  createScheduleEvent,
  updateScheduleEventDetails,
  type AppointmentActionState,
} from "./actions";
import type {
  Job,
  ScheduleEventType,
  ScheduleEventStatus,
  ScheduleEventWithRelations,
  ScheduleUser,
} from "@/lib/types/database";

const initialState: AppointmentActionState = {
  status: "idle",
  message: "",
};

const eventTypes: ScheduleEventType[] = [
  "estimate",
  "job",
  "follow_up",
  "maintenance",
  "pto",
  "unavailable",
  "internal",
  "emergency",
  "other",
];

const statuses: ScheduleEventStatus[] = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

export function AddScheduleEventForm({
  defaultStartsAt,
  jobs,
  users,
}: {
  defaultStartsAt?: string;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
  users: ScheduleUser[];
}) {
  const [state, formAction, pending] = useActionState(createScheduleEvent, initialState);

  return (
    <form action={formAction} className="crm-form schedule-event-form">
      <FormMessage state={state} />
      <label>
        Title
        <input name="title" placeholder="Crew work at Lake Ridge, HOA walkthrough, PTO" required />
      </label>
      <div className="form-grid-two">
        <label>
          Event type
          <select defaultValue="job" name="event_type">
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select defaultValue="scheduled" name="status">
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Linked job
        <select defaultValue="" name="job_id">
          <option value="">No linked job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.service_type ?? "job"} - {job.status.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Start time
          <input defaultValue={defaultStartsAt ?? ""} name="starts_at" required type="datetime-local" />
        </label>
        <label>
          End time
          <input name="ends_at" type="datetime-local" />
        </label>
      </div>
      <label className="form-checkbox">
        <input name="all_day" type="checkbox" value="1" />
        <span>All-day availability block</span>
      </label>
      <label>
        Assigned employees
        <select className="multi-select-field" defaultValue={[]} multiple name="assigned_user_ids" size={Math.min(Math.max(users.length, 4), 8)}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name || user.email || "Unnamed team member"}
              {user.role_names.length ? ` (${user.role_names.join(", ")})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Location
        <input name="location_label" placeholder="Office, 123 Main St, north entrance, phone-only follow-up" />
      </label>
      <label>
        Description
        <input name="description" placeholder="Short event summary for the calendar card" />
      </label>
      <label>
        Notes
        <textarea name="calendar_notes" placeholder="Internal schedule notes, access details, or reminders" rows={4} />
      </label>
      <button disabled={pending} type="submit">
        <CalendarPlus aria-hidden="true" size={18} />
        {pending ? "Saving..." : "Add event"}
      </button>
    </form>
  );
}

export function ScheduleEventEditForm({
  event,
  jobs,
  users,
}: {
  event: ScheduleEventWithRelations;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
  users: ScheduleUser[];
}) {
  const [state, formAction, pending] = useActionState(updateScheduleEventDetails, initialState);
  const assignedUserIds = (event.schedule_event_assignments ?? []).map((assignment) => assignment.user_id);

  return (
    <form action={formAction} className="appointment-edit-form schedule-event-edit-form">
      <input name="event_id" type="hidden" value={event.id} />
      <label>
        <span>Title</span>
        <input defaultValue={event.title} name="title" required />
      </label>
      <div className="form-grid-two">
        <label>
          <span>Type</span>
          <select defaultValue={event.event_type} name="event_type">
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select defaultValue={event.status} name="status">
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>Linked job</span>
        <select defaultValue={event.job_id ?? ""} name="job_id">
          <option value="">No linked job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.service_type ?? "job"} - {job.status.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          <span>Start time</span>
          <input defaultValue={toLocalDateTime(event.starts_at)} name="starts_at" required type="datetime-local" />
        </label>
        <label>
          <span>End time</span>
          <input defaultValue={event.ends_at ? toLocalDateTime(event.ends_at) : ""} name="ends_at" type="datetime-local" />
        </label>
      </div>
      <label className="form-checkbox">
        <input defaultChecked={event.all_day} name="all_day" type="checkbox" value="1" />
        <span>All-day availability block</span>
      </label>
      <label>
        <span>Assigned employees</span>
        <select className="multi-select-field" defaultValue={assignedUserIds} multiple name="assigned_user_ids" size={Math.min(Math.max(users.length, 4), 8)}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name || user.email || "Unnamed team member"}
              {user.role_names.length ? ` (${user.role_names.join(", ")})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Location</span>
        <input defaultValue={event.location_label ?? ""} name="location_label" />
      </label>
      <label>
        <span>Description</span>
        <input defaultValue={event.description ?? ""} name="description" />
      </label>
      <label>
        <span>Notes</span>
        <textarea defaultValue={event.calendar_notes ?? ""} name="calendar_notes" rows={4} />
      </label>
      <button disabled={pending} type="submit">
        <Save aria-hidden="true" size={17} />
        {pending ? "Saving..." : "Save event"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function FormMessage({ state }: { state: AppointmentActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
