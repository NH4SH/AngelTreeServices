// Run with: node --test lead-follow-up-policy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { contactPreferenceError, evaluateFollowUp } from "./lead-follow-up-policy.mjs";
const now = Date.parse("2026-11-12T15:00:00Z");
const future = "2026-11-12T16:00:00Z", past = "2026-11-12T14:00:00Z";
const make = (extra = {}) => ({ id: "synthetic-job-1", eligible: true, stage: "new", ownerId: "synthetic-owner",
  nextActionAt: future, noticeState: "sent", ...extra });
test("email preference requires email", () => assert.ok(contactPreferenceError("email", null)));
test("whitespace email is missing", () => assert.ok(contactPreferenceError("email", "  ")));
test("invalid supplied email rejected", () => assert.ok(contactPreferenceError("phone", "bad")));
test("valid preferred email accepted", () => assert.equal(contactPreferenceError("email", "person@example.test"), null));
test("phone preference allows absent email", () => assert.equal(contactPreferenceError("phone", null), null));
test("text preference allows absent email", () => assert.equal(contactPreferenceError("text", ""), null));
test("no preference allows absent email", () => assert.equal(contactPreferenceError(null, null), null));
test("blocked record produces no action", () => assert.equal(evaluateFollowUp(make({ eligible: false }), now).action, null));
test("missing eligibility fails closed", () => assert.equal(evaluateFollowUp({ id: "x" }, now).action, null));
for (const stage of ["lost", "cancelled", "closed"]) test("terminal stage " + stage, () => assert.equal(evaluateFollowUp(make({ stage }), now).action, null));
test("new lead has first contact action", () => assert.equal(evaluateFollowUp(make(), now).action, "contact_lead"));
test("contact already recorded avoids first contact action", () => assert.equal(evaluateFollowUp(make({ firstContactAt: past }), now).action, "review_next_step"));
test("unassigned lead flagged", () => assert.ok(evaluateFollowUp(make({ ownerId: null }), now).reasons.includes("unassigned")));
test("missing next action flagged", () => assert.ok(evaluateFollowUp(make({ nextActionAt: null }), now).reasons.includes("missing_next_action")));
test("deadline equality is overdue", () => assert.ok(evaluateFollowUp(make({ nextActionAt: new Date(now).toISOString() }), now).reasons.includes("overdue")));
test("future action remains normal priority", () => assert.equal(evaluateFollowUp(make(), now).priority, 2));
test("unreviewed hazard has highest priority", () => assert.equal(evaluateFollowUp(make({ hazardPresent: true }), now).priority, 0));
test("reviewed hazard is not perpetually urgent", () => assert.equal(evaluateFollowUp(make({ hazardPresent: true, hazardReviewedAt: past }), now).priority, 2));
for (const noticeState of ["failed", "unknown"]) test("notice " + noticeState + " needs review without send", () => {
  const result = evaluateFollowUp(make({ noticeState }), now);
  assert.ok(result.reasons.includes("office_notice_review")); assert.equal(result.automaticSend, false);
});
test("expired proposal requires review", () => assert.equal(evaluateFollowUp(make({ stage: "quote_sent", quoteValidUntil: past }), now).action, "review_quote"));
test("expired link does not rewrite quote validity", () => assert.ok(evaluateFollowUp(make({ stage: "quote_sent", portalExpiresAt: past, quoteValidUntil: future }), now).reasons.includes("portal_expired")));
test("conditional validity is flagged without invented date", () => assert.ok(evaluateFollowUp(make({ stage: "quote_sent", quoteTermsNeedReview: true }), now).reasons.includes("quote_terms_review")));
test("approval produces scheduling action, never booking", () => assert.equal(evaluateFollowUp(make({ stage: "quote_approved" }), now).action, "schedule_work"));
test("scheduled work missing appointment flagged", () => assert.ok(evaluateFollowUp(make({ stage: "work_scheduled" }), now).reasons.includes("missing_schedule")));
test("unknown stage needs review", () => assert.equal(evaluateFollowUp(make({ stage: "mystery" }), now).action, "review_record"));
test("invalid date needs review", () => assert.equal(evaluateFollowUp(make({ nextActionAt: "tomorrow" }), now).action, "review_record"));
test("offset timestamps normalize to UTC", () => assert.equal(evaluateFollowUp(make({ nextActionAt: "2026-11-12T11:00:00-05:00" }), now).dueAt, future.replace("Z", ".000Z")));
test("input is never mutated", () => { const row = Object.freeze(make()); evaluateFollowUp(row, now); assert.equal(row.nextActionAt, future); });
test("repeated read is deterministic", () => assert.deepEqual(evaluateFollowUp(make(), now), evaluateFollowUp(make(), now)));
test("output excludes personal details", () => {
  const result = evaluateFollowUp(make({ name: "Synthetic", phone: "555", email: "x@example.test", message: "private" }), now);
  for (const key of ["name", "phone", "email", "message"]) assert.equal(result[key], undefined);
});
test("invalid clock throws", () => assert.throws(() => evaluateFollowUp(make(), NaN), TypeError));
test("missing stable ID throws", () => assert.throws(() => evaluateFollowUp(make({ id: "" }), now), TypeError));

test("won is not assumed to mean work scheduled", () => assert.equal(evaluateFollowUp(make({ stage: "won" }), now).action, "review_record"));
test("impossible calendar date requires review", () => assert.equal(evaluateFollowUp(make({ nextActionAt: "2026-02-30T15:00:00Z" }), now).action, "review_record"));
test("marketing opt-in does not change queue decisions or authorize sending", () => {
 const a = evaluateFollowUp(make({ updatesOptIn: false }), now);
 const b = evaluateFollowUp(make({ updatesOptIn: true }), now);
 assert.deepEqual(a, b); assert.equal(a.automaticSend, false);
});

test("urgent unmapped stage stays highest priority", () => assert.equal(evaluateFollowUp(make({ stage: "unmapped", hazardPresent: true }), now).priority, 0));
test("urgent malformed deadline stays highest priority", () => assert.equal(evaluateFollowUp(make({ nextActionAt: "bad", hazardPresent: true }), now).priority, 0));
test("future hazard review does not dismiss urgency", () => {
 const r = evaluateFollowUp(make({ hazardPresent: true, hazardReviewedAt: future }), now);
 assert.equal(r.priority, 0); assert.ok(r.reasons.includes("future_hazardReviewedAt"));
});
test("future first contact is reviewed", () => assert.ok(evaluateFollowUp(make({ firstContactAt: future }), now).reasons.includes("future_firstContactAt")));
test("blank owner needs assignment", () => assert.ok(evaluateFollowUp(make({ ownerId: "  " }), now).reasons.includes("unassigned")));
test("inactive existing owner needs assignment", () => assert.ok(evaluateFollowUp(make({ needsOwner: true }), now).reasons.includes("unassigned")));
for (const nextActionAt of ["2026-11-12T24:00:00Z", "2026-11-12T16:00:60Z", "2026-13-12T16:00:00Z", "2026-11-12T16:00:00"]) test("noncanonical timestamp " + nextActionAt, () => assert.equal(evaluateFollowUp(make({ nextActionAt }), now).action, "review_record"));
test("out of range clock throws", () => assert.throws(() => evaluateFollowUp(make(), 9e15), TypeError));
test("historical zero clock is valid", () => assert.equal(evaluateFollowUp(make(), 0).automaticSend, false));
test("review at current instant is valid", () => assert.equal(evaluateFollowUp(make({ hazardPresent: true, hazardReviewedAt: new Date(now).toISOString() }), now).priority, 2));
test("expired proposal equal to now requires review", () => assert.equal(evaluateFollowUp(make({ stage: "quote_sent", quoteValidUntil: new Date(now).toISOString() }), now).action, "review_quote"));
test("approved quote with unresolved scope terms requires review", () => assert.equal(evaluateFollowUp(make({ stage: "quote_approved", quoteTermsNeedReview: true }), now).action, "review_quote"));
test("future appointment stays permitted", () => assert.ok(!evaluateFollowUp(make({ stage: "work_scheduled", scheduledAt: future }), now).reasons.includes("missing_schedule")));
test("null snapshot is suppressed", () => assert.equal(evaluateFollowUp(null, now).action, null));
test("empty ID is rejected even if whitespace", () => assert.throws(() => evaluateFollowUp(make({ id: "  " }), now), TypeError));
test("non-string supplied email is rejected", () => assert.ok(contactPreferenceError("phone", 123)));
test("leap day is accepted", () => assert.equal(evaluateFollowUp(make({ nextActionAt: "2028-02-29T12:00:00Z" }), now).action, "contact_lead"));
test("non-leap day is rejected", () => assert.equal(evaluateFollowUp(make({ nextActionAt: "2027-02-29T12:00:00Z" }), now).action, "review_record"));
test("invalid hazard type is reviewed", () => assert.equal(evaluateFollowUp(make({ hazardPresent: "false" }), now).action, "review_record"));
test("invalid owner activity flag is reviewed", () => assert.equal(evaluateFollowUp(make({ needsOwner: "false" }), now).action, "review_record"));
