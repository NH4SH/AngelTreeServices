"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { updateAppointmentDetails, type AppointmentActionState } from "@/app/admin/schedule/actions";
import type { AppointmentWithRelations, AssignableUser } from "@/lib/types/database";

const initialState: AppointmentActionState = {
  status: "idle",
  message: "",
};

export function AppointmentEditForm({
  appointment,
  assignedUsers,
}: {
  appointment: AppointmentWithRelations;
  assignedUsers: AssignableUser[];
}) {
  const [state, formAction, pending] = useActionState(updateAppointmentDetails, initialState);

  return (
    <form action={formAction} className="appointment-edit-form">
      <input name="appointment_id" type="hidden" value={appointment.id} />
      <input name="job_id" type="hidden" value={appointment.job_id} />
      <div className="form-grid-two">
        <label>
          <span>Start time</span>
          <input defaultValue={toLocalDateTime(appointment.starts_at)} name="starts_at" required type="datetime-local" />
        </label>
        <label>
          <span>End time</span>
          <input defaultValue={appointment.ends_at ? toLocalDateTime(appointment.ends_at) : ""} name="ends_at" type="datetime-local" />
        </label>
      </div>
      <label>
        <span>Assign staff</span>
        <select defaultValue={appointment.assigned_user_id ?? ""} name="assigned_user_id">
          <option value="">Unassigned</option>
          {assignedUsers.map((user) => (
            <option key={user.id} value={user.id}>{user.full_name || user.email || "Unnamed staff user"}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Calendar notes</span>
        <textarea defaultValue={appointment.calendar_notes ?? ""} maxLength={1000} name="calendar_notes" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <Save aria-hidden="true" size={17} />
        {pending ? "Saving..." : "Save changes"}
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

