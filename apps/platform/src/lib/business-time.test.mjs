import assert from "node:assert/strict";
import test from "node:test";
import {
  businessTimeZone,
  formatBusinessDate,
  getBusinessDateKey,
  getBusinessDayRange,
  formatBusinessDateTime,
  parseBusinessDateTime,
  toBusinessDateTimeLocal,
} from "./business-time.ts";

test("formats summer UTC timestamps in Eastern daylight time", () => {
  assert.equal(businessTimeZone, "America/New_York");
  assert.equal(formatBusinessDateTime("2026-08-02T23:48:00.000Z"), "Aug 2, 2026, 7:48 PM");
});

test("formats winter UTC timestamps in Eastern standard time", () => {
  assert.equal(formatBusinessDateTime("2026-01-15T23:48:00.000Z"), "Jan 15, 2026, 6:48 PM");
});

test("preserves calendar-only dates while localizing timestamps", () => {
  assert.equal(formatBusinessDate("2026-08-02", { dateStyle: "long" }), "August 2, 2026");
  assert.equal(formatBusinessDate("2026-08-03T02:00:00.000Z", { dateStyle: "long" }), "August 2, 2026");
  assert.equal(formatBusinessDate("2026-02-31"), "Invalid date");
});

test("supports page-specific date and time presentation", () => {
  assert.equal(
    formatBusinessDateTime("2026-08-02T23:48:00.000Z", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
    "7:48 PM EDT",
  );
});

test("returns a stable fallback for malformed timestamps", () => {
  assert.equal(formatBusinessDateTime("not-a-date"), "Invalid date");
});

test("interprets summer datetime-local input as Eastern wall time", () => {
  assert.equal(parseBusinessDateTime("2026-08-02T19:48")?.toISOString(), "2026-08-02T23:48:00.000Z");
});

test("interprets winter datetime-local input as Eastern wall time", () => {
  assert.equal(parseBusinessDateTime("2026-01-15T18:48")?.toISOString(), "2026-01-15T23:48:00.000Z");
});

test("round-trips timestamps through Eastern datetime-local values", () => {
  assert.equal(toBusinessDateTimeLocal("2026-08-02T23:48:00.000Z"), "2026-08-02T19:48");
});

test("rejects nonexistent Eastern wall times during the DST jump", () => {
  assert.equal(parseBusinessDateTime("2026-03-08T02:30"), null);
});

test("uses the Eastern business date around UTC midnight", () => {
  assert.equal(getBusinessDateKey("2026-08-03T02:00:00.000Z"), "2026-08-02");
});

test("builds DST-aware Eastern day boundaries", () => {
  const range = getBusinessDayRange("2026-03-08T16:00:00.000Z");
  assert.equal(range?.start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(range?.endExclusive.toISOString(), "2026-03-09T04:00:00.000Z");
});
