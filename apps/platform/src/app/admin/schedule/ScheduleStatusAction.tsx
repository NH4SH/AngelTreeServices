"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import type { AppointmentStatus, ScheduleEventStatus } from "@/lib/types/database";
import {
  updateAppointmentStatus,
  updateScheduleEventStatus,
  type AppointmentActionState,
} from "./actions";

const initialState: AppointmentActionState = { status: "idle", message: "" };

export function ScheduleEventStatusAction({
  currentStatus,
  eventId,
  label,
  nextStatus,
}: {
  currentStatus: ScheduleEventStatus;
  eventId: string;
  label: string;
  nextStatus: ScheduleEventStatus;
}) {
  const [state, action, pending] = useReliableActionState(updateScheduleEventStatus, initialState);

  return (
    <form action={action} className="schedule-quick-status-form">
      <input name="event_id" type="hidden" value={eventId} />
      <input name="next_status" type="hidden" value={nextStatus} />
      <button disabled={pending || currentStatus === nextStatus} type="submit">
        {pending ? "Updating..." : label}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function AppointmentStatusAction({
  appointmentId,
  currentStatus,
  jobId,
  label,
  nextStatus,
}: {
  appointmentId: string;
  currentStatus: AppointmentStatus;
  jobId: string;
  label: string;
  nextStatus: AppointmentStatus;
}) {
  const [state, action, pending] = useReliableActionState(updateAppointmentStatus, initialState);

  return (
    <form action={action} className="schedule-quick-status-form">
      <input name="appointment_id" type="hidden" value={appointmentId} />
      <input name="job_id" type="hidden" value={jobId} />
      <input name="next_status" type="hidden" value={nextStatus} />
      <button disabled={pending || currentStatus === nextStatus} type="submit">
        {pending ? "Updating..." : label}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function ActionMessage({ state }: { state: AppointmentActionState }) {
  if (!state.message || state.status === "success") return null;
  return <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}
