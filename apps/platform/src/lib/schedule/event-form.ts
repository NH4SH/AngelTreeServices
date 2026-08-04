import { businessTimeZone, formatBusinessDateTime, getBusinessDateKey, parseBusinessDateTime, shiftBusinessDateKey, toBusinessDateTimeLocal } from "../business-time.ts";

export { businessTimeZone };

export function toScheduleDateTimeLocal(value: string) {
  return toBusinessDateTimeLocal(value);
}

export function parseScheduleDateTime(value: string) {
  return parseBusinessDateTime(value);
}

export function getScheduleDateKey(value: string | Date) {
  return getBusinessDateKey(value);
}

export function shiftScheduleDateKey(value: string, days: number) {
  return shiftBusinessDateKey(value, days);
}

export function formatScheduleTime(value: string | Date) {
  if (Number.isNaN(new Date(value).getTime())) return "";
  return formatBusinessDateTime(value, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatScheduleDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
) {
  if (Number.isNaN(new Date(value).getTime())) return "";
  return formatBusinessDateTime(value, options);
}
