import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const production = Object.freeze({
  supabaseProjectRef: 'ddvlnixdugcbnrewktes',
  netlifySiteId: '6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0',
  appOrigin: 'https://admin.angeltreeservices.org',
  websiteOrigin: 'https://angeltreeservices.org',
});
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
function origin(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : null; }
  catch { return null; }
}
function jwtProject(value) {
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).ref ?? null; }
  catch { return null; }
}
// Offline configuration check ONLY. A passing declaration is not independent
// evidence of credentials, protection, deployed adapter behavior or approval.
export function checkStaging(manifest, env = {}) {
  const errors = [], s = manifest?.staging ?? {};
  const require = (condition, label) => { if (!condition) errors.push(label); };
  require(manifest?.mode === 'core-no-providers', 'Use the reviewed core-no-providers staging profile.');
  require(/^[a-z]{20}$/.test(s.supabaseProjectRef ?? '') && s.supabaseProjectRef !== production.supabaseProjectRef, 'Assign a separate staging Supabase project.');
  require(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(s.netlifySiteId ?? '') && s.netlifySiteId !== production.netlifySiteId, 'Assign a separate staging Netlify site.');
  const app = origin(s.appOrigin);
  require(app && ![production.appOrigin, production.websiteOrigin].includes(app), 'Assign an isolated HTTPS staging origin.');
  require(env.APP_ENV === 'staging' && env.STAGING_MODE === 'core-no-providers', 'Set the explicit staging environment/profile.');
  require(nonempty(env.SITE_ID) && env.SITE_ID === s.netlifySiteId, 'Runtime SITE_ID must match the approved staging site.');
  require(origin(env.APP_BASE_URL) === app && app !== null, 'APP_BASE_URL must match the isolated staging origin.');
  const api = origin(env.NEXT_PUBLIC_SUPABASE_URL);
  require(api === `https://${s.supabaseProjectRef}.supabase.co` && s.supabaseProjectRef !== production.supabaseProjectRef, 'Supabase URL must match the separate staging project.');
  for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    require(nonempty(env[key]), `Provide ${key} privately for staging.`);
    const ref = jwtProject(env[key] ?? '');
    if (ref !== null) require(ref === s.supabaseProjectRef && ref !== production.supabaseProjectRef, `${key} is bound to another project.`);
  }
  // No outbound providers or scheduler/worker credentials in the initial stage.
  // Do not print names/values from an untrusted environment in diagnostics.
  for (const [key, value] of Object.entries(env)) {
    if (!nonempty(value)) continue;
    if (/^(STRIPE_|NEXT_PUBLIC_STRIPE_|RESEND_|TWILIO_|SMTP_|GOOGLE_|NEXT_PUBLIC_GOOGLE_)/.test(key)
      || /(?:WORKER|MONITOR|CRON|INTAKE|WEBHOOK)_SECRET$/.test(key)) errors.push('Remove outbound provider and worker credentials from the initial staging environment.');
    if (/^(NEXT_PUBLIC_|PUBLIC_|VITE_)/.test(key) && /(?:SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY)/.test(key)) errors.push('A privileged value is configured in a public variable.');
  }
  const scanner = origin(s.scannerOrigin);
  require(scanner && scanner !== production.appOrigin && scanner !== production.websiteOrigin && s.scannerIsolationVerified === true, 'Verify a separate staging HTTPS scanner.');
  try { const u = new URL(env.DOCUMENT_SCANNER_URL); require(scanner !== null && u.origin === scanner && u.pathname === '/scan' && !u.username && !u.password && !u.search && !u.hash, 'Scanner URL must match the separate staging scanner.'); }
  catch { errors.push('Provide the separate staging scanner URL.'); }
  require(nonempty(env.DOCUMENT_SCANNER_TOKEN) && env.DOCUMENT_SCANNER_TOKEN.length >= 32, 'Provide the separate staging scanner credential privately.');
  for (const [field, label] of Object.entries({
    environmentIsolationVerified: 'Verify site and inherited runtime-variable isolation.',
    runtimeKeyBindingVerified: 'Verify the actual staging API key/project binding.',
    accessProtectionVerified: 'Verify staging visitor protection and private logs.',
    canonicalLinksSupported: 'Review staging canonical-link support before building.',
    backupRecoveryVerified: 'Verify paired staging source-file/database recovery.',
    maintainerAssigned: 'Assign the staging/scanner maintainer.',
  })) require(s[field] === true, label);
  return { ready: errors.length === 0, profile: 'core-no-providers', errors: [...new Set(errors)], networkRequests: 0, changesApplied: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flag = process.argv.indexOf('--manifest');
    if (flag < 0 || !process.argv[flag + 1]) throw Error('missing manifest');
    const report = checkStaging(JSON.parse(readFileSync(process.argv[flag + 1], 'utf8')), process.env);
    console.log(JSON.stringify(report, null, 2)); if (!report.ready) process.exitCode = 1;
  } catch { console.error('Staging preflight could not read the reviewed manifest. No operation was performed.'); process.exitCode = 1; }
}
