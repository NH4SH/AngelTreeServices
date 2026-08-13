import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMobileSchedulePayload,
  isActiveMobileWorkSession,
  isAssignedToIdentity,
} from "./mobile-contract.ts";

const identity = {
  authUserId: "auth-one",
  employeeId: "employee-one",
};

function entry(overrides = {}) {
  return {
    id: "event-one",
    source: "schedule_event",
    title: "Tree removal",
    subtitle: "Remove the rear oak",
    event_type: "job",
    status: "scheduled",
    starts_at: "2026-08-12T12:00:00.000Z",
    ends_at: "2026-08-12T16:00:00.000Z",
    all_day: false,
    location_label: "Rear yard",
    calendar_notes: "Meet at the side gate",
    job_id: "job-one",
    service_location_id: "location-one",
    assignees: [{ id: "employee-one", auth_user_id: "auth-one", full_name: "Saul Sierra", email: null }],
    customer_label: "Donna Goodwin",
    primary_phone: "540-555-0100",
    full_address: "6917 Bloomsbury Ln Spotsylvania, VA 22553",
    access_instructions: "Use the side gate",
    equipment_details: [],
    material_details: [],
    workday_number: 1,
    workday_count: 2,
    ...overrides,
  };
}

function scheduleEvent(overrides = {}) {
  return {
    id: "event-one",
    job_id: "job-one",
    source_customer_id: null,
    source_organization_id: null,
    source_contact_id: null,
    source_service_type: "tree_removal",
    service_location_id: "location-one",
    title: "Tree removal",
    description: "Remove the rear oak\nHaul brush",
    event_type: "job",
    status: "scheduled",
    starts_at: "2026-08-12T12:00:00.000Z",
    ends_at: "2026-08-12T16:00:00.000Z",
    all_day: false,
    location_label: "Rear yard",
    calendar_notes: "Meet at the side gate",
    work_session_group_id: "group-one",
    source_appointment_id: null,
    jobs: {
      id: "job-one",
      customer_id: "customer-one",
      organization_id: null,
      requested_scope: "Remove the rear oak",
      customers: {
        id: "customer-one",
        display_name: "Donna Goodwin",
        email: "donna@example.com",
        phone: "540-555-0100",
      },
    },
    service_locations: {
      id: "location-one",
      label: "Primary service location",
      street: "6917 Bloomsbury Ln",
      city: "Spotsylvania",
      state: "VA",
      postal_code: "22553",
      access_notes: "Use the side gate",
      service_notes: "Protect the flower bed",
    },
    schedule_event_assignments: [],
    equipment_assignments: [],
    ...overrides,
  };
}

function calendarData(entries, events = []) {
  return {
    appointments: [],
    conflicts: [],
    entries,
    scheduleEvents: events,
    users: [],
  };
}

test("My Schedule keeps entries assigned through durable employee identity", () => {
  assert.equal(isAssignedToIdentity(entry(), identity), true);
  assert.equal(isAssignedToIdentity(entry({ assignees: [] }), identity), false);

  const payload = buildMobileSchedulePayload({
    data: calendarData([entry()], [scheduleEvent()]),
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    identity,
    scope: "mine",
    now: new Date("2026-08-12T10:00:00.000Z"),
  });

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].assignees[0].id, "employee-one");
});

test("team scope includes other employees while mine scope filters them", () => {
  const other = entry({
    id: "event-two",
    assignees: [{ id: "employee-two", auth_user_id: "auth-two", full_name: "Another employee", email: null }],
  });
  const mine = buildMobileSchedulePayload({
    data: calendarData([entry(), other], [scheduleEvent()]),
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    identity,
    scope: "mine",
  });
  const team = buildMobileSchedulePayload({
    data: calendarData([entry(), other], [scheduleEvent()]),
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    identity,
    scope: "team",
  });

  assert.deepEqual(mine.items.map((item) => item.id), ["event-one"]);
  assert.deepEqual(team.items.map((item) => item.id), ["event-one", "event-two"]);
});

test("cancelled job sessions do not appear as active mobile workdays", () => {
  const cancelled = entry({ id: "cancelled-day", status: "cancelled" });
  assert.equal(isActiveMobileWorkSession(cancelled), false);

  const payload = buildMobileSchedulePayload({
    data: calendarData([entry(), cancelled], [scheduleEvent()]),
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    identity,
    scope: "team",
  });

  assert.deepEqual(payload.items.map((item) => item.id), ["event-one"]);
});

test("organization work prefers the organization and onsite contact details", () => {
  const organizationEvent = scheduleEvent({
    jobs: {
      id: "job-one",
      customer_id: null,
      organization_id: "organization-one",
      requested_scope: "Prune parking-lot trees",
      organizations: {
        id: "organization-one",
        name: "Rappahannock Properties Inc",
        billing_email: "billing@example.com",
        billing_phone: "540-555-0110",
      },
    },
    source_contact: {
      id: "contact-one",
      full_name: "Site manager",
      email: "site@example.com",
      phone: "540-555-0111",
    },
  });
  const payload = buildMobileSchedulePayload({
    data: calendarData([entry()], [organizationEvent]),
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    identity,
    scope: "team",
  });

  assert.equal(payload.items[0].party.kind, "organization");
  assert.equal(payload.items[0].party.name, "Rappahannock Properties Inc");
  assert.equal(payload.items[0].party.phone, "540-555-0111");
});

test("missing optional party and location data maps without throwing", () => {
  const sparseEntry = entry({
    customer_label: null,
    primary_phone: null,
    full_address: null,
    location_label: null,
    access_instructions: null,
  });
  const payload = buildMobileSchedulePayload({
    data: calendarData([sparseEntry]),
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    identity,
    scope: "mine",
  });

  assert.equal(payload.items[0].party, null);
  assert.equal(payload.items[0].location, null);
});
