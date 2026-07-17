"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  CalendarPlus,
  Check,
  Clock3,
  FileSignature,
  ListPlus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sprout,
} from "lucide-react";
import {
  closeRecurringOccurrence,
  createAuthorizedRecurringWorkOrder,
  createFollowUpTask,
  createQuoteFromRecommendation,
  createRecurringServicePlan,
  createRenewalQuote,
  createServiceRecommendation,
  createTaskFromRecommendation,
  generateRecurringOpportunities,
  rescheduleRecurringLocation,
  updateFollowUpTask,
  updateRecurringLocationState,
  updateRecurringPlanState,
} from "@/lib/actions/recurring";
import {
  initialRecurringActionState,
  type RecurringActionState,
} from "@/lib/action-states/recurring";
import type {
  AssignableUser,
  Organization,
  OrganizationContact,
  RecurringPlanLocation,
  RecurringServiceOccurrence,
  ServiceCategory,
  ServiceLocation,
  ServiceRecommendation,
} from "@/lib/types/database";

type CustomerOption = {
  id: string;
  display_name: string;
  organization_id: string | null;
  status: string;
};
type OrganizationOption = Pick<
  Organization,
  "id" | "name" | "status" | "payment_terms"
>;
type StaffOption = AssignableUser;

export function AddRecurringPlanForm({
  categories,
  contacts,
  customers,
  defaultAccountId = "",
  defaultAccountKind = "customer",
  defaultLocationId = "",
  locations,
  organizations,
  staff,
  sourceRecommendation,
}: {
  categories: ServiceCategory[];
  contacts: OrganizationContact[];
  customers: CustomerOption[];
  defaultAccountId?: string;
  defaultAccountKind?: "customer" | "organization";
  defaultLocationId?: string;
  locations: ServiceLocation[];
  organizations: OrganizationOption[];
  staff: StaffOption[];
  sourceRecommendation?: ServiceRecommendation | null;
}) {
  const [state, action, pending] = useActionState(
    createRecurringServicePlan,
    initialRecurringActionState,
  );
  const defaultKind = sourceRecommendation?.organization_id
    ? "organization"
    : defaultAccountKind;
  const [accountKind, setAccountKind] = useState(defaultKind);
  const [accountId, setAccountId] = useState(
    sourceRecommendation?.organization_id ??
      sourceRecommendation?.customer_id ??
      defaultAccountId,
  );
  const [authorizationMode, setAuthorizationMode] = useState("quote_required");
  const matchingLocations = useMemo(
    () =>
      locations.filter((location) =>
        accountKind === "organization"
          ? location.organization_id === accountId
          : location.customer_id === accountId,
      ),
    [accountId, accountKind, locations],
  );
  const matchingContacts = useMemo(
    () =>
      accountKind === "organization"
        ? contacts.filter(
            (contact) =>
              contact.organization_id === accountId && contact.is_active,
          )
        : [],
    [accountId, accountKind, contacts],
  );
  return (
    <form action={action} className="crm-form recurring-plan-form">
      <ActionMessage state={state} />
      <input
        name="source_recommendation_id"
        type="hidden"
        value={sourceRecommendation?.id ?? ""}
      />
      <fieldset className="segmented-field">
        <legend>Account type</legend>
        <label>
          <input
            checked={accountKind === "customer"}
            name="account_kind"
            onChange={() => {
              setAccountKind("customer");
              setAccountId("");
            }}
            type="radio"
            value="customer"
          />{" "}
          Individual customer
        </label>
        <label>
          <input
            checked={accountKind === "organization"}
            name="account_kind"
            onChange={() => {
              setAccountKind("organization");
              setAccountId("");
            }}
            type="radio"
            value="organization"
          />{" "}
          Organization
        </label>
      </fieldset>
      <label>
        {accountKind === "organization" ? "Organization" : "Customer"}
        <select
          name="account_id"
          onChange={(event) => setAccountId(event.target.value)}
          required
          value={accountId}
        >
          <option value="">Choose account</option>
          {accountKind === "organization"
            ? organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))
            : customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.display_name}
                </option>
              ))}
        </select>
      </label>
      <fieldset className="recurring-location-picker">
        <legend>Service locations</legend>
        {matchingLocations.length ? (
          matchingLocations.map((location) => (
            <div className="recurring-location-option" key={location.id}>
              <label className="checkbox-field">
                <input
                  defaultChecked={
                    (sourceRecommendation?.service_location_id ??
                      defaultLocationId) === location.id
                  }
                  name="service_location_ids"
                  type="checkbox"
                  value={location.id}
                />
                <span>
                  <strong>{location.label || location.street}</strong>
                  <small>
                    {location.street}, {location.city}
                  </small>
                </span>
              </label>
              {accountKind === "organization" ? (
                <ContactSelect
                  contacts={matchingContacts}
                  label="Onsite contact for this property"
                  name={`onsite_contact_${location.id}`}
                />
              ) : null}
            </div>
          ))
        ) : (
          <p className="inline-empty">
            Choose an account with at least one service location.
          </p>
        )}
      </fieldset>
      <div className="form-grid-two">
        <label>
          Plan name
          <input
            defaultValue={sourceRecommendation?.title ?? ""}
            name="plan_name"
            placeholder="Annual common-area tree inspection"
            required
          />
        </label>
        <label>
          Service category
          <select name="service_category_id">
            <option value="">Not specified</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Standard service scope
        <textarea
          defaultValue={sourceRecommendation?.customer_recommendation ?? ""}
          name="service_description"
          placeholder="Describe the repeatable work for each cycle."
          required
          rows={5}
        />
      </label>
      <div className="form-grid-three">
        <label>
          Frequency
          <select defaultValue="annually" name="recurrence_pattern">
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="monthly">Monthly</option>
            <option value="bimonthly">Every two months</option>
            <option value="quarterly">Quarterly</option>
            <option value="twice_yearly">Twice yearly</option>
            <option value="annually">Annually</option>
            <option value="custom_days">Custom days</option>
            <option value="custom_months">Custom months</option>
            <option value="seasonal_manual">Seasonal / manual renewal</option>
          </select>
        </label>
        <label>
          Custom interval
          <input
            min="1"
            name="custom_interval_count"
            placeholder="Only for custom"
            type="number"
          />
        </label>
        <label>
          Next service due
          <input name="next_service_due_date" required type="date" />
        </label>
      </div>
      <div className="form-grid-three">
        <label>
          Planning window
          <input
            defaultValue="60"
            min="0"
            name="planning_window_days"
            type="number"
          />
        </label>
        <label>
          Quote lead time
          <input
            defaultValue="45"
            min="0"
            name="quote_lead_days"
            type="number"
          />
        </label>
        <label>
          Reminder lead time
          <input
            defaultValue="30"
            min="0"
            name="reminder_lead_days"
            type="number"
          />
        </label>
      </div>
      <label>
        Preferred service window
        <input
          name="preferred_service_window"
          placeholder="Early spring, weekday mornings, after leaf drop..."
        />
      </label>
      <label>
        Authorization
        <select
          name="authorization_mode"
          onChange={(event) => setAuthorizationMode(event.target.value)}
          value={authorizationMode}
        >
          <option value="quote_required">
            Quote required every occurrence
          </option>
          <option value="staff_review">Staff review required</option>
          <option value="existing_agreement">
            Automatically authorized under existing agreement
          </option>
        </select>
      </label>
      {authorizationMode === "existing_agreement" ? (
        <section className="recurring-authorization-fields">
          <label>
            Agreement reference
            <input name="agreement_reference" required />
          </label>
          <div className="form-grid-three">
            <label>
              Starts
              <input name="authorization_start_date" type="date" />
            </label>
            <label>
              Ends
              <input name="authorization_end_date" type="date" />
            </label>
            <label>
              Approved per-visit price
              <input min="0" name="approved_price" step="0.01" type="number" />
            </label>
          </div>
          <label>
            Pricing rule
            <textarea
              name="pricing_rule"
              placeholder="Record the approved pricing basis. No automatic increases are applied."
              rows={3}
            />
          </label>
        </section>
      ) : null}
      {accountKind === "organization" ? (
        <div className="form-grid-three">
          <ContactSelect
            contacts={matchingContacts}
            label="Approval contact"
            name="approval_contact_id"
          />
          <ContactSelect
            contacts={matchingContacts}
            label="Billing contact"
            name="billing_contact_id"
          />
          <ContactSelect
            contacts={matchingContacts}
            label="Default onsite contact"
            name="default_onsite_contact_id"
          />
        </div>
      ) : null}
      <div className="form-grid-two">
        <label>
          Payment terms
          <input
            name="default_payment_terms"
            placeholder={
              accountKind === "organization"
                ? (organizations.find((org) => org.id === accountId)
                    ?.payment_terms ?? "Net 30")
                : "Due on receipt"
            }
          />
        </label>
        <label>
          Estimated minutes
          <input min="1" name="estimated_duration_minutes" type="number" />
        </label>
      </div>
      <label>
        Preferred crew
        <select name="preferred_crew_user_id">
          <option value="">Assign during scheduling</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name || person.email || "Staff member"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Customer-visible notes
        <textarea name="customer_notes" rows={3} />
      </label>
      <label>
        Internal planning notes
        <textarea name="internal_notes" rows={4} />
      </label>
      <label className="checkbox-field">
        <input
          defaultChecked
          name="weather_reschedule_allowed"
          type="checkbox"
        />{" "}
        Weather rescheduling may be needed
      </label>
      <button disabled={pending || !matchingLocations.length} type="submit">
        <Sprout size={18} />
        {pending ? "Creating plan..." : "Create recurring plan"}
      </button>
    </form>
  );
}

export function AddFollowUpForm({
  defaultLocationId = "",
  locations,
  staff,
}: {
  defaultLocationId?: string;
  locations: ServiceLocation[];
  staff: StaffOption[];
}) {
  const [state, action, pending] = useActionState(
    createFollowUpTask,
    initialRecurringActionState,
  );
  return (
    <form action={action} className="crm-form">
      <ActionMessage state={state} />
      <label>
        Property / service location
        <select
          defaultValue={defaultLocationId}
          name="service_location_id"
          required
        >
          <option value="">Choose property</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label || location.street} - {location.city}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" placeholder="Call about fall pruning" required />
      </label>
      <div className="form-grid-two">
        <label>
          Task type
          <select name="task_type">
            <option value="call_customer">Call customer</option>
            <option value="schedule_estimate">Schedule estimate</option>
            <option value="prepare_quote">Prepare quote</option>
            <option value="follow_up_quote">Follow up on quote</option>
            <option value="schedule_approved_work">
              Schedule approved work
            </option>
            <option value="collect_information">Collect information</option>
            <option value="request_payment">Request payment</option>
            <option value="renew_service">Renew service</option>
            <option value="property_inspection">Property inspection</option>
            <option value="customer_callback">Customer callback</option>
            <option value="internal_review">Internal review</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Due
          <input name="due_at" required type="datetime-local" />
        </label>
      </div>
      <div className="form-grid-two">
        <label>
          Priority
          <select defaultValue="normal" name="priority">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          Assigned to
          <select name="assigned_to_user_id">
            <option value="">Unassigned office queue</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name || person.email}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea name="description" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <ListPlus size={18} />
        {pending ? "Adding..." : "Add follow-up"}
      </button>
    </form>
  );
}

export function AddRecommendationForm({
  categories,
  defaultLocationId = "",
  locations,
}: {
  categories: ServiceCategory[];
  defaultLocationId?: string;
  locations: ServiceLocation[];
}) {
  const [state, action, pending] = useActionState(
    createServiceRecommendation,
    initialRecurringActionState,
  );
  return (
    <form action={action} className="crm-form">
      <ActionMessage state={state} />
      <label>
        Property
        <select
          defaultValue={defaultLocationId}
          name="service_location_id"
          required
        >
          <option value="">Choose property</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label || location.street} - {location.city}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Title
          <input name="title" placeholder="Reinspect rear oak" required />
        </label>
        <label>
          Service category
          <select name="service_category_id">
            <option value="">Not specified</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Customer-ready recommendation
        <textarea name="customer_recommendation" required rows={4} />
      </label>
      <div className="form-grid-three">
        <label>
          Recommended timeframe
          <input name="recommended_timeframe" placeholder="Within 6 months" />
        </label>
        <label>
          Priority
          <select defaultValue="normal" name="priority">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          Estimated value
          <input min="0" name="estimated_value" step="0.01" type="number" />
        </label>
      </div>
      <label>
        Internal notes
        <textarea name="internal_notes" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <Sprout size={18} />
        {pending ? "Saving..." : "Save recommendation"}
      </button>
    </form>
  );
}

export function GenerateRenewalsButton() {
  const [state, action, pending] = useActionState(
    generateRecurringOpportunities,
    initialRecurringActionState,
  );
  return (
    <form action={action}>
      <button disabled={pending} type="submit">
        <RotateCcw size={18} />
        {pending ? "Checking plans..." : "Generate due renewals"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function FollowUpActions({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(
    updateFollowUpTask,
    initialRecurringActionState,
  );
  return (
    <form action={action} className="task-action-row">
      <input name="task_id" type="hidden" value={taskId} />
      {status === "completed" ? (
        <button
          className="secondary-action"
          disabled={pending}
          name="task_intent"
          value="reopen"
        >
          <RotateCcw size={16} /> Reopen
        </button>
      ) : (
        <>
          <button
            className="secondary-action"
            disabled={pending}
            name="task_intent"
            value="start"
          >
            <Play size={16} /> Start
          </button>
          <button disabled={pending} name="task_intent" value="complete">
            <Check size={16} /> Complete
          </button>
        </>
      )}
      <ActionMessage state={state} />
    </form>
  );
}

export function RecommendationActions({
  recommendationId,
}: {
  recommendationId: string;
}) {
  const [state, action, pending] = useActionState(
    createTaskFromRecommendation,
    initialRecurringActionState,
  );
  const [quoteState, quoteAction, quotePending] = useActionState(
    createQuoteFromRecommendation,
    initialRecurringActionState,
  );
  return (
    <div className="task-action-row">
      <form action={action}>
        <input
          name="recommendation_id"
          type="hidden"
          value={recommendationId}
        />
        <input
          name="due_at"
          type="hidden"
          value={new Date().toISOString().slice(0, 16)}
        />
        <button className="secondary-action" disabled={pending} type="submit">
          <ListPlus size={16} />
          {pending ? "Adding..." : "Add follow-up"}
        </button>
      </form>
      <Link
        className="secondary-action"
        href={`/admin/recurring?new_plan=1&recommendation_id=${recommendationId}`}
      >
        <Sprout size={16} /> Create plan
      </Link>
      <form action={quoteAction}>
        <input
          name="recommendation_id"
          type="hidden"
          value={recommendationId}
        />
        <button disabled={quotePending} type="submit">
          <FileSignature size={16} />
          {quotePending ? "Preparing..." : "Prepare quote"}
        </button>
      </form>
      <ActionMessage state={state} />
      <ActionMessage state={quoteState} />
    </div>
  );
}

export function PlanStateActions({
  planId,
  state: planState,
}: {
  planId: string;
  state: string;
}) {
  const [state, action, pending] = useActionState(
    updateRecurringPlanState,
    initialRecurringActionState,
  );
  return (
    <form action={action} className="task-action-row">
      <input name="plan_id" type="hidden" value={planId} />
      {planState === "cancelled" ? (
        <span className="field-note">
          Cancelled plans retain their history.
        </span>
      ) : planState === "active" ? (
        <button
          className="secondary-action"
          disabled={pending}
          name="plan_state"
          value="paused"
        >
          <Pause size={16} /> Pause plan
        </button>
      ) : (
        <button disabled={pending} name="plan_state" value="active">
          <Play size={16} /> Resume plan
        </button>
      )}
      {planState !== "cancelled" ? (
        <details>
          <summary>Cancel plan</summary>
          <p className="field-note">
            Cancellation stops future generation and keeps all prior work.
          </p>
          <button
            className="secondary-action"
            disabled={pending}
            name="plan_state"
            value="cancelled"
          >
            Cancel recurring plan
          </button>
        </details>
      ) : null}
      <ActionMessage state={state} />
    </form>
  );
}

export function PlanLocationScheduleForm({
  location,
}: {
  location: RecurringPlanLocation;
}) {
  const [state, action, pending] = useActionState(
    rescheduleRecurringLocation,
    initialRecurringActionState,
  );
  return (
    <form action={action} className="inline-date-form">
      <input name="plan_location_id" type="hidden" value={location.id} />
      <label>
        Next service
        <input
          defaultValue={location.next_service_due_date}
          name="next_service_due_date"
          type="date"
        />
      </label>
      <button className="secondary-action" disabled={pending} type="submit">
        <CalendarPlus size={16} /> Update
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function PlanLocationStateForm({
  location,
}: {
  location: RecurringPlanLocation;
}) {
  const [state, action, pending] = useActionState(
    updateRecurringLocationState,
    initialRecurringActionState,
  );
  return (
    <form action={action} className="location-state-form">
      <input name="plan_location_id" type="hidden" value={location.id} />
      {location.state === "active" ? (
        <details>
          <summary>Pause this property</summary>
          <label>
            Reason
            <textarea
              name="paused_reason"
              placeholder="Optional office note"
              rows={2}
            />
          </label>
          <button
            className="secondary-action"
            disabled={pending}
            name="location_state"
            value="paused"
          >
            <Pause size={16} /> Pause property
          </button>
        </details>
      ) : (
        <button
          className="secondary-action"
          disabled={pending}
          name="location_state"
          value="active"
        >
          <Play size={16} /> Resume property
        </button>
      )}
      <ActionMessage state={state} />
    </form>
  );
}

export function OccurrenceActions({
  occurrence,
}: {
  occurrence: RecurringServiceOccurrence;
}) {
  const [quoteState, quoteAction, quotePending] = useActionState(
    createRenewalQuote,
    initialRecurringActionState,
  );
  const [jobState, jobAction, jobPending] = useActionState(
    createAuthorizedRecurringWorkOrder,
    initialRecurringActionState,
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeRecurringOccurrence,
    initialRecurringActionState,
  );
  const closed = ["completed", "skipped", "cancelled"].includes(
    occurrence.status,
  );
  return (
    <div className="occurrence-actions">
      {occurrence.renewal_quote_id ? (
        <Link
          className="primary-action"
          href={`/admin/quotes/${occurrence.renewal_quote_id}`}
        >
          <FileSignature size={16} /> Open renewal quote
        </Link>
      ) : occurrence.authorization_mode_snapshot === "existing_agreement" ? (
        <form action={jobAction}>
          <input name="occurrence_id" type="hidden" value={occurrence.id} />
          <button disabled={jobPending} type="submit">
            <CalendarPlus size={16} />
            {jobPending ? "Creating..." : "Create authorized work order"}
          </button>
        </form>
      ) : (
        <form action={quoteAction}>
          <input name="occurrence_id" type="hidden" value={occurrence.id} />
          <button disabled={quotePending} type="submit">
            <FileSignature size={16} />
            {quotePending ? "Preparing..." : "Prepare renewal quote"}
          </button>
        </form>
      )}
      {!closed ? (
        <details>
          <summary>Complete or skip</summary>
          <form action={closeAction} className="crm-form compact-form">
            <input name="occurrence_id" type="hidden" value={occurrence.id} />
            <label>
              Reason when skipped
              <textarea name="reason" rows={2} />
            </label>
            <div className="task-action-row">
              <button
                className="secondary-action"
                disabled={closePending}
                name="occurrence_status"
                value="completed"
              >
                <Check size={16} /> Complete cycle
              </button>
              <button
                className="secondary-action"
                disabled={closePending}
                name="occurrence_status"
                value="skipped"
              >
                <SkipForward size={16} /> Skip occurrence
              </button>
            </div>
          </form>
        </details>
      ) : null}
      <ActionMessage state={quoteState} />
      <ActionMessage state={jobState} />
      <ActionMessage state={closeState} />
    </div>
  );
}

function ContactSelect({
  contacts,
  label,
  name,
}: {
  contacts: OrganizationContact[];
  label: string;
  name: string;
}) {
  return (
    <label>
      {label}
      <select name={name}>
        <option value="">Not selected</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.full_name} -{" "}
            {contact.contact_roles
              ?.map((role) => role.replaceAll("_", " "))
              .join(", ") ||
              contact.role_title ||
              "contact"}
          </option>
        ))}
      </select>
    </label>
  );
}
function ActionMessage({ state }: { state: RecurringActionState }) {
  return state.message ? (
    <p
      className={`form-message ${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  ) : null;
}
