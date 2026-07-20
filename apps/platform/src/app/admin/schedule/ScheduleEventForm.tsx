"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CalendarPlus, MapPinned, Save, Search, X } from "lucide-react";
import { JobScheduleManager } from "@/components/job-schedule-manager";
import {
  createScheduleEvent,
  updateScheduleEventDetails,
  type AppointmentActionState,
} from "./actions";
import type { ScheduleEventType, ScheduleEventStatus, ScheduleEventWithRelations, ScheduleJobOption, ScheduleUser } from "@/lib/types/database";

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

export function ScheduleEventDrawerContent({
  closeHref,
  defaultDate,
  defaultStartsAt,
  initialJobId,
  jobs,
  users,
}: {
  closeHref: string;
  defaultDate: string;
  defaultStartsAt?: string;
  initialJobId?: string;
  jobs: ScheduleJobOption[];
  users: ScheduleUser[];
}) {
  const [eventType, setEventType] = useState<ScheduleEventType>("job");
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState(jobs.some((job) => job.id === initialJobId) ? initialJobId ?? "" : "");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const filteredJobs = useMemo(() => {
    const terms = jobSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return jobs;
    return jobs.filter((job) => {
      const searchable = getJobSearchText(job);
      return terms.every((term) => searchable.includes(term));
    });
  }, [jobSearch, jobs]);

  return <>
    <div className="appointment-drawer-header schedule-drawer-header">
      <div>
        <span>{eventType === "job" ? "Field work" : "New schedule event"}</span>
        <h2 id="add-schedule-event-title">{eventType === "job" ? "Schedule job" : "Add event"}</h2>
        <p>{eventType === "job" ? "Choose the work order, then choose the days and adjust each shift." : "Add an estimate, PTO, unavailable block, or internal company event."}</p>
      </div>
      <Link aria-label="Close add event" href={closeHref}>
        <X aria-hidden="true" size={17} />
      </Link>
    </div>

    <label className="schedule-drawer-type-control">
      <span>Event type</span>
      <select onChange={(event) => setEventType(event.target.value as ScheduleEventType)} value={eventType}>
        {eventTypes.map((type) => <option key={type} value={type}>{formatOption(type)}</option>)}
      </select>
    </label>

    {eventType === "job" ? <div className="schedule-job-flow">
      <section className="schedule-job-picker" aria-labelledby="schedule-job-picker-title">
        <div>
          <strong id="schedule-job-picker-title">Linked job</strong>
          <span>Required for field-work scheduling</span>
        </div>
        <label className="schedule-job-search">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">Search jobs</span>
          <input onChange={(event) => setJobSearch(event.target.value)} placeholder="Search customer, address, job, or scope" type="search" value={jobSearch} />
        </label>
        <label>
          <span>Choose job</span>
          <select onChange={(event) => setSelectedJobId(event.target.value)} required value={selectedJobId}>
            <option value="">Choose a work order</option>
            {filteredJobs.map((job) => <option key={job.id} value={job.id}>{formatJobOptionLabel(job)}</option>)}
          </select>
        </label>
        {jobSearch && filteredJobs.length === 0 ? <p className="schedule-job-search-empty">No jobs match that search.</p> : null}
      </section>

      {selectedJob ? <>
        <JobSummary job={selectedJob} />
        <JobScheduleManager
          closeHref={closeHref}
          defaultDate={defaultDate}
          embedded
          events={selectedJob.schedule_events ?? []}
          jobId={selectedJob.id}
          key={selectedJob.id}
          users={users}
        />
      </> : <div className="schedule-job-selection-empty">
        <CalendarPlus aria-hidden="true" size={23} />
        <strong>Choose a job to begin</strong>
        <span>The title, customer, property, and scope will come from the work order.</span>
      </div>}
    </div> : <AddScheduleEventForm defaultStartsAt={defaultStartsAt} eventType={eventType} jobs={jobs} users={users} />}
  </>;
}

export function AddScheduleEventForm({
  defaultStartsAt,
  eventType,
  jobs,
  users,
}: {
  defaultStartsAt?: string;
  eventType: Exclude<ScheduleEventType, "job">;
  jobs: ScheduleJobOption[];
  users: ScheduleUser[];
}) {
  const [state, formAction, pending] = useReliableActionState(createScheduleEvent, initialState);

  return (
    <form action={formAction} className="crm-form schedule-event-form">
      <input name="event_type" type="hidden" value={eventType} />
      <FormMessage state={state} />
      <label>
        Title
        <input name="title" placeholder="Crew work at Lake Ridge, HOA walkthrough, PTO" required />
      </label>
      <div className="form-grid-two schedule-event-status-row">
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
        Related job (optional)
        <select defaultValue="" name="job_id">
          <option value="">No linked job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {formatJobOptionLabel(job)}
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
      <label>
        Owner/admin override reason
        <textarea
          name="eligibility_override_reason"
          placeholder="Only needed if an assigned employee has a qualification warning"
          rows={2}
        />
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
  jobs: ScheduleJobOption[];
  users: ScheduleUser[];
}) {
  const [state, formAction, pending] = useReliableActionState(updateScheduleEventDetails, initialState);
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
              {formatJobOptionLabel(job)}
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
      <label>
        <span>Owner/admin override reason</span>
        <textarea
          maxLength={600}
          name="eligibility_override_reason"
          placeholder="Only needed if an assigned employee has a qualification warning"
          rows={2}
        />
      </label>
      <button disabled={pending} type="submit">
        <Save aria-hidden="true" size={17} />
        {pending ? "Saving..." : "Save event"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function JobSummary({ job }: { job: ScheduleJobOption }) {
  const activeSessions = (job.schedule_events ?? [])
    .filter((event) => event.event_type === "job" && ["scheduled", "confirmed", "in_progress"].includes(event.status))
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const party = job.organizations?.name || job.customers?.display_name || "Contracting party not available";
  const address = formatJobAddress(job);

  return <section className="schedule-job-summary" aria-label="Selected job summary">
    <div className="schedule-job-summary-heading">
      <div><span>Selected work order</span><strong>{formatServiceType(job.service_type)}</strong></div>
      <b>Job {job.id.slice(0, 8).toUpperCase()}</b>
    </div>
    <dl>
      <div><dt>Customer</dt><dd>{party}</dd></div>
      <div><dt>Property</dt><dd><MapPinned aria-hidden="true" size={15} />{address}</dd></div>
      <div><dt>Scope</dt><dd>{job.requested_scope || "No scope entered yet."}</dd></div>
      <div><dt>Current schedule</dt><dd>{formatCurrentSchedule(activeSessions)}</dd></div>
    </dl>
  </section>;
}

function getJobSearchText(job: ScheduleJobOption) {
  return [
    job.id,
    job.id.slice(0, 8),
    job.customers?.display_name,
    job.organizations?.name,
    job.service_type,
    job.requested_scope,
    job.service_locations?.label,
    job.service_locations?.street,
    job.service_locations?.city,
    job.service_locations?.state,
    job.service_locations?.postal_code,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function formatJobOptionLabel(job: ScheduleJobOption) {
  const party = job.organizations?.name || job.customers?.display_name || "Unknown customer";
  const location = job.service_locations?.street || job.service_locations?.label || "No address";
  return `${party} - ${location} - ${formatServiceType(job.service_type)} - ${job.id.slice(0, 8).toUpperCase()}`;
}

function formatServiceType(value: string | null) {
  if (!value) return "Scheduled work";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatJobAddress(job: ScheduleJobOption) {
  const location = job.service_locations;
  if (!location) return "No service location available";
  return [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
}

function formatCurrentSchedule(events: ScheduleEventWithRelations[]) {
  if (!events.length) return "Not scheduled yet";
  const first = new Date(events[0].starts_at);
  const last = new Date(events.at(-1)!.starts_at);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return events.length === 1 ? formatter.format(first) : `${events.length} workdays, ${formatter.format(first)} to ${formatter.format(last)}`;
}

function formatOption(value: string) {
  if (value === "pto") return "PTO";
  return value.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
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
