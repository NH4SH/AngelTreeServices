export const businessTimeZone = "America/New_York";

type BusinessTimeValue = Date | number | string;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const defaultDateTimeOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

export function formatBusinessDateTime(
  value: BusinessTimeValue,
  options: Intl.DateTimeFormatOptions = defaultDateTimeOptions,
) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: businessTimeZone,
  }).format(date);
}

export function formatBusinessDate(
  value: BusinessTimeValue,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  if (typeof value === "string" && dateOnlyPattern.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Invalid date";
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }

  return formatBusinessDateTime(value, options);
}

export function toBusinessDateTimeLocal(value: BusinessTimeValue) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: businessTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function parseBusinessDateTime(value: string) {
  const text = value.trim();
  const match = localDateTimePattern.exec(text);

  if (!match) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const intended = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let guess = intended;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    guess += intended - zonedPartsAsUtc(new Date(guess));
  }

  const parsed = new Date(guess);
  return toBusinessDateTimeLocal(parsed) === `${year}-${month}-${day}T${hour}:${minute}` ? parsed : null;
}

export function getBusinessDateKey(value: BusinessTimeValue) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: businessTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftBusinessDateKey(value: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getBusinessDayRange(value: BusinessTimeValue = new Date()) {
  const dateKey = getBusinessDateKey(value);
  const nextDateKey = shiftBusinessDateKey(dateKey, 1);
  const start = parseBusinessDateTime(`${dateKey}T00:00`);
  const endExclusive = parseBusinessDateTime(`${nextDateKey}T00:00`);
  return start && endExclusive ? { start, endExclusive } : null;
}

export function addBusinessDays(value: BusinessTimeValue, days: number) {
  const localValue = toBusinessDateTimeLocal(value);
  if (!localValue) return null;
  const [dateKey, time] = localValue.split("T");
  return parseBusinessDateTime(`${shiftBusinessDateKey(dateKey, days)}T${time}`);
}

function zonedPartsAsUtc(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: businessTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
