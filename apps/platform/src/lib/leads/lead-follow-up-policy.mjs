// Pure diagnostics for the existing staff follow-up queue.
// Call only with an authorized, server-mapped snapshot. No I/O or side effects.
const ACTIVE_STAGES = new Set(["new", "contacted", "visit_scheduled", "quote_sent", "quote_approved", "work_scheduled"]);
const TERMINAL_STAGES = new Set(["lost", "cancelled", "closed"]);
function instant(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return null;
  const day = new Date(0);
  day.setUTCFullYear(+m[1], +m[2] - 1, +m[3]);
  day.setUTCHours(0, 0, 0, 0);
  if (day.getUTCFullYear() !== +m[1] || day.getUTCMonth() !== +m[2] - 1 || day.getUTCDate() !== +m[3]) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function contactPreferenceError(preference, email) {
  const invalid = "Please enter a valid email address or leave it blank.";
  if (email != null && typeof email !== "string") return invalid;
  const value = typeof email === "string" ? email.trim() : "";
  if (preference === "email" && !value) return "Please enter an email address so we can contact you by email.";
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return invalid;
  return null;
}
export function evaluateFollowUp(lead, now) {
  if (!Number.isFinite(now) || Math.abs(now) > 8.64e15) throw new TypeError("Pass an explicit valid UTC clock in milliseconds.");
  const empty = { action: null, reasons: [], dueAt: null, priority: null, automaticSend: false };
  if (!lead || lead.eligible !== true) return empty;
  if (typeof lead.id !== "string" || !lead.id.trim()) throw new TypeError("A stable CRM job ID is required.");
  if (TERMINAL_STAGES.has(lead.stage)) return empty;
  // Determine urgency before rejecting unrelated metadata. Bad dates cannot hide it.
  const reviewed = instant(lead.hazardReviewedAt);
  const urgent = lead.hazardPresent === true && (reviewed === null || reviewed > now);
  const reasons = [];
  if (urgent) reasons.push("hazard_review");
  if (lead.needsOwner === true || typeof lead.ownerId !== "string" || !lead.ownerId.trim()) reasons.push("unassigned");
  if (lead.noticeState === "unknown" || lead.noticeState === "failed") reasons.push("office_notice_review");
  const review = reason => ({ ...empty, action: "review_record", reasons: [...reasons, reason], priority: urgent ? 0 : 1 });
  if (!ACTIVE_STAGES.has(lead.stage)) return review("unknown_stage");
  for (const key of ["hazardPresent", "needsOwner", "quoteTermsNeedReview"]) {
    if (lead[key] != null && typeof lead[key] !== "boolean") return review("invalid_" + key);
  }
  const dates = {};
  for (const key of ["firstContactAt", "nextActionAt", "quoteValidUntil", "portalExpiresAt", "scheduledAt", "hazardReviewedAt"]) {
    if (lead[key] == null) { dates[key] = null; continue; }
    dates[key] = instant(lead[key]);
    if (dates[key] === null) return review("invalid_" + key);
    if (["firstContactAt", "hazardReviewedAt"].includes(key) && dates[key] > now) return review("future_" + key);
  }
  let action = "follow_up";
  if (lead.stage === "new") action = dates.firstContactAt === null ? "contact_lead" : "review_next_step";
  if (lead.stage === "contacted") action = "arrange_visit";
  if (lead.stage === "visit_scheduled") action = "review_visit";
  if (lead.stage === "quote_sent") {
    action = "follow_up_quote";
    if (dates.quoteValidUntil !== null && dates.quoteValidUntil <= now) reasons.push("quote_expired");
    if (dates.portalExpiresAt !== null && dates.portalExpiresAt <= now) reasons.push("portal_expired");
    if (reasons.includes("quote_expired") || reasons.includes("portal_expired")) action = "review_quote";
  }
  if (lead.stage === "quote_approved") action = "schedule_work";
  // A disputed scope or contradictory terms must be reviewed before scheduling.
  if (["quote_sent", "quote_approved"].includes(lead.stage) && lead.quoteTermsNeedReview === true) {
    reasons.push("quote_terms_review"); action = "review_quote";
  }
  if (lead.stage === "work_scheduled") action = "review_schedule";
  if (["visit_scheduled", "work_scheduled"].includes(lead.stage) && dates.scheduledAt === null) reasons.push("missing_schedule");
  // nextActionAt comes from the existing office queue's computed next_action_at.
  // It already accounts for snoozed_until. Do not recompute or persist it here.
  if (dates.nextActionAt === null) reasons.push("missing_next_action");
  else if (dates.nextActionAt <= now) reasons.push("overdue");
  return { action, reasons, dueAt: dates.nextActionAt === null ? null : new Date(dates.nextActionAt).toISOString(),
    priority: urgent ? 0 : reasons.length ? 1 : 2, automaticSend: false };
}
