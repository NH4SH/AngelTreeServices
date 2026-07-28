import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultInvoiceDueDate, getInvoiceDueAt } from "./due-date.ts";

test("invoice due dates default to 15 days after the Eastern business date", () => {
  const reference = new Date("2026-07-28T02:30:00.000Z");

  assert.equal(getDefaultInvoiceDueDate(reference), "2026-08-11");
  assert.equal(getInvoiceDueAt("", reference), "2026-08-11T17:00:00.000Z");
});

test("an explicitly selected due date remains unchanged", () => {
  assert.equal(getInvoiceDueAt("2026-09-30"), "2026-09-30T17:00:00.000Z");
});

test("a malformed date safely falls back to Net 15", () => {
  const reference = new Date("2026-07-27T16:00:00.000Z");

  assert.equal(getInvoiceDueAt("2026-02-31", reference), "2026-08-11T17:00:00.000Z");
});
