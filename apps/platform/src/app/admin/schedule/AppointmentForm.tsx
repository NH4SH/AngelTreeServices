"use client";

import { useActionState } from "react";
import { createAppointment, type AppointmentActionState } from "./actions";
import type { AppointmentType, Job } from "@/lib/types/database";

const initialState: AppointmentActionState = {
  status: "idle",
  message: "",
};

const appointmentTypes: AppointmentType[] = ["estimate", "job", "follow_up"];

export function AddAppointmentForm({
  jobs,
}: {
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
}) {
  const [state, formAction, pending] = useActionState(createAppointment, initialState);

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
        Appointment type
        <select name="appointment_type" defaultValue="estimate">
          {appointmentTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start time
        <input name="starts_at" required type="datetime-local" />
      </label>
      <label>
        Notes
        <textarea name="calendar_notes" placeholder="Calendar notes for office or crew" rows={3} />
      </label>
      <button disabled={pending || jobs.length === 0} type="submit">
        {pending ? "Saving..." : "Add appointment"}
      </button>
    </form>
  );
}
