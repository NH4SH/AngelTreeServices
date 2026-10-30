import { createHash } from 'node:crypto';
export type ScanVerdict = { status: 'clean' | 'quarantined'; sha256: string } | { status: 'unavailable'; sha256?: never };
const MAX_BYTES = 25 * 1024 * 1024;
// Only the actual bytes downloaded from private Storage are submitted here.
// No filenames, record metadata, credentials, or files are logged.
export async function scanDocumentBytes(bytes: Uint8Array, options: {
  url?: string; token?: string; production?: boolean; fetcher?: typeof fetch;
} = {}): Promise<ScanVerdict> {
  try {
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return { status: 'unavailable' };
    const endpoint = new URL(options.url ?? process.env.DOCUMENT_SCANNER_URL ?? 'invalid:');
    const token = options.token ?? process.env.DOCUMENT_SCANNER_TOKEN;
    const production = options.production ?? process.env.NODE_ENV === 'production';
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/scan'
      || !(endpoint.protocol === 'https:' || (!production && loopback && endpoint.protocol === 'http:'))
      || !token || token.length < 32) return { status: 'unavailable' };
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
      body: Buffer.from(bytes),
    });
    if (!response.ok || !response.body) return { status: 'unavailable' };
    const reader = response.body.getReader(); let body = ''; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024) return { status: 'unavailable' };
        body += Buffer.from(chunk.value).toString('utf8');
      }
    } finally { await reader.cancel().catch(() => {}); }
    const result = JSON.parse(body);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!['clean', 'quarantined'].includes(result.status) || result.sha256 !== sha256 || result.engine !== 'clamav') return { status: 'unavailable' };
    return { status: result.status, sha256 };
  } catch { return { status: 'unavailable' }; }
}
