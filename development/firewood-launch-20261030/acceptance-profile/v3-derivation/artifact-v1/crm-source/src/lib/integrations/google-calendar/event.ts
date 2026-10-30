import { createHash } from "node:crypto";
import type { GoogleCalendarEventPayload, ScheduleSyncEvent } from "./types";

export const googleCalendarBusinessTimeZone = "America/New_York";
export const googleCalendarFutureWindowDays = 90;

export function buildGoogleCalendarEvent(
  event: ScheduleSyncEvent,
  appBaseUrl: string,
): GoogleCalendarEventPayload {
  const summary = event.partyName ? `${event.title} - ${event.partyName}` : event.title;
  const location = formatServiceAddress(event.location);
  const description = [
    "Managed by Angel Tree Services.",
    `Open in Angel Tree: ${new URL(`/admin/schedule?event=${encodeURIComponent(event.id)}`, appBaseUrl)}`,
  ].join("\n");

  return {
    summary,
    description,
    ...(location ? { location } : {}),
    ...buildEventTimes(event),
    visibility: "private",
    transparency: "opaque",
    extendedProperties: {
      private: {
        angelTreeManaged: "true",
        angelTreeScheduleEventId: event.id,
      },
    },
  };
}

export function fingerprintGoogleCalendarEvent(calendarId: string, event: GoogleCalendarEventPayload) {
  return createHash("sha256")
    .update(JSON.stringify({ calendarId, event }))
    .digest("hex");
}

export function buildManagedGoogleEventId(connectionId: string, scheduleEventId: string) {
  // Google accepts lowercase base32hex characters for caller-supplied event IDs;
  // a stable ID makes concurrent retries converge on the same provider event.
  const digest = createHash("sha256")
    .update(`${connectionId}:${scheduleEventId}`)
    .digest("hex")
    .slice(0, 40);
  return `ats${digest}`;
}

export function getGoogleCalendarSyncWindow(now = new Date()) {
  const startKey = businessDateKey(now);
  const windowStart = easternMidnight(startKey);
  const windowEnd = easternMidnight(addCalendarDays(startKey, googleCalendarFutureWindowDays));
  return { windowStart, windowEnd };
}

function buildEventTimes(event: ScheduleSyncEvent) {
  if (event.allDay) {
    const startDate = businessDateKey(new Date(event.startsAt));
    const storedEnd = event.endsAt ? businessDateKey(new Date(event.endsAt)) : startDate;
    return {
      start: { date: startDate, timeZone: googleCalendarBusinessTimeZone },
      end: { date: addCalendarDays(storedEnd, 1), timeZone: googleCalendarBusinessTimeZone },
    };
  }

  const start = new Date(event.startsAt);
  const storedEnd = event.endsAt ? new Date(event.endsAt) : null;
  const end = storedEnd && storedEnd > start
    ? storedEnd
    : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    start: { dateTime: start.toISOString(), timeZone: googleCalendarBusinessTimeZone },
    end: { dateTime: end.toISOString(), timeZone: googleCalendarBusinessTimeZone },
  };
}

function formatServiceAddress(location: ScheduleSyncEvent["location"]) {
  if (!location) return "";
  const locality = [location.city, [location.state, location.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [location.street, locality].filter(Boolean).join(", ") || location.fallbackLabel || "";
}

function businessDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: googleCalendarBusinessTimeZone,
    year: "numeric",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addCalendarDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function easternMidnight(dateKey: string) {
  // UTC midnight still falls before the Eastern DST transition on transition days,
  // so its offset is the one in effect at the requested local midnight.
  const midnightUtc = new Date(`${dateKey}T00:00:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: googleCalendarBusinessTimeZone,
    timeZoneName: "longOffset",
  }).formatToParts(midnightUtc).find((part) => part.type === "timeZoneName")?.value ?? "GMT-05:00";
  const match = offsetName.match(/GMT([+-])(\d{2}):(\d{2})/);
  const sign = match?.[1] === "+" ? 1 : -1;
  const offsetMinutes = match ? sign * (Number(match[2]) * 60 + Number(match[3])) : -300;
  return new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() - offsetMinutes * 60_000);
}
