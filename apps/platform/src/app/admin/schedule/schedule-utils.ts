import type { AppointmentType, AppointmentWithRelations } from "@/lib/types/database";

export type ScheduleView = "day" | "week" | "month";

export const appointmentTypes = ["all", "estimate", "job", "follow_up", "maintenance"] as const;
export const appointmentStatuses = [
  "all",
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

export function getDateAnchor(value?: string) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function getScheduleRange(anchor: Date, view: ScheduleView) {
  if (view === "month") {
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(firstOfMonth);
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { start, end };
  }

  const start = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + (view === "day" ? 1 : 7));
  return { start, end };
}

export function getVisibleDays(anchor: Date, view: ScheduleView) {
  const range = getScheduleRange(anchor, view);
  const count = view === "day" ? 1 : view === "week" ? 7 : 42;

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(range.start);
    date.setDate(date.getDate() + index);
    return date;
  });
}

export function shiftDate(date: Date, view: ScheduleView, direction: -1 | 1) {
  const shifted = new Date(date);
  shifted.setDate(
    shifted.getDate() +
      direction * (view === "day" ? 1 : view === "week" ? 7 : daysInMonth(date)),
  );
  return shifted;
}

export function buildScheduleHref(
  current: Record<string, string | undefined>,
  updates: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();

  Object.entries({ ...current, ...updates }).forEach(([key, value]) => {
    if (value && value !== "all") {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `/admin/schedule?${query}` : "/admin/schedule";
}

export function groupAppointmentsByDate(appointments: AppointmentWithRelations[]) {
  return appointments.reduce<Record<string, AppointmentWithRelations[]>>((groups, appointment) => {
    const key = formatDateInput(new Date(appointment.starts_at));
    groups[key] = [...(groups[key] ?? []), appointment];
    return groups;
  }, {});
}

export function formatDateInput(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function formatRangeTitle(anchor: Date, range: { start: Date; end: Date }, view: ScheduleView) {
  if (view === "day") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(anchor);
  }

  if (view === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(anchor);
  }

  const inclusiveEnd = new Date(range.end);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(range.start)} to ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(inclusiveEnd)}`;
}

export function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

export function formatDayNumber(date: Date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatShortLocation(appointment: AppointmentWithRelations) {
  const location = appointment.service_locations;
  return location ? `${location.street}, ${location.city}` : "No location";
}

export function getAppointmentSummary(appointment: AppointmentWithRelations) {
  return appointment.jobs?.service_type?.replace("_", " ") || appointment.jobs?.requested_scope || "Scheduled work";
}

export function getAppointmentTone(appointment: Pick<AppointmentWithRelations, "appointment_type" | "status">) {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return "muted";
  }

  const tones: Record<AppointmentType, string> = {
    estimate: "estimate",
    follow_up: "follow-up",
    job: "field",
    maintenance: "maintenance",
    other: "maintenance",
  };

  return tones[appointment.appointment_type] ?? "maintenance";
}

export function isSameDay(left: Date, right: Date) {
  return formatDateInput(left) === formatDateInput(right);
}

export function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
