import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { hostname, homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOrderStore } from '../store.mjs';
import { resendTestMailer } from '../email-worker.mjs';
import { requireTestCredentials, functionHeaders } from '../hosted/runtime.mjs';
import { storageHandler, stripeVerifier } from '../hosted/service.mjs';
import { testWebhookHandler } from '../hosted/webhook.mjs';

export const MAC_RUNTIME_ID = 'ats-firewood-home-mac-test-20261026';
export function requireMacRuntime(env, id) {
  if (id !== MAC_RUNTIME_ID || env.FIREWOOD_MACBOOK_TEST_ENABLED !== '1') throw new Error('macbook_test_disabled');
  requireTestCredentials(env);
}

// Private test harness: embedded Postgres, one process and an owned directory.
// This is not the CRM database, a public webhook endpoint or a production host.
export async function createMacbookService({ env, directory, host = hostname(), port = 56271, verifier, intervalMs = 15000 } = {}) {
  requireMacRuntime(env, MAC_RUNTIME_ID);
  if (host !== 'MacBookPro') throw new Error('The approved home MacBook is required.');
  const mailer = env.FIREWOOD_TEST_EMAIL_ENABLED === '1' ? resendTestMailer({ key: env.FIREWOOD_TEST_RESEND_KEY, from: env.FIREWOOD_TEST_EMAIL_FROM }) : null;
  const store = await openOrderStore({ directory, controlledEmail: true, mailer });
  let working;
  async function work() {
    if (!working) working = (async () => { await store.purgeSessions(); return store.workEmail(); })().finally(() => { working = null; });
    return working;
  }
  const options = { env, siteId: MAC_RUNTIME_ID, validateRuntime: requireMacRuntime,
    runtime: async () => ({ store, work }), ...(verifier ?? stripeVerifier(env)) };
  const storage = storageHandler(options), webhook = testWebhookHandler(options);
  let expectedHost;
  const server = createServer(async (req, res) => {
    if (!expectedHost || req.headers.host !== expectedHost || req.socket.remoteAddress !== '127.0.0.1') {
      res.writeHead(403, functionHeaders); res.end('{}'); return;
    }
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, functionHeaders); res.end(JSON.stringify({ marker: MAC_RUNTIME_ID, host, testOnly: true })); return;
    }
    if (!['/storage','/webhook'].includes(req.url)) { res.writeHead(404, functionHeaders); res.end('{}'); return; }
    try {
      const request = new Request(`http://${expectedHost}${req.url}`, { method: req.method, headers: req.headers,
        ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Readable.toWeb(req), duplex: 'half' }) });
      const response = await (req.url === '/storage' ? storage : webhook)(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(503, functionHeaders); res.end('{"error":"Private test step pending."}'); }
  });
  try { await new Promise((yes,no) => { server.once('error',no); server.listen(port,'127.0.0.1',yes); }); }
  catch (error) { await store.close(); throw error; }
  expectedHost = `127.0.0.1:${server.address().port}`;
  const interval = setInterval(() => { work().catch(() => {}); }, intervalMs); interval.unref();
  return { store, origin: `http://${expectedHost}`, work, async close() {
    clearInterval(interval); server.closeAllConnections(); await new Promise(yes => server.close(yes));
    if (working) await working; await store.close();
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(homedir(), '.local/share/ats-firewood-test-20261026/data');
  const service = await createMacbookService({ env: process.env, directory });
  console.log('Private Firewood MacBook test service ready on loopback port 56271. Live payments and CRM sending are disabled.');
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, async () => { await service.close(); process.exit(0); });
}
