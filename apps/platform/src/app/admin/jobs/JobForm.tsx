"use client";

import { useActionState } from "react";
import { createJob, type JobActionState } from "./actions";
import type { Customer, JobPriority, JobServiceType, ServiceLocation } from "@/lib/types/database";

const initialState: JobActionState = {
  status: "idle",
  message: "",
};

const serviceTypes: JobServiceType[] = [
  "tree_removal",
  "trimming",
  "stump_grinding",
  "landscaping",
  "lawn_care",
  "emergency",
  "other",
];

const priorities: JobPriority[] = ["normal", "urgent", "emergency"];

export function AddJobForm({
  customers,
  leadSources,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  leadSources: { id: string; name: string }[];
  serviceLocations: ServiceLocation[];
}) {
  const [state, formAction, pending] = useActionState(createJob, initialState);

  return (
    <form action={formAction} className="crm-form">
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      <label>
        Customer
        <select name="customer_id" required>
          <option value="">Choose customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Service location
        <select name="service_location_id" required>
          <option value="">Choose service location</option>
          {serviceLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label ? `${location.label}: ` : ""}
              {location.street}, {location.city}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Service type
          <select name="service_type" defaultValue="tree_removal">
            {serviceTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="normal">
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid-two">
        <label>
          Lead source
          <select name="lead_source_id">
            <option value="">Not recorded</option>
            {leadSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
        </label>
        <label>
          Campaign detail
          <input name="lead_campaign" placeholder="Optional campaign, referral, or promotion" />
        </label>
      </div>
      <label>
        Estimated date
        <input name="estimated_date" type="date" />
      </label>
      <label>
        Description
        <textarea name="requested_scope" placeholder="Describe the requested work" required rows={4} />
      </label>
      <button disabled={pending || customers.length === 0 || serviceLocations.length === 0} type="submit">
        {pending ? "Saving..." : "Add job"}
      </button>
    </form>
  );
}
