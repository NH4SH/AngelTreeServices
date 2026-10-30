import { createOrderStore } from '../store-core.mjs';
import { drainControlledEmail, resendTestMailer } from '../email-worker.mjs';

export const TEST_SITE_ID = '88db4909-b179-4f0f-a3a5-fa00860c0a9a';
export const TEST_ACCOUNT_ID = 'acct_1UU9U8RAZXGe6tX0';
export const TEST_ORIGIN = 'https://angel-firewood-test.netlify.app';

export function requireTestCredentials(env) {
  if (env.FIREWOOD_CRM_TEST_ENABLED === '1') throw new Error('hosted_test_disabled');
  if (env.FIREWOOD_STRIPE_TEST_ACCOUNT_ID !== TEST_ACCOUNT_ID || !/^(?:sk|rk)_test_[A-Za-z0-9]+$/u.test(env.FIREWOOD_STRIPE_TEST_SECRET_KEY ?? '')) throw new Error('dedicated_test_account_required');
  if (!/^[a-f0-9]{64}$/u.test(env.FIREWOOD_TEST_STORAGE_TOKEN ?? '')) throw new Error('storage_auth_missing');
}

export function requireTestRuntime(env, siteId) {
  if (siteId !== TEST_SITE_ID || env.FIREWOOD_HOSTED_TEST_ENABLED !== '1') throw new Error('hosted_test_disabled');
  requireTestCredentials(env);
}

export function postgresAdapter(pool) {
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await operation({ query: (text, params) => client.query(text, params) });
        await client.query('COMMIT');
        return value;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}

let database;
export function externalDatabaseOptions(env) {
  let url;
  try { url = new URL(env.FIREWOOD_TEST_DATABASE_URL); } catch { throw new Error('isolated_database_url_required'); }
  const user = decodeURIComponent(url.username);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== env.FIREWOOD_TEST_DATABASE_HOST ||
      !url.hostname.endsWith('.neon.tech') || user !== 'firewood_worker' || url.pathname !== '/firewood_test' ||
      decodeURIComponent(url.password).length < 32 || url.hash || (url.port && url.port !== '5432')) throw new Error('isolated_database_url_required');
  // Connection-string SSL parameters override pg's SSL object. Refuse insecure
  // modes and remove these parameters before enforcing certificate validation.
  if (url.searchParams.has('sslmode') && !['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) throw new Error('verified_tls_required');
  for (const key of url.searchParams.keys()) if (!['sslmode','channel_binding'].includes(key)) throw new Error('unsupported_database_option');
  url.search = '';
  return { connectionString: url.href, ssl: { rejectUnauthorized: true }, enableChannelBinding: true,
    max: 2, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, allowExitOnIdle: true };
}

export async function hostedRuntime(env, siteId) {
  requireTestRuntime(env, siteId);
  if (!database) {
    const { Pool } = await import('pg');
    const pool = new Pool(externalDatabaseOptions(env));
    const candidate = postgresAdapter(pool);
    try {
      const marker = (await candidate.query('SELECT site_id FROM firewood_test_environment WHERE id=$1', ['website-firewood-isolated-test'])).rows[0];
      if (marker?.site_id !== TEST_SITE_ID) throw new Error('isolated_database_required');
      database = candidate;
    } catch (error) { await pool.end(); throw error; }
  }
  const store = createOrderStore(database, { controlledEmail: true });
  const work = async () => {
    await store.purgeSessions();
    const mailer = env.FIREWOOD_TEST_EMAIL_ENABLED === '1' ? resendTestMailer({ key: env.FIREWOOD_TEST_RESEND_KEY, from: env.FIREWOOD_TEST_EMAIL_FROM }) : null;
    return drainControlledEmail(database, mailer);
  };
  return { store, work, db: database };
}

export const functionHeaders = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
