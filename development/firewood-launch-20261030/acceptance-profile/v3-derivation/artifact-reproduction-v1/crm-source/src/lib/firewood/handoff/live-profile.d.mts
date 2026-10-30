export const FIREWOOD_LIVE_REVIEW_PROFILE: Readonly<{
  profile: 'firewood-acceptance-v1-review-unbound'; reviewOnly: true; runtimeLoadable: false; mode: 'test';
  contract: 'firewood-invoice-handoff-acceptance-v1'; sourceId: 'website_firewood_invoice_acceptance_v1';
  environmentId: 'ats_firewood_acceptance_v1'; accountId: 'acct_1UU9U8RAZXGe6tX0';
  portalOrigin: 'https://crm-firewood-acceptance.angeltreeservices.org'; websiteOrigin: 'https://firewood-acceptance.angeltreeservices.org';
  termsVersion: 'firewood-household-live-2026-10-29-v1'; termsHash: string;
  paymentPolicyVersion: 'firewood-payment-options-live-2026-10-29-v1'; paymentPolicyHash: string;
  activation: Readonly<{ orders: false; preparation: false; collection: false; customerSending: false;
    ownerSending: false; workers: false; publicCheckoutLink: false }>;
  bindings: Readonly<{ appReleaseId: null; databaseIdentity: null; schemaFingerprint: null; signingKeyId: null;
    signingCredentialRef: null; capabilityCredentialRef: null; stripeCredentialRef: null; stripeWebhookRef: null;
    emailCredentialRef: null; backupSourceId: null; recoveryAuthorityId: null; releaseCertificateId: null }>;
}>;
export function isLiveRestrictedStripeKey(value: unknown): boolean;
/** Recognizes proposed code identity only. Does not prove runtime readiness or grant authority. */
export function isFirewoodLiveCodeIdentity(value: unknown): boolean;
