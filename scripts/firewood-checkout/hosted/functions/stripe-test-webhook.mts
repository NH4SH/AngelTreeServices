import { hostedRuntime, requireTestRuntime, functionHeaders } from '../runtime.mjs';
import { stripeVerifier } from '../service.mjs';
import { testWebhookHandler } from '../webhook.mjs';

export default async (request: Request, context: { site: { id: string } }) => {
  const names = ['FIREWOOD_HOSTED_TEST_ENABLED','FIREWOOD_CRM_TEST_ENABLED','FIREWOOD_STRIPE_TEST_ACCOUNT_ID','FIREWOOD_STRIPE_TEST_SECRET_KEY','FIREWOOD_TEST_STORAGE_TOKEN','FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET','FIREWOOD_TEST_DATABASE_URL','FIREWOOD_TEST_DATABASE_HOST'];
  const env = Object.fromEntries(names.map(name => [name, Netlify.env.get(name)]));
  try { requireTestRuntime(env, context.site.id); } catch { return new Response('Test webhook disabled.', {status:503,headers:functionHeaders}); }
  return testWebhookHandler({env,siteId:context.site.id,runtime:()=>hostedRuntime(env,context.site.id),...stripeVerifier(env)})(request);
};
