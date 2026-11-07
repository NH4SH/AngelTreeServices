import { createServer } from 'node:http';
import { liveAssets } from './assets.mjs';
import { CheckoutError } from './policy.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from './live-profile.mjs';
const BASE = '/firewood/checkout/', COOKIE = 'ats_firewood_live_isolated';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
async function body(req) {
  if (Number(req.headers['content-length']) > 16384) throw new CheckoutError('Request is too large.', 413);
  const parts = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) throw new CheckoutError('Request is too large.', 413); parts.push(chunk); }
  try { const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value;
  } catch { throw new CheckoutError('The order could not be read.', 400); }
}
export async function isolatedLivePreview({ orders, origin }) {
  const canonical = new URL(origin);
  if (orders.scope !== FIREWOOD_LIVE_REVIEW_PROFILE || canonical.origin !== origin || canonical.protocol !== 'http:'
    || canonical.hostname !== '127.0.0.1' || !canonical.port || canonical.username || canonical.password)
    throw Error('loopback_isolated_live_preview_required');
  const files = await liveAssets(), server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      res.end(req.method === 'HEAD' ? '' : type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== canonical.host
        || req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === 'host').length !== 1
        || req.headers.forwarded || req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto'])
        return send(403, { error: 'Use the isolated preview address.' });
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return send(400, { error: 'Invalid path.' });
      const url = new URL(req.url, origin);
      if (req.method === 'POST' && req.headers.origin !== origin) return send(403, { error: 'Use this preview to send the request.' });
      if (url.pathname === '/health' && req.method === 'GET') return send(200, { isolated: true, livePayments: false, sending: false });
      if (url.pathname === '/robots.txt') return send(200, 'User-agent: *\nDisallow: /\n', 'text/plain');
      if (url.pathname.startsWith(BASE + 'api/')) {
        const action = url.pathname.slice((BASE + 'api/').length);
        if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
        const cookie = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
        const session = await orders.session(cookie, req.method === 'GET' && action === 'state');
        if (req.method === 'GET' && action === 'state') return send(200, await orders.state(session), undefined,
          session.cookie !== cookie ? { 'Set-Cookie': `${COOKIE}=${session.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` } : {});
        if (req.method === 'GET' && action === 'confirmation') return send(200, await orders.confirmation(session));
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON POST required.' });
        const input = await body(req);
        if (action === 'start') return send(200, await orders.start(session, input));
        if (action === 'resume') return send(200, await orders.resume(session, input));
        return send(404, { error: 'Endpoint not found.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
      const file = files.get(url.pathname); if (!file) return send(404, { error: 'Page not found.' });
      let html = file.body;
      if (file.type.startsWith('text/html')) {
        html = html.replace('<body>', '<body><p class="test-notice" role="note">Isolated production-profile review. Use .invalid contact details. No real order, payment or email.</p>');
        if (url.searchParams.get('text') === '200') html = html.replace('</head>', `<link rel="stylesheet" href="${BASE}enlarged.css"></head>`);
      }
      send(200, html, file.type);
    } catch (error) {
      if (!res.headersSent) send(error instanceof CheckoutError ? error.status : 503, { error: error instanceof CheckoutError ? error.message
        : 'Your saved order needs to be checked. Try again shortly or contact Angel.', field: error instanceof CheckoutError ? error.field ?? null : null });
      else res.end();
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  return { async listen() { await new Promise((yes, no) => { server.once('error', no); server.listen(Number(canonical.port), '127.0.0.1', yes); });
      canonical.port = String(server.address().port); origin = canonical.origin; return origin; },
    async close() { server.closeAllConnections(); await new Promise(ok => server.close(ok)); } };
}
