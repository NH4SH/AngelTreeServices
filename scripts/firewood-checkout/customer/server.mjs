// Loopback customer-flow QA only. Never bind this server to permanent HTTPS.
import { createServer } from 'node:http';
import { CheckoutError } from '../live/policy.mjs';
import { customerAssets } from './assets.mjs';
import { assertCustomerService } from './service.mjs';
const BASE = '/firewood/checkout/', COOKIE = 'ats_firewood_customer_qa';
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
export async function isolatedCustomerPreview({ service, origin }) {
  assertCustomerService(service);
  const canonical = new URL(origin);
  if (canonical.origin !== origin || canonical.protocol !== 'http:' || canonical.hostname !== '127.0.0.1'
    || !canonical.port || canonical.username || canonical.password) throw Error('loopback_customer_preview_required');
  const files = await customerAssets();
  const server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      res.end(req.method === 'HEAD' ? '' : type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== canonical.host
        || req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === 'host').length !== 1
        || req.headers.forwarded || req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto']) return send(403, { error: 'Use the isolated checkout address.' });
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return send(400, { error: 'Invalid path.' });
      const url = new URL(req.url, canonical.origin);
      if (req.method === 'POST' && req.headers.origin !== canonical.origin) return send(403, { error: 'Submit from this checkout page.' });
      if (url.pathname === '/health' && req.method === 'GET') return send(200, { isolated: true, livePayments: false, sending: false });
      if (url.pathname === '/robots.txt' && req.method === 'GET') return send(200, 'User-agent: *\nDisallow: /\n', 'text/plain');
      if (url.pathname.startsWith(BASE + 'api/')) {
        const action = url.pathname.slice((BASE + 'api/').length), isRead = req.method === 'GET' && action === 'state';
        if (url.search || !['state', 'start', 'office-request', 'office-accept', 'resume'].includes(action)) return send(404, { error: 'Endpoint not found.' });
        if (!isRead && (req.method !== 'POST' || action === 'state')) return send(405, { error: 'Use the checkout controls for this step.' });
        const cookie = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
        const session = await service.session(cookie, isRead);
        if (isRead) return send(200, await service.state(session.cookie), undefined, session.cookie !== cookie
          ? { 'Set-Cookie': `${COOKIE}=${session.cookie}; Path=${BASE}; HttpOnly; SameSite=Strict; Max-Age=86400` } : {});
        if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'Use the checkout page to submit this request.' });
        const input = await readBody(req);
        const methods = { start: 'start', 'office-request': 'requestPrice', 'office-accept': 'acceptPrice', resume: 'resume' };
        return send(200, await service[methods[action]](session.cookie, input));
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
      const file = files.get(url.pathname); if (!file) return send(404, { error: 'Page not found.' });
      let body = file.body;
      if (file.type.startsWith('text/html')) {
        body = body.replace('<body>', '<body><p class="test-notice" role="note">Isolated checkout review. Use .invalid contact details. No real order, payment or email.</p>');
        if (url.searchParams.get('text') === '200') body = body.replace('</head>', `<link rel="stylesheet" href="${BASE}enlarged.css"></head>`);
      }
      return send(200, body, file.type);
    } catch (error) {
      req.resume();
      if (!res.headersSent) send(error instanceof CheckoutError ? error.status : 503, { error: error instanceof CheckoutError ? error.message
        : 'This step could not be confirmed. Keep this page open and check again, or contact Angel.', field: error instanceof CheckoutError ? error.field ?? null : null });
      else res.end();
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  return { async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(canonical.port), '127.0.0.1', resolve); });
      canonical.port = String(server.address().port); return canonical.origin; },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
