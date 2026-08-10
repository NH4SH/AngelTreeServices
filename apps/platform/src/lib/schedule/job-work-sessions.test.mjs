import assert from "node:assert/strict";
import test from "node:test";
import { buildActiveJobWorkSessions, replaceJobWorkSessionTiming } from "./job-work-sessions.ts";

function event(overrides = {}) {
  return {
    id: "event-aug-10",
    starts_at: "2026-08-10T12:00:00.000Z",
    ends_at: "2026-08-10T20:00:00.000Z",
    status: "scheduled",
    calendar_notes: "Use the side gate.",
    schedule_event_assignments: [{ employee_id: "employee-one" }],
    ...overrides,
  };
}

test("moving a one-day job preserves its event identity, crew, and notes", () => {
  const sessions = buildActiveJobWorkSessions([event()]);
  const moved = replaceJobWorkSessionTiming(sessions, "event-aug-10", {
    date: "2026-08-12",
    start_time: "08:00",
    end_time: "16:00",
  });

  assert.equal(moved.length, 1);
  assert.equal(moved[0].id, "event-aug-10");
  assert.equal(moved[0].date, "2026-08-12");
  assert.deepEqual(moved[0].assigned_user_ids, ["employee-one"]);
  assert.equal(moved[0].notes, "Use the side gate.");
});

test("moving one day of a multi-day job retains exactly the submitted active days", () => {
  const sessions = buildActiveJobWorkSessions([
    event(),
    event({
      id: "event-aug-11",
      starts_at: "2026-08-11T12:00:00.000Z",
      ends_at: "2026-08-11T20:00:00.000Z",
    }),
  ]);
  const moved = replaceJobWorkSessionTiming(sessions, "event-aug-10", {
    date: "2026-08-12",
    start_time: "08:00",
    end_time: "16:00",
  });

  assert.equal(moved.length, 2);
  assert.deepEqual(moved.map((session) => session.date), ["2026-08-11", "2026-08-12"]);
  assert.deepEqual(moved.map((session) => session.id), ["event-aug-11", "event-aug-10"]);
});

test("time-only edits keep the same work-session row", () => {
  const sessions = buildActiveJobWorkSessions([event()]);
  const moved = replaceJobWorkSessionTiming(sessions, "event-aug-10", {
    date: "2026-08-10",
    start_time: "09:00",
    end_time: "15:00",
  });

  assert.equal(moved[0].id, "event-aug-10");
  assert.equal(moved[0].start_time, "09:00");
  assert.equal(moved[0].end_time, "15:00");
});

test("cancelled history is excluded from active workday numbering and replacement", () => {
  const sessions = buildActiveJobWorkSessions([
    event(),
    event({ id: "cancelled-event", status: "cancelled" }),
  ]);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "event-aug-10");
});
