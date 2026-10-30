import { FIREWOOD_LIVE_REVIEW_PROFILE } from './live-profile.mjs';
import { HANDOFF_CONTRACT } from './contract.mjs';

// Actual release/database/credential/admission bindings have not been installed.
// Deliberately do not read process.env, a private key or a prior v1 release file.
export function getLiveProductionDependencies() { return null; }
export function liveProductionUnavailable() {
  return Response.json({ contract: HANDOFF_CONTRACT, code: 'checkout_unavailable',
    payment_retry_required: false }, { status: 503, headers: {
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Retry-After': '60',
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}
export async function handleLiveProductionRequest() { return liveProductionUnavailable(); }
export function liveProfileStatus() {
  return { profile: FIREWOOD_LIVE_REVIEW_PROFILE.profile, implemented: true,
    runtimeBound: false, livePayments: false, sending: false, activation: FIREWOOD_LIVE_REVIEW_PROFILE.activation };
}
