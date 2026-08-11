"use client";

import { formatBusinessDateTime } from "@/lib/business-time";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { StructuredAddressFields } from "@/components/address-autocomplete";
import { CalendarPlus, Clock3, MapPinned, Save, Search, UserRound, X } from "lucide-react";
import { JobScheduleManager } from "@/components/job-schedule-manager";
import { updateJobWorkSessionTime } from "@/app/admin/jobs/actions";
import {
  createScheduleEvent,
  createScheduleCustomerJob,
  scheduleLeadEstimate,
  schedulePartyEstimate,
  updateScheduleEventDetails,
  updateScheduleEventTime,
  type AppointmentActionState,
} from "./actions";
import type { ScheduleCustomerOption, ScheduleEventType, ScheduleEventStatus, ScheduleEventWithRelations, ScheduleJobOption, ScheduleUser } from "@/lib/types/database";
import { defaultEstimateStart, type LeadEstimatePrefill } from "@/lib/schedule/lead-estimate";
import type { PartyEstimatePrefill } from "@/lib/schedule/party-estimate";
import { formatScheduleDateTime, toScheduleDateTimeLocal } from "@/lib/schedule/event-form";

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

export function ScheduleEventQuickTimeForm({ event }: { event: ScheduleEventWithRelations }) {
  return event.event_type === "job"
    ? <JobWorkSessionQuickTimeForm event={event} />
    : <StandardEventQuickTimeForm event={event} />;
}

function JobWorkSessionQuickTimeForm({ event }: { event: ScheduleEventWithRelations }) {
  const router = useRouter();
  const [state, action, pending] = useReliableActionState(updateJobWorkSessionTime, initialState);
  const [allowConflicts, setAllowConflicts] = useState(false);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return <QuickTimeFields
    action={action}
    allowConflicts={allowConflicts}
    event={event}
    onAllowConflicts={setAllowConflicts}
    pending={pending}
    state={state}
  />;
}

function StandardEventQuickTimeForm({ event }: { event: ScheduleEventWithRelations }) {
  const router = useRouter();
  const [state, action, pending] = useReliableActionState(updateScheduleEventTime, initialState);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return <QuickTimeFields action={action} event={event} pending={pending} state={state} />;
}

function QuickTimeFields({
  action,
  allowConflicts = false,
  event,
  onAllowConflicts,
  pending,
  state,
}: {
  action: (formData: FormData) => void;
  allowConflicts?: boolean;
  event: ScheduleEventWithRelations;
  onAllowConflicts?: (value: boolean) => void;
  pending: boolean;
  state: AppointmentActionState & { conflicts?: string[] };
}) {
  const start = toScheduleDateTimeLocal(event.starts_at);
  const end = event.ends_at ? toScheduleDateTimeLocal(event.ends_at) : "";

  return <form action={action} className="schedule-quick-time-form">
    <div className="schedule-quick-time-heading">
      <Clock3 aria-hidden="true" size={18} />
      <div><strong>Date &amp; time</strong><span>Edit this calendar item directly.</span></div>
    </div>
    <input name="event_id" type="hidden" value={event.id} />
    <input name="allow_conflicts" type="hidden" value={allowConflicts ? "1" : "0"} />
    <label>Date<input defaultValue={start.slice(0, 10)} name="date" required type="date" /></label>
    <label>Start<input defaultValue={start.slice(11, 16)} name="start_time" required type="time" /></label>
    <label>End<input defaultValue={end.slice(11, 16)} name="end_time" required type="time" /></label>
    <button disabled={pending} type="submit"><Save aria-hidden="true" size={17} />{pending ? "Saving..." : "Save"}</button>
    {state.message ? <div className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      <strong>{state.message}</strong>
      {state.conflicts?.map((conflict) => <span key={conflict}>{conflict}</span>)}
    </div> : null}
    {state.status === "warning" && onAllowConflicts ? <label className="schedule-quick-conflict-override">
      <input checked={allowConflicts} onChange={(change) => onAllowConflicts(change.target.checked)} type="checkbox" />
      Save despite these crew conflicts
    </label> : null}
  </form>;
}

export function ScheduleEventDrawerContent({
  closeHref,
  customers,
  defaultDate,
  defaultStartsAt,
  initialJobId,
  jobs,
  leadEstimate,
  partyEstimate,
  users,
}: {
  closeHref: string;
  customers: ScheduleCustomerOption[];
  defaultDate: string;
  defaultStartsAt?: string;
  initialJobId?: string;
  jobs: ScheduleJobOption[];
  leadEstimate?: LeadEstimatePrefill | null;
  partyEstimate?: PartyEstimatePrefill | null;
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

  if (leadEstimate) {
    return <LeadEstimateDrawer
      closeHref={closeHref}
      defaultStartsAt={defaultStartsAt ?? ""}
      lead={leadEstimate}
      users={users}
    />;
  }

  if (partyEstimate) {
    return <PartyEstimateDrawer
      closeHref={closeHref}
      defaultStartsAt={defaultStartsAt ?? ""}
      source={partyEstimate}
      users={users}
    />;
  }

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
      </> : <>
        <div className="schedule-job-selection-empty">
        <CalendarPlus aria-hidden="true" size={23} />
        <strong>Choose a job to begin</strong>
        <span>The title, customer, property, and scope will come from the work order.</span>
        </div>
        <QuickScheduleJobForm customers={customers} />
      </>}
    </div> : <AddScheduleEventForm defaultStartsAt={defaultStartsAt} eventType={eventType} jobs={jobs} users={users} />}
  </>;
}

function PartyEstimateDrawer({
  closeHref,
  defaultStartsAt,
  source,
  users,
}: {
  closeHref: string;
  defaultStartsAt: string;
  source: PartyEstimatePrefill;
  users: ScheduleUser[];
}) {
  const router = useRouter();
  const [state, action, pending] = useReliableActionState(schedulePartyEstimate, initialState as LeadEstimateActionState);
  const [contactId, setContactId] = useState(source.selectedContactId);
  const [locationId, setLocationId] = useState(source.selectedLocationId);
  const selectedContact = source.contactOptions.find((contact) => contact.id === contactId) ?? null;
  const selectedLocation = source.locationOptions.find((location) => location.id === locationId) ?? null;

  useEffect(() => {
    if (!state.eventId || state.status !== "success") return;
    const url = new URL(closeHref, window.location.origin);
    url.searchParams.set("event", state.eventId);
    url.searchParams.set("scheduled", "1");
    router.replace(`${url.pathname}${url.search}`);
  }, [closeHref, router, state.eventId, state.status]);

  return <>
    <div className="appointment-drawer-header schedule-drawer-header">
      <div>
        <span>{source.partyType === "organization" ? "Organization" : "Customer"} · {source.leadSource}</span>
        <h2 id="add-schedule-event-title">Schedule estimate</h2>
        <p>Scheduling {source.partyLabel}. Existing contact and property details are filled in and remain editable.</p>
      </div>
      <Link aria-label="Close estimate scheduling" href={closeHref}><X aria-hidden="true" size={17} /></Link>
    </div>

    <section className="lead-estimate-context" aria-label="Scheduling source">
      <UserRound aria-hidden="true" size={20} />
      <div><strong>{source.partyLabel}</strong><span>{source.partyType === "organization" ? "Organization record" : "Customer record"}</span></div>
      <Link href={source.partyType === "organization" ? `/admin/organizations/${source.organizationId}` : `/admin/customers/${source.sourceCustomerId}`}>Open record</Link>
    </section>

    <form
      className="crm-form lead-estimate-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action(new FormData(event.currentTarget));
      }}
    >
      <input name="source_request_key" type="hidden" value={source.sourceRequestKey} />
      <input name="source_customer_id" type="hidden" value={source.sourceCustomerId} />
      <input name="source_organization_id" type="hidden" value={source.organizationId} />
      <FormMessage state={state} />

      <section className="lead-estimate-time-section">
        <div><Clock3 aria-hidden="true" size={20} /><span><strong>Choose the estimate time</strong><small>Review only the details that need correction.</small></span></div>
        <label>Estimate date and time<input defaultValue={defaultStartsAt} name="starts_at" required type="datetime-local" /></label>
      </section>

      <fieldset>
        <legend>Customer contact</legend>
        {source.contactOptions.length > 1 ? (
          <label>Organization contact
            <select name="source_contact_id" onChange={(event) => setContactId(event.target.value)} required value={contactId}>
              <option value="">Choose contact</option>
              {source.contactOptions.map((contact) => <option key={contact.id} value={contact.id}>{contact.label}</option>)}
            </select>
          </label>
        ) : <input name="source_contact_id" type="hidden" value={contactId} />}
        <div className="form-grid-two" key={contactId || "party-contact"}>
          <label>Contact name<input defaultValue={selectedContact?.label || source.contactName} name="contact_name" required /></label>
          <label>Phone<input defaultValue={selectedContact?.phone || source.phone} inputMode="tel" name="phone" /></label>
          <label>Email<input defaultValue={selectedContact?.email || source.email} name="email" type="email" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Service property</legend>
        {source.locationOptions.length > 1 ? (
          <label>Property
            <select name="service_location_id" onChange={(event) => setLocationId(event.target.value)} required value={locationId}>
              <option value="">Choose property</option>
              {source.locationOptions.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
            </select>
          </label>
        ) : <input name="service_location_id" type="hidden" value={locationId} />}
        {selectedLocation ? <div key={selectedLocation.id}>
          <StructuredAddressFields
            defaultValues={{ street: selectedLocation.street, city: selectedLocation.city, state: selectedLocation.state, postalCode: selectedLocation.postalCode }}
            names={{ street: "street", city: "city", state: "state", postalCode: "postal_code" }}
            required={{ street: true, city: true, state: true }}
          />
          <label>Access instructions<textarea defaultValue={selectedLocation.accessNotes} name="access_notes" rows={2} /></label>
          <label>Property notes<textarea defaultValue={selectedLocation.serviceNotes} name="service_notes" rows={2} /></label>
        </div> : (
          <div className="lead-estimate-missing-property" role="status">
            <strong>No active service property is available</strong>
            <span>Add or restore a service location on the {source.partyType === "organization" ? "organization" : "customer"} record, then return here to schedule the estimate.</span>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Requested work</legend>
        <label>Service
          <select defaultValue={source.serviceType} name="service_type">
            <option value="tree_removal">Tree removal</option><option value="trimming">Trimming</option>
            <option value="stump_grinding">Stump grinding</option><option value="landscaping">Landscaping</option>
            <option value="lawn_care">Lawn care</option><option value="emergency">Emergency</option><option value="other">Other</option>
          </select>
        </label>
        <label>Work description<textarea defaultValue={source.requestedScope} name="requested_scope" placeholder="Describe the requested estimate" required rows={5} /></label>
        <label>Customer or organization notes<textarea defaultValue={source.notes} name="calendar_notes" rows={3} /></label>
      </fieldset>

      <fieldset>
        <legend>Calendar details</legend>
        <label>Calendar title<input defaultValue={source.eventTitle} name="event_title" required /></label>
        <label>Estimator<select defaultValue="" name="assigned_user_id"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Unnamed team member"}</option>)}</select></label>
        <label>Owner/admin override reason<textarea name="eligibility_override_reason" placeholder="Only needed for a qualification warning" rows={2} /></label>
      </fieldset>

      <p className="form-helper">Saving updates the selected contact and property. If this request is submitted again, the existing appointment is updated instead of duplicated.</p>
      <button disabled={pending || !selectedLocation} type="submit"><CalendarPlus aria-hidden="true" size={18} />{pending ? "Scheduling..." : "Schedule estimate"}</button>
    </form>
  </>;
}

type LeadEstimateActionState = AppointmentActionState & { eventId?: string };

function LeadEstimateDrawer({
  closeHref,
  defaultStartsAt,
  lead,
  users,
}: {
  closeHref: string;
  defaultStartsAt: string;
  lead: LeadEstimatePrefill;
  users: ScheduleUser[];
}) {
  const router = useRouter();
  const [state, action, pending] = useReliableActionState(scheduleLeadEstimate, initialState as LeadEstimateActionState);

  useEffect(() => {
    if (!state.eventId || state.status !== "success") return;
    const url = new URL(closeHref, window.location.origin);
    url.searchParams.set("event", state.eventId);
    url.searchParams.set("scheduled", "1");
    router.replace(`${url.pathname}${url.search}`);
  }, [closeHref, router, state.eventId, state.status]);

  return <>
    <div className="appointment-drawer-header schedule-drawer-header">
      <div>
        <span>Website lead · {lead.leadSource}</span>
        <h2 id="add-schedule-event-title">Schedule estimate</h2>
        <p>Scheduling {lead.organizationName || lead.contactName}. Intake details are already filled in and remain editable.</p>
      </div>
      <Link aria-label="Close estimate scheduling" href={closeHref}>
        <X aria-hidden="true" size={17} />
      </Link>
    </div>

    <section className="lead-estimate-context" aria-label="Originating lead">
      <UserRound aria-hidden="true" size={20} />
      <div>
        <strong>{lead.contactName}</strong>
        <span>Received {formatBusinessDateTime(new Date(lead.submittedAt))} · Lead {lead.leadJobId.slice(0, 8).toUpperCase()}</span>
      </div>
      <Link href={`/admin/jobs/${lead.leadJobId}`}>Open lead</Link>
    </section>

    <form
      className="crm-form lead-estimate-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action(new FormData(event.currentTarget));
      }}
    >
      <input name="lead_job_id" type="hidden" value={lead.leadJobId} />
      <FormMessage state={state} />

      <section className="lead-estimate-time-section">
        <div><Clock3 aria-hidden="true" size={20} /><span><strong>Choose the estimate time</strong><small>Everything else came from the customer’s request.</small></span></div>
        <label>
          Estimate date and time
          <input
            defaultValue={defaultEstimateStart(lead.existingStartsAt, defaultStartsAt)}
            name="starts_at"
            required
            type="datetime-local"
          />
        </label>
      </section>

      <fieldset>
        <legend>Customer contact</legend>
        {lead.partyType === "organization" ? <label>Organization name<input defaultValue={lead.organizationName} name="organization_name" required /></label> : null}
        <div className="form-grid-two">
          <label>Contact name<input defaultValue={lead.contactName} name="contact_name" required /></label>
          <label>Phone<input defaultValue={lead.phone} inputMode="tel" name="phone" /></label>
          <label>Email<input defaultValue={lead.email} name="email" type="email" /></label>
          <label>Preferred contact
            <select defaultValue={lead.preferredContactMethod} name="preferred_contact_method">
              <option value="">Not specified</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="text">Text</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Service location</legend>
        <StructuredAddressFields
          defaultValues={{ street: lead.street, city: lead.city, state: lead.state, postalCode: lead.postalCode }}
          names={{ street: "street", city: "city", state: "state", postalCode: "postal_code" }}
          required={{ street: true, city: true, state: true }}
        />
        <label>Access instructions<textarea defaultValue={lead.accessNotes} name="access_notes" placeholder="Gate, parking, pets, or where to meet" rows={2} /></label>
        <label>Property/customer notes<textarea defaultValue={lead.serviceNotes} name="service_notes" rows={2} /></label>
      </fieldset>

      <fieldset>
        <legend>Requested work</legend>
        <label>Service
          <select defaultValue={lead.serviceType} name="service_type">
            <option value="tree_removal">Tree removal</option>
            <option value="trimming">Trimming</option>
            <option value="stump_grinding">Stump grinding</option>
            <option value="landscaping">Landscaping</option>
            <option value="lawn_care">Lawn care</option>
            <option value="emergency">Emergency</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Work description<textarea defaultValue={lead.requestedScope} name="requested_scope" required rows={5} /></label>
        <label>Requested date or window<input defaultValue={lead.preferredTiming} name="preferred_appointment_timing" placeholder="No preference supplied" /></label>
        <label>Intake details<textarea defaultValue={lead.internalNotes} name="internal_notes" rows={3} /></label>
      </fieldset>

      <fieldset>
        <legend>Calendar details</legend>
        <label>Calendar title<input defaultValue={lead.eventTitle} name="event_title" required /></label>
        <label>Estimator
          <select defaultValue={lead.assignedUserId} name="assigned_user_id">
            <option value="">Unassigned</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.email || "Unnamed team member"}</option>)}
          </select>
        </label>
        <label>Schedule notes<textarea defaultValue={lead.calendarNotes} name="calendar_notes" rows={3} /></label>
        <label>Owner/admin override reason<textarea name="eligibility_override_reason" placeholder="Only needed if the selected estimator has a qualification warning" rows={2} /></label>
      </fieldset>

      <p className="form-helper">Saving updates this lead and its existing customer or organization and property. It does not create another customer, lead, or estimate event.</p>
      <button disabled={pending} type="submit"><CalendarPlus aria-hidden="true" size={18} />{pending ? "Scheduling..." : lead.eventId ? "Update estimate" : "Schedule estimate"}</button>
    </form>
  </>;
}

type QuickJobState = AppointmentActionState & { jobId?: string };

function QuickScheduleJobForm({ customers }: { customers: ScheduleCustomerOption[] }) {
  const router = useRouter();
  const [state, action, pending] = useReliableActionState(createScheduleCustomerJob, initialState as QuickJobState);
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState(false);
  const customer = customers.find((item) => item.id === customerId) ?? null;
  const visibleCustomers = customers.filter((item) => [item.display_name, item.phone, item.email, item.billing_address, ...(item.service_locations ?? []).map((location) => location.street)].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (!state.jobId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("new", "1");
    url.searchParams.set("job", state.jobId);
    router.replace(`${url.pathname}${url.search}`);
  }, [router, state.jobId]);

  return (
    <details className="quick-schedule-job-creator">
      <summary>{newCustomer ? "New customer and job" : "Customer has no job yet?"}</summary>
      <form action={action} className="crm-form">
        {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        <label className="form-checkbox"><input checked={newCustomer} onChange={(event) => { setNewCustomer(event.target.checked); setCustomerId(""); }} type="checkbox" /><span>Create a new customer</span></label>
        {!newCustomer ? <>
          <label>Find customer<input onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, email, or street" type="search" value={search} /></label>
          <label>Customer<select name="customer_id" onChange={(event) => setCustomerId(event.target.value)} required value={customerId}><option value="">Choose customer</option>{visibleCustomers.map((item) => <option key={item.id} value={item.id}>{item.display_name}{item.phone ? ` - ${item.phone}` : ""}</option>)}</select></label>
          <label>Property<select disabled={!customer} name="service_location_id" required><option value="">Choose property</option>{(customer?.service_locations ?? []).map((location) => <option key={location.id} value={location.id}>{[location.label, location.street, location.city].filter(Boolean).join(" - ")}</option>)}</select></label>
        </> : <div className="form-grid-two quick-customer-fields">
          <label>Name<input name="new_customer_name" required /></label>
          <label>Phone<input inputMode="tel" name="new_customer_phone" /></label>
          <label>Email<input name="new_customer_email" type="email" /></label>
          <StructuredAddressFields
            className="quick-address-fields"
            defaultValues={{ city: "Fredericksburg", state: "VA" }}
            names={{
              street: "new_customer_street",
              city: "new_customer_city",
              state: "new_customer_state",
              postalCode: "new_customer_postal_code",
            }}
            required={{ street: true, city: true, state: true }}
          />
        </div>}
        <label>Service type<select defaultValue="tree_removal" name="service_type"><option value="tree_removal">Tree removal</option><option value="trimming">Trimming</option><option value="stump_grinding">Stump grinding</option><option value="landscaping">Landscaping</option><option value="lawn_care">Lawn care</option><option value="emergency">Emergency</option><option value="other">Other</option></select></label>
        <label>Scope<textarea name="requested_scope" placeholder="Work to schedule" required rows={3} /></label>
        <button disabled={pending || (!newCustomer && !customer)} type="submit"><Save size={18} />{pending ? "Creating..." : "Create job and continue"}</button>
      </form>
    </details>
  );
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
  const assignedUserIds = (event.schedule_event_assignments ?? []).map((assignment) => assignment.employee_id).filter((id): id is string => Boolean(id));

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
          <input defaultValue={toScheduleDateTimeLocal(event.starts_at)} name="starts_at" required type="datetime-local" />
        </label>
        <label>
          <span>End time</span>
          <input defaultValue={event.ends_at ? toScheduleDateTimeLocal(event.ends_at) : ""} name="ends_at" type="datetime-local" />
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
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return events.length === 1 ? formatScheduleDateTime(first, options) : `${events.length} workdays, ${formatScheduleDateTime(first, options)} to ${formatScheduleDateTime(last, options)}`;
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
