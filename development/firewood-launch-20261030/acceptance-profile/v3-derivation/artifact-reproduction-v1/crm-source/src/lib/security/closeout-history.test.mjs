import assert from "node:assert/strict";
import test from "node:test";
import { hasMeaningfulCloseoutChild, hasMeaningfulCloseoutRecord } from "../records/closeout-history.ts";

const pristineCloseout = {
  acknowledgment_status: null,
  additional_work_requested: null,
  created_at: "2026-09-01T12:00:00.000Z",
  crew_internal_notes: null,
  customer_summary: null,
  incident_occurred: null,
  reopen_reason: null,
  reopened_at: null,
  review_notes: null,
  reviewed_at: null,
  status: "draft",
  submitted_at: null,
  updated_at: "2026-09-01T12:00:00.000Z",
};

test("an untouched generated draft is not treated as crew history", () => {
  assert.equal(hasMeaningfulCloseoutRecord(pristineCloseout), false);
  assert.equal(hasMeaningfulCloseoutChild({
    created_at: pristineCloseout.created_at,
    updated_at: pristineCloseout.updated_at,
    updated_by_user_id: null,
  }), false);
});

test("crew answers, edits, and submissions remain protected history", () => {
  assert.equal(hasMeaningfulCloseoutRecord({ ...pristineCloseout, incident_occurred: false }), true);
  assert.equal(hasMeaningfulCloseoutRecord({ ...pristineCloseout, status: "submitted" }), true);
  assert.equal(hasMeaningfulCloseoutRecord({ ...pristineCloseout, updated_at: "2026-09-01T12:01:00.000Z" }), true);
  assert.equal(hasMeaningfulCloseoutChild({
    created_at: pristineCloseout.created_at,
    updated_at: pristineCloseout.updated_at,
    updated_by_user_id: "11111111-1111-4111-8111-111111111111",
  }), true);
});
