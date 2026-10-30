import { buildGoogleCalendarEvent, buildManagedGoogleEventId, fingerprintGoogleCalendarEvent } from "./event.ts";
import { isGoogleCalendarEventEligible } from "./policy.ts";
import type {
  GoogleCalendarEventPayload,
  GoogleCalendarEventReference,
  GoogleCalendarMapping,
  GoogleCalendarSyncContext,
} from "./types";

export type GoogleCalendarGateway = {
  createEvent(calendarId: string, event: GoogleCalendarEventPayload, eventId: string): Promise<GoogleCalendarEventReference>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  findManagedEvent(calendarId: string, scheduleEventId: string): Promise<GoogleCalendarEventReference | null>;
  updateEvent(calendarId: string, eventId: string, event: GoogleCalendarEventPayload): Promise<GoogleCalendarEventReference | null>;
};

export type GoogleCalendarMappingWriter = {
  deleteMapping(mappingId: string): Promise<void>;
  saveMapping(input: {
    connectionId: string;
    event: GoogleCalendarEventReference;
    fingerprint: string;
    googleCalendarId: string;
    scheduleEventId: string;
    sourceStartsAt: string;
  }): Promise<void>;
};

export type GoogleCalendarReconcileOperation = "created" | "deleted" | "unchanged" | "updated";

export async function reconcileGoogleCalendarEvent(input: {
  context: GoogleCalendarSyncContext;
  gateway: GoogleCalendarGateway;
  mappings: GoogleCalendarMappingWriter;
}): Promise<GoogleCalendarReconcileOperation> {
  const { connection, event, mapping } = input.context;
  const eligible = isGoogleCalendarEventEligible({
    connection,
    event,
    roles: input.context.roles,
    windowEnd: input.context.windowEnd,
    windowStart: input.context.windowStart,
  });

  if (!eligible || !event) {
    if (!mapping) return "unchanged";
    await input.gateway.deleteEvent(mapping.googleCalendarId, mapping.googleEventId);
    await input.mappings.deleteMapping(mapping.id);
    return "deleted";
  }

  const calendarId = connection.selectedCalendarId;
  const payload = buildGoogleCalendarEvent(event, input.context.appBaseUrl);
  const fingerprint = fingerprintGoogleCalendarEvent(calendarId, payload);

  if (mapping && mapping.googleCalendarId === calendarId) {
    if (!input.context.forceUpdate && mapping.syncFingerprint === fingerprint) return "unchanged";
    const updated = await input.gateway.updateEvent(calendarId, mapping.googleEventId, payload);
    if (updated) {
      await saveMapping(input.mappings, connection.id, event.id, event.startsAt, calendarId, fingerprint, updated);
      return "updated";
    }
  } else if (mapping) {
    await input.gateway.deleteEvent(mapping.googleCalendarId, mapping.googleEventId);
    await input.mappings.deleteMapping(mapping.id);
  }

  const recoverable = await input.gateway.findManagedEvent(calendarId, event.id);
  if (recoverable) {
    const updated = await input.gateway.updateEvent(calendarId, recoverable.id, payload) ?? recoverable;
    await saveMapping(input.mappings, connection.id, event.id, event.startsAt, calendarId, fingerprint, updated);
    return "updated";
  }

  const created = await input.gateway.createEvent(
    calendarId,
    payload,
    buildManagedGoogleEventId(connection.id, event.id),
  );
  await saveMapping(input.mappings, connection.id, event.id, event.startsAt, calendarId, fingerprint, created);
  return "created";
}

async function saveMapping(
  writer: GoogleCalendarMappingWriter,
  connectionId: string,
  scheduleEventId: string,
  sourceStartsAt: string,
  googleCalendarId: string,
  fingerprint: string,
  event: GoogleCalendarEventReference,
) {
  await writer.saveMapping({
    connectionId,
    event,
    fingerprint,
    googleCalendarId,
    scheduleEventId,
    sourceStartsAt,
  });
}

export function mappingForScheduleEvent(
  mappings: readonly GoogleCalendarMapping[],
  scheduleEventId: string,
) {
  return mappings.find((mapping) => mapping.scheduleEventId === scheduleEventId) ?? null;
}
