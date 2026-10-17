import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStaging, production } from '../scripts/release/staging-preflight.mjs';
const jwt = ref => ['synthetic', Buffer.from(JSON.stringify({ ref })).toString('base64url'), 'fixture-not-a-signed-key'].join('.');
function fixture() {
  const staging = { supabaseProjectRef: 'abcdefghijklmnopqrst', netlifySiteId: '11111111-2222-3333-4444-555555555555', appOrigin: 'https://stage.example.invalid', scannerOrigin: 'https://scanner-stage.example.invalid', scannerIsolationVerified: true, environmentIsolationVerified: true, runtimeKeyBindingVerified: true, accessProtectionVerified: true, canonicalLinksSupported: true, backupRecoveryVerified: true, maintainerAssigned: true };
  const env = { APP_ENV: 'staging', STAGING_MODE: 'core-no-providers', SITE_ID: staging.netlifySiteId, APP_BASE_URL: staging.appOrigin, NEXT_PUBLIC_SUPABASE_URL: `https://${staging.supabaseProjectRef}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(staging.supabaseProjectRef), SUPABASE_SERVICE_ROLE_KEY: jwt(staging.supabaseProjectRef), DOCUMENT_SCANNER_URL: staging.scannerOrigin + '/scan', DOCUMENT_SCANNER_TOKEN: 'synthetic-scanner-only-not-a-real-credential' };
  return { manifest: { mode: 'core-no-providers', staging }, env };
}
test('a reviewed synthetic staging declaration can pass offline without network or mutations', () => {
  const f = fixture(), result = checkStaging(f.manifest, f.env); assert.equal(result.ready, true); assert.equal(result.networkRequests, 0); assert.equal(result.changesApplied, false);
});
test('unassigned targets fail closed without inventing credentials or targets', () => {
  assert.equal(checkStaging({ mode: 'core-no-providers', staging: {} }, {}).ready, false);
});
test('production site, API, canonical URL and borrowed project-bound keys are rejected independently', () => {
  for (const alter of [f => f.manifest.staging.supabaseProjectRef = production.supabaseProjectRef, f => f.env.SITE_ID = production.netlifySiteId, f => f.env.APP_BASE_URL = production.appOrigin, f => f.env.NEXT_PUBLIC_SUPABASE_URL = `https://${production.supabaseProjectRef}.supabase.co`, f => f.env.SUPABASE_SERVICE_ROLE_KEY = jwt(production.supabaseProjectRef)]) {
    const f = fixture(); alter(f); assert.equal(checkStaging(f.manifest, f.env).ready, false);
  }
});
test('outbound/inherited provider keys, worker credentials and public privileged values stop staging; values never enter the report', () => {
  for (const key of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'RESEND_API_KEY', 'GOOGLE_TOKEN_ENCRYPTION_KEY', 'COMMUNICATION_WORKER_SECRET', 'SYSTEM_HEALTH_MONITOR_SECRET', 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY']) {
    const f = fixture(), secret = 'never-print-this-synthetic-fixture'; f.env[key] = secret; const result = checkStaging(f.manifest, f.env); assert.equal(result.ready, false); assert.equal(JSON.stringify(result).includes(secret), false);
  }
});
test('unverified environment isolation, canonical link support or protection cannot be waived by other fields', () => {
  for (const field of ['environmentIsolationVerified', 'runtimeKeyBindingVerified', 'canonicalLinksSupported', 'accessProtectionVerified', 'scannerIsolationVerified', 'backupRecoveryVerified', 'maintainerAssigned']) {
    const f = fixture(); f.manifest.staging[field] = false; assert.equal(checkStaging(f.manifest, f.env).ready, false);
  }
});
test('URL credentials, queries, plaintext and an incorrect scanner path fail before any request', () => {
  for (const value of ['http://scanner-stage.example.invalid/scan', 'https://user:password@scanner-stage.example.invalid/scan', 'https://scanner-stage.example.invalid/scan?key=bad', 'https://scanner-stage.example.invalid/other']) {
    const f = fixture(); f.env.DOCUMENT_SCANNER_URL = value; assert.equal(checkStaging(f.manifest, f.env).ready, false);
  }
});
