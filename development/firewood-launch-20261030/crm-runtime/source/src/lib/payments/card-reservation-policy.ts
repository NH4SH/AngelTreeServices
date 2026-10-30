export const cardAuthenticationLifetimeMs = 30 * 60 * 1000;
export const cardReviewLifetimeMs = 15 * 60 * 1000;

export function cardIntentCanExpire(status: string) {
  return ["canceled", "requires_action", "requires_confirmation", "requires_payment_method"].includes(status);
}

export function cardIntentMustRemainReserved(status: string) {
  return ["processing", "requires_capture", "succeeded"].includes(status);
}

export function reservationIsStale(expiresAt: string | null, now = Date.now()) {
  return Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= now;
}
