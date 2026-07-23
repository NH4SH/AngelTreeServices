import assert from "node:assert/strict";
import test from "node:test";
import { safeStaffMessage, sanitizeLogText } from "./errors.ts";

test("database internals are replaced with an actionable safe fallback", () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal(safeStaffMessage('duplicate key violates constraint "payments_provider_id_key"', "Payment could not be saved."), "A record with these details already exists.");
    assert.match(safeStaffMessage("column public.jobs.secret does not exist"), /^The request could not be completed\. Please try again\. Reference: [0-9a-f-]+$/);
    assert.equal(safeStaffMessage("Choose a valid employee."), "Choose a valid employee.");
  } finally {
    console.error = originalConsoleError;
  }
});

test("log text prevents control-character forging and redacts common secrets", () => {
  assert.equal(sanitizeLogText("line one\nline two"), "line one line two");
  assert.doesNotMatch(sanitizeLogText("Authorization: Bearer abc.def.ghi"), /abc\.def/);
  assert.doesNotMatch(sanitizeLogText("?token=customer-secret"), /customer-secret/);
});
