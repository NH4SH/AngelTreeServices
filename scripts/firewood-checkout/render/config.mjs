import { TEST_ACCOUNT_ID, postgresAdapter } from '../hosted/runtime.mjs';
import { testKey, stripeAdapter, STRIPE_API_VERSION } from '../model.mjs';
import Stripe from 'stripe';

export const RUNTIME_ID = 'angel-firewood-render-qa';
export const ACCOUNT_ID = TEST_ACCOUNT_ID;
export const SESSION_MS = 30 * 60 * 1000;
export const LEASE_MS = 45000;
export const CREATE_WINDOW_MS = 23 * 60 * 60 * 1000;
export const tokenPattern = /^[a-f0-9]{48}$/u;

export function configuration(env, role = 'web') {
  if (!['web','worker','migration'].includes(role) || env.FIREWOOD_RENDER_QA_ENABLED !== '1' ||
      (env.FIREWOOD_CRM_TEST_ENABLED ?? '0') !== '0' || env.FIREWOOD_STRIPE_TEST_ACCOUNT_ID !== ACCOUNT_ID) throw new Error('firewood_qa_disabled');
  const key = testKey(env.FIREWOOD_STRIPE_TEST_SECRET_KEY);
  if (!key || !/^(?:rk|sk)_test_/u.test(key)) throw new Error('claimed_sandbox_required');
  const webId = env.FIREWOOD_QA_WEB_SERVICE_ID, workerId = env.FIREWOOD_QA_WORKER_SERVICE_ID;
  if (!/^srv-[a-z0-9]{8,64}$/u.test(webId ?? '') || !/^(?:srv|crn)-[a-z0-9]{8,64}$/u.test(workerId ?? '') || webId === workerId ||
      env.RENDER_SERVICE_ID !== (role === 'worker' ? workerId : webId)) throw new Error('dedicated_render_service_required');
  let origin;
  try { origin = new URL(env.FIREWOOD_QA_ORIGIN); } catch { throw new Error('dedicated_qa_origin_required'); }
  if (origin.protocol !== 'https:' || !/^angel-firewood-qa[a-z0-9-]*\.onrender\.com$/u.test(origin.hostname) ||
      origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.origin !== env.FIREWOOD_QA_ORIGIN) throw new Error('dedicated_qa_origin_required');
  if (!/^[a-f0-9]{64}$/u.test(env.FIREWOOD_QA_ACCESS_TOKEN ?? '') ||
      !/^whsec_[A-Za-z0-9]+$/u.test(env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET ?? '')) throw new Error('qa_credentials_required');
  if (!['0','1'].includes(env.FIREWOOD_TEST_EMAIL_ENABLED ?? '0')) throw new Error('invalid_email_switch');
  return Object.freeze({ origin: origin.origin, webId, workerId, account: ACCOUNT_ID, key,
    accessToken: env.FIREWOOD_QA_ACCESS_TOKEN, webhookSecret: env.FIREWOOD_HOSTED_TEST_WEBHOOK_SECRET,
    emailEnabled: env.FIREWOOD_TEST_EMAIL_ENABLED === '1', mailKey: env.FIREWOOD_TEST_RESEND_KEY,
    mailFrom: 'Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>' });
}

export function databaseOptions(env, migration = false) {
  let url;
  try { url = new URL(env.FIREWOOD_TEST_DATABASE_URL); } catch { throw new Error('dedicated_render_database_required'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || url.hostname !== env.FIREWOOD_TEST_DATABASE_HOST ||
      !/^dpg-[a-z0-9]+-[a-z]\.[a-z0-9-]+-postgres\.render\.com$/u.test(url.hostname) ||
      decodeURIComponent(url.username) !== (migration ? 'firewood_migrator' : 'firewood_worker') ||
      url.pathname !== '/firewood_test' || decodeURIComponent(url.password).length < 32 || url.hash || (url.port && url.port !== '5432')) throw new Error('dedicated_render_database_required');
  for (const [name,value] of url.searchParams) if (!((name === 'sslmode' && value === 'verify-full') || (name === 'channel_binding' && value === 'require'))) throw new Error('verified_database_tls_required');
  url.search = '';
  return { connectionString: url.href, ssl: { rejectUnauthorized: true }, enableChannelBinding: true,
    max: 4, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, statement_timeout: 12000, allowExitOnIdle: true };
}

export async function verifyDatabase(db, config) {
  const marker = (await db.query('SELECT * FROM firewood_render_environment WHERE id=$1', [RUNTIME_ID])).rows[0];
  if (!marker || marker.origin !== config.origin || marker.web_id !== config.webId || marker.worker_id !== config.workerId || marker.account_id !== ACCOUNT_ID ||
      Number((await db.query('SELECT count(*) AS n FROM firewood_test_crm_sync')).rows[0].n) !== 0) throw new Error('isolated_render_database_required');
}

export async function openDatabase(env, config) {
  const { Pool } = await import('pg');
  const pool = new Pool(databaseOptions(env));
  return managedDatabase(pool,config);
}

export async function managedDatabase(pool,config) {
  // pg removes failed idle clients itself. Catch background errors so an idle
  // disconnect does not crash the service; health/query failures remain visible.
  pool.on('error',()=>{});
  const db = postgresAdapter(pool);
  try { await verifyDatabase(db, config); } catch (e) { await pool.end(); throw e; }
  return { db, close: () => pool.end() };
}

export function sandboxProvider(config, fetcher = fetch) {
  const adapter = stripeAdapter(config.key, fetcher);
  const client = new Stripe(config.key, { apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(fetcher), timeout: 8000, maxNetworkRetries: 0 });
  let account;
  async function verifyAccount() {
    account ??= (await client.accounts.retrieve()).id;
    if (account !== ACCOUNT_ID) throw new Error('dedicated_sandbox_required');
  }
  return {
    verifyAccount,
    verifyEvent: (...args) => adapter.verifyEvent(...args),
    async create(...args) { await verifyAccount(); return adapter.create(...args); },
    async state(...args) { await verifyAccount(); return adapter.state(...args); },
    async link(id,total,reference,attempt) {
      await verifyAccount();
      await adapter.state(id,total,reference,attempt);
      const session=await client.checkout.sessions.retrieve(id);
      if(session.id!==id||session.livemode!==false)throw new Error('test_session_required');
      return {id,url:session.url};
    },
    async expire(id) { await verifyAccount(); if (!/^cs_test_[A-Za-z0-9_]+$/u.test(id)) throw new Error('test_session_required'); await client.checkout.sessions.expire(id); },
  };
}
