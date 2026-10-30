import assert from "node:assert/strict";
import test from "node:test";
import {
  formatScheduleDateTime,
  formatScheduleTime,
  getScheduleDateKey,
  parseScheduleDateTime,
  shiftScheduleDateKey,
  toScheduleDateTimeLocal,
} from "./event-form.ts";

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

test("calendar display renders the production 5 PM estimate in Eastern time", () => {
  assert.equal(formatScheduleTime("2026-08-04T21:00:00.000Z"), "5:00 PM");
  assert.equal(formatScheduleTime("2026-08-04T22:00:00.000Z"), "6:00 PM");
  assert.equal(formatScheduleDateTime("2026-08-04T21:00:00.000Z"), "Aug 4, 5:00 PM");
  assert.equal(getScheduleDateKey("2026-08-04T21:00:00.000Z"), "2026-08-04");
});

test("common estimate times round trip without shifting", () => {
  const cases = [
    ["2026-08-05T08:00", "2026-08-05T12:00:00.000Z", "8:00 AM"],
    ["2026-08-05T13:00", "2026-08-05T17:00:00.000Z", "1:00 PM"],
    ["2026-08-05T15:30", "2026-08-05T19:30:00.000Z", "3:30 PM"],
    ["2026-08-05T17:00", "2026-08-05T21:00:00.000Z", "5:00 PM"],
    ["2026-08-05T18:00", "2026-08-05T22:00:00.000Z", "6:00 PM"],
  ];

  for (const [input, stored, display] of cases) {
    assert.equal(parseScheduleDateTime(input)?.toISOString(), stored);
    assert.equal(toScheduleDateTimeLocal(stored), input);
    assert.equal(formatScheduleTime(stored), display);
  }
});

test("5 PM round trips under both EDT and EST without changing the date", () => {
  assert.equal(parseScheduleDateTime("2026-08-05T17:00")?.toISOString(), "2026-08-05T21:00:00.000Z");
  assert.equal(toScheduleDateTimeLocal("2026-08-05T21:00:00.000Z"), "2026-08-05T17:00");
  assert.equal(parseScheduleDateTime("2026-01-15T17:00")?.toISOString(), "2026-01-15T22:00:00.000Z");
  assert.equal(toScheduleDateTimeLocal("2026-01-15T22:00:00.000Z"), "2026-01-15T17:00");
});

test("start and end retain a one-hour duration after Eastern conversion", () => {
  const start = parseScheduleDateTime("2026-08-05T17:00");
  const end = parseScheduleDateTime("2026-08-05T18:00");
  assert.equal(end.getTime() - start.getTime(), 60 * 60 * 1000);
});

test("Eastern date windows advance by civil days across daylight-saving changes", () => {
  assert.equal(shiftScheduleDateKey("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftScheduleDateKey("2026-11-01", 1), "2026-11-02");
  const springStart = parseScheduleDateTime("2026-03-08T00:00");
  const springEnd = parseScheduleDateTime("2026-03-09T00:00");
  const fallStart = parseScheduleDateTime("2026-11-01T00:00");
  const fallEnd = parseScheduleDateTime("2026-11-02T00:00");
  assert.equal(springEnd.getTime() - springStart.getTime(), 23 * 60 * 60 * 1000);
  assert.equal(fallEnd.getTime() - fallStart.getTime(), 25 * 60 * 60 * 1000);
});
