// Reserved .invalid hosts and unsigned fixtures only. True flags model evidence;
// they are never written into the real staging target manifest.
export const jwt = (ref, role = 'service_role') => ['synthetic', Buffer.from(JSON.stringify({ ref, role })).toString('base64url'), 'fixture-not-a-signed-key'].join('.');
export function stagingFixture() {
  const staging = { supabaseProjectRef: 'abcdefghijklmnopqrst', netlifySiteId: '11111111-2222-3333-4444-555555555555', appOrigin: 'https://stage.example.invalid', scannerOrigin: 'https://scanner-stage.example.invalid', scannerIsolationVerified: true, environmentIsolationVerified: true, runtimeKeyBindingVerified: true, authIsolationVerified: true, accessProtectionVerified: true, canonicalLinksSupported: true, backupRecoveryVerified: true, maintainerAssigned: true };
  const env = { APP_ENV: 'staging', STAGING_MODE: 'core-no-providers', SITE_ID: staging.netlifySiteId, APP_BASE_URL: staging.appOrigin, NEXT_PUBLIC_SUPABASE_URL: `https://${staging.supabaseProjectRef}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt(staging.supabaseProjectRef, 'anon'), SUPABASE_SERVICE_ROLE_KEY: jwt(staging.supabaseProjectRef), DOCUMENT_SCANNER_URL: staging.scannerOrigin + '/scan', DOCUMENT_SCANNER_TOKEN: 'synthetic-scanner-only-not-a-real-credential' };
  return { manifest: { mode: 'core-no-providers', staging }, env };
}
