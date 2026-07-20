import type { AppointmentWithRelations, InvoiceWithRelations, JobStatus, ScheduleEventWithRelations } from "@/lib/types/database";

export type JobOperationalState = "to_be_scheduled" | "scheduled" | "in_progress" | "work_complete" | "invoiced" | "paid" | "needs_attention" | "cancelled";

export function getCurrentWorkAppointment(appointments: AppointmentWithRelations[] = []) {
  return appointments
    .filter((appointment) =>
      ["job", "maintenance"].includes(appointment.appointment_type)
      && ["scheduled", "confirmed", "in_progress"].includes(appointment.status),
    )
    .sort((left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      || new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0] ?? null;
}

export function getCurrentWorkSession(events: ScheduleEventWithRelations[] = [], now = new Date()) {
  const active = events
    .filter((event) => event.event_type === "job" && ["scheduled", "confirmed", "in_progress"].includes(event.status))
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
  return active.find((event) => new Date(event.ends_at ?? event.starts_at).getTime() >= now.getTime()) ?? active.at(-1) ?? null;
}

export function getJobOperationalState(input: {
  appointments?: AppointmentWithRelations[];
  scheduleEvents?: ScheduleEventWithRelations[];
  invoices?: InvoiceWithRelations[];
  jobStatus: JobStatus;
  now?: Date;
}): JobOperationalState {
  const invoice = (input.invoices ?? []).find((item) => item.status !== "void");
  if (invoice?.status === "paid" || input.jobStatus === "paid") return "paid";
  if (invoice && ["sent", "partially_paid", "overdue"].includes(invoice.status)) return "invoiced";
  if (input.jobStatus === "invoiced") return "invoiced";
  if (["cancelled", "lost"].includes(input.jobStatus)) return "cancelled";
  if (["completed", "completed_pending_review", "ready_to_invoice"].includes(input.jobStatus)) return "work_complete";
  if (input.jobStatus === "returned_for_correction") return "needs_attention";
  if (input.jobStatus === "in_progress") return "in_progress";

  const workSession = getCurrentWorkSession(input.scheduleEvents, input.now);
  if (workSession) {
    if (workSession.status === "in_progress") return "in_progress";
    return new Date(workSession.starts_at).getTime() <= (input.now ?? new Date()).getTime()
      ? "in_progress"
      : "scheduled";
  }

  const appointment = getCurrentWorkAppointment(input.appointments);
  if (appointment) {
    if (appointment.status === "in_progress") return "in_progress";
    return new Date(appointment.starts_at).getTime() <= (input.now ?? new Date()).getTime()
      ? "in_progress"
      : "scheduled";
  }

  return "to_be_scheduled";
}

export function formatJobOperationalState(state: JobOperationalState) {
  return {
    to_be_scheduled: "To be scheduled",
    scheduled: "Scheduled",
    in_progress: "In progress",
    work_complete: "Work complete",
    invoiced: "Invoiced",
    paid: "Paid",
    needs_attention: "Needs attention",
    cancelled: "Cancelled",
  }[state];
}
