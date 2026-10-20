import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './pr10-test-helpers.mjs';
import { stagingFixture } from './staging-fixture.mjs';
import * as policy from '../src/lib/security/staging-policy.mjs';
import { normalizeAppBaseUrl } from '../src/lib/security/app-base-url.ts';
import * as checkoutClosure from '../src/lib/payments/checkout-closure.ts';

function canonical(f) {
  return load('../src/lib/security/app-base-url.ts', {
    './deployment.ts': { targets: f.manifest }, './staging-policy.mjs': policy,
  });
}
async function withEnvironment(env, fn) {
  const previous = { ...process.env };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  try { return await fn(); }
  finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

test('production builds permit exactly the bound staging origin only with a complete explicit isolated profile', () => {
  const f = stagingFixture(), deployment = { manifest: f.manifest, env: f.env };
  assert.equal(normalizeAppBaseUrl(f.env.APP_BASE_URL, 'production', deployment), f.env.APP_BASE_URL);
  for (const url of [policy.production.appOrigin, policy.production.websiteOrigin, 'https://other.example.invalid',
    'https://stage.example.invalid.evil.invalid', 'http://stage.example.invalid', 'http://localhost:3102',
    f.env.APP_BASE_URL + ':8443', f.env.APP_BASE_URL + '/path', f.env.APP_BASE_URL + '?q=1',
    'https://person:password@stage.example.invalid']) {
    assert.equal(normalizeAppBaseUrl(url, 'production', deployment), null, url);
  }
  for (const key of ['APP_ENV', 'STAGING_MODE', 'SITE_ID', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const broken = stagingFixture(); delete broken.env[key];
    assert.equal(normalizeAppBaseUrl(broken.env.APP_BASE_URL, 'production', { manifest: broken.manifest, env: broken.env }), null, key);
    assert.throws(() => policy.assertDeploymentIsolation(broken.manifest, broken.env), /isolation checks failed/);
  }
});

test('assigned staging artifacts cannot become production by removing markers or substituting runtime targets', () => {
  const f = stagingFixture();
  assert.doesNotThrow(() => policy.assertDeploymentIsolation(f.manifest, f.env));
  for (const env of [{}, { APP_ENV: 'production' }, { ...f.env, APP_ENV: 'production' },
    { ...f.env, SITE_ID: policy.production.netlifySiteId }, { ...f.env, RESEND_API_KEY: 'private-synthetic-marker' }]) {
    assert.throws(() => policy.assertDeploymentIsolation(f.manifest, env), error =>
      /isolation/.test(error.message) && !error.message.includes('private-synthetic-marker'));
  }
  assert.throws(() => policy.assertDeploymentIsolation({}, { APP_ENV: 'stagng' }), /Unrecognized/);
  assert.doesNotThrow(() => policy.assertDeploymentIsolation({}, {}));
  assert.doesNotThrow(() => policy.assertDeploymentIsolation({}, { APP_ENV: 'production' }));
});

test('the unassigned production artifact retains production/loopback behavior and rejects port aliases', () => {
  const deployment = { manifest: {}, env: {} };
  assert.equal(normalizeAppBaseUrl(policy.production.appOrigin, 'production', deployment), policy.production.appOrigin);
  for (const url of ['https://stage.example.invalid', policy.production.appOrigin + ':8443', 'http://localhost:3102'])
    assert.equal(normalizeAppBaseUrl(url, 'production', deployment), null);
  assert.equal(normalizeAppBaseUrl('http://127.0.0.1:3102', 'development', deployment), 'http://127.0.0.1:3102');
});

test('staging browser policy binds database connections to its project and intake does not inherit production website origins', async () => {
  const f = stagingFixture(), urls = canonical(f);
  await withEnvironment(f.env, async () => {
    const headers = load('../src/lib/security/headers.ts', { './deployment.ts': { targets: f.manifest }, './staging-policy.mjs': policy });
    const csp = headers.contentSecurityPolicy;
    assert.ok(csp.includes(`connect-src 'self' ${f.env.NEXT_PUBLIC_SUPABASE_URL} wss://${f.manifest.staging.supabaseProjectRef}.supabase.co`));
    assert.doesNotMatch(csp, /\*\.supabase|stripe\.com|googleapis\.com|gstatic\.com/);
    const lead = load('../src/lib/leads/config.ts', { 'server-only': {}, '../security/deployment.ts': { targets: f.manifest },
      '../security/staging-policy.mjs': policy, '../security/app-base-url': urls });
    assert.deepEqual(lead.getAllowedLeadIntakeOrigins(), [f.env.APP_BASE_URL]);
    assert.equal(lead.DEFAULT_PUBLIC_LEAD_INTAKE_URL, f.env.APP_BASE_URL + '/api/leads');
    delete process.env.APP_ENV;
    assert.deepEqual(lead.getAllowedLeadIntakeOrigins(), []);
  });
});

test('portal quote/invoice/change-order links, OAuth, employee notices and reset redirects stay on staging without provider calls', async () => {
  const f = stagingFixture(), urls = canonical(f), origin = f.env.APP_BASE_URL;
  const portal = load('../src/lib/portal/urls.ts', { 'server-only': {}, '@/lib/security/app-base-url': urls });
  const google = load('../src/lib/integrations/google-calendar/config.ts', {
    'server-only': {}, '@/lib/security/app-base-url': urls, './credentials': { isGoogleTokenEncryptionConfigured: () => false },
  });
  const stripe = load('../src/lib/stripe/server.ts', { 'server-only': {}, stripe: { default: class { constructor() { assert.fail('Core staging must not create a provider client'); } } }, '@/lib/security/app-base-url': urls });
  const templates = load('../src/lib/email/templates.ts', {
    'server-only': {}, '@/lib/security/app-base-url': urls, '@/lib/documents/email-drafts': {}, '@/lib/email/customer-document-layout': {},
  });
  await withEnvironment(f.env, async () => {
    for (const type of ['quote', 'invoice', 'change-order']) {
      const url = new URL(await portal.getPortalUrl(type, 'synthetic/token?only'));
      assert.equal(url.origin, origin); assert.equal(url.pathname, `/portal/${type}/synthetic%2Ftoken%3Fonly`);
    }
    assert.equal(google.getGoogleCalendarConfiguration().redirectUri, origin + '/api/integrations/google-calendar/callback');
    assert.equal(google.getGoogleCalendarConfiguration().configured, false);
    assert.equal(stripe.getStripeServerConfig().configured, false);
    assert.equal(urls.buildCanonicalAppUrl('/update-password'), origin + '/update-password');
    for (const path of [policy.production.appOrigin + '/admin', '//admin.angeltreeservices.org/admin', '/\\evil.invalid', '/admin\n'])
      assert.equal(urls.buildCanonicalAppUrl(path), null);
    const approved = templates.employeeAccessApprovedTemplate({ fullName: 'Synthetic employee', assignedRole: 'crew' });
    const request = templates.employeeAccessRequestAdminTemplate({ full_name: 'Synthetic', email: 'synthetic@example.invalid' });
    const lead = templates.leadInternalNoticeTemplate({ jobId: 'synthetic-job', submission: { name: 'Synthetic', serviceLabel: 'Test', customerTypeLabel: 'Test' } });
    for (const [message, path] of [[approved, '/login'], [request, '/admin/access'], [lead, '/admin/jobs/synthetic-job']]) {
      assert.ok(message.text.includes(origin + path)); assert.ok(!message.text.includes(policy.production.appOrigin));
    }
  });
});

test('employee reset action stops before requesting recovery email when the canonical configuration is invalid', async () => {
  let resets = 0;
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { email: 'synthetic@example.invalid' } }), then(resolve) { resolve({ data: [{ roles: { name: 'owner' } }] }); } };
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic-owner' } } }) }, from: () => query };
  const actions = load('../src/lib/actions/access-requests.ts', {
    'next/headers': {}, 'next/cache': { revalidatePath() {} }, '@/lib/access-request-options': { employeeRequestedRoleOptions: [] },
    '@/lib/auth/roles': { hasAllowedRole: () => true, platformRoleGroups: { accessApproval: [] } },
    '@/lib/supabase/server': { createClient: async () => db }, '@/lib/email/config': {}, '@/lib/email/templates': {},
    '@/lib/email/send': { recordEmailEvent: async () => {} }, '@/lib/activity-log': { recordActivity: async () => {} },
    '@/lib/security/app-base-url': { buildCanonicalAppUrl: () => null }, '@/lib/security/rate-limit': {},
    '@/lib/security/errors': {}, '@/lib/supabase/admin': {}, '@/lib/supabase/password-recovery': {
      createPasswordRecoveryRequestClient: () => { resets++; assert.fail('No recovery client before valid redirect'); },
    },
  });
  const form = new FormData(); form.set('user_id', 'synthetic-employee');
  const result = await actions.sendEmployeePasswordReset({}, form);
  assert.equal(result.status, 'error'); assert.match(result.message, /APP_BASE_URL/); assert.equal(resets, 0);
});

test('real checkout preparation keeps both payment return URLs on the bound staging invoice without contacting Stripe', async () => {
  const f = stagingFixture(), urls = canonical(f);
  const portal = load('../src/lib/portal/urls.ts', { 'server-only': {}, '@/lib/security/app-base-url': urls });
  let parameters;
  const reservation = { id: 'synthetic-reservation', invoice_id: 'synthetic-invoice', customer_id: 'synthetic-customer', organization_id: null,
    status: 'creating', payment_channel: 'ach', invoice_principal_cents: 1000, amount_cents: 1000, total_charge_cents: 1000,
    currency: 'usd', stripe_checkout_session_id: null, stripe_payment_intent_id: null, submitted_at: null };
  const db = { from(table) {
    assert.equal(table, 'invoice_checkout_sessions'); let operation = 'read';
    const q = { select() { return q; }, eq() { return q; }, is() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
      insert() { operation = 'insert'; return q; }, update() { operation = 'update'; return q; },
      single: async () => ({ data: reservation, error: null }), maybeSingle: async () => ({ data: operation === 'update' ? { id: reservation.id } : null, error: null }) };
    return q;
  } };
  const checkout = load('../src/lib/stripe/invoice-checkout.ts', {
    'server-only': {}, '@/lib/payments/checkout-closure': checkoutClosure, '@/lib/payments/ach-checkout': { achCheckoutPaymentMethodTypes: ['us_bank_account'] },
  });
  await withEnvironment(f.env, async () => {
    const portalUrl = await portal.getPortalUrl('invoice', 'synthetic-token');
    const result = await checkout.createOrReuseInvoiceCheckout({ invoiceId: 'synthetic-invoice', customerId: 'synthetic-customer',
      amountCents: 1000, portalUrl, livemode: false, supabase: db,
      stripe: { checkout: { sessions: { create: async value => { parameters = value; return {
        id: 'cs_synthetic', url: 'https://checkout.example.invalid/test', mode: 'payment', status: 'open', payment_status: 'unpaid', livemode: false,
        metadata: value.metadata, client_reference_id: value.client_reference_id, amount_total: 1000, currency: 'usd', payment_intent: null, expires_at: 1792600000,
      }; } } } },
    });
    assert.equal(result.ok, true);
    for (const key of ['success_url', 'cancel_url']) {
      const url = new URL(parameters[key]); assert.equal(url.origin, f.env.APP_BASE_URL);
      assert.equal(url.pathname, '/portal/invoice/synthetic-token');
    }
    assert.equal(parameters.line_items[0].price_data.unit_amount, 1000);
  });
});
