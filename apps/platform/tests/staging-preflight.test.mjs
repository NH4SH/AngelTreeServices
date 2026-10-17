import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStaging, production } from '../scripts/release/staging-preflight.mjs';
import { stagingFixture as fixture, jwt } from './staging-fixture.mjs';
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
  for (const field of ['environmentIsolationVerified', 'runtimeKeyBindingVerified', 'authIsolationVerified', 'canonicalLinksSupported', 'accessProtectionVerified', 'scannerIsolationVerified', 'backupRecoveryVerified', 'maintainerAssigned']) {
    const f = fixture(); f.manifest.staging[field] = false; assert.equal(checkStaging(f.manifest, f.env).ready, false);
  }
});

test('privileged keys cannot be disguised as ordinary public variables; malformed keys and role swaps fail closed', () => {
  for (const [key, value] of [
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', jwt('abcdefghijklmnopqrst')],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_secret_synthetic-example-only'],
    ['NEXT_PUBLIC_NORMAL_SETTING', 'sb_secret_synthetic-example-only'],
    ['NEXT_PUBLIC_NORMAL_SETTING', jwt('abcdefghijklmnopqrst')],
    ['NEXT_PUBLIC_PORTAL_TOKEN_ENCRYPTION_KEY', 'synthetic-private-encryption-fixture'],
    ['NEXT_PUBLIC_DOCUMENT_SCANNER_TOKEN', 'synthetic-private-scanner-fixture'],
    ['SUPABASE_SERVICE_ROLE_KEY', jwt('abcdefghijklmnopqrst', 'anon')],
    ['SUPABASE_SERVICE_ROLE_KEY', 'not-an-api-key'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'broken.payload.signature'],
  ]) {
    const f = fixture(); f.env[key] = value;
    const result = checkStaging(f.manifest, f.env);
    assert.equal(result.ready, false); assert.ok(!JSON.stringify(result).includes(value));
  }
});

test('modern key shapes still require independent real API/project binding evidence', () => {
  const f = fixture(); f.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_synthetic-example-only';
  f.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic-example-only';
  assert.equal(checkStaging(f.manifest, f.env).ready, true);
  f.manifest.staging.runtimeKeyBindingVerified = false;
  assert.equal(checkStaging(f.manifest, f.env).ready, false);
});

test('production aliases, ports, loopback/IP hosts, scanner sharing and legacy portal overrides are rejected', () => {
  for (const value of ['https://angeltreeservice.org', 'https://www.angeltreeservices.org', 'https://admin.angeltreeservices.org.', 'https://127.0.0.1', 'https://127.1', 'https://localhost', 'https://stage.localhost', 'https://stage.example.invalid:8443', 'https://stage.example.invalid/./', 'https://stage.example.invalid\\']) {
    const f = fixture(); f.manifest.staging.appOrigin = value; f.env.APP_BASE_URL = value;
    assert.equal(checkStaging(f.manifest, f.env).ready, false, value);
  }
  for (const alter of [f => f.env.CUSTOMER_PORTAL_BASE_URL = production.appOrigin,
    f => f.env.EMAIL_REPLY_TO = 'owner@example.invalid', f => f.env.DATABASE_URL = 'synthetic-private-database',
    f => f.manifest.staging.netlifySiteId = production.websiteSiteId,
    f => { f.manifest.staging.scannerOrigin = f.manifest.staging.appOrigin; f.env.DOCUMENT_SCANNER_URL = f.env.APP_BASE_URL + '/scan'; }]) {
    const f = fixture(); alter(f); assert.equal(checkStaging(f.manifest, f.env).ready, false);
  }
});
test('URL credentials, queries, plaintext and an incorrect scanner path fail before any request', () => {
  for (const value of ['http://scanner-stage.example.invalid/scan', 'https://user:password@scanner-stage.example.invalid/scan', 'https://scanner-stage.example.invalid/scan?key=bad', 'https://scanner-stage.example.invalid/other']) {
    const f = fixture(); f.env.DOCUMENT_SCANNER_URL = value; assert.equal(checkStaging(f.manifest, f.env).ready, false);
  }
});
