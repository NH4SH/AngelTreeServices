"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { createAppointment, type AppointmentActionState } from "./actions";
import type { AppointmentType, AssignableUser, Job } from "@/lib/types/database";

const initialState: AppointmentActionState = {
  status: "idle",
  message: "",
};

const appointmentTypes: AppointmentType[] = ["estimate", "job", "follow_up", "maintenance"];

export function AddAppointmentForm({
  assignedUsers,
  defaultAppointmentType = "estimate",
  jobId,
  jobs,
  lockedAppointmentType,
}: {
  assignedUsers: AssignableUser[];
  defaultAppointmentType?: AppointmentType;
  jobId?: string;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
  lockedAppointmentType?: AppointmentType;
}) {
  const [state, formAction, pending] = useActionState(createAppointment, initialState);

  return (
    <form action={formAction} className="crm-form">
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      {jobId ? <input name="job_id" type="hidden" value={jobId} /> : (
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
      )}
      {lockedAppointmentType ? <input name="appointment_type" type="hidden" value={lockedAppointmentType} /> : (
        <label>
          Appointment type
          <select name="appointment_type" defaultValue={defaultAppointmentType}>
            {appointmentTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Start time
        <input name="starts_at" required type="datetime-local" />
      </label>
      <label>
        End time
        <input name="ends_at" type="datetime-local" />
      </label>
      <label>
        Assign staff
        <select name="assigned_user_id" defaultValue="">
          <option value="">Unassigned</option>
          {assignedUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name || user.email || "Unnamed staff user"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea name="calendar_notes" placeholder="Calendar notes for office or crew" rows={3} />
      </label>
      <label>
        Owner/admin override reason
        <textarea
          name="eligibility_override_reason"
          placeholder="Only needed if the assigned employee has a qualification warning"
          rows={2}
        />
      </label>
      <button disabled={pending || (!jobId && jobs.length === 0)} type="submit">
        <CalendarPlus aria-hidden="true" size={18} />
        {pending ? "Saving..." : "Add appointment"}
      </button>
    </form>
  );
}
