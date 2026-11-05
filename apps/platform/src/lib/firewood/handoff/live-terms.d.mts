export type LiveTermsClause = Readonly<{ label: string; text: string }>;
export type LiveTermsPolicy = Readonly<{
  version: 'firewood-household-live-2026-10-29-v1'; currency: 'usd'; deliveryCents: 0;
  stackingCents: 15000; maximumCords: 2; notificationDays: 7; cancellationHours: 48;
  cutoff: 'delivery-window-start'; unscheduledRefund: 'full'; angelCancellationRefund: 'full';
  declinedAngelRescheduleRefund: 'full'; lateCustomerCancellation: 'non-refundable'; taxBasisPoints: 0;
  purchaseUse: 'personal-household-only'; veterans: string; timezone: 'America/New_York';
  clauses: readonly LiveTermsClause[];
}>;
export const LIVE_TERMS_CLAUSES: readonly LiveTermsClause[];
export const LIVE_TERMS_POLICY: LiveTermsPolicy;
