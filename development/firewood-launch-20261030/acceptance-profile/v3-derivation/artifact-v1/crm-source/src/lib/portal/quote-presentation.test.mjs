import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPortalWorkSummary,
  formatCustomerQuoteStatus,
} from "./quote-presentation.ts";

test("short scope shows no more than three complete customer-visible items", () => {
  const summary = buildPortalWorkSummary({
    quote_line_items: [
      { name: "Remove one Mulberry tree", description: null },
      { name: "Haul wood and brush away", description: null },
      { name: "Leave the stump in place", description: null },
    ],
  });

  assert.deepEqual(summary, {
    mode: "short",
    items: [
      "Remove one Mulberry tree",
      "Haul wood and brush away",
      "Leave the stump in place",
    ],
  });
});

test("more than three bullet items produces a count instead of duplicated scope", () => {
  const summary = buildPortalWorkSummary({
    quote_line_items: [{
      name: "Tree service",
      description: "- Remove tree\n- Grind stump\n- Haul brush\n- Rake work area",
    }],
  });

  assert.deepEqual(summary, {
    areaCount: 0,
    itemCount: 4,
    message: "This proposal includes 4 scope items.",
    mode: "long",
  });
});

test("multiple property sections force a compact area-aware summary", () => {
  const summary = buildPortalWorkSummary({
    quote_line_items: [{
      name: "Property trimming",
      description: "Front of the house\n- Trim Holly\nBack property\n- Remove dead branch",
    }],
  });

  assert.deepEqual(summary, {
    areaCount: 2,
    itemCount: 2,
    message: "This proposal includes 2 scope items across 2 areas of the property.",
    mode: "long",
  });
});

test("long contractual text is counted but never truncated into a summary item", () => {
  const longDescription = "Remove the marked tree only after utility clearance and preserve all surrounding plantings unless the customer gives written approval for additional work.";
  const summary = buildPortalWorkSummary({
    quote_line_items: [{ name: "Tree removal", description: longDescription }],
  });

  assert.equal(summary?.mode, "long");
  assert.doesNotMatch("message" in (summary ?? {}) ? summary.message : "", /utility clearance/);
});

test("customer-facing statuses avoid internal workflow language", () => {
  assert.equal(formatCustomerQuoteStatus("draft"), "Ready for review");
  assert.equal(formatCustomerQuoteStatus("sent"), "Awaiting your response");
  assert.equal(formatCustomerQuoteStatus("change_requested"), "Changes requested");
  assert.equal(formatCustomerQuoteStatus("cancelled"), "No longer active");
});
