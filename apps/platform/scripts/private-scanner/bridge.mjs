import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { readScannerToken } from './token.mjs';
const MAX = 25 * 1024 * 1024;
// clamd's unauthenticated TCP port must be isolated. Only this bridge is exposed
// through your authenticated HTTPS ingress; never expose clamd to the internet.
async function command(command, bytes, { host, port }) {
  const socket = createConnection({ host, port });
  const timeout = setTimeout(() => socket.destroy(new Error('scanner_timeout')), 9000);
  const response = new Promise((resolve, reject) => {
    let text = ''; socket.on('error', reject);
    socket.on('data', chunk => {
      text += chunk.toString('utf8');
      if (Buffer.byteLength(text) > 1024) socket.destroy(new Error('invalid_scanner_reply'));
      if (text.includes('\0')) { resolve(text.slice(0, text.indexOf('\0'))); socket.destroy(); }
    });
    socket.on('end', () => reject(new Error('incomplete_scanner_reply')));
  });
  // Attach rejection handling before any await can fail.
  response.catch(() => {});
  try {
    await once(socket, 'connect'); socket.write(`z${command}\0`);
    if (bytes) {
      for (let i = 0; i < bytes.length; i += 64 * 1024) {
        const chunk = bytes.subarray(i, i + 64 * 1024); const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length);
        if (!socket.write(Buffer.concat([length, chunk]))) await once(socket, 'drain');
      }
      socket.write(Buffer.alloc(4));
    }
    return await response;
  } finally { clearTimeout(timeout); socket.destroy(); }
}
export async function getClamAVState(connection, now = Date.now()) {
  const version = await command('VERSION', null, connection);
  const match = /^ClamAV ([^/]+)\/(\d+)\/(.+)$/.exec(version);
  const signatureTime = match ? Date.parse(`${match[3]} UTC`) : NaN;
  const age = now - signatureTime;
  if (!Number.isFinite(age) || age < -3600000 || age > 48 * 3600000) throw new Error('scanner_signatures_stale');
  return { engineVersion: match[1], signatureVersion: Number(match[2]), signatureAgeSeconds: Math.max(0, Math.floor(age / 1000)),
    freshness: age >= 36 * 3600000 ? 'urgent' : age >= 24 * 3600000 ? 'warning' : 'current' };
}
export async function scanWithClamAV(bytes, connection) {
  await getClamAVState(connection);
  const reply = await command('INSTREAM', bytes, connection);
  if (reply === 'stream: OK') return 'clean';
  if (/^stream: [^\r\n]+ FOUND$/.test(reply)) return 'quarantined';
  throw new Error('scan_not_confirmed');
}
export function createScannerBridge({ token, scan, readiness }) {
  if (!token || token.length < 32) throw new Error('A private scanner token of at least 32 characters is required.');
  const expected = createHash('sha256').update(`Bearer ${token}`).digest();
  let inFlight = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store'); res.setHeader('content-type', 'application/json');
    const provided = createHash('sha256').update(req.headers.authorization ?? '').digest();
    if (!timingSafeEqual(expected, provided)) { res.writeHead(401).end('{}'); req.resume(); return; }
    if (req.method !== 'POST' || req.url !== '/scan' || req.headers['content-type'] !== 'application/octet-stream') { res.writeHead(400).end('{}'); req.resume(); return; }
    if (inFlight >= 2) { res.writeHead(503).end('{}'); req.resume(); return; }
    inFlight++;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX) { res.writeHead(413).end('{}'); req.destroy(); return; }
        chunks.push(chunk);
      }
      if (!size) { res.writeHead(400).end('{}'); return; }
      const bytes = Buffer.concat(chunks); const status = await scan(bytes);
      if (!['clean', 'quarantined'].includes(status)) throw new Error('scan_not_confirmed');
      const state = readiness ? await readiness() : null;
      res.end(JSON.stringify({ status, sha256: createHash('sha256').update(bytes).digest('hex'), engine: 'clamav',
        ...(state ? { engineVersion: state.engineVersion, signatureVersion: state.signatureVersion,
          signatureAgeSeconds: state.signatureAgeSeconds, freshness: state.freshness } : {}) }));
    } catch { if (!res.headersSent) res.writeHead(503); res.end('{}'); }
    finally { inFlight--; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 15000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createScannerBridge({ token: readScannerToken(),
    scan: bytes => scanWithClamAV(bytes, { host: process.env.CLAMD_HOST ?? '127.0.0.1', port: Number(process.env.CLAMD_PORT ?? 3310) }),
    readiness: () => getClamAVState({ host: process.env.CLAMD_HOST ?? '127.0.0.1', port: Number(process.env.CLAMD_PORT ?? 3310) }),
  });
  server.listen(Number(process.env.SCANNER_PORT ?? 3311), process.env.SCANNER_BIND ?? '127.0.0.1', () => console.log('Private file scanner bridge is listening.'));
}
