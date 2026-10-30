// Review artifact only. Importing or editing environment flags cannot enable it.
import { LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_SOURCE, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_ACCOUNT, LIVE_PORTAL_ORIGIN, LIVE_WEBSITE_ORIGIN, LIVE_TERMS_POLICY,
  LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY, LIVE_PAYMENT_POLICY_HASH } from './live-contract.mjs';

export const FIREWOOD_LIVE_REVIEW_PROFILE = Object.freeze({
  profile: 'firewood-acceptance-v1-review-unbound',
  reviewOnly: true,
  runtimeLoadable: false,
  mode: 'test',
  contract: LIVE_HANDOFF_CONTRACT,
  sourceId: LIVE_HANDOFF_SOURCE,
  environmentId: LIVE_HANDOFF_ENVIRONMENT,
  accountId: LIVE_ACCOUNT,
  portalOrigin: LIVE_PORTAL_ORIGIN,
  websiteOrigin: LIVE_WEBSITE_ORIGIN,
  termsVersion: LIVE_TERMS_POLICY.version,
  termsHash: LIVE_TERMS_HASH,
  paymentPolicyVersion: LIVE_PAYMENT_POLICY.version,
  paymentPolicyHash: LIVE_PAYMENT_POLICY_HASH,
  activation: Object.freeze({ orders: false, preparation: false, collection: false, customerSending: false,
    ownerSending: false, workers: false, publicCheckoutLink: false }),
  // Code identities above do not establish actual release/schema/key custody.
  bindings: Object.freeze({ appReleaseId: null, databaseIdentity: null, schemaFingerprint: null,
    signingKeyId: null, signingCredentialRef: null, capabilityCredentialRef: null,
    stripeCredentialRef: null, stripeWebhookRef: null, emailCredentialRef: null,
    backupSourceId: null, recoveryAuthorityId: null, releaseCertificateId: null }),
});

// Pure classification only. This module never reads process.env, a key file or a
// provider, returns a supplied credential, or creates a payment client.
export function isLiveRestrictedStripeKey(value) {
  return typeof value === 'string' && /^rk_test_[A-Za-z0-9]+$/u.test(value);
}

export function isFirewoodLiveCodeIdentity(value) {
  return value?.contract === LIVE_HANDOFF_CONTRACT && value.sourceId === LIVE_HANDOFF_SOURCE
    && value.environmentId === LIVE_HANDOFF_ENVIRONMENT && value.mode === 'test'
    && value.accountId === LIVE_ACCOUNT && value.portalOrigin === LIVE_PORTAL_ORIGIN
    && value.websiteOrigin === LIVE_WEBSITE_ORIGIN && value.termsVersion === LIVE_TERMS_POLICY.version
    && value.termsHash === LIVE_TERMS_HASH && value.paymentPolicyVersion === LIVE_PAYMENT_POLICY.version
    && value.paymentPolicyHash === LIVE_PAYMENT_POLICY_HASH;
}

// No runtime configuration factory is exported: actual bindings and the guarded
// installer are a separate review/approval boundary, not an environment toggle.
