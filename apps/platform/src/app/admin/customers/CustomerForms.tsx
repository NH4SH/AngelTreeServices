"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import type { CustomerActionState } from "./actions";
import { createCustomer, createServiceLocation, updateCustomer } from "./actions";
import type { Customer, CustomerStatus, CustomerType, CustomerWithLocations, Organization, ServiceLocation } from "@/lib/types/database";

const initialState: CustomerActionState = {
  status: "idle",
  message: "",
};

const customerTypes: CustomerType[] = ["residential", "commercial", "property_manager", "hoa"];
const customerStatuses: CustomerStatus[] = ["active", "inactive", "archived"];

export function AddCustomerForm() {
  const [state, formAction, pending] = useReliableActionState(createCustomer, initialState);

  return (
    <form action={formAction} className="crm-form">
      <FormMessage state={state} />
      <label>
        Name
        <input name="display_name" placeholder="Customer or organization name" required />
      </label>
      <div className="form-grid-two">
        <label>
          Phone
          <input name="phone" placeholder="(540) 555-1234" type="tel" />
        </label>
        <label>
          Email
          <input name="email" placeholder="name@example.com" type="email" />
        </label>
      </div>
      <label>
        Customer type
        <select name="customer_type" defaultValue="residential">
          {customerTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea name="notes" placeholder="Internal notes for office or estimator" rows={3} />
      </label>
      <fieldset className="nested-fieldset">
        <legend>Optional first service location</legend>
        <input name="street" placeholder="Street address" />
        <div className="form-grid-three">
          <input name="city" placeholder="City" />
          <input name="state" placeholder="VA" defaultValue="VA" />
          <input name="postal_code" placeholder="ZIP" />
        </div>
      </fieldset>
      <button disabled={pending} type="submit">
        {pending ? "Saving..." : "Add customer"}
      </button>
    </form>
  );
}

export function EditCustomerForm({
  customer,
  organizations,
  serviceLocations,
}: {
  customer: Customer;
  organizations: Pick<Organization, "id" | "name">[];
  serviceLocations: ServiceLocation[];
}) {
  const [state, formAction, pending] = useReliableActionState(updateCustomer, initialState);
  const primaryLocationId =
    serviceLocations.find((location) => location.label === "Primary service location")?.id ??
    (serviceLocations.length === 1 ? serviceLocations[0]?.id : "");

  return (
    <form action={formAction} className="crm-form edit-record-form">
      <input name="customer_id" type="hidden" value={customer.id} />
      <FormMessage state={state} />
      <fieldset className="nested-fieldset edit-record-section">
        <legend>Customer contact info</legend>
        <label>
          Customer name
          <input defaultValue={customer.display_name} name="display_name" required />
        </label>
        <label>
          Primary contact name
          <input defaultValue={customer.primary_contact_name ?? ""} name="primary_contact_name" placeholder="Main contact person" />
        </label>
        <div className="form-grid-two">
          <label>
            Phone
            <input defaultValue={customer.phone ?? ""} name="phone" placeholder="(540) 555-1234" type="tel" />
          </label>
          <label>
            Email
            <input defaultValue={customer.email ?? ""} name="email" placeholder="name@example.com" type="email" />
          </label>
        </div>
      </fieldset>

      <fieldset className="nested-fieldset edit-record-section">
        <legend>Service locations</legend>
        <p className="field-note">These are the job and quote addresses. Updating a saved location keeps existing linked records connected to the same location.</p>
        <div className="service-location-editor-list">
          {serviceLocations.length ? (
            serviceLocations.map((location, index) => (
              <article className="service-location-editor" key={location.id}>
                <input name="service_location_id" type="hidden" value={location.id} />
                <div className="location-editor-heading">
                  <strong>{location.label || `Service location ${index + 1}`}</strong>
                  <label className="checkbox-field">
                    <input
                      defaultChecked={location.id === primaryLocationId}
                      name="primary_service_location_id"
                      type="radio"
                      value={location.id}
                    />
                    Mark primary
                  </label>
                </div>
                <label>
                  Location label
                  <input defaultValue={location.label ?? ""} name="service_location_label" placeholder="Primary service location, home, rental property" />
                </label>
                <label>
                  Street address
                  <input defaultValue={location.street} name="service_location_street" placeholder="Street address" required />
                </label>
                <div className="form-grid-three">
                  <label>
                    City
                    <input defaultValue={location.city} name="service_location_city" placeholder="City" required />
                  </label>
                  <label>
                    State
                    <input defaultValue={location.state} name="service_location_state" placeholder="VA" />
                  </label>
                  <label>
                    ZIP
                    <input defaultValue={location.postal_code ?? ""} name="service_location_postal_code" placeholder="ZIP" />
                  </label>
                </div>
                <div className="form-grid-two">
                  <label>
                    Access notes
                    <textarea defaultValue={location.access_notes ?? ""} name="service_location_access_notes" placeholder="Gate, driveway, pets, parking" rows={3} />
                  </label>
                  <label>
                    Gate code
                    <input defaultValue={location.gate_code ?? ""} name="service_location_gate_code" placeholder="Optional gate code" />
                  </label>
                </div>
                <label>
                  Service notes
                  <textarea defaultValue={location.service_notes ?? ""} name="service_location_service_notes" placeholder="Tree location, hazards, preferred access path" rows={3} />
                </label>
                <label className="checkbox-field remove-location-option">
                  <input name="remove_service_location" type="checkbox" value={location.id} />
                  Remove this location if it is not linked to jobs, quotes, appointments, or schedule events.
                </label>
              </article>
            ))
          ) : (
            <p className="inline-empty">No service locations yet. Add the first service address below.</p>
          )}
        </div>

        <article className="service-location-editor new-location-editor">
          <div className="location-editor-heading">
            <strong>Add service location</strong>
            <label className="checkbox-field">
              <input
                defaultChecked={serviceLocations.length === 0}
                name="primary_service_location_id"
                type="radio"
                value="__new_service_location"
              />
              Mark primary
            </label>
          </div>
          <label>
            Location label
            <input name="new_service_location_label" placeholder="Home, HOA entrance, rental property" />
          </label>
          <label>
            Street address
            <input name="new_service_location_street" placeholder="Street address" />
          </label>
          <div className="form-grid-three">
            <label>
              City
              <input name="new_service_location_city" placeholder="City" />
            </label>
            <label>
              State
              <input defaultValue="VA" name="new_service_location_state" placeholder="VA" />
            </label>
            <label>
              ZIP
              <input name="new_service_location_postal_code" placeholder="ZIP" />
            </label>
          </div>
          <div className="form-grid-two">
            <label>
              Access notes
              <textarea name="new_service_location_access_notes" placeholder="Gate, driveway, pets, parking" rows={3} />
            </label>
            <label>
              Gate code
              <input name="new_service_location_gate_code" placeholder="Optional gate code" />
            </label>
          </div>
          <label>
            Service notes
            <textarea name="new_service_location_service_notes" placeholder="Tree location, hazards, preferred access path" rows={3} />
          </label>
        </article>
      </fieldset>

      <fieldset className="nested-fieldset edit-record-section">
        <legend>Billing/contact address</legend>
        <p className="field-note">Use this only for mailing or billing notes. Service/job addresses are edited above.</p>
        <textarea
          defaultValue={customer.billing_address ?? ""}
          name="billing_address"
          placeholder="Optional mailing address, billing contact, or office contact notes"
          rows={3}
        />
      </fieldset>

      <fieldset className="nested-fieldset edit-record-section">
        <legend>Account settings</legend>
        <div className="form-grid-two">
          <label>
            Customer type
            <select defaultValue={customer.customer_type} name="customer_type">
              {customerTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select defaultValue={customer.status} name="status">
              {customerStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Organization
          <select defaultValue={customer.organization_id ?? ""} name="organization_id">
            <option value="">No linked organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <label>
        New internal note
        <textarea name="notes" placeholder="Optional note to add to this customer history" rows={3} />
      </label>
      <div className="record-form-actions">
        <button disabled={pending} type="submit">
          {pending ? "Saving..." : "Save changes"}
        </button>
        <Link className="secondary-action" href={`/admin/customers/${customer.id}`}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function AddServiceLocationForm({
  customers,
}: {
  customers: Pick<CustomerWithLocations, "id" | "display_name">[];
}) {
  const [state, formAction, pending] = useReliableActionState(createServiceLocation, initialState);

  return (
    <form action={formAction} className="crm-form compact-form">
      <FormMessage state={state} />
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
        Label
        <input name="label" placeholder="Home, HOA entrance, rental property" />
      </label>
      <label>
        Street
        <input name="street" placeholder="Street address" required />
      </label>
      <div className="form-grid-three">
        <input name="city" placeholder="City" required />
        <input name="state" placeholder="VA" defaultValue="VA" />
        <input name="postal_code" placeholder="ZIP" />
      </div>
      <label>
        Service notes
        <textarea name="service_notes" placeholder="Access notes, gates, hazards, parking" rows={3} />
      </label>
      <button disabled={pending || customers.length === 0} type="submit">
        {pending ? "Saving..." : "Add service location"}
      </button>
    </form>
  );
}

function FormMessage({ state }: { state: CustomerActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}
