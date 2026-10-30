import { hostedRuntime, functionHeaders } from '../runtime.mjs';

export default async (_request: Request, context: { site: { id: string } }) => {
  const names = ['FIREWOOD_HOSTED_TEST_ENABLED','FIREWOOD_CRM_TEST_ENABLED','FIREWOOD_STRIPE_TEST_ACCOUNT_ID','FIREWOOD_STRIPE_TEST_SECRET_KEY','FIREWOOD_TEST_STORAGE_TOKEN','FIREWOOD_TEST_EMAIL_ENABLED','FIREWOOD_TEST_RESEND_KEY','FIREWOOD_TEST_EMAIL_FROM','FIREWOOD_TEST_DATABASE_URL','FIREWOOD_TEST_DATABASE_HOST'];
  const env = Object.fromEntries(names.map(name => [name, Netlify.env.get(name)]));
  const { work } = await hostedRuntime(env, context.site.id);
  return new Response(JSON.stringify(await work()), { headers: functionHeaders });
};

// Every five minutes in UTC; independent of browser sessions or the Mac.
export const config = { schedule: '*/5 * * * *' };
