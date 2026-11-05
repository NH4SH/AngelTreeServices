export const FIREWOOD_LIVE_REVIEW_PROFILE: Readonly<{
  profile: 'firewood-live-v1-review'; reviewOnly: true; runtimeLoadable: false; mode: 'live';
  contract: 'firewood-invoice-handoff-live-v1'; sourceId: 'website_firewood_invoice_live_v1';
  environmentId: 'ats_firewood_live_v1'; accountId: 'acct_1Tv92EI7tY6VHUvU';
  portalOrigin: 'https://admin.angeltreeservices.org'; websiteOrigin: 'https://checkout.angeltreeservices.org';
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
