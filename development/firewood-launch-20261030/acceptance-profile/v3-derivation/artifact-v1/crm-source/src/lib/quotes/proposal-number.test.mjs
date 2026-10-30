import assert from "node:assert/strict";
import test from "node:test";
import { formatProposalNumber, formatProposalReference } from "./proposal-number.ts";

test("date-based quote numbers use a concise customer-facing proposal number", () => {
  assert.equal(formatProposalNumber("Q-20260812-002"), "260812-02");
  assert.equal(formatProposalReference("Q-20260812-002"), "Proposal #260812-02");
  assert.equal(formatProposalNumber("Q-20260812-1000"), "260812-1000");
});

test("legacy numbers remain recognizable and missing numbers use a professional fallback", () => {
  assert.equal(formatProposalNumber("Q-1042"), "1042");
  assert.equal(formatProposalReference("Q-1042"), "Proposal #1042");
  assert.equal(formatProposalNumber(null), null);
  assert.equal(formatProposalReference(null), "Prepared proposal");
  assert.equal(formatProposalNumber("unexpected-format"), null);
  assert.equal(formatProposalReference("unexpected-format"), "Prepared proposal");
});
