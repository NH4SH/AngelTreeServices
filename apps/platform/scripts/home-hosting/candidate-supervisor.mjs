// Isolated candidate only. Do not use as the production ingress or write fence.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Transform } from 'node:stream';
import { isIP } from 'node:net';

assert.equal(process.platform, 'linux');
assert.equal(process.getuid(), 1000);
assert.equal(process.env.ATS_CANDIDATE_ISOLATED, '1');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:3240/backend');
assert.ok(!process.env.APP_ENV);
for (const [name, value] of Object.entries(process.env)) {
  if (/^(STRIPE_|RESEND_|SMTP_|TWILIO_|GOOGLE_)/.test(name)) assert.ok(!value, 'Provider credentials are not allowed in the isolated candidate.');
}
const claims = JSON.parse(Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64url'));
assert.match(claims.ref, /^ats_candidate_[a-f0-9]{12}$/);
const app = ['/srv/server.js', '/srv/apps/platform/server.js'].find(existsSync);
assert.ok(app, 'The standalone server is missing.');
const child = spawn(process.execPath, [app], {
  cwd: app.slice(0, app.lastIndexOf('/')), stdio: 'inherit',
  env: { ...process.env, PORT: '3241', HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1' },
});
let closing = false;
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'expect']);
function fixed(response, status) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
  response.end(status === 413 ? 'Request too large.' : status === 503 ? 'Service temporarily unavailable.' : 'Request unavailable.');
}
const server = http.createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
  if (closing) return fixed(response, 503);
  if (request.headers.host !== '127.0.0.1:3240') return fixed(response, 421);
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) return fixed(response, 400);
  if (['CONNECT', 'TRACE'].includes(request.method)) return fixed(response, 405);
  const backend = request.url.startsWith('/backend/');
  const extraHopHeaders = new Set((request.headers.connection ?? '').split(',').map(v => v.trim().toLowerCase()));
  const peer = request.socket.remoteAddress;
  if (!peer || !isIP(peer)) return fixed(response, 503);
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) =>
    !hopHeaders.has(key) && !extraHopHeaders.has(key) && !key.startsWith('x-forwarded-') && key !== 'forwarded' && key !== 'x-nf-client-connection-ip'));
  headers['x-forwarded-host'] = '127.0.0.1:3240';
  headers['x-forwarded-proto'] = 'http';
  // Adapt the existing login limiter to this isolated trusted gateway. Never
  // accept a caller's purported Netlify/client address. A real public proxy
  // chain/source-address contract is a separate production acceptance check.
  headers['x-nf-client-connection-ip'] = peer;
  headers['x-forwarded-for'] = peer;
  const upstream = http.request({
    hostname: backend ? 'api-gw' : '127.0.0.1', port: backend ? 8000 : 3241,
    path: backend ? request.url.slice('/backend'.length) : request.url,
    method: request.method, headers, timeout: 35_000,
  }, incoming => {
    const outbound = Object.fromEntries(Object.entries(incoming.headers).filter(([key]) => !hopHeaders.has(key)));
    if (backend) outbound['cache-control'] = 'private, no-store';
    response.writeHead(incoming.statusCode ?? 502, outbound);
    incoming.on('error', () => response.destroy());
    incoming.pipe(response);
  });
  // No automatic replay or retry, including on a partial upstream response.
  upstream.on('error', () => fixed(response, 503));
  upstream.on('timeout', () => upstream.destroy());
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => upstream.destroy());
  let bytes = 0;
  const bounded = new Transform({ transform(chunk, _, callback) {
    bytes += chunk.length;
    if (bytes > 26 * 1024 * 1024) {
      fixed(response, 413); upstream.destroy(); callback(new Error('body_limit'));
    } else callback(null, chunk);
  } });
  bounded.on('error', () => request.unpipe(bounded));
  request.on('error', () => upstream.destroy());
  request.pipe(bounded).pipe(upstream);
});
server.requestTimeout = 40_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.on('clientError', (_, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
function stop(code = 0) {
  if (closing) return;
  closing = true; server.close(); child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5_000).unref();
}
child.on('error', () => { stop(1); process.exitCode = 1; });
child.on('exit', () => { stop(1); server.closeAllConnections(); process.exitCode = 1; });
server.on('error', () => { stop(1); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop(0));
server.listen(3240, '0.0.0.0'); // Docker publishes only VM loopback; no LAN/public bind.
