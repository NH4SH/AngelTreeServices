"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { useMemo, useState } from "react";
import { createJob, type JobActionState } from "./actions";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import type { Customer, JobPriority, JobServiceType, Organization, ServiceLocation } from "@/lib/types/database";

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
  organizations,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  leadSources: { id: string; name: string }[];
  organizations: Pick<Organization, "id" | "name">[];
  serviceLocations: ServiceLocation[];
}) {
  const [state, formAction, pending] = useReliableActionState(createJob, initialState);
  const [partyValue, setPartyValue] = useState("");
  const party = parseContractingParty(partyValue);
  const matchingLocations = useMemo(
    () => party ? serviceLocations.filter((location) => belongsToContractingParty(location, party)) : [],
    [party, serviceLocations],
  );

  return (
    <form action={formAction} className="crm-form mobile-primary-action-form">
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      <label>
        Contracting party
        <select name="contracting_party" onChange={(event) => setPartyValue(event.target.value)} required value={partyValue}>
          <option value="">Choose customer or organization</option>
          <optgroup label="Individual customers">{customers.map((customer) => <option key={customer.id} value={`customer:${customer.id}`}>{customer.display_name}</option>)}</optgroup>
          <optgroup label="Organizations">{organizations.map((organization) => <option key={organization.id} value={`organization:${organization.id}`}>{organization.name}</option>)}</optgroup>
        </select>
      </label>
      <label>
        Service location
        <select name="service_location_id" required>
          <option value="">Choose service location</option>
          {matchingLocations.map((location) => (
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
      <button disabled={pending || !party || matchingLocations.length === 0} type="submit">
        {pending ? "Saving..." : "Add job"}
      </button>
    </form>
  );
}
