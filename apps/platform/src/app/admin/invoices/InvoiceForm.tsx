"use client";

import { useActionState } from "react";
import { createInvoice, type InvoiceActionState } from "./actions";
import type { Customer, InvoiceStatus, Job } from "@/lib/types/database";

const initialState: InvoiceActionState = {
  status: "idle",
  message: "",
};

const statuses: InvoiceStatus[] = ["draft", "sent", "partially_paid", "paid", "overdue", "void"];

export function AddInvoiceForm({
  customers,
  jobs,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
}) {
  const [state, formAction, pending] = useActionState(createInvoice, initialState);

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
        Job
        <select name="job_id" required>
          <option value="">Choose job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.service_type ?? "job"} - {job.status.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Status
          <select name="status" defaultValue="draft">
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input name="due_date" type="date" />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" placeholder="Internal invoice notes" rows={3} />
      </label>
      <fieldset className="nested-fieldset">
        <legend>Line item scaffold</legend>
        <input name="line_item_description" placeholder="Line item description" />
        <div className="form-grid-two">
          <input name="line_item_quantity" placeholder="Quantity" defaultValue="1" inputMode="decimal" />
          <input name="line_item_unit_price" placeholder="Unit price" inputMode="decimal" />
        </div>
      </fieldset>
      <button disabled={pending || customers.length === 0 || jobs.length === 0} type="submit">
        {pending ? "Saving..." : "Add invoice"}
      </button>
    </form>
  );
}
