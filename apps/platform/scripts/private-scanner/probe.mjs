import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readScannerToken } from './token.mjs';
import { getClamAVState } from './bridge.mjs';

export async function probeScanner(env = process.env) {
  const url = new URL(env.SCANNER_PROBE_URL ?? 'http://127.0.0.1:3311/scan');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/scan'
    || !(url.protocol === 'https:' || (env.SCANNER_PROBE_LOCAL === '1' && loopback && url.protocol === 'http:'))) throw new Error('Invalid probe target.');
  const token = readScannerToken(env), bytes = Buffer.from('Angel Tree Services synthetic scanner readiness check.');
  const response = await fetch(url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body: bytes });
  if (!response.ok || !response.body) throw new Error('Scanner unavailable.');
  const reader = response.body.getReader(); let size = 0; const parts = [];
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > 1024) throw new Error('Invalid scanner response.'); parts.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (result.status !== 'clean' || result.engine !== 'clamav' || result.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Scanner readiness failed.');
  const state = env.CLAMD_HOST ? await getClamAVState({ host: env.CLAMD_HOST, port: Number(env.CLAMD_PORT ?? 3310) }) : {};
  return { status: 'ok', ...state };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await probeScanner())); }
  catch { console.error('Scanner readiness failed.'); process.exitCode = 1; }
}
