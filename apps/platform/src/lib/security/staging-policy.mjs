// Shared by the offline preflight, build/startup guards and canonical-link policy.
// No network access, mutation, secret output or environment discovery here.
import {FIREWOOD_STAGING,isFirewoodStagingIdentity} from '../firewood/handoff/staging-profile.mjs';
export const production = Object.freeze({
  supabaseProjectRef: 'ddvlnixdugcbnrewktes',
  netlifySiteId: '6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0',
  websiteSiteId: '86c48a95-ead4-4b15-8e57-fa827558b2f0',
  appOrigin: 'https://admin.angeltreeservices.org',
  websiteOrigin: 'https://angeltreeservices.org',
});

const nonempty = value => typeof value === 'string' && Boolean(value.trim());
export function httpsOrigin(value) {
  if (!nonempty(value) || /[\\\s]/.test(value) || !/^https:\/\/[^/?#]+\/?$/i.test(value)) return null;
  try {
    const url = new URL(value);
    // Staging is a named HTTPS host, never loopback, an IP, a wildcard or a port alias.
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash && !url.port &&
      /^[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(url.hostname) &&
      !url.hostname.endsWith('.localhost') ? url.origin : null;
  } catch { return null; }
}

function keyClaims(value) {
  try {
    const parts = value.split('.');
    if (parts.length !== 3 || parts.some(part => !part)) return null;
    // Decode only to REJECT mismatches/privileged browser keys, not to verify signatures.
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

export function isStagingDeployment(manifest, env = {}) {
  const s = manifest?.staging ?? {};
  return env.APP_ENV === 'staging' || nonempty(env.STAGING_MODE) ||
    ['appOrigin', 'netlifySiteId', 'supabaseProjectRef', 'scannerOrigin'].some(key => s[key] != null);
}

// The hosted sandbox uses Stripe's normal browser origins. Only this exact,
// explicitly enabled test collector may relax the core profile's provider CSP.
export function isFirewoodStagingCollectorDeployment(manifest, env = {}) {
  return manifest?.mode === FIREWOOD_STAGING.mode &&
    manifest?.staging?.supabaseProjectRef === FIREWOOD_STAGING.projectRef &&
    manifest?.staging?.netlifySiteId === FIREWOOD_STAGING.siteId &&
    manifest?.staging?.appOrigin === FIREWOOD_STAGING.portalOrigin &&
    isFirewoodStagingIdentity(env) && env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED === '1' &&
    env.FIREWOOD_HANDOFF_V2_COLLECTOR_STAGING_ENABLED === '1' &&
    env.FIREWOOD_HANDOFF_V2_TEST_ENABLED !== '1' && env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED !== '1' &&
    /^rk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY ?? '') &&
    /^pk_test_[A-Za-z0-9]+$/.test(env.STRIPE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
}

export function checkStaging(manifest, env = {}) {
  const errors = [], s = manifest?.staging ?? {};
  const firewood=manifest?.mode===FIREWOOD_STAGING.mode;
  const require = (condition, label) => { if (!condition) errors.push(label); };
  require(manifest?.mode === 'core-no-providers'||firewood, 'Use a reviewed staging profile.');
  require(/^[a-z]{20}$/.test(s.supabaseProjectRef ?? '') && s.supabaseProjectRef !== production.supabaseProjectRef,
    'Assign a separate staging Supabase project.');
  require(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(s.netlifySiteId ?? '') &&
    ![production.netlifySiteId, production.websiteSiteId].includes(s.netlifySiteId?.toLowerCase()),
    'Assign a separate staging Netlify site.');
  const app = httpsOrigin(s.appOrigin);
  const productionHost = value => {
    try { return /^(?:admin\.|www\.)?angeltreeservices?\.org\.?$/i.test(new URL(value).hostname); }
    catch { return false; }
  };
  require(app && !productionHost(app), 'Assign an isolated HTTPS staging origin.');
  require(env.APP_ENV === 'staging' && env.STAGING_MODE === manifest?.mode, 'Set the explicit staging environment/profile.');
  require(nonempty(env.SITE_ID) && env.SITE_ID === s.netlifySiteId, 'Runtime SITE_ID must match the approved staging site.');
  require(httpsOrigin(env.APP_BASE_URL) === app && app !== null, 'APP_BASE_URL must match the isolated staging origin.');
  require(httpsOrigin(env.NEXT_PUBLIC_SUPABASE_URL) === `https://${s.supabaseProjectRef}.supabase.co` &&
    s.supabaseProjectRef !== production.supabaseProjectRef, 'Supabase URL must match the separate staging project.');
  for (const [key, role, prefix] of [
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon', 'sb_publishable_'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'sb_secret_'],
  ]) {
    const value = env[key] ?? '', claims = keyClaims(value);
    const modern = new RegExp(`^${prefix}[A-Za-z0-9_-]{10,}$`).test(value);
    require(modern || (claims?.ref === s.supabaseProjectRef && claims?.role === role &&
      claims.ref !== production.supabaseProjectRef), `${key} must be the correct staging key type/project.`);
  }
  if(firewood){
    require(s.supabaseProjectRef===FIREWOOD_STAGING.projectRef&&s.netlifySiteId===FIREWOOD_STAGING.siteId&&app===FIREWOOD_STAGING.portalOrigin&&isFirewoodStagingIdentity(env),'Bind Firewood sandbox staging to its exact approved project/site/origin.');
    require(env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED==='1'&&env.FIREWOOD_HANDOFF_V2_TEST_ENABLED!=='1'&&env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED!=='1','Use only explicit Firewood staging activation flags.');
    require(env.FIREWOOD_HANDOFF_V2_SERVICE_ROLE_KEY===env.SUPABASE_SERVICE_ROLE_KEY,'Use the same independently verified staging backend key.');
    require(/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(env.FIREWOOD_HANDOFF_V2_KEY_ID??''),'Provide the explicit Firewood staging signing-key identifier.');
    require(typeof env.FIREWOOD_HANDOFF_V2_SIGNING_SECRET==='string'&&/^[A-Za-z0-9_-]{32,256}$/.test(env.FIREWOOD_HANDOFF_V2_SIGNING_SECRET),'Provide the private Firewood staging signing secret.');
    require(typeof env.FIREWOOD_HANDOFF_V2_ENCRYPTION_KEY==='string'&&env.FIREWOOD_HANDOFF_V2_ENCRYPTION_KEY===env.PORTAL_TOKEN_ENCRYPTION_KEY&&/^[A-Za-z0-9+/]{43}=$/.test(env.FIREWOOD_HANDOFF_V2_ENCRYPTION_KEY),'Use the same private 32-byte portal encryption key.');
    require(!env.STRIPE_PUBLISHABLE_KEY||!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY||env.STRIPE_PUBLISHABLE_KEY===env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,'Configured test publishable-key aliases must match.');
    if(env.FIREWOOD_HANDOFF_V2_COLLECTOR_STAGING_ENABLED==='1')require(/^rk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY??'')&&/^pk_test_[A-Za-z0-9]+$/.test(env.STRIPE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY||'')&&/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET??''),'Provide only isolated test Stripe collector credentials.');
  }
  for (const [key, value] of Object.entries(env)) {
    if (!nonempty(value)) continue;
    const firewoodStripe=firewood&&(
      key==='STRIPE_SECRET_KEY'&&/^rk_test_[A-Za-z0-9]+$/.test(value)||
      ['STRIPE_PUBLISHABLE_KEY','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'].includes(key)&&/^pk_test_[A-Za-z0-9]+$/.test(value)||
      key==='STRIPE_WEBHOOK_SECRET'&&/^whsec_[A-Za-z0-9]+$/.test(value));
    if (/^(STRIPE_|NEXT_PUBLIC_STRIPE_|RESEND_|TWILIO_|SMTP_|GOOGLE_|NEXT_PUBLIC_GOOGLE_)/.test(key) ||
      /(?:WORKER|MONITOR|CRON|INTAKE|WEBHOOK)_SECRET(?:_PREVIOUS)?$/.test(key) ||
      /^(EMAIL_FROM|EMAIL_REPLY_TO|INTERNAL_LEAD_NOTIFICATION_(?:CC_)?EMAIL|LEAD_INTAKE_ALLOWED_ORIGINS|DATABASE_URL|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|PGPASSWORD)$/.test(key)) {
      if(!firewoodStripe)errors.push('Remove unapproved provider, recipient, intake, worker and management credentials from staging.');
    }
    if (/^(NEXT_PUBLIC_|PUBLIC_|VITE_)/.test(key) &&
      (/(?:SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|ENCRYPTION_KEY|TOKEN)/.test(key) || value.startsWith('sb_secret_') || keyClaims(value)?.role === 'service_role')) {
      errors.push('A privileged value is configured in a public variable.');
    }
    if (value.includes(production.supabaseProjectRef) || value.includes(production.netlifySiteId) ||
      value.includes(production.websiteSiteId) || productionHost(value)) {
      errors.push('Remove production targets from the staging environment.');
    }
  }
  if (nonempty(env.CUSTOMER_PORTAL_BASE_URL)) require(httpsOrigin(env.CUSTOMER_PORTAL_BASE_URL) === app && app !== null,
    'Customer portal override must match the staging origin.');
  const scanner = httpsOrigin(s.scannerOrigin);
  require(scanner && scanner !== app && !productionHost(scanner) && s.scannerIsolationVerified === true,
    'Verify a separate staging HTTPS scanner.');
  try {
    const url = new URL(env.DOCUMENT_SCANNER_URL);
    require(scanner !== null && url.origin === scanner && url.pathname === '/scan' && !url.username &&
      !url.password && !url.search && !url.hash && !/[\\\s]/.test(env.DOCUMENT_SCANNER_URL),
      'Scanner URL must match the separate staging scanner.');
  } catch { errors.push('Provide the separate staging scanner URL.'); }
  require(nonempty(env.DOCUMENT_SCANNER_TOKEN) && env.DOCUMENT_SCANNER_TOKEN.length >= 32,
    'Provide the separate staging scanner credential privately.');
  for (const [field, label] of Object.entries({
    environmentIsolationVerified: 'Verify site and inherited build/runtime-variable isolation.',
    runtimeKeyBindingVerified: 'Verify the actual staging API key/project binding.',
    authIsolationVerified: 'Verify staging Auth site/redirect URLs, email templates and isolated mail handling.',
    accessProtectionVerified: 'Verify staging visitor protection and private logs.',
    canonicalLinksSupported: 'Verify canonical links on the actual staging target.',
    backupRecoveryVerified: 'Verify paired staging source-file/database recovery.',
    maintainerAssigned: 'Assign the staging/scanner maintainer.',
  })) require(s[field] === true, label);
  return { ready: errors.length === 0, profile: firewood?FIREWOOD_STAGING.mode:'core-no-providers', errors: [...new Set(errors)], networkRequests: 0, changesApplied: false };
}

export function assertDeploymentIsolation(manifest, env = {}) {
  if (isStagingDeployment(manifest, env)) {
    if (!checkStaging(manifest, env).ready) throw new Error('Staging isolation checks failed. Review the staging preflight; no credentials are included in this error.');
  } else if (nonempty(env.APP_ENV) && env.APP_ENV !== 'production') {
    throw new Error('Unrecognized application environment.');
  }
}
