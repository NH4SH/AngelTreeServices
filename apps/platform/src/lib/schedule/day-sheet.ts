import type { CalendarEntry } from "../types/database";

export type DaySheetEntry = {
  accessInstructions: string;
  assignees: string;
  customer: string;
  duration: string;
  equipment: string[];
  location: string;
  materials: string[];
  notes: string;
  phone: string;
  status: string;
  summary: string;
  time: string;
  title: string;
  type: string;
};

export function buildDaySheetEntries(entries: CalendarEntry[]): DaySheetEntry[] {
  return [...entries]
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    .map((entry) => ({
      accessInstructions: entry.access_instructions || "",
      assignees: entry.assignees
        .map((assignee) => assignee.full_name || assignee.email || "Assigned employee")
        .join(", ") || "Unassigned",
      customer: entry.customer_label || "No contracting party",
      duration: formatDuration(entry.starts_at, entry.ends_at, entry.all_day),
      equipment: entry.equipment_details ?? [],
      location: entry.full_address || entry.location_label || "No service address",
      materials: entry.material_details ?? [],
      notes: entry.calendar_notes || "",
      phone: entry.primary_phone || "No phone on file",
      status: titleCase(entry.status),
      summary: entry.subtitle || "No work summary entered.",
      time: entry.all_day ? "All day" : formatTime(entry.starts_at),
      title: entry.title,
      type: titleCase(entry.event_type),
    }));
}

export function formatDaySheetDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDuration(startsAt: string, endsAt: string | null, allDay: boolean) {
  if (allDay) return "All day";
  if (!endsAt) return "Duration not set";
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  if (minutes <= 0) return "Duration not set";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
