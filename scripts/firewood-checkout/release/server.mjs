// Private production backend. The edge supplies an unguessable gateway proof;
// only the guarded release entrypoint starts this on the private service network.
import { createServer } from 'node:http';
import { CheckoutError } from './policy.mjs';
import { customerAssets } from '../customer/assets.mjs';
import { assertReleaseService } from './service.mjs';
import { timingSafeEqual } from 'node:crypto';
const BASE = '/firewood/checkout/', COOKIE = '__Host-ats_firewood_v2';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
async function readBody(req) {
  if (req.headers['content-length'] && (!/^\d+$/u.test(req.headers['content-length']) || Number(req.headers['content-length']) > 16384))
    throw new CheckoutError('This request is too large. Keep instructions under 500 characters.', 413);
  let deadline, size = 0; const parts = [], iterator = req[Symbol.asyncIterator]();
  const timeout = new Promise((_, reject) => { deadline = setTimeout(() => reject(new CheckoutError('The request was interrupted. Check your saved order before trying again.', 408)), 5000); });
  try {
    for (;;) { const item = await Promise.race([iterator.next(), timeout]); if (item.done) break;
      size += item.value.byteLength; if (size > 16384) throw new CheckoutError('This request is too large.', 413); parts.push(item.value); }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value;
  } catch (error) { if (error instanceof CheckoutError) throw error; throw new CheckoutError('The order could not be read. Check again before submitting.', 400); }
  finally { clearTimeout(deadline); }
}
export async function releaseServer({ service, origin, gatewaySecret, gates, activeGates = null, health = null }) {
  assertReleaseService(service);
  const canonical = new URL(origin);
  if (origin !== 'https://checkout.angeltreeservices.org' || !/^[a-f0-9]{64}$/u.test(gatewaySecret ?? '')
    || typeof gates?.orders !== 'boolean' || typeof gates?.collection !== 'boolean') throw Error('private_release_backend_required');
  gates = Object.freeze({ orders: gates.orders, collection: gates.collection });
  const gateway = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
    && timingSafeEqual(Buffer.from(value), Buffer.from(gatewaySecret));
  const files = await customerAssets();
  const server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      res.end(req.method === 'HEAD' ? '' : type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      if (req.headers.host !== canonical.host || !gateway(req.headers['x-ats-checkout-gateway'])
        || req.rawHeaders.filter((v,i) => i % 2 === 0 && ['host','x-ats-checkout-gateway'].includes(v.toLowerCase())).length !== 2)
        return send(403, { error: 'Use the Angel Firewood checkout address.' });
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return send(400, { error: 'Invalid path.' });
      const url = new URL(req.url, canonical.origin);
      if (req.method === 'POST' && req.headers.origin !== canonical.origin) return send(403, { error: 'Submit from this checkout page.' });
      if (url.pathname === '/health' && req.method === 'GET') { const ready = health ? await health() : false; return send(ready ? 200 : 503, { ready: ready === true, ordersEnabled: gates.orders, collectionEnabled: gates.collection }); }
      if (url.pathname === '/robots.txt' && req.method === 'GET') return send(200, 'User-agent: *\nDisallow: /\n', 'text/plain');
      if (url.pathname.startsWith(BASE + 'api/')) {
        const dynamic = activeGates ? await activeGates() : gates;
        const currentGates = { orders: gates.orders && dynamic?.orders === true, collection: gates.collection && dynamic?.collection === true };
        const action = url.pathname.slice((BASE + 'api/').length), isRead = req.method === 'GET' && action === 'state';
        if (url.search || !['state', 'start', 'office-request', 'office-accept', 'resume'].includes(action)) return send(404, { error: 'Endpoint not found.' });
        if (!isRead && (req.method !== 'POST' || action === 'state')) return send(405, { error: 'Use the checkout controls for this step.' });
        const cookie = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
        const session = await service.session(cookie, isRead);
        if (isRead) { const state = await service.state(session.cookie); state.paused = state.paused || !currentGates.orders;
          state.canCheckPayment = state.canCheckPayment === true && currentGates.collection;
          state.paymentExecutionReady = state.paymentExecutionReady === true && currentGates.collection;
          return send(200, state, undefined, session.cookie !== cookie
          ? { 'Set-Cookie': `${COOKIE}=${session.cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400` } : {}); }
        if (req.headers['content-type'] !== 'application/json' || req.headers['content-encoding']) return send(415, { error: 'Use the checkout page to submit this request.' });
        const input = await readBody(req);
        if (!currentGates.orders && action !== 'resume') return send(503, { error: 'Online ordering is paused. Please contact Angel for availability.' });
        if (!currentGates.collection && action === 'resume') return send(200, { held: true, next: null });
        const methods = { start: 'start', 'office-request': 'requestPrice', 'office-accept': 'acceptPrice', resume: 'resume' };
        return send(200, await service[methods[action]](session.cookie, input));
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
      const file = files.get(url.pathname); if (!file) return send(404, { error: 'Page not found.' });
      let body = file.body;
      return send(200, body, file.type);
    } catch (error) {
      req.resume();
      if (!res.headersSent) send(error instanceof CheckoutError ? error.status : 503, { error: error instanceof CheckoutError ? error.message
        : 'This step could not be confirmed. Keep this page open and check again, or contact Angel.', field: error instanceof CheckoutError ? error.field ?? null : null });
      else res.end();
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  return { async listen(port = 0, host = '127.0.0.1') {
      if (!Number.isInteger(port) || port < 0 || port > 65535 || !['127.0.0.1','0.0.0.0'].includes(host)) throw Error('private_release_listener_required'); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return server.address().port; },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
