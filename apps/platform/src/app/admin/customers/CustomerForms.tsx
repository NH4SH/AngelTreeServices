"use client";

import { useActionState } from "react";
import type { CustomerActionState } from "./actions";
import { createCustomer, createServiceLocation } from "./actions";
import type { CustomerType, CustomerWithLocations } from "@/lib/types/database";

const initialState: CustomerActionState = {
  status: "idle",
  message: "",
};

const customerTypes: CustomerType[] = ["residential", "commercial", "property_manager", "hoa"];

export function AddCustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomer, initialState);

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

export function AddServiceLocationForm({
  customers,
}: {
  customers: Pick<CustomerWithLocations, "id" | "display_name">[];
}) {
  const [state, formAction, pending] = useActionState(createServiceLocation, initialState);

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
