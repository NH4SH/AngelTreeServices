export interface LeadFollowUpSnapshot {
  id: string;
  eligible: boolean; // Derived by authorized CRM adapter; never public form input.
  stage: string; // Canonical stage mapping; unknown stages are reviewed.
  ownerId?: string | null;
  needsOwner?: boolean; // From office_follow_up_queue.needs_owner; detects inactive owners.
  firstContactAt?: string | null;
  nextActionAt?: string | null;
  quoteValidUntil?: string | null;
  portalExpiresAt?: string | null;
  scheduledAt?: string | null;
  hazardReviewedAt?: string | null;
  noticeState?: string | null;
  hazardPresent?: boolean;
  quoteTermsNeedReview?: boolean;
}
export interface FollowUpDecision {
  action: string | null;
  reasons: string[];
  dueAt: string | null;
  priority: 0 | 1 | 2 | null;
  automaticSend: false;
}
export function contactPreferenceError(preference: unknown, email: unknown): string | null;
export function evaluateFollowUp(lead: LeadFollowUpSnapshot | null | undefined, now: number): FollowUpDecision;
