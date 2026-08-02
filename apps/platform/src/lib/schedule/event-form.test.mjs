import assert from "node:assert/strict";
import test from "node:test";
import { parseScheduleDateTime, toScheduleDateTimeLocal } from "./event-form.ts";

test("schedule edit preserves an 8:00 AM stored start", () => {
  assert.equal(toScheduleDateTimeLocal("2026-08-03T12:00:00.000Z"), "2026-08-03T08:00");
});

test("schedule edit preserves a 3:30 PM stored start", () => {
  assert.equal(toScheduleDateTimeLocal("2026-08-03T19:30:00.000Z"), "2026-08-03T15:30");
});

test("schedule edit preserves a legitimate 1:00 PM stored start", () => {
  assert.equal(toScheduleDateTimeLocal("2026-08-03T17:00:00.000Z"), "2026-08-03T13:00");
});

test("schedule edit preserves stored end time and duration", () => {
  const start = toScheduleDateTimeLocal("2026-08-03T19:30:00.000Z");
  const end = toScheduleDateTimeLocal("2026-08-03T21:00:00.000Z");

  assert.equal(start, "2026-08-03T15:30");
  assert.equal(end, "2026-08-03T17:00");
});

test("submitting an unchanged Eastern time produces the original stored instant", () => {
  const stored = "2026-08-05T13:30:00.000Z";
  const formValue = toScheduleDateTimeLocal(stored);

  assert.equal(formValue, "2026-08-05T09:30");
  assert.equal(parseScheduleDateTime(formValue)?.toISOString(), stored);
});

test("Eastern parsing observes standard and daylight-saving offsets", () => {
  assert.equal(parseScheduleDateTime("2026-01-15T09:30")?.toISOString(), "2026-01-15T14:30:00.000Z");
  assert.equal(parseScheduleDateTime("2026-07-15T09:30")?.toISOString(), "2026-07-15T13:30:00.000Z");
  assert.equal(parseScheduleDateTime("2026-03-08T02:30"), null);
});
