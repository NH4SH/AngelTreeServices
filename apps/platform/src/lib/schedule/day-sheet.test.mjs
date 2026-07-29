import assert from "node:assert/strict";
import test from "node:test";
import { buildDaySheetEntries } from "./day-sheet.ts";

test("day sheet rows are chronological and preserve operational details", () => {
  const base = {
    source: "schedule_event",
    event_type: "job",
    status: "scheduled",
    ends_at: null,
    all_day: false,
    location_label: null,
    calendar_notes: "Park by the road.",
    job_id: "job",
    service_location_id: "location",
    assignees: [{ id: "user", full_name: "Crew One", email: null }],
    customer_label: "Customer",
    primary_phone: "555-0100",
    full_address: "1 Main St Fredericksburg, VA 22401",
    access_instructions: "Gate code 1234",
    equipment_details: ["TR-01 · Chipper"],
    material_details: ["Mulch · 2 yards"],
  };
  const rows = buildDaySheetEntries([
    { ...base, id: "later", title: "Later", subtitle: "Trim oak", starts_at: "2026-07-29T14:00:00Z" },
    { ...base, id: "first", title: "First", subtitle: "Remove pine", starts_at: "2026-07-29T12:00:00Z", ends_at: "2026-07-29T13:30:00Z" },
  ]);

  assert.equal(rows[0].title, "First");
  assert.equal(rows[0].duration, "1 hr 30 min");
  assert.equal(rows[0].accessInstructions, "Gate code 1234");
  assert.deepEqual(rows[0].equipment, ["TR-01 · Chipper"]);
});

test("empty schedules produce no fabricated rows", () => {
  assert.deepEqual(buildDaySheetEntries([]), []);
});
