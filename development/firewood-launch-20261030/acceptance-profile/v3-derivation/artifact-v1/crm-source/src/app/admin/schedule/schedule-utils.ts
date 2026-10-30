import type { AppointmentType, CalendarEntry, ScheduleEventType } from "@/lib/types/database";
import { formatScheduleDateTime, formatScheduleTime, getScheduleDateKey, parseScheduleDateTime } from "@/lib/schedule/event-form";

export type ScheduleView = "day" | "week" | "month";

export const scheduleEventTypes = [
  "all",
  "estimate",
  "job",
  "follow_up",
  "maintenance",
  "pto",
  "unavailable",
  "internal",
  "emergency",
  "other",
] as const;
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
  const todayKey = getScheduleDateKey(new Date());
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : todayKey;
  const date = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date(`${todayKey}T12:00:00Z`) : date;
}

export function getScheduleRange(anchor: Date, view: ScheduleView) {
  const civilStart = getCivilRangeStart(anchor, view);
  const civilEnd = addCivilDays(civilStart, view === "day" ? 1 : view === "week" ? 7 : 42);
  const start = parseScheduleDateTime(`${formatDateInput(civilStart)}T00:00`);
  const end = parseScheduleDateTime(`${formatDateInput(civilEnd)}T00:00`);
  if (!start || !end) throw new Error("Could not create the Eastern schedule range.");
  return { start, end };
}

export function getVisibleDays(anchor: Date, view: ScheduleView) {
  const start = getCivilRangeStart(anchor, view);
  const count = view === "day" ? 1 : view === "week" ? 7 : 42;

  return Array.from({ length: count }, (_, index) => addCivilDays(start, index));
}

export function shiftDate(date: Date, view: ScheduleView, direction: -1 | 1) {
  return addCivilDays(date, direction * (view === "day" ? 1 : view === "week" ? 7 : daysInMonth(date)));
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

export function groupEntriesByDate(entries: CalendarEntry[]) {
  return entries.reduce<Record<string, CalendarEntry[]>>((groups, entry) => {
    const key = getScheduleDateKey(entry.starts_at);
    groups[key] = [...(groups[key] ?? []), entry];
    return groups;
  }, {});
}

export function formatDateInput(date: Date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function formatRangeTitle(anchor: Date, _range: { start: Date; end: Date }, view: ScheduleView) {
  if (view === "day") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(anchor);
  }

  if (view === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(anchor);
  }

  const start = startOfWeek(anchor);
  const inclusiveEnd = addCivilDays(start, 6);
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start)} to ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(inclusiveEnd)}`;
}

export function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
}

export function formatDayNumber(date: Date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date);
}

export function formatTime(value: string) {
  return formatScheduleTime(value);
}

export function formatDateTimeLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
) {
  return formatScheduleDateTime(value, options);
}

export function formatEntryLocation(entry: CalendarEntry) {
  return entry.location_label || "No location";
}

export function getEntrySummary(entry: CalendarEntry) {
  if (entry.event_type === "pto") {
    return entry.subtitle || "Paid time off";
  }

  if (entry.event_type === "unavailable") {
    return entry.subtitle || "Unavailable";
  }

  return entry.subtitle || "Scheduled work";
}

export function getEntryTone(entry: Pick<CalendarEntry, "event_type" | "status">) {
  if (entry.status === "cancelled" || entry.status === "no_show") {
    return "muted";
  }

  const tones: Record<ScheduleEventType, string> = {
    estimate: "estimate",
    follow_up: "follow-up",
    job: "field",
    maintenance: "maintenance",
    pto: "pto",
    unavailable: "blocked",
    internal: "internal",
    emergency: "emergency",
    other: "maintenance",
  };

  return tones[entry.event_type] ?? "maintenance";
}

export function getEventTypeLabel(eventType: AppointmentType | ScheduleEventType | "all") {
  if (eventType === "all") {
    return "All event types";
  }

  if (eventType === "pto") {
    return "PTO";
  }

  return eventType.replace("_", " ");
}

export function getStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function isSameDay(left: Date, right: Date) {
  return formatDateInput(left) === formatDateInput(right);
}

export function isSameMonth(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}

function getCivilRangeStart(date: Date, view: ScheduleView) {
  if (view === "month") return startOfWeek(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)));
  return view === "week" ? startOfWeek(date) : new Date(date);
}

function startOfWeek(date: Date) {
  return addCivilDays(date, -date.getUTCDay());
}

function addCivilDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function daysInMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
}
