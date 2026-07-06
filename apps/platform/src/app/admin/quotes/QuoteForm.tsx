"use client";

import { useActionState } from "react";
import { createQuote, type QuoteActionState } from "./actions";
import type { Job, QuoteStatus } from "@/lib/types/database";

const initialState: QuoteActionState = {
  status: "idle",
  message: "",
};

const statuses: QuoteStatus[] = ["draft", "sent", "approved", "declined", "expired"];

export function AddQuoteForm({
  jobs,
}: {
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
}) {
  const [state, formAction, pending] = useActionState(createQuote, initialState);

  return (
    <form action={formAction} className="crm-form">
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
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
      <label>
        Quote status
        <select name="status" defaultValue="draft">
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status === "approved" ? "accepted (approved)" : status.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea name="customer_message" placeholder="Customer-facing quote notes" rows={3} />
      </label>
      <fieldset className="nested-fieldset">
        <legend>Line item scaffold</legend>
        <input name="line_item_description" placeholder="Line item description" />
        <div className="form-grid-two">
          <input name="line_item_quantity" placeholder="Quantity" defaultValue="1" inputMode="decimal" />
          <input name="line_item_unit_price" placeholder="Unit price" inputMode="decimal" />
        </div>
      </fieldset>
      <button disabled={pending || jobs.length === 0} type="submit">
        {pending ? "Saving..." : "Add quote"}
      </button>
    </form>
  );
}
