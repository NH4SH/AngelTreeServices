import assert from "node:assert/strict";
import test from "node:test";
import { getLinkedJobApprovalPlan } from "./linked-job-approval.ts";

const base = {
  archived_at: null,
  lead_disposition: "active",
  source_quote_id: null,
  status: "estimate_scheduled",
  website_submission_id: "submission-1",
};

test("an automatically archived website lead is restored and converted on approval", () => {
  assert.deepEqual(getLinkedJobApprovalPlan({
    ...base,
    archived_at: "2026-08-15T01:13:16.389Z",
    lead_disposition: "archived",
  }, "quote-1"), {
    ok: true,
    restoreArchivedLead: true,
    moveToAccepted: true,
    linkSourceQuote: true,
  });
});

test("a manually archived active work order is not restored automatically", () => {
  assert.deepEqual(getLinkedJobApprovalPlan({
    ...base,
    archived_at: "2026-08-15T01:13:16.389Z",
    status: "scheduled",
  }, "quote-1"), {
    ok: false,
    message: "The linked work order is archived. Restore it before approving this quote.",
  });
});

test("an active estimate is converted without an archive restore", () => {
  assert.deepEqual(getLinkedJobApprovalPlan(base, "quote-1"), {
    ok: true,
    restoreArchivedLead: false,
    moveToAccepted: true,
    linkSourceQuote: true,
  });
});

test("an already scheduled work order keeps its operational status", () => {
  assert.deepEqual(getLinkedJobApprovalPlan({
    ...base,
    source_quote_id: "quote-1",
    status: "scheduled",
  }, "quote-1"), {
    ok: true,
    restoreArchivedLead: false,
    moveToAccepted: false,
    linkSourceQuote: false,
  });
});

test("a work order linked to another source quote is rejected", () => {
  assert.equal(getLinkedJobApprovalPlan({
    ...base,
    source_quote_id: "quote-2",
  }, "quote-1").ok, false);
});
