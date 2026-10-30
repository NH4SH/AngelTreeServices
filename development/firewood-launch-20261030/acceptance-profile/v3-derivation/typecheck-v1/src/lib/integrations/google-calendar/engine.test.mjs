import assert from "node:assert/strict";
import test from "node:test";
import { reconcileGoogleCalendarEvent } from "./engine.ts";

test("first reconciliation creates one managed event and a durable mapping", async () => {
  const harness = createHarness();
  const operation = await harness.reconcile();

  assert.equal(operation, "created");
  assert.equal(harness.gateway.created.length, 1);
  assert.equal(harness.gateway.events.size, 1);
  assert.equal(harness.mapping?.scheduleEventId, "schedule-one");
});

test("repeating an unchanged reconciliation does not create a duplicate", async () => {
  const harness = createHarness();
  await harness.reconcile();
  const operation = await harness.reconcile();

  assert.equal(operation, "unchanged");
  assert.equal(harness.gateway.created.length, 1);
  assert.equal(harness.gateway.updated.length, 0);
});

test("rescheduling updates the same Google event and mapping", async () => {
  const harness = createHarness();
  await harness.reconcile();
  const googleEventId = harness.mapping.googleEventId;
  harness.event = eventFixture({
    endsAt: "2026-08-15T16:30:00.000Z",
    startsAt: "2026-08-15T15:30:00.000Z",
  });

  assert.equal(await harness.reconcile(), "updated");
  assert.equal(harness.gateway.created.length, 1);
  assert.equal(harness.gateway.updated.length, 1);
  assert.equal(harness.mapping.googleEventId, googleEventId);
  assert.equal(harness.mapping.sourceStartsAt, "2026-08-15T15:30:00.000Z");
});

test("a time-only change updates the managed event without replacing it", async () => {
  const harness = createHarness();
  await harness.reconcile();
  const originalId = harness.mapping.googleEventId;
  harness.event = eventFixture({ endsAt: "2026-08-14T15:15:00.000Z" });

  await harness.reconcile();
  assert.equal(harness.mapping.googleEventId, originalId);
  assert.equal(harness.gateway.created.length, 1);
  assert.equal(harness.gateway.updated.length, 1);
});

test("removing the connected employee assignment deletes only the mapped event", async () => {
  const harness = createHarness();
  await harness.reconcile();
  harness.event = eventFixture({ assignees: [] });

  assert.equal(await harness.reconcile(), "deleted");
  assert.equal(harness.mapping, null);
  assert.deepEqual(harness.gateway.deleted.map((item) => item.eventId), [harness.gateway.created[0].id]);
});

test("adding the employee assignment creates the newly eligible event", async () => {
  const harness = createHarness({ event: eventFixture({ assignees: [] }) });
  assert.equal(await harness.reconcile(), "unchanged");
  harness.event = eventFixture();

  assert.equal(await harness.reconcile(), "created");
  assert.equal(harness.gateway.created.length, 1);
});

test("cancelled or deleted CRM events remove the integration-owned event", async () => {
  for (const nextEvent of [eventFixture({ status: "cancelled" }), null]) {
    const harness = createHarness();
    await harness.reconcile();
    harness.event = nextEvent;
    assert.equal(await harness.reconcile(), "deleted");
    assert.equal(harness.gateway.events.size, 0);
  }
});

test("multi-day work sessions remain separate Google events", async () => {
  const first = createHarness({ event: eventFixture({ id: "workday-one" }) });
  const second = createHarness({
    gateway: first.gateway,
    event: eventFixture({
      endsAt: "2026-08-15T14:00:00.000Z",
      id: "workday-two",
      startsAt: "2026-08-15T13:00:00.000Z",
    }),
  });

  await first.reconcile();
  await second.reconcile();
  assert.equal(first.gateway.events.size, 2);
  assert.deepEqual(
    [...first.gateway.events.values()].map((item) => item.extendedProperties.private.angelTreeScheduleEventId).sort(),
    ["workday-one", "workday-two"],
  );
});

test("a Google failure leaves the CRM source object and mapping untouched", async () => {
  const sourceEvent = eventFixture();
  const sourceSnapshot = structuredClone(sourceEvent);
  const harness = createHarness({ event: sourceEvent });
  harness.gateway.createError = new Error("provider unavailable");

  await assert.rejects(harness.reconcile(), /provider unavailable/);
  assert.deepEqual(sourceEvent, sourceSnapshot);
  assert.equal(harness.mapping, null);
});

test("manual reconciliation adopts a previously managed event when its mapping is missing", async () => {
  const gateway = createGateway();
  gateway.seed("primary", "recovered-google-event", eventPayloadFixture("schedule-one"));
  const harness = createHarness({ gateway });

  assert.equal(await harness.reconcile(), "updated");
  assert.equal(harness.gateway.created.length, 0);
  assert.equal(harness.mapping.googleEventId, "recovered-google-event");
});

test("reconciliation never changes unrelated Google events", async () => {
  const gateway = createGateway();
  gateway.seed("primary", "personal-event", {
    ...eventPayloadFixture("unrelated"),
    extendedProperties: { private: {} },
    summary: "Personal appointment",
  });
  const harness = createHarness({ gateway });
  await harness.reconcile();

  assert.equal(gateway.events.get("primary:personal-event").summary, "Personal appointment");
  assert.equal(gateway.deleted.length, 0);
  assert.equal(gateway.events.size, 2);
});

test("changing calendars removes the old managed event before creating the replacement", async () => {
  const harness = createHarness();
  await harness.reconcile();
  harness.connection = { ...harness.connection, selectedCalendarId: "operations" };

  assert.equal(await harness.reconcile(), "created");
  assert.deepEqual(harness.gateway.deleted, [{ calendarId: "primary", eventId: harness.gateway.created[0].id }]);
  assert.equal(harness.gateway.events.has(`operations:${harness.gateway.created[1].id}`), true);
  assert.equal(harness.mapping.googleCalendarId, "operations");
});

function createHarness(options = {}) {
  const gateway = options.gateway ?? createGateway();
  let mapping = options.mapping ?? null;
  const harness = {
    connection: options.connection ?? connectionFixture(),
    event: options.event === undefined ? eventFixture() : options.event,
    gateway,
    get mapping() { return mapping; },
    async reconcile() {
      return reconcileGoogleCalendarEvent({
        context: {
          appBaseUrl: "https://admin.angeltreeservices.org",
          connection: harness.connection,
          event: harness.event,
          mapping,
          roles: ["crew"],
          windowEnd: new Date("2026-11-10T05:00:00.000Z"),
          windowStart: new Date("2026-08-12T04:00:00.000Z"),
        },
        gateway,
        mappings: {
          async deleteMapping() { mapping = null; },
          async saveMapping(input) {
            mapping = {
              connectionId: input.connectionId,
              googleCalendarId: input.googleCalendarId,
              googleEventHtmlLink: input.event.htmlLink,
              googleEventId: input.event.id,
              id: mapping?.id ?? "mapping-one",
              scheduleEventId: input.scheduleEventId,
              sourceStartsAt: input.sourceStartsAt,
              syncFingerprint: input.fingerprint,
            };
          },
        },
      });
    },
  };
  return harness;
}

function createGateway() {
  let nextId = 1;
  const events = new Map();
  return {
    createError: null,
    created: [],
    deleted: [],
    events,
    updated: [],
    async createEvent(calendarId, payload, eventId) {
      if (this.createError) throw this.createError;
      const id = eventId || `google-${nextId++}`;
      events.set(`${calendarId}:${id}`, structuredClone(payload));
      this.created.push({ calendarId, id });
      return { htmlLink: `https://calendar.google.com/event?eid=${id}`, id };
    },
    async deleteEvent(calendarId, eventId) {
      events.delete(`${calendarId}:${eventId}`);
      this.deleted.push({ calendarId, eventId });
    },
    async findManagedEvent(calendarId, scheduleEventId) {
      for (const [key, payload] of events) {
        if (!key.startsWith(`${calendarId}:`)) continue;
        if (payload.extendedProperties?.private?.angelTreeManaged !== "true") continue;
        if (payload.extendedProperties.private.angelTreeScheduleEventId !== scheduleEventId) continue;
        const id = key.slice(calendarId.length + 1);
        return { htmlLink: `https://calendar.google.com/event?eid=${id}`, id };
      }
      return null;
    },
    seed(calendarId, id, payload) { events.set(`${calendarId}:${id}`, structuredClone(payload)); },
    async updateEvent(calendarId, eventId, payload) {
      const key = `${calendarId}:${eventId}`;
      if (!events.has(key)) return null;
      events.set(key, structuredClone(payload));
      this.updated.push({ calendarId, eventId });
      return { htmlLink: `https://calendar.google.com/event?eid=${eventId}`, id: eventId };
    },
  };
}

function connectionFixture() {
  return {
    id: "connection-one", authUserId: "user-one", employeeId: "employee-one",
    googleAccountId: "google-one", googleAccountEmail: "employee@example.com",
    selectedCalendarId: "primary", selectedCalendarSummary: "Primary",
    syncEstimates: true, syncJobs: true, syncCompanyAll: false, syncEnabled: true,
    status: "active", refreshTokenEncrypted: "encrypted", lastSyncStatus: "never",
    lastSyncAttemptAt: null, lastSyncSucceededAt: null, lastSyncErrorCode: null, lastSyncErrorAt: null,
  };
}

function eventFixture(overrides = {}) {
  return {
    id: "schedule-one", eventType: "job", status: "scheduled", title: "Tree Removal",
    startsAt: "2026-08-14T13:00:00.000Z", endsAt: "2026-08-14T14:00:00.000Z",
    allDay: false, jobId: "job-one", partyName: "Rose",
    location: { street: "1 Oak Ln", city: "Fredericksburg", state: "VA", postalCode: "22407", fallbackLabel: null },
    assignees: [{ employeeId: "employee-one", authUserId: "user-one" }],
    ...overrides,
  };
}

function eventPayloadFixture(scheduleEventId) {
  return {
    summary: "Tree Removal - Rose",
    description: "Managed by Angel Tree Services.",
    start: { dateTime: "2026-08-14T13:00:00.000Z", timeZone: "America/New_York" },
    end: { dateTime: "2026-08-14T14:00:00.000Z", timeZone: "America/New_York" },
    visibility: "private",
    transparency: "opaque",
    extendedProperties: { private: { angelTreeManaged: "true", angelTreeScheduleEventId: scheduleEventId } },
  };
}
