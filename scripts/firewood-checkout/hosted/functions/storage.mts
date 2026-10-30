import { hostedRuntime, requireTestRuntime } from '../runtime.mjs';
import { storageHandler, stripeVerifier } from '../service.mjs';

export default async (request: Request, context: { site: { id: string } }) => {
  const names = ['FIREWOOD_HOSTED_TEST_ENABLED','FIREWOOD_CRM_TEST_ENABLED','FIREWOOD_STRIPE_TEST_ACCOUNT_ID','FIREWOOD_STRIPE_TEST_SECRET_KEY','FIREWOOD_TEST_STORAGE_TOKEN','FIREWOOD_TEST_EMAIL_ENABLED','FIREWOOD_TEST_RESEND_KEY','FIREWOOD_TEST_EMAIL_FROM','FIREWOOD_TEST_DATABASE_URL','FIREWOOD_TEST_DATABASE_HOST'];
  const env = Object.fromEntries(names.map(name => [name, Netlify.env.get(name)]));
  // Validate before constructing any network client.
  try { requireTestRuntime(env, context.site.id); } catch { return new Response('Test storage disabled.', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag':'noindex' } }); }
  return storageHandler({ env, siteId: context.site.id, runtime: () => hostedRuntime(env, context.site.id), ...stripeVerifier(env) })(request);
};
