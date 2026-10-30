import { toScheduleDateTimeLocal } from "./event-form.ts";

export const activeJobWorkSessionStatuses = ["scheduled", "confirmed", "in_progress"] as const;

export type JobWorkSessionPayload = {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  assigned_user_ids: string[];
  notes: string;
  status: (typeof activeJobWorkSessionStatuses)[number];
};

type JobScheduleEventInput = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  calendar_notes?: string | null;
  schedule_event_assignments?: { employee_id?: string | null }[] | null;
};

export function buildActiveJobWorkSessions(events: JobScheduleEventInput[]): JobWorkSessionPayload[] {
  return events
    .filter((event) => activeJobWorkSessionStatuses.includes(event.status as JobWorkSessionPayload["status"]))
    .map((event) => {
      const start = toScheduleDateTimeLocal(event.starts_at);
      const end = toScheduleDateTimeLocal(event.ends_at ?? event.starts_at);
      return {
        id: event.id,
        date: start.slice(0, 10),
        start_time: start.slice(11, 16),
        end_time: end.slice(11, 16),
        assigned_user_ids: (event.schedule_event_assignments ?? [])
          .map((assignment) => assignment.employee_id)
          .filter((id): id is string => Boolean(id)),
        notes: event.calendar_notes ?? "",
        status: event.status as JobWorkSessionPayload["status"],
      };
    })
    .sort(compareWorkSessions);
}

export function replaceJobWorkSessionTiming(
  sessions: JobWorkSessionPayload[],
  eventId: string,
  timing: Pick<JobWorkSessionPayload, "date" | "start_time" | "end_time">,
) {
  let found = false;
  const updated = sessions.map((session) => {
    if (session.id !== eventId) return session;
    found = true;
    return { ...session, ...timing };
  });

  if (!found) throw new Error("The selected workday is no longer active on this job.");
  return updated.sort(compareWorkSessions);
}

function compareWorkSessions(a: JobWorkSessionPayload, b: JobWorkSessionPayload) {
  return a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time);
}
