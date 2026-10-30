"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { updateAppointmentStatus, type AppointmentActionState } from "@/app/admin/schedule/actions";
import type { AppointmentStatus } from "@/lib/types/database";

const initialState: AppointmentActionState = {
  status: "idle",
  message: "",
};

const appointmentStatuses: AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

export function AppointmentStatusActions({
  appointmentId,
  currentStatus,
  jobId,
  revision: initialRevision,
}: {
  appointmentId: string;
  currentStatus: AppointmentStatus;
  jobId: string;
  revision: number;
}) {
  const [state, formAction, pending] = useReliableActionState(updateAppointmentStatus, initialState);
  const [revision, setRevision] = useState(initialRevision);
  const router = useRouter();
  useEffect(() => { if (state.appointmentId && state.revision) { setRevision(state.revision); router.refresh(); } }, [state, router]);

  return (
    <form onSubmit={event => { event.preventDefault(); void formAction(new FormData(event.currentTarget)); }} className="appointment-status-form">
      <input name="appointment_id" type="hidden" value={appointmentId} />
      <input name="job_id" type="hidden" value={jobId} />
      <input name="expected_revision" type="hidden" value={revision} />
      <label>
        <span>Update status</span>
        <select defaultValue={currentStatus} name="next_status">
          {appointmentStatuses.map((status) => (
            <option key={status} value={status}>{status.replace("_", " ")}</option>
          ))}
        </select>
      </label>
      <button disabled={pending} type="submit">
        <CheckCircle2 aria-hidden="true" size={17} />
        {pending ? "Saving..." : "Save"}
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

