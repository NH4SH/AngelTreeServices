// Non-secret, reviewed target identity. This profile never enables live payments.
export const FIREWOOD_STAGING = Object.freeze({
  mode: 'firewood-sandbox-v2',
  projectRef: 'gbyhdsuiqeslgjdnbqng',
  databaseOrigin: 'https://gbyhdsuiqeslgjdnbqng.supabase.co',
  siteId: 'd81d923d-6ccf-4c1e-87cc-263f3d51555d',
  portalOrigin: 'https://angel-tree-admin-staging.netlify.app',
  environmentId: 'ats_fwhandoff_staging_gbyhdsuiqeslgjdnbqng',
  accountId: 'acct_1UU9U8RAZXGe6tX0',
  sourceId: 'website_firewood_invoice_v2',
});

export function isFirewoodStagingIdentity(env = {}) {
  return env.APP_ENV === 'staging' && env.STAGING_MODE === FIREWOOD_STAGING.mode
    && env.SITE_ID === FIREWOOD_STAGING.siteId && env.APP_BASE_URL === FIREWOOD_STAGING.portalOrigin
    && env.NEXT_PUBLIC_SUPABASE_URL === FIREWOOD_STAGING.databaseOrigin
    && env.FIREWOOD_HANDOFF_V2_SUPABASE_URL === FIREWOOD_STAGING.databaseOrigin
    && env.FIREWOOD_HANDOFF_V2_PORTAL_ORIGIN === FIREWOOD_STAGING.portalOrigin
    && env.FIREWOOD_HANDOFF_V2_ENVIRONMENT_ID === FIREWOOD_STAGING.environmentId
    && env.FIREWOOD_HANDOFF_V2_ACCOUNT_ID === FIREWOOD_STAGING.accountId
    && env.FIREWOOD_HANDOFF_V2_SOURCE_ID === FIREWOOD_STAGING.sourceId;
}
