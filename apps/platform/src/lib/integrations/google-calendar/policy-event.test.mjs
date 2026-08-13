import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleCalendarEvent, getGoogleCalendarSyncWindow } from "./event.ts";
import { canUseCompanyGoogleCalendarSync, isGoogleCalendarEventEligible } from "./policy.ts";

const windowStart = new Date("2026-08-12T04:00:00.000Z");
const windowEnd = new Date("2026-11-10T05:00:00.000Z");

test("assigned-to-me resolves durable employee identity instead of assuming auth IDs", () => {
  const connection = connectionFixture();
  const event = eventFixture({ assignees: [{ employeeId: "employee-one", authUserId: "user-one" }] });
  assert.equal(eligible(connection, event, ["crew"]), true);
  assert.equal(eligible({ ...connection, employeeId: "employee-two", authUserId: "user-two" }, event, ["crew"]), false);
});

test("estimate and job preferences filter independently", () => {
  const connection = connectionFixture();
  assert.equal(eligible({ ...connection, syncEstimates: false }, eventFixture({ eventType: "estimate" }), ["crew"]), false);
  assert.equal(eligible({ ...connection, syncJobs: false }, eventFixture({ eventType: "job" }), ["crew"]), false);
  assert.equal(eligible(connection, eventFixture({ eventType: "estimate" }), ["crew"]), true);
  assert.equal(eligible(connection, eventFixture({ eventType: "job" }), ["crew"]), true);
});

test("company-wide sync is owner/admin authorized and cannot be enabled by crew", () => {
  const connection = { ...connectionFixture(), syncCompanyAll: true };
  const unassigned = eventFixture({ assignees: [] });
  assert.equal(canUseCompanyGoogleCalendarSync(["owner"]), true);
  assert.equal(canUseCompanyGoogleCalendarSync(["admin"]), true);
  assert.equal(canUseCompanyGoogleCalendarSync(["crew"]), false);
  assert.equal(eligible(connection, unassigned, ["owner"]), true);
  assert.equal(eligible(connection, unassigned, ["crew"]), false);
});

test("cancelled, completed, unsupported, past, and out-of-window events are ineligible", () => {
  const connection = connectionFixture();
  assert.equal(eligible(connection, eventFixture({ status: "cancelled" }), ["crew"]), false);
  assert.equal(eligible(connection, eventFixture({ status: "completed" }), ["crew"]), false);
  assert.equal(eligible(connection, eventFixture({ eventType: "internal" }), ["crew"]), false);
  assert.equal(eligible(connection, eventFixture({ startsAt: "2026-08-11T14:00:00.000Z" }), ["crew"]), false);
  assert.equal(eligible(connection, eventFixture({ startsAt: "2026-11-10T05:00:00.000Z" }), ["crew"]), false);
});

test("the 90-day window uses Eastern calendar midnights across DST", () => {
  const spring = getGoogleCalendarSyncWindow(new Date("2026-03-08T16:00:00.000Z"));
  assert.equal(spring.windowStart.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(spring.windowEnd.toISOString(), "2026-06-06T04:00:00.000Z");
  const fall = getGoogleCalendarSyncWindow(new Date("2026-11-01T17:00:00.000Z"));
  assert.equal(fall.windowStart.toISOString(), "2026-11-01T04:00:00.000Z");
});

test("event payload is private, operational, correctly located, and excludes sensitive fields", () => {
  const event = eventFixture({
    partyName: "Rose",
    title: "Tree Removal",
    location: { street: "1 Oak Ln", city: "Fredericksburg", state: "VA", postalCode: "22407", fallbackLabel: null },
  });
  event.internalNotes = "do not expose";
  event.quotePrice = 160000;
  event.customerPhone = "555-0100";
  const payload = buildGoogleCalendarEvent(event, "https://admin.angeltreeservices.org");
  const serialized = JSON.stringify(payload);
  assert.equal(payload.summary, "Tree Removal - Rose");
  assert.equal(payload.location, "1 Oak Ln, Fredericksburg, VA 22407");
  assert.equal(payload.visibility, "private");
  assert.match(payload.description, /Open in Angel Tree/);
  assert.doesNotMatch(serialized, /do not expose|160000|555-0100/);
});

test("all-day and timed events preserve CRM time semantics", () => {
  const timed = buildGoogleCalendarEvent(eventFixture(), "https://admin.angeltreeservices.org");
  assert.equal(timed.start.dateTime, "2026-08-14T13:00:00.000Z");
  assert.equal(timed.end.dateTime, "2026-08-14T14:00:00.000Z");
  assert.equal(timed.start.timeZone, "America/New_York");
  const allDay = buildGoogleCalendarEvent(eventFixture({ allDay: true, startsAt: "2026-08-14T04:00:00.000Z", endsAt: "2026-08-14T23:59:00.000Z" }), "https://admin.angeltreeservices.org");
  assert.equal(allDay.start.date, "2026-08-14");
  assert.equal(allDay.end.date, "2026-08-15");
});

function eligible(connection, event, roles) {
  return isGoogleCalendarEventEligible({ connection, event, roles, windowStart, windowEnd });
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
    id: "event-one", eventType: "estimate", status: "scheduled", title: "Estimate",
    startsAt: "2026-08-14T13:00:00.000Z", endsAt: "2026-08-14T14:00:00.000Z",
    allDay: false, jobId: "job-one", partyName: "Rose",
    location: { street: "1 Oak Ln", city: "Fredericksburg", state: "VA", postalCode: "22407", fallbackLabel: null },
    assignees: [{ employeeId: "employee-one", authUserId: "user-one" }],
    ...overrides,
  };
}

